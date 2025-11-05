import { eq, desc } from 'drizzle-orm';
import { db } from './connection.js';
import { proofLogs } from './schema.js';

/**
 * Proof Log Service
 * Tracks proof verification attempts for auditing and debugging
 */

/**
 * Log a proof verification attempt
 * @param {string} identityCommitment - Identity commitment from the proof
 * @param {string} proofStatus - Status: 'valid', 'invalid', 'reused_nullifier'
 * @param {string|null} nullifierHash - Nullifier hash from the proof
 * @param {string|null} externalNullifier - External nullifier value
 * @param {number|null} groupId - Group ID
 * @param {number|null} verificationTimeMs - Verification time in milliseconds
 * @param {string|null} errorMessage - Error message if verification failed
 * @param {Object|null} req - Express request object for IP and user agent
 * @param {number|null} tenantId - Tenant ID (optional)
 * @returns {Promise<boolean>} True if logged successfully
 */
export async function logProofVerification(
  identityCommitment,
  proofStatus,
  nullifierHash = null,
  externalNullifier = null,
  groupId = null,
  verificationTimeMs = null,
  errorMessage = null,
  req = null,
  tenantId = null
) {
  try {
    if (!identityCommitment || !proofStatus) {
      console.warn('Missing required parameters for proof logging');
      return false;
    }

    // Extract IP address and user agent from request
    const ipAddress = req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req?.headers?.['x-real-ip'] ||
                     req?.connection?.remoteAddress ||
                     null;
    
    const userAgent = req?.headers?.['user-agent'] || null;

    await db.insert(proofLogs).values({
      identityCommitment,
      proofStatus,
      nullifierHash,
      externalNullifier: externalNullifier ? externalNullifier.toString() : null,
      groupId,
      verificationTimeMs,
      errorMessage,
      ipAddress,
      userAgent,
      tenantId: tenantId ?? null,
    });

    console.log(`Proof verification logged: ${proofStatus} for commitment ${identityCommitment.substring(0, 16)}...`);
    return true;
  } catch (error) {
    // Don't throw - logging failures shouldn't break the main flow
    console.error('Error logging proof verification:', error);
    return false;
  }
}

/**
 * Get proof logs for a specific identity commitment
 * @param {string} identityCommitment - Identity commitment
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} Array of proof log records
 */
export async function getProofLogs(identityCommitment, limit = 10) {
  try {
    const records = await db
      .select()
      .from(proofLogs)
      .where(eq(proofLogs.identityCommitment, identityCommitment))
      .orderBy(desc(proofLogs.createdAt))
      .limit(limit);

    return records;
  } catch (error) {
    console.error('Error getting proof logs:', error);
    return [];
  }
}

/**
 * Get proof statistics for a group
 * @param {number} groupId - Group ID
 * @param {Date|null} startDate - Start date for filtering
 * @param {Date|null} endDate - End date for filtering
 * @returns {Promise<Object>} Statistics object
 */
export async function getProofStats(groupId, startDate = null, endDate = null) {
  try {
    let query = db.select().from(proofLogs).where(eq(proofLogs.groupId, groupId));
    
    // Apply date filters if provided
    if (startDate || endDate) {
      // Note: Drizzle ORM doesn't have built-in date filtering in this version
      // This would need to be implemented with raw SQL or additional query builder
      // For now, we'll get all records and filter in memory
      const allRecords = await query;
      const filtered = allRecords.filter(record => {
        const createdAt = new Date(record.createdAt);
        if (startDate && createdAt < startDate) return false;
        if (endDate && createdAt > endDate) return false;
        return true;
      });
      
      const valid = filtered.filter(r => r.proofStatus === 'valid').length;
      const invalid = filtered.filter(r => r.proofStatus === 'invalid').length;
      const reused = filtered.filter(r => r.proofStatus === 'reused_nullifier').length;
      
      return {
        total: filtered.length,
        valid,
        invalid,
        reused,
        successRate: filtered.length > 0 ? (valid / filtered.length * 100).toFixed(2) : '0.00',
      };
    }

    const allRecords = await query;
    const valid = allRecords.filter(r => r.proofStatus === 'valid').length;
    const invalid = allRecords.filter(r => r.proofStatus === 'invalid').length;
    const reused = allRecords.filter(r => r.proofStatus === 'reused_nullifier').length;

    return {
      total: allRecords.length,
      valid,
      invalid,
      reused,
      successRate: allRecords.length > 0 ? (valid / allRecords.length * 100).toFixed(2) : '0.00',
    };
  } catch (error) {
    console.error('Error getting proof stats:', error);
    return {
      total: 0,
      valid: 0,
      invalid: 0,
      reused: 0,
      successRate: '0.00',
    };
  }
}

