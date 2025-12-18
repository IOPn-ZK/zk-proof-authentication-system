import { generateDeterministicWallet, generateDeterministicIdentityWithWallet } from '@iopn-zk/zk-proof-authentication-sdk';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';

/**
 * API endpoint to generate deterministic wallet from Auth0 sub claim
 * This demonstrates the simple HKDF-based approach:
 * - Takes Auth0 sub claim from session
 * - Generates deterministic private key using HKDF
 * - Creates ethers wallet from the private key
 * 
 * POST /api/zk/wallet/generate
 */
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

    // Get salt (AUTH0_SECRET) for HKDF
    const appSecret = process.env.AUTH0_SECRET;
    if (!appSecret) {
      return res.status(500).json({
        success: false,
        message: 'AUTH0_SECRET not configured',
        error: 'SECRET_MISSING'
      });
    }

    // Generate deterministic wallet using simple HKDF approach
    // This uses: hkdf(sha256, auth0Sub, salt, "semaphore-identity", 32)
    const walletResult = generateDeterministicWallet(auth0Sub, appSecret, 'semaphore-identity');

    // Also generate the combined identity + wallet for Semaphore
    const identityWithWallet = generateDeterministicIdentityWithWallet(auth0Sub, appSecret);

    // Return wallet information (never return private key in production)
    const responseBody = {
      success: true,
      walletAddress: walletResult.walletAddress,
      identityCommitment: identityWithWallet.commitment,
      message: 'Deterministic wallet generated from Auth0 sub using HKDF'
    };

    // Only include private key in development for testing
    if (process.env.NODE_ENV !== 'production') {
      responseBody.debug = {
        auth0SubPrefix: auth0Sub.slice(0, 16) + '...',
        privateKeyPrefix: walletResult.privateKey.slice(0, 20) + '...',
        infoLabel: 'semaphore-identity',
        note: 'Private key shown only in development mode'
      };
      // In development, you might want to see the full private key for testing
      // but in production, NEVER expose this
      if (process.env.SHOW_PRIVATE_KEY_IN_DEV === 'true') {
        responseBody.debug.privateKey = walletResult.privateKey;
      }
    }

    res.status(200).json(responseBody);

  } catch (error) {
    console.error('Error generating wallet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate wallet',
      error: 'WALLET_GENERATION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}

export default withSecurityConfig('identity')(handler);

