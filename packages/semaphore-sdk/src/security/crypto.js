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
 * Generate a cryptographically secure seed (no email dependency)
 * @param {string} userId - User identifier for deterministic generation
 * @param {string} appSecret - Application secret for additional entropy
 * @returns {string} - Secure seed string
 */
export function generateSecureSeed(userId, appSecret) {
  try {
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID must be a valid string');
    }
    
    if (!appSecret || typeof appSecret !== 'string') {
      throw new Error('App secret must be a valid string');
    }
    
    // Generate cryptographically secure random bytes
    const randomBytes = generateSecureRandom(32);
    
    if (!randomBytes || randomBytes.length !== 32) {
      throw new Error('Failed to generate secure random bytes');
    }
    
    // Use HKDF for key derivation with secure parameters
    const salt = crypto.randomBytes(16);
    const info = Buffer.from('semaphore-seed-v2', 'utf8');
    const ikm = Buffer.concat([
      Buffer.from(appSecret, 'utf8'),
      Buffer.from(userId, 'utf8'),
      randomBytes
    ]);
    
    // Derive 32-byte key using HKDF-SHA256
    const derivedKey = crypto.hkdfSync('sha256', ikm, salt, info, 32);
    
    // Create final seed by combining derived key with timestamp
    const timestamp = Date.now().toString();
    const finalSeed = crypto.createHash('sha256')
      .update(derivedKey)
      .update(timestamp)
      .digest('hex');
    
    if (!finalSeed || typeof finalSeed !== 'string' || finalSeed.length !== 64) {
      throw new Error('Failed to generate valid hash for seed');
    }
    
    return finalSeed;
  } catch (error) {
    console.error('Error generating secure seed:', error);
    throw new Error(`Failed to generate secure seed: ${error.message}`);
  }
}

/**
 * Encrypt sensitive data at rest
 * @param {string} data - Data to encrypt
 * @param {string} key - Encryption key (hex string)
 * @returns {object} - Encrypted data with IV
 */
export function encryptData(data, key) {
  try {
    if (!data || !key) {
      throw new Error('Data and key are required for encryption');
    }
    
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    
    // Ensure key is 32 bytes (64 hex chars)
    let keyBuffer;
    if (key.length === 64) {
      keyBuffer = Buffer.from(key, 'hex');
    } else if (key.length >= 32) {
      // If key is longer, hash it to get 32 bytes
      keyBuffer = crypto.createHash('sha256').update(key).digest();
    } else {
      // If key is shorter, pad it
      keyBuffer = crypto.createHash('sha256').update(key).digest();
    }
    
    const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
    
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
 * @param {string} key - Decryption key (hex string)
 * @returns {string} - Decrypted data
 */
export function decryptData(encryptedData, key) {
  try {
    if (!encryptedData || !key) {
      throw new Error('Encrypted data and key are required for decryption');
    }
    
    const algorithm = 'aes-256-gcm';
    
    // Ensure key is 32 bytes (64 hex chars)
    let keyBuffer;
    if (key.length === 64) {
      keyBuffer = Buffer.from(key, 'hex');
    } else if (key.length >= 32) {
      keyBuffer = crypto.createHash('sha256').update(key).digest();
    } else {
      keyBuffer = crypto.createHash('sha256').update(key).digest();
    }
    
    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, Buffer.from(encryptedData.iv, 'hex'));
    
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
 * @returns {string} - Hashed data in format "salt:hash"
 */
export function hashData(data, salt = null) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(data, actualSalt, 10000, 64, 'sha512');
  return `${actualSalt}:${hash.toString('hex')}`;
}

/**
 * Verify hashed data
 * @param {string} data - Original data
 * @param {string} hashedData - Hashed data to verify against (format: "salt:hash")
 * @returns {boolean} - Verification result
 */
export function verifyHash(data, hashedData) {
  const [salt, hash] = hashedData.split(':');
  const newHash = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512');
  return hash === newHash.toString('hex');
}

