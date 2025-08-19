import { generateDeterministicIdentity } from '../../../../lib/semaphore/identity.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';

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
    console.log('Deterministic identity created successfully');
    
    console.log('Secure identity created for user:', {
      email: userEmail,
      commitment: identity.commitment.toString(),
      timestamp: new Date().toISOString()
    });
    
    const responseBody = {
      success: true,
      identityCommitment: identity.commitment.toString(),
      message: 'Deterministic identity created using HKDF (no secrets returned)'
    };
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