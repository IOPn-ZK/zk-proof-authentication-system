import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { storeCloudBackupMetadata, getCloudBackupMetadata } from '../../../../lib/db/keyShareService.js';
import crypto from 'crypto';

/**
 * POST /api/zk/shares/cloud-backup
 * Store cloud backup metadata (Google Drive file ID, hash, etc.)
 * 
 * Body: {
 *   cloudBackupUrl: string (Google Drive file ID),
 *   shareHash: string (SHA-256 hash of Share C)
 * }
 * 
 * GET /api/zk/shares/cloud-backup
 * Retrieve cloud backup metadata
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
    
    if (req.method === 'POST') {
      const { cloudBackupUrl, shareHash } = req.body;
      
      if (!cloudBackupUrl || !shareHash) {
        return res.status(400).json({
          success: false,
          message: 'cloudBackupUrl and shareHash are required',
          error: 'MISSING_PARAMETERS'
        });
      }
      
      // Validate hash format (SHA-256 hex string)
      if (!/^[a-f0-9]{64}$/i.test(shareHash)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid share hash format (expected SHA-256 hex)',
          error: 'INVALID_HASH_FORMAT'
        });
      }
      
      // Store cloud backup metadata
      const metadata = await storeCloudBackupMetadata(
        auth0Sub,
        cloudBackupUrl,
        shareHash,
        true, // isEncrypted
        null, // userId
        null  // tenantId
      );
      
      return res.status(200).json({
        success: true,
        message: 'Cloud backup metadata stored successfully',
        metadata: {
          cloudBackupUrl: metadata.cloudBackupUrl,
          shareHash: metadata.shareHash,
          createdAt: metadata.createdAt
        }
      });
    }
    
    if (req.method === 'GET') {
      // Retrieve cloud backup metadata
      const metadata = await getCloudBackupMetadata(auth0Sub);
      
      if (!metadata) {
        return res.status(404).json({
          success: false,
          message: 'Cloud backup metadata not found',
          error: 'METADATA_NOT_FOUND'
        });
      }
      
      return res.status(200).json({
        success: true,
        metadata: {
          cloudBackupUrl: metadata.cloudBackupUrl,
          shareHash: metadata.shareHash,
          cloudBackupEncrypted: metadata.cloudBackupEncrypted,
          createdAt: metadata.createdAt,
          updatedAt: metadata.updatedAt
        }
      });
    }
    
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      error: 'METHOD_NOT_ALLOWED'
    });
    
  } catch (error) {
    console.error('Error in cloud backup handler:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export default withSecurityConfig('shares')(handler);

