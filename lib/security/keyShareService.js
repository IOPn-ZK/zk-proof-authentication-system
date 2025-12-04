import secrets from 'secrets.js-34r7h';
import crypto from 'crypto';
import { encrypt, decrypt } from './encryption.js';

/**
 * Key Share Service for 2-of-3 Shamir Secret Sharing
 * 
 * Share Distribution:
 * - Share A (Index 1): Device (stored client-side, encrypted with device key)
 * - Share B (Index 2): Server (stored encrypted in database)
 * - Share C (Index 3): Cloud Backup (encrypted client-side, uploaded to Google Drive)
 * 
 * Threshold: M=2, N=3 (any 2 shares can reconstruct the secret)
 */

const SHARE_CONFIG = {
  totalShares: 3,
  threshold: 2,
  shareIndices: [1, 2, 3] // Share A=1, Share B=2, Share C=3
};

/**
 * Convert private key (hex string) to format suitable for SSS
 * @param {string} privateKeyHex - Private key as hex string (with or without 0x prefix)
 * @returns {string} - Hex string without 0x prefix, padded to 64 chars
 */
function normalizePrivateKey(privateKeyHex) {
  let key = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
  // Ensure it's 64 hex chars (32 bytes)
  if (key.length < 64) {
    key = key.padStart(64, '0');
  } else if (key.length > 64) {
    key = key.slice(0, 64);
  }
  return key;
}

/**
 * Split a private key into N shares with threshold M
 * @param {string} privateKeyHex - Private key as hex string
 * @param {number} n - Total number of shares (default: 3)
 * @param {number} m - Threshold (default: 2)
 * @returns {Array<string>} - Array of share hex strings
 */
export function splitPrivateKey(privateKeyHex, n = SHARE_CONFIG.totalShares, m = SHARE_CONFIG.threshold) {
  try {
    const normalizedKey = normalizePrivateKey(privateKeyHex);
    
    // Convert hex string to bytes
    const keyBytes = Buffer.from(normalizedKey, 'hex');
    
    // secrets.js expects hex string, padLength should be at least key length
    const padLength = 256; // 256 bits = 32 bytes
    
    // Split the secret into shares
    // secrets.js returns shares as hex strings
    const shares = secrets.share(keyBytes.toString('hex'), n, m, padLength);
    
    if (!shares || shares.length !== n) {
      throw new Error(`Failed to generate ${n} shares`);
    }
    
    // Validate shares
    for (let i = 0; i < shares.length; i++) {
      if (!shares[i] || typeof shares[i] !== 'string') {
        throw new Error(`Invalid share at index ${i}`);
      }
    }
    
    return shares;
  } catch (error) {
    console.error('Error splitting private key:', error);
    throw new Error(`Failed to split private key: ${error.message}`);
  }
}

/**
 * Combine shares to reconstruct the private key
 * @param {Array<string>} shares - Array of share hex strings (minimum threshold number)
 * @returns {string} - Reconstructed private key as hex string (without 0x prefix)
 */
export function combineShares(shares) {
  try {
    if (!Array.isArray(shares) || shares.length < SHARE_CONFIG.threshold) {
      throw new Error(`Need at least ${SHARE_CONFIG.threshold} shares to reconstruct key`);
    }
    
    if (shares.length > SHARE_CONFIG.totalShares) {
      throw new Error(`Too many shares provided (max ${SHARE_CONFIG.totalShares})`);
    }
    
    // Validate all shares are strings
    for (let i = 0; i < shares.length; i++) {
      if (!shares[i] || typeof shares[i] !== 'string') {
        throw new Error(`Invalid share at index ${i}`);
      }
    }
    
    // Combine shares to reconstruct the secret
    const reconstructedHex = secrets.combine(shares);
    
    if (!reconstructedHex || typeof reconstructedHex !== 'string') {
      throw new Error('Failed to reconstruct private key from shares');
    }
    
    // Normalize the result
    const normalizedKey = normalizePrivateKey(reconstructedHex);
    
    return normalizedKey;
  } catch (error) {
    console.error('Error combining shares:', error);
    throw new Error(`Failed to combine shares: ${error.message}`);
  }
}

/**
 * Encrypt a share for server storage
 * @param {string} share - Share hex string
 * @returns {object} - Encrypted share data
 */
export function encryptShareForServer(share) {
  try {
    if (!share || typeof share !== 'string') {
      throw new Error('Invalid share provided');
    }
    
    // Encrypt using server encryption key
    const encrypted = encrypt(share);
    
    // Generate hash for integrity verification
    const shareHash = crypto.createHash('sha256').update(share).digest('hex');
    
    return {
      encryptedShare: encrypted,
      shareHash: shareHash
    };
  } catch (error) {
    console.error('Error encrypting share for server:', error);
    throw new Error(`Failed to encrypt share: ${error.message}`);
  }
}

/**
 * Decrypt a share from server storage
 * @param {object} encryptedShareData - Encrypted share data from database
 * @returns {string} - Decrypted share hex string
 */
export function decryptShareFromServer(encryptedShareData) {
  try {
    if (!encryptedShareData || !encryptedShareData.encrypted) {
      throw new Error('Invalid encrypted share data');
    }
    
    const decryptedShare = decrypt(encryptedShareData);
    
    return decryptedShare;
  } catch (error) {
    console.error('Error decrypting share from server:', error);
    throw new Error(`Failed to decrypt share: ${error.message}`);
  }
}

/**
 * Verify share integrity using hash
 * @param {string} share - Share hex string
 * @param {string} expectedHash - Expected SHA-256 hash
 * @returns {boolean} - True if share matches hash
 */
export function verifyShareIntegrity(share, expectedHash) {
  try {
    if (!share || !expectedHash) {
      return false;
    }
    
    const actualHash = crypto.createHash('sha256').update(share).digest('hex');
    return actualHash === expectedHash;
  } catch (error) {
    console.error('Error verifying share integrity:', error);
    return false;
  }
}

/**
 * Get share type label
 * @param {number} shareIndex - Share index (1, 2, or 3)
 * @returns {string} - Share type label
 */
export function getShareTypeLabel(shareIndex) {
  const labels = {
    1: 'DEVICE',
    2: 'SERVER',
    3: 'CLOUD_BACKUP'
  };
  return labels[shareIndex] || 'UNKNOWN';
}

/**
 * Validate share index
 * @param {number} shareIndex - Share index to validate
 * @returns {boolean} - True if valid
 */
export function isValidShareIndex(shareIndex) {
  return shareIndex >= 1 && shareIndex <= SHARE_CONFIG.totalShares;
}

/**
 * Get share configuration
 * @returns {object} - Share configuration
 */
export function getShareConfig() {
  return {
    ...SHARE_CONFIG,
    shareLabels: {
      1: 'Device (Client-side)',
      2: 'Server (Database)',
      3: 'Cloud Backup (Google Drive)'
    }
  };
}

