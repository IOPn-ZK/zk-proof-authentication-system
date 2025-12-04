import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { combineShares } from '../../../../lib/security/keyShareService.js';
import { getServerShare } from '../../../../lib/db/keyShareService.js';
import { decryptShareFromServer, verifyShareIntegrity } from '../../../../lib/security/keyShareService.js';

/**
 * POST /api/zk/shares/combine
 * Combine shares to reconstruct private key
 * 
 * Body: {
 *   shareA: string (device share),
 *   shareB?: string (optional, will fetch from server if not provided),
 *   shareC?: string (optional, cloud backup share)
 * }
 * 
 * Returns: {
 *   privateKey: string (reconstructed private key - use immediately and discard)
 * }
 */
async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed',
        error: 'METHOD_NOT_ALLOWED'
      });
    }
    
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
    
    console.log(`[SHARE_COMBINE] Request from user: ${auth0Sub.substring(0, 16)}...`);
    console.log(`[SHARE_COMBINE] Method: ${req.method}, Timestamp: ${new Date().toISOString()}`);
    
    const { shareA, shareB, shareC } = req.body;
    
    // Need at least 2 shares (threshold)
    const providedShares = [shareA, shareB, shareC].filter(s => s && typeof s === 'string');
    console.log(`[SHARE_COMBINE] Provided shares: ${providedShares.length} (A: ${!!shareA}, B: ${!!shareB}, C: ${!!shareC})`);
    
    if (providedShares.length < 2) {
      // If shareB not provided, fetch from server
      if (!shareB && shareA) {
        try {
          console.log(`[SHARE_COMBINE] Fetching Share B from server...`);
          const shareRecord = await getServerShare(auth0Sub);
          if (shareRecord) {
            const encryptedShareData = JSON.parse(shareRecord.encryptedShare);
            const decryptedShareB = decryptShareFromServer(encryptedShareData);
            
            // Verify integrity
            if (verifyShareIntegrity(decryptedShareB, shareRecord.shareHash)) {
              providedShares.push(decryptedShareB);
              console.log(`[SHARE_COMBINE] ✅ Share B retrieved and verified from server`);
            } else {
              console.error(`[SHARE_COMBINE] ❌ Share B integrity verification failed`);
              return res.status(500).json({
                success: false,
                message: 'Server share integrity verification failed',
                error: 'INTEGRITY_CHECK_FAILED'
              });
            }
          } else {
            console.error(`[SHARE_COMBINE] ❌ Share B not found in database`);
          }
        } catch (error) {
          console.error(`[SHARE_COMBINE] ❌ Error fetching server share:`, error.message);
        }
      }
      
      if (providedShares.length < 2) {
        console.error(`[SHARE_COMBINE] ❌ Insufficient shares: ${providedShares.length} (need 2)`);
        return res.status(400).json({
          success: false,
          message: 'At least 2 shares required to reconstruct private key',
          error: 'INSUFFICIENT_SHARES'
        });
      }
    }
    
    // Combine shares to reconstruct private key
    console.log(`[SHARE_COMBINE] Combining ${providedShares.length} shares to reconstruct private key...`);
    const startTime = Date.now();
    const reconstructedKey = combineShares(providedShares);
    const duration = Date.now() - startTime;
    console.log(`[SHARE_COMBINE] ✅ Private key reconstructed successfully in ${duration}ms`);
    console.log(`[SHARE_COMBINE] Key prefix: 0x${reconstructedKey.substring(0, 16)}...`);
    
    // Return reconstructed key (client should use immediately and discard)
    return res.status(200).json({
      success: true,
      privateKey: `0x${reconstructedKey}`,
      message: 'Private key reconstructed successfully. Use immediately and discard from memory.',
      warning: 'DO NOT store this private key. Use it immediately for the intended operation.'
    });
    
  } catch (error) {
    console.error('Error combining shares:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to combine shares',
      error: 'COMBINE_FAILED',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export default withSecurityConfig('shares')(handler);

