import { getVerifiedProofsByWallet, getVerifiedProofsByIdentity } from '../../../../lib/db/proofStorageService.js';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { generateDeterministicWallet } from '@iopn-zk/zk-proof-authentication-sdk';

/**
 * API endpoint to list verified proofs for the current user's wallet
 * GET /api/zk/proofs/list
 * 
 * Returns all verified proofs linked to the user's wallet address
 */
async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
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

    // Get salt (AUTH0_SECRET) for HKDF
    const appSecret = process.env.AUTH0_SECRET;
    if (!appSecret) {
      return res.status(500).json({
        success: false,
        message: 'AUTH0_SECRET not configured',
        error: 'SECRET_MISSING'
      });
    }

    // Generate wallet address from Auth0 sub
    const walletResult = generateDeterministicWallet(auth0Sub, appSecret, 'semaphore-identity');
    const walletAddress = walletResult.walletAddress;

    // Get limit from query params (default 50)
    const limit = parseInt(req.query.limit) || 50;
    const limitClamped = Math.min(Math.max(limit, 1), 100); // Clamp between 1 and 100

    // Get verified proofs for this wallet
    const proofs = await getVerifiedProofsByWallet(walletAddress, limitClamped);

    res.status(200).json({
      success: true,
      walletAddress,
      proofs,
      count: proofs.length,
      message: `Found ${proofs.length} verified proof(s) for wallet ${walletAddress.substring(0, 10)}...`
    });

  } catch (error) {
    console.error('Error listing verified proofs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list verified proofs',
      error: 'LIST_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}

export default withSecurityConfig('identity')(handler);

