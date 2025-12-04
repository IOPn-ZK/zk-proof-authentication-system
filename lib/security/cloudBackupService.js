/**
 * Cloud Backup Service
 * Handles encryption and upload of Share C (cloud backup share) to Google Drive
 * 
 * Flow:
 * 1. Client encrypts Share C with user's password/biometric
 * 2. Client uploads encrypted share to Google Drive via OAuth
 * 3. Server stores metadata (file ID, hash) in database
 * 4. On recovery, client downloads and decrypts share
 */

/**
 * Encrypt Share C for cloud backup
 * Uses additional user-provided encryption (password/biometric) on top of base encryption
 * @param {string} shareC - Share C hex string
 * @param {string} userPassword - Optional user password for additional encryption
 * @returns {Promise<object>} - Encrypted share data ready for upload
 */
export async function encryptShareForCloudBackup(shareC, userPassword = null) {
  try {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      throw new Error('Web Crypto API not available');
    }
    
    const shareBuffer = new TextEncoder().encode(shareC);
    
    // Generate encryption key from user password or use device key
    let encryptionKey;
    
    if (userPassword) {
      // Derive key from user password using PBKDF2
      const passwordKey = await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(userPassword),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      );
      
      encryptionKey = await window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: new TextEncoder().encode('zk_cloud_backup_salt_v1'),
          iterations: 100000,
          hash: 'SHA-256'
        },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    } else {
      // Use device key as fallback (less secure but more convenient)
      // In production, require user password or biometric
      throw new Error('User password or biometric required for cloud backup encryption');
    }
    
    // Generate random IV
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt share
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      encryptionKey,
      shareBuffer
    );
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedBuffer), iv.length);
    
    // Convert to base64 for upload
    const encryptedBase64 = btoa(String.fromCharCode(...combined));
    
    // Generate hash for integrity verification
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', shareBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return {
      encryptedData: encryptedBase64,
      hash: hashHex,
      encrypted: true,
      version: '1.0'
    };
  } catch (error) {
    console.error('Error encrypting share for cloud backup:', error);
    throw new Error(`Failed to encrypt share for cloud backup: ${error.message}`);
  }
}

/**
 * Decrypt Share C from cloud backup
 * @param {string} encryptedBase64 - Encrypted share data (base64)
 * @param {string} userPassword - User password used for encryption
 * @returns {Promise<string>} - Decrypted Share C hex string
 */
export async function decryptShareFromCloudBackup(encryptedBase64, userPassword) {
  try {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      throw new Error('Web Crypto API not available');
    }
    
    if (!userPassword) {
      throw new Error('User password required for decryption');
    }
    
    // Derive encryption key from password
    const passwordKey = await window.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(userPassword),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const encryptionKey = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode('zk_cloud_backup_salt_v1'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    // Convert from base64
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);
    
    // Decrypt
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      encryptionKey,
      encryptedData
    );
    
    // Convert back to string
    const shareC = new TextDecoder().decode(decryptedBuffer);
    
    return shareC;
  } catch (error) {
    console.error('Error decrypting share from cloud backup:', error);
    throw new Error(`Failed to decrypt share from cloud backup: ${error.message}`);
  }
}

/**
 * Upload encrypted share to Google Drive
 * This is a client-side function that uses Google Drive API
 * @param {string} encryptedData - Encrypted share data (base64)
 * @param {string} fileName - File name for backup
 * @param {string} accessToken - Google OAuth access token
 * @returns {Promise<object>} - Upload result with file ID
 */
export async function uploadToGoogleDrive(encryptedData, fileName, accessToken) {
  try {
    // Create file metadata
    const metadata = {
      name: fileName || 'zk_share_backup.json',
      mimeType: 'application/json',
      description: 'ZK Identity Share Backup (Encrypted)'
    };
    
    // Create file content
    const fileContent = JSON.stringify({
      encrypted: true,
      version: '1.0',
      data: encryptedData,
      createdAt: new Date().toISOString()
    });
    
    // Upload to Google Drive
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([fileContent], { type: 'application/json' }));
    
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: form
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Drive upload failed: ${error.error?.message || 'Unknown error'}`);
    }
    
    const result = await response.json();
    
    return {
      fileId: result.id,
      fileName: result.name,
      webViewLink: result.webViewLink,
      createdTime: result.createdTime
    };
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    throw new Error(`Failed to upload to Google Drive: ${error.message}`);
  }
}

/**
 * Download encrypted share from Google Drive
 * @param {string} fileId - Google Drive file ID
 * @param {string} accessToken - Google OAuth access token
 * @returns {Promise<string>} - Encrypted share data (base64)
 */
export async function downloadFromGoogleDrive(fileId, accessToken) {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Drive download failed: ${error.error?.message || 'Unknown error'}`);
    }
    
    const fileData = await response.json();
    
    if (!fileData.encrypted || !fileData.data) {
      throw new Error('Invalid backup file format');
    }
    
    return fileData.data;
  } catch (error) {
    console.error('Error downloading from Google Drive:', error);
    throw new Error(`Failed to download from Google Drive: ${error.message}`);
  }
}

/**
 * Generate backup file name
 * @param {string} auth0Sub - Auth0 user sub
 * @returns {string} - Backup file name
 */
export function generateBackupFileName(auth0Sub) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `zk_share_backup_${auth0Sub.slice(0, 8)}_${timestamp}.json`;
}

