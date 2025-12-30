import { db, pool } from './connection.js';
import { keyShares } from './schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Key Share Database Service
 * Manages server-side key share storage and retrieval
 */

/**
 * Store server share (Share B) in database
 * @param {string} auth0Sub - Auth0 user sub
 * @param {string} encryptedShare - Encrypted share data (JSON string)
 * @param {string} shareHash - SHA-256 hash of the share for integrity
 * @param {number} userId - Optional user ID
 * @param {number} tenantId - Optional tenant ID
 * @returns {Promise<object>} - Stored share record
 */
export async function storeServerShare(auth0Sub, encryptedShare, shareHash, userId = null, tenantId = null) {
  try {
    // Check if database is available
    if (!db || !pool) {
      console.warn('Database not available, cannot store server share');
      return null;
    }
    
    const existing = await db.select()
      .from(keyShares)
      .where(and(
        eq(keyShares.auth0Sub, auth0Sub),
        eq(keyShares.shareType, 'SERVER')
      ))
      .limit(1);
    
    if (existing.length > 0) {
      const [updated] = await db.update(keyShares)
        .set({
          encryptedShare: JSON.stringify(encryptedShare),
          shareHash: shareHash,
          shareType: 'SERVER',
          shareIndex: 2,
          updatedAt: new Date(),
          lastUsedAt: new Date()
        })
        .where(and(
          eq(keyShares.auth0Sub, auth0Sub),
          eq(keyShares.shareType, 'SERVER')
        ))
        .returning();
      
      return updated;
    } else {
      const [inserted] = await db.insert(keyShares)
        .values({
          auth0Sub: auth0Sub,
          userId: userId,
          shareType: 'SERVER',
          shareIndex: 2,
          encryptedShare: JSON.stringify(encryptedShare),
          shareHash: shareHash,
          tenantId: tenantId
        })
        .returning();
      
      return inserted;
    }
  } catch (error) {
    console.error('Error storing server share:', error);
    // Return null instead of throwing - allows endpoint to continue
    console.warn('Server share storage failed, but continuing without database storage');
    return null;
  }
}

/**
 * Store cloud backup metadata (Share C) in database
 * @param {string} auth0Sub - Auth0 user sub
 * @param {string} cloudBackupUrl - Google Drive file ID or URL
 * @param {string} shareHash - SHA-256 hash of the share
 * @param {boolean} isEncrypted - Whether backup is encrypted
 * @param {number} userId - Optional user ID
 * @param {number} tenantId - Optional tenant ID
 * @returns {Promise<object>} - Stored share record
 */
export async function storeCloudBackupMetadata(auth0Sub, cloudBackupUrl, shareHash, isEncrypted = true, userId = null, tenantId = null) {
  try {
    // Check if database is available
    if (!db || !pool) {
      console.warn('Database not available, cannot store cloud backup metadata');
      return null;
    }
    
    const existing = await db.select()
      .from(keyShares)
      .where(and(
        eq(keyShares.auth0Sub, auth0Sub),
        eq(keyShares.shareType, 'CLOUD_METADATA')
      ))
      .limit(1);
    
    if (existing.length > 0) {
      const [updated] = await db.update(keyShares)
        .set({
          cloudBackupUrl: cloudBackupUrl,
          shareHash: shareHash,
          cloudBackupEncrypted: isEncrypted,
          updatedAt: new Date()
        })
        .where(and(
          eq(keyShares.auth0Sub, auth0Sub),
          eq(keyShares.shareType, 'CLOUD_METADATA')
        ))
        .returning();
      
      if (!updated) {
        console.warn('Update returned no rows');
        return null;
      }
      
      return updated;
    } else {
      const [inserted] = await db.insert(keyShares)
        .values({
          auth0Sub: auth0Sub,
          userId: userId,
          shareType: 'CLOUD_METADATA',
          shareIndex: 3,
          cloudBackupUrl: cloudBackupUrl,
          cloudBackupEncrypted: isEncrypted,
          shareHash: shareHash,
          encryptedShare: '',
          tenantId: tenantId
        })
        .returning();
      
      if (!inserted) {
        console.warn('Insert returned no rows');
        return null;
      }
      
      return inserted;
    }
  } catch (error) {
    console.error('Error storing cloud backup metadata:', error);
    // Return null instead of throwing - allows endpoint to continue
    console.warn('Cloud backup metadata storage failed, but continuing without database storage');
    return null;
  }
}

