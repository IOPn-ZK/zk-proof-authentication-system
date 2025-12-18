import { generateDeterministicWallet } from '@iopn-zk/zk-proof-authentication-sdk';
import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import crypto from 'crypto';

/**
 * API endpoint to export private key and seed (encrypted with session key)
 * POST /api/zk/wallet/export
 * 
 * Returns encrypted private key and seed that can be decrypted client-side
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

    // Generate deterministic wallet
    const walletResult = generateDeterministicWallet(auth0Sub, appSecret, 'semaphore-identity');

    // Generate a session-based encryption key (derived from session ID)
    const sessionId = req.session.id || req.sessionID || crypto.randomBytes(16).toString('hex');
    const sessionKey = crypto.createHash('sha256')
      .update(sessionId + appSecret + auth0Sub)
      .digest('hex')
      .substring(0, 64); // 32 bytes in hex

    // Encrypt private key and seed using AES-256-GCM
    const algorithm = 'aes-256-gcm';
    const keyBuffer = Buffer.from(sessionKey, 'hex');

    // Encrypt private key
    const privateKeyIv = crypto.randomBytes(16);
    const privateKeyCipher = crypto.createCipheriv(algorithm, keyBuffer, privateKeyIv);
    let encryptedPrivateKey = privateKeyCipher.update(walletResult.privateKey, 'utf8', 'hex');
    encryptedPrivateKey += privateKeyCipher.final('hex');
    const privateKeyAuthTag = privateKeyCipher.getAuthTag();

    // Encrypt seed (convert buffer to hex string first)
    const seedHex = walletResult.seed.toString('hex');
    const seedIv = crypto.randomBytes(16);
    const seedCipher = crypto.createCipheriv(algorithm, keyBuffer, seedIv);
    let encryptedSeed = seedCipher.update(seedHex, 'utf8', 'hex');
    encryptedSeed += seedCipher.final('hex');
    const seedAuthTag = seedCipher.getAuthTag();

    // Return encrypted data (client will decrypt using session key)
    res.status(200).json({
      success: true,
      encryptedPrivateKey: {
        encrypted: encryptedPrivateKey,
        iv: privateKeyIv.toString('hex'),
        authTag: privateKeyAuthTag.toString('hex')
      },
      encryptedSeed: {
        encrypted: encryptedSeed,
        iv: seedIv.toString('hex'),
        authTag: seedAuthTag.toString('hex')
      },
      walletAddress: walletResult.walletAddress,
      sessionKey: sessionKey, // Client will use this to decrypt
      message: 'Private key and seed encrypted with session key. Decrypt client-side.'
    });

  } catch (error) {
    console.error('Error exporting wallet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export wallet',
      error: 'EXPORT_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}

export default withSecurityConfig('identity')(handler);

