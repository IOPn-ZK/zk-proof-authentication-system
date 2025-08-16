import { generateDeterministicIdentity } from '../../../../lib/semaphore/identity.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';

async function handler(req, res) {
  try {
    // Debug logging
    console.log('Identity init handler started');
    console.log('Request method:', req.method);
    
    // Session is already validated by security middleware
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
    
    // Get Auth0 sub from session for deterministic identity
    const auth0Sub = req.session.user.sub;
    if (!auth0Sub) {
      console.error('No Auth0 sub found in session');
      return res.status(400).json({
        success: false,
        message: 'No Auth0 sub found in session',
        error: 'AUTH0_SUB_MISSING'
      });
    }
    
    // Create deterministic identity using HKDF
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
    
    const identityResult = generateDeterministicIdentity(auth0Sub, appSecret);
    const identity = identityResult.identity;
    console.log('Deterministic identity created successfully');
    
    // Prepare identity data (without encryption for now)
    const identityData = {
      trapdoor: identity.trapdoor.toString(),
      nullifier: identity.nullifier.toString(),
      commitment: identity.commitment.toString(),
      userEmail: userEmail,
      auth0Sub: auth0Sub,
      createdAt: new Date().toISOString()
    };
    
    console.log('Identity data prepared');
    
    // Log identity creation (without sensitive data)
    console.log('Secure identity created for user:', {
      email: userEmail,
      commitment: identity.commitment.toString(),
      timestamp: identityData.createdAt
    });
    
    // Return response with identity data
    res.status(200).json({ 
      success: true,
      identityCommitment: identity.commitment.toString(),
      identityData: identityData,
      message: 'Deterministic identity created using HKDF'
    });
    
  } catch (error) {
    console.error('Error generating secure identity:', error);
    console.error('Error stack:', error.stack);
    
    // Check for specific error types
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

// Apply security middleware with identity-specific configuration
export default withSecurityConfig('identity')(handler); 