/**
 * Retrieve server share (Share B) from database
 * @param {string} auth0Sub - Auth0 user sub
 * @returns {Promise<object|null>} - Share record with encrypted share data
 */
export async function getServerShare(auth0Sub) {
  try {
    const [share] = await db.select()
      .from(keyShares)
      .where(and(
        eq(keyShares.auth0Sub, auth0Sub),
        eq(keyShares.shareType, 'SERVER')
      ))
      .limit(1);
    
    if (!share) {
      return null;
    }
    
    await db.update(keyShares)
      .set({ lastUsedAt: new Date() })
      .where(eq(keyShares.id, share.id));
    
    return share;
  } catch (error) {
    console.error('Error retrieving server share:', error);
    throw new Error(`Failed to retrieve server share: ${error.message}`);
  }
}

/**
 * Retrieve cloud backup metadata (Share C) from database
 * @param {string} auth0Sub - Auth0 user sub
 * @returns {Promise<object|null>} - Share record with cloud backup metadata
 */
export async function getCloudBackupMetadata(auth0Sub) {
  try {
    // Check if database is available
    if (!db || !pool) {
      console.warn('Database not available, cannot retrieve cloud backup metadata');
      return null;
    }
    
    const [share] = await db.select()
      .from(keyShares)
      .where(and(
        eq(keyShares.auth0Sub, auth0Sub),
        eq(keyShares.shareType, 'CLOUD_METADATA')
      ))
      .limit(1);
    
    return share || null;
  } catch (error) {
    console.error('Error retrieving cloud backup metadata:', error);
    // Return null instead of throwing - allows endpoint to continue
    return null;
  }
}

/**
 * Check if user has shares set up
 * @param {string} auth0Sub - Auth0 user sub
 * @returns {Promise<boolean>} - True if shares exist
 */
export async function hasKeyShares(auth0Sub) {
  try {
    // Check if database is available
    if (!db || !pool) {
      console.warn('Database not available, assuming no shares exist');
      return false;
    }
    
    const shares = await db.select()
      .from(keyShares)
      .where(eq(keyShares.auth0Sub, auth0Sub))
      .limit(1);
    
    return shares.length > 0;
  } catch (error) {
    console.error('Error checking key shares:', error);
    // Return false on error - allows endpoint to continue and create new shares
    return false;
  }
}

/**
 * Delete all shares for a user (for account deletion/recovery reset)
 * @param {string} auth0Sub - Auth0 user sub
 * @returns {Promise<void>}
 */
export async function deleteKeyShares(auth0Sub) {
  try {
    await db.delete(keyShares)
      .where(eq(keyShares.auth0Sub, auth0Sub));
    
    console.log(`Deleted all key shares for user: ${auth0Sub}`);
  } catch (error) {
    console.error('Error deleting key shares:', error);
    throw new Error(`Failed to delete key shares: ${error.message}`);
  }
}

/**
 * Get all share metadata for a user (for admin/debugging)
 * @param {string} auth0Sub - Auth0 user sub
 * @returns {Promise<Array>} - Array of share records (without sensitive data)
 */
export async function getShareMetadata(auth0Sub) {
  try {
    const shares = await db.select({
      id: keyShares.id,
      shareType: keyShares.shareType,
      shareIndex: keyShares.shareIndex,
      cloudBackupUrl: keyShares.cloudBackupUrl,
      cloudBackupEncrypted: keyShares.cloudBackupEncrypted,
      shareHash: keyShares.shareHash,
      createdAt: keyShares.createdAt,
      updatedAt: keyShares.updatedAt,
      lastUsedAt: keyShares.lastUsedAt
    })
      .from(keyShares)
      .where(eq(keyShares.auth0Sub, auth0Sub));
    
    return shares;
  } catch (error) {
    console.error('Error retrieving share metadata:', error);
    throw new Error(`Failed to retrieve share metadata: ${error.message}`);
  }
}

