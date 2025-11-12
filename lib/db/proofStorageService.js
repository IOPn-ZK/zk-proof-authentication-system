import { eq, desc, and } from 'drizzle-orm';
import { db } from './connection.js';
import { verifiedProofs } from './schema.js';
import logger from '../logging/logger.js';

/**
 * Proof Storage Service
 * Stores successfully verified ZK proofs linked to wallet addresses
 * Ensures all proofs are publicly verifiable and bound to the same wallet identity
 */

/**
 * Store a verified proof linked to wallet address
 * @param {string} walletAddress - Wallet address (EOA) that generated the proof
 * @param {string} identityCommitment - Identity commitment from the proof
 * @param {string} nullifierHash - Nullifier hash from the proof
 * @param {string} externalNullifier - External nullifier value
 * @param {string|null} signal - Signal value (optional)
 * @param {number} groupId - Group ID
 * @param {number} treeDepth - Merkle tree depth
 * @param {object} fullProof - The complete proof object (will be stored as JSON)
 * @param {number|null} verificationTimeMs - Verification time in milliseconds
 * @param {Object|null} req - Express request object for IP and user agent
 * @param {number|null} tenantId - Tenant ID (optional)
 * @returns {Promise<boolean>} True if stored successfully
 */
export async function storeVerifiedProof(
  walletAddress,
  identityCommitment,
  nullifierHash,
  externalNullifier,
  signal = null,
  groupId = 1,
  treeDepth = 20,
  fullProof = null,
  verificationTimeMs = null,
  req = null,
  tenantId = null
) {
  try {
    if (!walletAddress || !identityCommitment || !nullifierHash || !externalNullifier) {
      console.warn('Missing required parameters for proof storage');
      return false;
    }

    if (!fullProof) {
      console.warn('No proof data provided for storage');
      return false;
    }

    // Extract IP address and user agent from request
    const ipAddress = req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req?.headers?.['x-real-ip'] ||
                     req?.connection?.remoteAddress ||
                     null;
    
    const userAgent = req?.headers?.['user-agent'] || null;

    // Serialize proof data to JSON (handle BigInt values)
    const proofDataJson = JSON.stringify(fullProof, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    );

    // Extract merkle tree root from proof
    const merkleTreeRoot = fullProof.merkleTreeRoot 
      ? (typeof fullProof.merkleTreeRoot === 'bigint' 
          ? fullProof.merkleTreeRoot.toString() 
          : String(fullProof.merkleTreeRoot))
      : null;

    await db.insert(verifiedProofs).values({
      walletAddress,
      identityCommitment,
      nullifierHash,
      externalNullifier: externalNullifier.toString(),
      signal: signal ? signal.toString() : null,
      groupId,
      treeDepth,
      proofData: proofDataJson,
      merkleTreeRoot,
      verificationTimeMs,
      ipAddress,
      userAgent,
      tenantId: tenantId ?? null,
    });

    logger.info('Verified proof stored', {
      walletAddress: walletAddress.substring(0, 10) + '...',
      identityCommitment: identityCommitment.substring(0, 16) + '...',
      nullifierHash: nullifierHash.substring(0, 16) + '...',
      groupId
    });

    return true;
  } catch (error) {
    // If it's a unique constraint violation, the proof was already stored
    if (error.code === '23505' || error.message.includes('unique')) {
      logger.warn('Proof already stored (unique constraint)', {
        nullifierHash: nullifierHash?.substring(0, 16) + '...'
      });
      return false;
    }
    
    logger.error('Error storing verified proof', { 
      error: error.message,
      walletAddress: walletAddress?.substring(0, 10) + '...'
    });
    return false;
  }
}

/**
 * Get verified proofs for a specific wallet address
 * @param {string} walletAddress - Wallet address
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} Array of verified proof records
 */
export async function getVerifiedProofsByWallet(walletAddress, limit = 10) {
  try {
    const records = await db
      .select()
      .from(verifiedProofs)
      .where(eq(verifiedProofs.walletAddress, walletAddress))
      .orderBy(desc(verifiedProofs.verifiedAt))
      .limit(limit);

    // Parse proof data JSON
    return records.map(record => ({
      ...record,
      proofData: JSON.parse(record.proofData)
    }));
  } catch (error) {
    logger.error('Error getting verified proofs by wallet', { error: error.message });
    return [];
  }
}

/**
 * Get verified proofs for a specific identity commitment
 * @param {string} identityCommitment - Identity commitment
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} Array of verified proof records
 */
export async function getVerifiedProofsByIdentity(identityCommitment, limit = 10) {
  try {
    const records = await db
      .select()
      .from(verifiedProofs)
      .where(eq(verifiedProofs.identityCommitment, identityCommitment))
      .orderBy(desc(verifiedProofs.verifiedAt))
      .limit(limit);

    // Parse proof data JSON
    return records.map(record => ({
      ...record,
      proofData: JSON.parse(record.proofData)
    }));
  } catch (error) {
    logger.error('Error getting verified proofs by identity', { error: error.message });
    return [];
  }
}

/**
 * Get verified proof by nullifier hash
 * @param {string} nullifierHash - Nullifier hash
 * @returns {Promise<Object|null>} Verified proof record or null if not found
 */
export async function getVerifiedProofByNullifier(nullifierHash) {
  try {
    const records = await db
      .select()
      .from(verifiedProofs)
      .where(eq(verifiedProofs.nullifierHash, nullifierHash))
      .limit(1);

    if (records.length === 0) {
      return null;
    }

    const record = records[0];
    return {
      ...record,
      proofData: JSON.parse(record.proofData)
    };
  } catch (error) {
    logger.error('Error getting verified proof by nullifier', { error: error.message });
    return null;
  }
}

/**
 * Get verified proofs for a group
 * @param {number} groupId - Group ID
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} Array of verified proof records
 */
export async function getVerifiedProofsByGroup(groupId, limit = 50) {
  try {
    const records = await db
      .select()
      .from(verifiedProofs)
      .where(eq(verifiedProofs.groupId, groupId))
      .orderBy(desc(verifiedProofs.verifiedAt))
      .limit(limit);

    // Parse proof data JSON
    return records.map(record => ({
      ...record,
      proofData: JSON.parse(record.proofData)
    }));
  } catch (error) {
    logger.error('Error getting verified proofs by group', { error: error.message });
    return [];
  }
}

