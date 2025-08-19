import { encrypt, decrypt, encryptSensitiveFields, decryptSensitiveFields } from './encryption.js';
import fs from 'fs';
import path from 'path';

/**
 * Comprehensive data encryption service for sensitive data at rest
 */

// Define sensitive fields that should always be encrypted
const SENSITIVE_FIELDS = [
  'trapdoor',
  'nullifier',
  'privateKey',
  'seed',
  'secret',
  'token',
  'password',
  'email', 
  'userEmail'
];

/**
 * Encrypt identity data for storage
 * @param {object} identityData - Identity data to encrypt
 * @returns {object} - Encrypted identity data
 */
export function encryptIdentityData(identityData) {
  try {
    if (!identityData || typeof identityData !== 'object') {
      throw new Error('Invalid identity data provided');
    }

    // Clone the data to avoid modifying the original
    const dataToEncrypt = { ...identityData };
    
    // Add metadata
    dataToEncrypt.encryptedAt = new Date().toISOString();
    dataToEncrypt.version = '2.0';
    
    // Encrypt sensitive fields
    const encryptedData = encryptSensitiveFields(dataToEncrypt, SENSITIVE_FIELDS);
    
    // Add encryption metadata
    encryptedData._encrypted = true;
    encryptedData._encryptedFields = SENSITIVE_FIELDS.filter(field => 
      dataToEncrypt[field] !== undefined && dataToEncrypt[field] !== null
    );
    
    console.log('Identity data encrypted successfully');
    return encryptedData;
  } catch (error) {
    console.error('Error encrypting identity data:', error);
    throw new Error(`Failed to encrypt identity data: ${error.message}`);
  }
}

/**
 * Decrypt identity data from storage
 * @param {object} encryptedData - Encrypted identity data
 * @returns {object} - Decrypted identity data
 */
export function decryptIdentityData(encryptedData) {
  try {
    if (!encryptedData || typeof encryptedData !== 'object') {
      throw new Error('Invalid encrypted data provided');
    }

    if (!encryptedData._encrypted) {
      // Data is not encrypted, return as-is (backward compatibility)
      console.warn('Data is not encrypted, returning as-is');
      return encryptedData;
    }

    const fieldsToDecrypt = encryptedData._encryptedFields || SENSITIVE_FIELDS;
    const decryptedData = decryptSensitiveFields(encryptedData, fieldsToDecrypt);
    
    // Remove encryption metadata
    delete decryptedData._encrypted;
    delete decryptedData._encryptedFields;
    
    console.log('Identity data decrypted successfully');
    return decryptedData;
  } catch (error) {
    console.error('Error decrypting identity data:', error);
    throw new Error(`Failed to decrypt identity data: ${error.message}`);
  }
}

/**
 * Securely store encrypted data to file
 * @param {string} filePath - Path to store the file
 * @param {object} data - Data to encrypt and store
 * @param {array} sensitiveFields - Fields to encrypt (optional)
 */
export function secureStoreToFile(filePath, data, sensitiveFields = SENSITIVE_FIELDS) {
  try {
    if (!filePath || !data) {
      throw new Error('File path and data are required');
    }

    // Encrypt the data
    const encryptedData = encryptSensitiveFields(data, sensitiveFields);
    
    // Add metadata
    encryptedData._encrypted = true;
    encryptedData._encryptedFields = sensitiveFields.filter(field => 
      data[field] !== undefined && data[field] !== null
    );
    encryptedData._storedAt = new Date().toISOString();
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write encrypted data to file
    fs.writeFileSync(filePath, JSON.stringify(encryptedData, null, 2));
    
    console.log('Data securely stored to file:', filePath);
  } catch (error) {
    console.error('Error storing encrypted data to file:', error);
    throw new Error(`Failed to store encrypted data: ${error.message}`);
  }
}

/**
 * Securely load and decrypt data from file
 * @param {string} filePath - Path to the encrypted file
 * @returns {object} - Decrypted data
 */
