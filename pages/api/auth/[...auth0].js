import { handleAuth } from '@auth0/nextjs-auth0';

function getBaseURL() {
  if (process.env.NGROK_BASE_URL) {
    console.log('Using NGROK_BASE_URL:', process.env.NGROK_BASE_URL);
    return process.env.NGROK_BASE_URL;
  }
  
  if (process.env.AUTH0_BASE_URL) {
    console.log('Using AUTH0_BASE_URL:', process.env.AUTH0_BASE_URL);
    return process.env.AUTH0_BASE_URL;
  }
  
  const defaultURL = 'http://localhost:3000';
  console.log('Using default URL:', defaultURL);
  return defaultURL;
}

// Validate required environment variables
function validateConfig() {
  const required = [
    'AUTH0_ISSUER_BASE_URL',
    'AUTH0_CLIENT_ID', 
    'AUTH0_CLIENT_SECRET',
    'AUTH0_SECRET'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required Auth0 environment variables: ${missing.join(', ')}`);
  }
  
  // Check for placeholder values
  if (process.env.AUTH0_ISSUER_BASE_URL === 'https://your-domain.auth0.com') {
    throw new Error('AUTH0_ISSUER_BASE_URL is still set to placeholder value. Please configure your actual Auth0 domain.');
  }
  
  if (process.env.AUTH0_CLIENT_ID === 'your-auth0-client-id') {
    throw new Error('AUTH0_CLIENT_ID is still set to placeholder value. Please configure your actual Auth0 Client ID.');
  }
  
  if (process.env.AUTH0_CLIENT_SECRET === 'your-auth0-client-secret') {
    throw new Error('AUTH0_CLIENT_SECRET is still set to placeholder value. Please configure your actual Auth0 Client Secret.');
  }
}

export default handleAuth({
  baseURL: getBaseURL(),
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  secret: process.env.AUTH0_SECRET,
  
  // Enhanced session configuration
  session: {
    rollingDuration: 30 * 60, // 30 minutes
    absoluteDuration: 24 * 60 * 60, // 24 hours
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
  },
  
  onError: (err, req, res) => {
    console.error('Auth0 Error:', err);
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      timestamp: new Date().toISOString()
    });
    
    // Enhanced error handling with security logging
    let clientIP = 'unknown';
    if (req && req.headers) {
      clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    }
    console.error('Auth error from IP:', clientIP);
    
    throw err;
  },
  
  onLogin: (req, res, session) => {
    let clientIP = 'unknown';
    let userAgent = 'unknown';
    
    if (req && req.headers) {
      clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      userAgent = req.headers['user-agent']?.substring(0, 100) || 'unknown';
    }
    
    console.log('Secure login successful:', {
      email: session?.user?.email,
      timestamp: new Date().toISOString(),
      clientIP: clientIP,
      userAgent: userAgent
    });
    
    return {
      ...session,
      loginTimestamp: new Date().toISOString(),
      clientIP: clientIP
    };
  },
  
  onCallback: (req, res, session) => {
    let clientIP = 'unknown';
    
    if (req && req.headers) {
      clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    }
    
    console.log('Secure callback successful:', {
      email: session?.user?.email,
      timestamp: new Date().toISOString(),
      clientIP: clientIP
    });
    
    // Validate session data
    if (!session?.user?.email) {
      throw new Error('Invalid session: missing user email');
    }
    
    return session;
  },
  
  authorizationParams: {
    scope: 'openid profile email',
    audience: process.env.AUTH0_AUDIENCE
  }
});

// validation middleware
export async function getServerSideProps(context) {
  try {
    validateConfig();
  } catch (error) {
    console.error('Auth0 configuration error:', error.message);
    return {
      props: {
        error: 'Auth0 configuration error. Please check your environment variables.',
        details: error.message
      }
    };
  }
  
  return { props: {} };
}
