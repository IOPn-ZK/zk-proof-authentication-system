import { checkDatabaseConnection, pool } from '../../../../lib/db/connection.js';
import { withCustomSecurity } from '../../../../lib/security/middleware.js';
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

/**
 * Diagnostic endpoint to test database connection from Vercel
 * GET /api/admin/db/test-connection
 * 
 * This endpoint helps diagnose database connection issues by:
 * 1. Checking environment variables
 * 2. Testing DNS resolution
 * 3. Testing TCP connection
 * 4. Testing PostgreSQL connection
 */
async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }

  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV,
      vercel: !!process.env.VERCEL,
      vercelEnv: process.env.VERCEL_ENV,
    },
    config: {},
    dns: {},
    connection: {},
    pool: {},
    errors: []
  };

  try {
    // 1. Check environment variables (sanitized)
    let dbHost = process.env.DB_HOST || 'not set';
    let dbPort = process.env.DB_PORT || 'not set';
    let dbName = process.env.DB_NAME || 'not set';
    let dbUser = process.env.DB_USER || 'not set';
    
    if (process.env.DATABASE_URL) {
      try {
        const dbUrl = new URL(process.env.DATABASE_URL);
        dbHost = dbHost === 'not set' ? dbUrl.hostname : dbHost;
        dbPort = dbPort === 'not set' ? dbUrl.port || '5432' : dbPort;
        dbName = dbName === 'not set' ? (dbUrl.pathname.slice(1) || 'postgres') : dbName;
        dbUser = dbUser === 'not set' ? dbUrl.username : dbUser;
      } catch (urlError) {
        diagnostics.errors.push({
          step: 'Parse DATABASE_URL',
          error: urlError.message
        });
      }
    }
    
    let hasPassword = !!process.env.DB_PASSWORD;
    if (process.env.DATABASE_URL) {
      try {
        const dbUrl = new URL(process.env.DATABASE_URL);
        hasPassword = hasPassword || !!dbUrl.password;
      } catch (e) {
        // Already handled above
      }
    }
    
    diagnostics.config = {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasIndividualVars: !!(process.env.DB_HOST && process.env.DB_PORT && process.env.DB_NAME && process.env.DB_USER),
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: dbUser,
      hasPassword: hasPassword,
      ssl: process.env.DB_SSL || (process.env.DATABASE_URL ? 'auto' : 'not set'),
    };

    // 2. Test DNS resolution
    try {
      const startTime = Date.now();
      const addresses = await dnsLookup(dbHost, { all: true });
      const dnsTime = Date.now() - startTime;
      
      diagnostics.dns = {
        status: 'success',
        hostname: dbHost,
        addresses: addresses.map(addr => ({
          address: addr.address,
          family: addr.family === 4 ? 'IPv4' : 'IPv6'
        })),
        lookupTime: `${dnsTime}ms`
      };
    } catch (dnsError) {
      diagnostics.dns = {
        status: 'failed',
        hostname: dbHost,
        error: dnsError.message,
        code: dnsError.code,
        syscall: dnsError.syscall
      };
      diagnostics.errors.push({
        step: 'DNS Resolution',
        error: dnsError.message,
        code: dnsError.code
      });
    }

    // 3. Test TCP connection (if DNS succeeded)
    if (diagnostics.dns.status === 'success') {
      try {
        const net = await import('net');
        const testSocket = new net.Socket();
        
        const tcpTest = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            testSocket.destroy();
            reject(new Error('TCP connection timeout'));
          }, 5000);
          
          testSocket.once('connect', () => {
            clearTimeout(timeout);
            testSocket.destroy();
            resolve(true);
          });
          
          testSocket.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
          
          testSocket.connect(parseInt(dbPort), dbHost);
        });
        
        const startTime = Date.now();
        await tcpTest;
        const tcpTime = Date.now() - startTime;
        
        diagnostics.connection = {
          status: 'success',
          tcpTime: `${tcpTime}ms`
        };
      } catch (tcpError) {
        diagnostics.connection = {
          status: 'failed',
          error: tcpError.message,
          code: tcpError.code
        };
        diagnostics.errors.push({
          step: 'TCP Connection',
          error: tcpError.message,
          code: tcpError.code
        });
      }
    } else {
      diagnostics.connection = {
        status: 'skipped',
        reason: 'DNS resolution failed'
      };
    }

    // 4. Test PostgreSQL connection
    if (pool) {
      diagnostics.pool = {
        initialized: true,
        totalCount: pool.totalCount || 0,
        idleCount: pool.idleCount || 0,
        waitingCount: pool.waitingCount || 0
      };
      
      try {
        const startTime = Date.now();
        const dbConnected = await checkDatabaseConnection();
        const dbTime = Date.now() - startTime;
        
        if (dbConnected) {
          diagnostics.pool.connection = {
            status: 'success',
            queryTime: `${dbTime}ms`
          };
        } else {
          diagnostics.pool.connection = {
            status: 'failed',
            error: 'Connection check returned false'
          };
          diagnostics.errors.push({
            step: 'PostgreSQL Connection',
            error: 'Connection check returned false'
          });
        }
      } catch (dbError) {
        diagnostics.pool.connection = {
          status: 'failed',
          error: dbError.message,
          code: dbError.code,
          syscall: dbError.syscall
        };
        diagnostics.errors.push({
          step: 'PostgreSQL Connection',
          error: dbError.message,
          code: dbError.code,
          syscall: dbError.syscall
        });
      }
    } else {
      diagnostics.pool = {
        initialized: false,
        error: 'Pool not initialized - check connection configuration'
      };
      diagnostics.errors.push({
        step: 'Pool Initialization',
        error: 'Pool not initialized'
      });
    }

    // Determine overall status
    const hasErrors = diagnostics.errors.length > 0;
    const overallStatus = hasErrors ? 'failed' : 'success';

    res.status(hasErrors ? 500 : 200).json({
      success: !hasErrors,
      status: overallStatus,
      diagnostics,
      recommendations: generateRecommendations(diagnostics)
    });

  } catch (error) {
    console.error('Error in database diagnostic:', error);
    res.status(500).json({
      success: false,
      status: 'error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      diagnostics
    });
  }
}