export function secureLoadFromFile(filePath) {
  try {
    if (!filePath) {
      throw new Error('File path is required');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Encrypted file not found: ${filePath}`);
    }

    const encryptedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!encryptedData._encrypted) {
      // File is not encrypted, return as-is (backward compatibility)
      console.warn('File is not encrypted, returning as-is');
      return encryptedData;
    }

    const fieldsToDecrypt = encryptedData._encryptedFields || SENSITIVE_FIELDS;
    const decryptedData = decryptSensitiveFields(encryptedData, fieldsToDecrypt);
    
    // Remove metadata
    delete decryptedData._encrypted;
    delete decryptedData._encryptedFields;
    delete decryptedData._storedAt;
    
    console.log('Data securely loaded from file:', filePath);
    return decryptedData;
  } catch (error) {
    console.error('Error loading encrypted data from file:', error);
    throw new Error(`Failed to load encrypted data: ${error.message}`);
  }
}

/**
 * Encrypt group data for storage
 * @param {object} groupData - Group data to encrypt
 * @returns {object} - Encrypted group data
 */
export function encryptGroupData(groupData) {
  try {
    if (!groupData || typeof groupData !== 'object') {
      throw new Error('Invalid group data provided');
    }

    // For group data, we mainly encrypt member emails if present
    const sensitiveGroupFields = ['memberEmails', 'adminEmails', 'metadata'];
    
    const dataToEncrypt = { ...groupData };
    dataToEncrypt.encryptedAt = new Date().toISOString();
    dataToEncrypt.version = '2.0';
    
    const encryptedData = encryptSensitiveFields(dataToEncrypt, sensitiveGroupFields);
    
    encryptedData._encrypted = true;
    encryptedData._encryptedFields = sensitiveGroupFields.filter(field => 
      dataToEncrypt[field] !== undefined && dataToEncrypt[field] !== null
    );
    
    console.log('Group data encrypted successfully');
    return encryptedData;
  } catch (error) {
    console.error('Error encrypting group data:', error);
    throw new Error(`Failed to encrypt group data: ${error.message}`);
  }
}

/**
 * Decrypt group data from storage
 * @param {object} encryptedData - Encrypted group data
 * @returns {object} - Decrypted group data
 */
export function decryptGroupData(encryptedData) {
  try {
    if (!encryptedData || typeof encryptedData !== 'object') {
      throw new Error('Invalid encrypted group data provided');
    }

    if (!encryptedData._encrypted) {
      console.warn('Group data is not encrypted, returning as-is');
      return encryptedData;
    }

    const fieldsToDecrypt = encryptedData._encryptedFields || ['memberEmails', 'adminEmails', 'metadata'];
    const decryptedData = decryptSensitiveFields(encryptedData, fieldsToDecrypt);
    
    delete decryptedData._encrypted;
    delete decryptedData._encryptedFields;
    
    console.log('Group data decrypted successfully');
    return decryptedData;
  } catch (error) {
    console.error('Error decrypting group data:', error);
    throw new Error(`Failed to decrypt group data: ${error.message}`);
  }
}

/**
 * Migrate unencrypted data to encrypted format
 * @param {string} filePath - Path to the data file
 * @param {array} sensitiveFields - Fields to encrypt
 */
export function migrateToEncrypted(filePath, sensitiveFields = SENSITIVE_FIELDS) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log('File does not exist, no migration needed:', filePath);
      return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (data._encrypted) {
      console.log('Data is already encrypted, no migration needed');
      return;
    }

    console.log('Migrating unencrypted data to encrypted format...');
    
    // Create backup
    const backupPath = `${filePath}.backup.${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
    console.log('Backup created:', backupPath);
    
    // Encrypt and save
    secureStoreToFile(filePath, data, sensitiveFields);
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error during migration:', error);
    throw new Error(`Failed to migrate data: ${error.message}`);
  }
}

/**
 * Verify data integrity after encryption/decryption
 * @param {object} originalData - Original data
 * @param {object} processedData - Data after encryption/decryption cycle
 * @param {array} fieldsToCheck - Fields to verify
 * @returns {boolean} - Whether data integrity is maintained
 */
export function verifyDataIntegrity(originalData, processedData, fieldsToCheck = []) {
  try {
    const fieldsToVerify = fieldsToCheck.length > 0 ? fieldsToCheck : Object.keys(originalData);
    
    for (const field of fieldsToVerify) {
      if (originalData[field] !== processedData[field]) {
        console.error(`Data integrity check failed for field: ${field}`);
        return false;
      }
    }
    
    console.log('Data integrity verification passed');
    return true;
  } catch (error) {
    console.error('Error during data integrity verification:', error);
    return false;
  }
}