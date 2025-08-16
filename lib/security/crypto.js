import crypto from 'crypto';

/**
 * Generate cryptographically secure random bytes
 * @param {number} length - Number of bytes to generate
 * @returns {Buffer} - Secure random bytes
 */
export function generateSecureRandom(length = 32) {
  return crypto.randomBytes(length);
}

/**
 * Generate a secure seed for identity creation
 * @param {string} userEmail - User's email for additional entropy
 * @returns {string} - Secure seed string
 */
export function generateSecureSeed(userEmail) {
  try {
    if (!userEmail || typeof userEmail !== 'string') {
      throw new Error('User email must be a valid string');
    }
    
    // Combine secure random bytes with user email for additional entropy
    const randomBytes = generateSecureRandom(32);
    
    if (!randomBytes || randomBytes.length !== 32) {
      throw new Error('Failed to generate secure random bytes');
    }
    
    const timestamp = Date.now().toString();
    const combined = `${randomBytes.toString('hex')}-${userEmail}-${timestamp}`;
    
    // Hash the combined string for consistent length
    const hash = crypto.createHash('sha256').update(combined).digest('hex');
    
    if (!hash || typeof hash !== 'string' || hash.length !== 64) {
      throw new Error('Failed to generate valid hash for seed');
    }
    
    console.log('Secure seed generated successfully');
    return hash;
  } catch (error) {
    console.error('Error generating secure seed:', error);
    throw new Error(`Failed to generate secure seed: ${error.message}`);
  }
}

/**
 * Encrypt sensitive data at rest
 * @param {string} data - Data to encrypt
 * @param {string} key - Encryption key
 * @returns {object} - Encrypted data with IV
 */
export function encryptData(data, key) {
  try {
    if (!data || !key) {
      throw new Error('Data and key are required for encryption');
    }
    
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    // Use createCipheriv instead of deprecated createCipher
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    console.error('Encrypt data error:', error);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt sensitive data
 * @param {object} encryptedData - Encrypted data object
 * @param {string} key - Decryption key
 * @returns {string} - Decrypted data
 */
export function decryptData(encryptedData, key) {
  try {
    if (!encryptedData || !key) {
      throw new Error('Encrypted data and key are required for decryption');
    }
    
    const algorithm = 'aes-256-gcm';
    // Use createDecipheriv instead of deprecated createDecipher
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), Buffer.from(encryptedData.iv, 'hex'));
    
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decrypt data error:', error);
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Hash sensitive data for storage
 * @param {string} data - Data to hash
 * @param {string} salt - Salt for hashing
 * @returns {string} - Hashed data
 */
export function hashData(data, salt = null) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(data, actualSalt, 10000, 64, 'sha512');
  return `${actualSalt}:${hash.toString('hex')}`;
}

/**
 * Verify hashed data
 * @param {string} data - Original data
 * @param {string} hashedData - Hashed data to verify against
 * @returns {boolean} - Verification result
 */
export function verifyHash(data, hashedData) {
  const [salt, hash] = hashedData.split(':');
  const newHash = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512');
  return hash === newHash.toString('hex');
}