import { eq, and } from 'drizzle-orm';
import { db } from './connection.js';
import { nullifiers } from './schema.js';

/**
 * Nullifier Service
 * Prevents replay attacks by tracking used nullifiers from ZK proofs
 */

/**
 * Check if a nullifier has already been used
 * @param {string} nullifierHash - The nullifier hash from the proof
 * @returns {Promise<boolean>} True if nullifier has been used, false otherwise
 */
export async function isNullifierUsed(nullifierHash) {
  try {
    if (!nullifierHash) {
      return false;
    }

    const existing = await db
      .select()
      .from(nullifiers)
      .where(eq(nullifiers.nullifierHash, nullifierHash))
      .limit(1);

    return existing.length > 0;
  } catch (error) {
    console.error('Error checking nullifier usage:', error);
    // On error, assume it's not used to avoid blocking valid requests
    // Log the error for investigation
    return false;
  }
}

/**
 * Mark a nullifier as used
 * @param {string} nullifierHash - The nullifier hash from the proof
 * @param {string} identityCommitment - Identity commitment that used this nullifier
 * @param {string} externalNullifier - External nullifier value
 * @param {string|null} signal - Signal value (optional)
 * @param {number} groupId - Group ID
 * @param {number|null} tenantId - Tenant ID (optional)
 * @returns {Promise<boolean>} True if successfully stored, false if already exists
 */
export async function markNullifierUsed(
  nullifierHash,
  identityCommitment,
  externalNullifier,
  signal = null,
  groupId = 1,
  tenantId = null
) {
  try {
    if (!nullifierHash || !identityCommitment || !externalNullifier) {
      throw new Error('Nullifier hash, identity commitment, and external nullifier are required');
    }

    // Check if already exists (shouldn't happen if we check before calling, but safety check)
    const alreadyUsed = await isNullifierUsed(nullifierHash);
    if (alreadyUsed) {
      console.warn(`Nullifier ${nullifierHash.substring(0, 16)}... already exists`);
      return false;
    }

    // Insert the nullifier
    await db.insert(nullifiers).values({
      nullifierHash,
      identityCommitment,
      externalNullifier: externalNullifier.toString(),
      signal: signal ? signal.toString() : null,
      groupId,
      tenantId: tenantId ?? null,
    });

    console.log(`Nullifier marked as used: ${nullifierHash.substring(0, 16)}...`);
    return true;
  } catch (error) {
    // If it's a unique constraint violation, the nullifier was already used
    if (error.code === '23505' || error.message.includes('unique')) {
      console.warn(`Nullifier ${nullifierHash.substring(0, 16)}... already exists (race condition)`);
      return false;
    }
    console.error('Error marking nullifier as used:', error);
    throw new Error(`Failed to mark nullifier as used: ${error.message}`);
  }
}

/**
 * Get nullifier usage history for debugging
 * @param {string} nullifierHash - The nullifier hash
 * @returns {Promise<Object|null>} Nullifier record or null if not found
 */
export async function getNullifierHistory(nullifierHash) {
  try {
    const record = await db
      .select()
      .from(nullifiers)
      .where(eq(nullifiers.nullifierHash, nullifierHash))
      .limit(1);

    return record.length > 0 ? record[0] : null;
  } catch (error) {
    console.error('Error getting nullifier history:', error);
    return null;
  }
}

/**
 * Get all nullifiers used by a specific identity commitment
 * @param {string} identityCommitment - Identity commitment
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} Array of nullifier records
 */
export async function getNullifiersByIdentity(identityCommitment, limit = 10) {
  try {
    const records = await db
      .select()
      .from(nullifiers)
      .where(eq(nullifiers.identityCommitment, identityCommitment))
      .orderBy(nullifiers.usedAt)
      .limit(limit);

    return records;
  } catch (error) {
    console.error('Error getting nullifiers by identity:', error);
    return [];
  }
}

