import { generateDeterministicIdentity } from '@iopn-zk/zk-proof-authentication-sdk';
import { setSessionIdentity } from '../../../../lib/security/session.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { splitPrivateKey, encryptShareForServer } from '../../../../lib/security/keyShareService.js';
import { storeServerShare, hasKeyShares } from '../../../../lib/db/keyShareService.js';

async function handler(req, res) {
  try {
 
    console.log('Identity init handler started');
    console.log('Request method:', req.method);
    
    if (!req.session || !req.session.user) {
      console.error('No valid session found');
      return res.status(401).json({
        success: false,
        message: 'No valid session found',
        error: 'SESSION_MISSING'
      });
    }
    
    const userEmail = req.session.user.email;
    console.log('User email from session:', userEmail);
    
    if (!userEmail) {
      console.error('No user email in session');
      return res.status(400).json({
        success: false,
        message: 'No user email found in session',
        error: 'EMAIL_MISSING'
      });
    }
    
    const auth0Sub = req.session.user.sub;
    if (!auth0Sub) {
      console.error('No Auth0 sub found in session');
      return res.status(400).json({
        success: false,
        message: 'No Auth0 sub found in session',
        error: 'AUTH0_SUB_MISSING'
      });
    }
    
    console.log('Creating deterministic identity for user:', userEmail, 'sub:', auth0Sub);
    const appSecret = process.env.AUTH0_SECRET;
    if (!appSecret) {
      console.error('AUTH0_SECRET not configured');
      return res.status(500).json({
        success: false,
        message: 'AUTH0_SECRET not configured',
        error: 'SECRET_MISSING'
      });
    }
    
    const identityResult = generateDeterministicIdentity(auth0Sub, appSecret, userEmail);
    const identity = identityResult.identity;
    const privateKey = identityResult.privateKey;
    console.log('Deterministic identity created successfully');
    
    // Check if shares already exist
    let sharesExist = false;
    let dbAvailable = true;
    
    try {
      sharesExist = await hasKeyShares(auth0Sub);
    } catch (error) {
      console.warn('Error checking for existing shares, assuming none exist:', error.message);
      sharesExist = false;
      dbAvailable = false;
    }
    
    let shareA = null;
    let shareC = null;
    let serverShareStored = false;
    
    if (!sharesExist) {
      // Split private key into 3 shares (2-of-3 threshold)
      console.log('Splitting private key into shares...');
      const shares = splitPrivateKey(privateKey, 3, 2);
      
      // Share A (Index 1): Device - will be sent to client for local storage
      shareA = shares[0];
      
      // Share B (Index 2): Server - encrypt and store in database (if available)
      const { encryptedShare, shareHash } = encryptShareForServer(shares[1]);
      try {
        const stored = await storeServerShare(auth0Sub, encryptedShare, shareHash);
        if (stored) {
          serverShareStored = true;
          console.log('Server share stored successfully');
        } else {
          console.warn('Server share could not be stored (database unavailable), but shares will still be returned to client');
          dbAvailable = false;
        }
      } catch (error) {
        console.warn('Failed to store server share, but continuing:', error.message);
        dbAvailable = false;
      }
      
      // Share C (Index 3): Cloud Backup - will be sent to client for encryption and upload
      shareC = shares[2];
      
      console.log('Key shares created and distributed', { serverShareStored, dbAvailable });
    } else {
      console.log('Key shares already exist for user, skipping share creation');
    }
    
    console.log('Secure identity created for user:', {
      email: userEmail,
      commitment: identity.commitment.toString(),
      sharesCreated: !sharesExist,
      timestamp: new Date().toISOString()
    });
    
    // Persist commitment to the DB session (no secrets stored)
    try {
      await setSessionIdentity(req.session, identity.commitment.toString(), null);
    } catch (e) {
      console.warn('Could not persist identity to session:', e?.message);
    }

    const responseBody = {
      success: true,
      identityCommitment: identity.commitment.toString(),
      message: 'Deterministic identity created using HKDF',
      sharesCreated: !sharesExist,
      dbAvailable: dbAvailable
    };
    
    // Only return shares if they were just created (first time setup)
    if (!sharesExist && shareA && shareC) {
      responseBody.shares = {
        shareA: shareA, // Device share - client should store locally
        shareC: shareC  // Cloud backup share - client should encrypt and upload
      };
      
      if (serverShareStored) {
        responseBody.message += ' - Key shares created and ready for distribution';
      } else {
        responseBody.message += ' - Key shares created (server share not stored - database unavailable)';
        responseBody.warning = 'Server share could not be stored in database. Please ensure database is configured for full functionality.';
      }
    }
    
    if (process.env.NODE_ENV !== 'production') {
      const issuer = process.env.AUTH0_ISSUER_BASE_URL || '';
      const clientId = process.env.AUTH0_CLIENT_ID || '';
      const normalizedEmail = typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : '';
      const saltInputPreview = `${issuer}|${clientId}|${auth0Sub}|${normalizedEmail}`.slice(0, 32) + '...';
      responseBody.debug = {
        userEmail,
        auth0SubPrefix: (auth0Sub || '').toString().slice(0, 16) + '...',
        issuerPrefix: issuer.slice(0, 16) + (issuer.length > 16 ? '...' : ''),
        clientIdPrefix: clientId.slice(0, 16) + (clientId.length > 16 ? '...' : ''),
        saltInputPreview,
        infoLabel: 'semaphore-identity-v3'
      };
    }
    res.status(200).json(responseBody);
    
  } catch (error) {
    console.error('Error generating secure identity:', error);
    console.error('Error stack:', error.stack);
    
    let errorMessage = 'Error generating identity';
    let errorCode = 'GENERAL_ERROR';
    
    if (error.message.includes('session')) {
      errorMessage = 'Session validation error';
      errorCode = 'SESSION_ERROR';
    } else if (error.message.includes('semaphore')) {
      errorMessage = 'Semaphore protocol error';
      errorCode = 'SEMAPHORE_ERROR';
    } else if (error.message.includes('SECRET_MISSING')) {
      errorMessage = 'Identity secret not configured';
      errorCode = 'SECRET_MISSING';
    } else if (error.message.includes('AUTH0_SUB_MISSING')) {
      errorMessage = 'Auth0 sub not found in session';
      errorCode = 'AUTH0_SUB_MISSING';
    }
    
    res.status(500).json({ 
      success: false,
      message: errorMessage, 
      error: errorCode,
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}

export default withSecurityConfig('identity')(handler); 