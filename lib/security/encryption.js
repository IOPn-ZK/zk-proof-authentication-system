import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Data encryption utilities for sensitive data at rest
 */

// Get encryption key from environment or generate one
function getEncryptionKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    // Validate the key length
    if (envKey.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }
    return envKey;
  }
  
  // For development, generate a key and warn
  console.warn('WARNING: No ENCRYPTION_KEY found in environment. Using generated key for development.');
  console.warn('In production, set ENCRYPTION_KEY environment variable.');
  console.warn('Generated key will change on each restart, causing encrypted data to become unreadable.');
  
  const generatedKey = crypto.randomBytes(32).toString('hex');
  console.warn('Generated encryption key:', generatedKey.substring(0, 8) + '...');
  
  return generatedKey;
}

const ENCRYPTION_KEY = getEncryptionKey();
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt data
 * @param {string} text - Text to encrypt
 * @returns {object} - Encrypted data with metadata
 */
export function encrypt(text) {
  try {
    if (!text) {
      throw new Error('Text to encrypt cannot be empty');
    }
    
    if (typeof text !== 'string') {
      throw new Error('Text to encrypt must be a string');
    }
    
    // Ensure encryption key is available
    if (!ENCRYPTION_KEY) {
      throw new Error('ENCRYPTION_KEY is not available');
    }
    
    const iv = crypto.randomBytes(16);
    // Use createCipheriv instead of deprecated createCipher
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: ALGORITHM
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt data
 * @param {object} encryptedData - Encrypted data object
 * @returns {string} - Decrypted text
 */
export function decrypt(encryptedData) {
  try {
    if (!encryptedData || !encryptedData.encrypted) {
      throw new Error('Invalid encrypted data');
    }
    
    const { encrypted, iv, authTag, algorithm = ALGORITHM } = encryptedData;
    
    // Use createDecipheriv instead of deprecated createDecipher
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Encrypt and save data to file
 * @param {string} filePath - Path to save encrypted file
 * @param {object} data - Data to encrypt and save
 */
export function encryptToFile(filePath, data) {
  try {
    if (!filePath || !data) {
      throw new Error('File path and data are required for file encryption');
    }
    
    const jsonString = JSON.stringify(data);
    const encryptedData = encrypt(jsonString);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(encryptedData, null, 2));
    console.log('Data encrypted and saved to file:', filePath);
  } catch (error) {
    console.error('Error encrypting to file:', error);
    throw new Error(`Failed to encrypt and save to file: ${error.message}`);
  }
}

/**
 * Decrypt and load data from file
 * @param {string} filePath - Path to encrypted file
 * @returns {object} - Decrypted data
 */
export function decryptFromFile(filePath) {
  try {
    if (!filePath) {
      throw new Error('File path is required for file decryption');
    }
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Encrypted file not found: ${filePath}`);
    }
    
    const encryptedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const decryptedString = decrypt(encryptedData);
    
    const result = JSON.parse(decryptedString);
    console.log('Data decrypted and loaded from file:', filePath);
    return result;
  } catch (error) {
    console.error('Error decrypting from file:', error);
    throw new Error(`Failed to decrypt from file: ${error.message}`);
  }
}

/**
 * Hash sensitive data for comparison
 * @param {string} data - Data to hash
 * @param {string} salt - Optional salt (will generate if not provided)
 * @returns {object} - Hash and salt
 */
export function hashData(data, salt = null) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(data, actualSalt, 100000, 64, 'sha512');
  
  return {
    hash: hash.toString('hex'),
    salt: actualSalt
  };
}

/**
 * Verify hashed data
 * @param {string} data - Original data
 * @param {string} hash - Hash to verify against
 * @param {string} salt - Salt used for hashing
 * @returns {boolean} - Verification result
 */
export function verifyHash(data, hash, salt) {
  const newHash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512');
  return hash === newHash.toString('hex');
}

/**
 * Generate secure random token
 * @param {number} length - Token length in bytes
 * @returns {string} - Secure random token
 */
export function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Encrypt sensitive fields in an object
 * @param {object} obj - Object with sensitive fields
 * @param {array} sensitiveFields - Array of field names to encrypt
 * @returns {object} - Object with encrypted sensitive fields
 */
export function encryptSensitiveFields(obj, sensitiveFields) {
  try {
    if (!obj || typeof obj !== 'object') {
      throw new Error('Invalid object provided for encryption');
    }
    
    if (!Array.isArray(sensitiveFields)) {
      throw new Error('Sensitive fields must be an array');
    }
    
    const result = { ...obj };
    
    for (const field of sensitiveFields) {
      if (result[field] !== undefined && result[field] !== null) {
        try {
          result[field] = encrypt(result[field].toString());
        } catch (encryptError) {
          console.error(`Failed to encrypt field '${field}':`, encryptError);
          throw new Error(`Encryption failed for field '${field}': ${encryptError.message}`);
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error in encryptSensitiveFields:', error);
    throw error;
  }
}

/**
 * Decrypt sensitive fields in an object
 * @param {object} obj - Object with encrypted sensitive fields
 * @param {array} sensitiveFields - Array of field names to decrypt
 * @returns {object} - Object with decrypted sensitive fields
 */
export function decryptSensitiveFields(obj, sensitiveFields) {
  const result = { ...obj };
  
  for (const field of sensitiveFields) {
    if (result[field] && typeof result[field] === 'object' && result[field].encrypted) {
      result[field] = decrypt(result[field]);
    }
  }
  
  return result;
}