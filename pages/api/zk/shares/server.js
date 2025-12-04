import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { getServerShare } from '../../../../lib/db/keyShareService.js';
import { decryptShareFromServer, verifyShareIntegrity } from '../../../../lib/security/keyShareService.js';

/**
 * GET /api/zk/shares/server
 * Retrieve server share (Share B) for combining with device share
 * 
 * POST /api/zk/shares/server
 * Verify and return decrypted server share (for client-side combination)
 */
async function handler(req, res) {
  try {
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
    
    if (req.method === 'GET') {
      // Return share metadata (not the actual share)
      const shareRecord = await getServerShare(auth0Sub);
      
      if (!shareRecord) {
        return res.status(404).json({
          success: false,
          message: 'Server share not found. Please initialize identity first.',
          error: 'SHARE_NOT_FOUND'
        });
      }
      
      return res.status(200).json({
        success: true,
        shareIndex: shareRecord.shareIndex,
        shareType: shareRecord.shareType,
        shareHash: shareRecord.shareHash, // For integrity verification
        createdAt: shareRecord.createdAt,
        lastUsedAt: shareRecord.lastUsedAt
      });
    }
    
    if (req.method === 'POST') {
      // Return decrypted share for combination (requires additional verification)
      console.log(`[SHARE_SERVER] POST request from user: ${auth0Sub.substring(0, 16)}...`);
      const { deviceShareHash } = req.body;
      
      if (!deviceShareHash) {
        console.warn(`[SHARE_SERVER] ⚠️  Device share hash missing`);
        return res.status(400).json({
          success: false,
          message: 'Device share hash required for verification',
          error: 'DEVICE_SHARE_HASH_MISSING'
        });
      }
      
      const shareRecord = await getServerShare(auth0Sub);
      
      if (!shareRecord) {
        console.error(`[SHARE_SERVER] ❌ Share B not found for user`);
        return res.status(404).json({
          success: false,
          message: 'Server share not found',
          error: 'SHARE_NOT_FOUND'
        });
      }
      
      // Decrypt server share
      console.log(`[SHARE_SERVER] Decrypting Share B...`);
      const encryptedShareData = JSON.parse(shareRecord.encryptedShare);
      const decryptedShare = decryptShareFromServer(encryptedShareData);
      
      // Verify integrity
      if (!verifyShareIntegrity(decryptedShare, shareRecord.shareHash)) {
        console.error(`[SHARE_SERVER] ❌ Share B integrity verification failed`);
        return res.status(500).json({
          success: false,
          message: 'Share integrity verification failed',
          error: 'INTEGRITY_CHECK_FAILED'
        });
      }
      
      console.log(`[SHARE_SERVER] ✅ Share B retrieved and verified (hash: ${shareRecord.shareHash.substring(0, 16)}...)`);
      
      // Return decrypted share (client will combine with device share)
      return res.status(200).json({
        success: true,
        shareB: decryptedShare,
        shareIndex: shareRecord.shareIndex,
        shareHash: shareRecord.shareHash
      });
    }
    
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      error: 'METHOD_NOT_ALLOWED'
    });
    
  } catch (error) {
    console.error('Error in server share handler:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export default withSecurityConfig('shares')(handler);