function generateRecommendations(diagnostics) {
  const recommendations = [];

  // Check environment variables
  if (!diagnostics.config.hasDatabaseUrl && !diagnostics.config.hasIndividualVars) {
    recommendations.push({
      priority: 'high',
      issue: 'Missing database configuration',
      solution: 'Set DATABASE_URL or individual DB_* variables in Vercel environment variables'
    });
  }

  // Check DNS
  if (diagnostics.dns.status === 'failed') {
    recommendations.push({
      priority: 'high',
      issue: `DNS resolution failed: ${diagnostics.dns.error}`,
      solutions: [
        'Verify the database hostname is correct',
        'Check if the Supabase project is active (not paused)',
        'Verify network connectivity from Vercel',
        'Check if the hostname is accessible from external networks'
      ]
    });
  }

  // Check TCP connection
  if (diagnostics.connection.status === 'failed') {
    recommendations.push({
      priority: 'high',
      issue: `TCP connection failed: ${diagnostics.connection.error}`,
      solutions: [
        'Check if the database port is correct (usually 5432)',
        'Verify firewall rules allow connections from Vercel IPs',
        'Check if Supabase allows external connections',
        'Verify SSL/TLS requirements'
      ]
    });
  }

  // Check PostgreSQL connection
  if (diagnostics.pool.connection && diagnostics.pool.connection.status === 'failed') {
    if (diagnostics.pool.connection.code === 'ENOTFOUND') {
      recommendations.push({
        priority: 'critical',
        issue: 'Hostname cannot be resolved (ENOTFOUND)',
        solutions: [
          'Verify the Supabase project is active and not paused',
          'Check the database hostname in Supabase dashboard',
          'Ensure the hostname is correct (db.xxxxx.supabase.co)',
          'Try using the connection pooler hostname if available'
        ]
      });
    } else if (diagnostics.pool.connection.code === 'ECONNREFUSED') {
      recommendations.push({
        priority: 'high',
        issue: 'Connection refused',
        solutions: [
          'Check if the database port is correct',
          'Verify firewall/security group settings',
          'Check if Supabase allows connections from Vercel'
        ]
      });
    } else if (diagnostics.pool.connection.error?.includes('password')) {
      recommendations.push({
        priority: 'high',
        issue: 'Authentication failed',
        solutions: [
          'Verify the database password is correct',
          'Check if special characters in password need URL encoding',
          'Verify the username is correct'
        ]
      });
    }
  }

  // SSL recommendations
  if (diagnostics.config.ssl !== 'true' && diagnostics.config.host?.includes('supabase')) {
    recommendations.push({
      priority: 'high',
      issue: 'SSL not enabled for Supabase',
      solution: 'Set DB_SSL=true in Vercel environment variables (required for Supabase)'
    });
  }

  return recommendations;
}

export default withCustomSecurity({
  requireAuth: true,
  rateLimitType: 'admin',
  allowedMethods: ['GET'],
  validationSchema: null
})(handler);

