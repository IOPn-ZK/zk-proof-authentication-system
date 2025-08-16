import { retrieveIdentity } from '../../../../lib/semaphore/identity.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        success: false, 
        message: 'Method not allowed' 
      });
    }

    // Session is already validated by security middleware
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'No valid session found',
        error: 'SESSION_MISSING'
      });
    }

    const auth0Sub = req.session.user.sub;
    if (!auth0Sub) {
      return res.status(400).json({
        success: false,
        message: 'No Auth0 sub found in session',
        error: 'AUTH0_SUB_MISSING'
      });
    }

    // Retrieve deterministic identity
    const appSecret = process.env.AUTH0_SECRET;
    if (!appSecret) {
      return res.status(500).json({
        success: false,
        message: 'AUTH0_SECRET not configured',
        error: 'SECRET_MISSING'
      });
    }

    const identityResult = retrieveIdentity(auth0Sub, appSecret);
    
    // Return only the necessary data for proof generation
    res.status(200).json({
      success: true,
      commitment: identityResult.commitment,
      message: 'Identity retrieved successfully'
    });

  } catch (error) {
    console.error('Error retrieving identity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve identity',
      error: 'RETRIEVAL_ERROR'
    });
  }
}

export default withSecurityConfig('identity')(handler); 