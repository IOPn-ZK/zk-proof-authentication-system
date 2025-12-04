/**
 * Device Storage Utilities
 * Handles secure storage of Share A (device share) using Web Crypto API
 * 
 * Storage locations:
 * - Browser: localStorage (encrypted) or IndexedDB
 * - Mobile: Secure Enclave / Keychain
 */

const STORAGE_KEY_PREFIX = 'zk_share_a_';
const DEVICE_KEY_PREFIX = 'zk_device_key_';

/**
 * Generate or retrieve device encryption key
 * Uses Web Crypto API to generate a key derived from user's device
 * @param {string} auth0Sub - Auth0 user sub for key derivation
 * @returns {Promise<CryptoKey>} - Device encryption key
 */
export async function getDeviceEncryptionKey(auth0Sub) {
  try {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      throw new Error('Web Crypto API not available (server-side or unsupported browser)');
    }
    
    const keyName = `${DEVICE_KEY_PREFIX}${auth0Sub}`;
    
    // Try to retrieve existing key from IndexedDB or generate new one
    // For simplicity, we'll use a deterministic key derived from auth0Sub
    // In production, you might want to use WebAuthn or hardware security module
    
    const keyMaterial = new TextEncoder().encode(auth0Sub + '_device_key_v1');
    
    // Import key for AES-GCM encryption
    const key = await window.crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    // Derive AES-GCM key
    const derivedKey = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode('zk_device_salt_v1'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    return derivedKey;
  } catch (error) {
    console.error('Error getting device encryption key:', error);
    throw new Error(`Failed to get device encryption key: ${error.message}`);
  }
}

/**
 * Encrypt and store Share A (device share) locally
 * @param {string} auth0Sub - Auth0 user sub
 * @param {string} shareA - Share A hex string
 * @returns {Promise<void>}
 */
export async function storeDeviceShare(auth0Sub, shareA) {
  try {
    if (typeof window === 'undefined') {
      throw new Error('Device storage only available in browser');
    }
    
    const deviceKey = await getDeviceEncryptionKey(auth0Sub);
    
    // Convert share to ArrayBuffer
    const shareBuffer = new TextEncoder().encode(shareA);
    
    // Generate random IV
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt share
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      deviceKey,
      shareBuffer
    );
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedBuffer), iv.length);
    
    // Convert to base64 for storage
    const encryptedBase64 = btoa(String.fromCharCode(...combined));
    
    // Store in localStorage (in production, consider IndexedDB for larger data)
    const storageKey = `${STORAGE_KEY_PREFIX}${auth0Sub}`;
    localStorage.setItem(storageKey, encryptedBase64);
    
    console.log('Device share stored successfully');
  } catch (error) {
    console.error('Error storing device share:', error);
    throw new Error(`Failed to store device share: ${error.message}`);
  }
}

/**
 * Retrieve and decrypt Share A (device share) from local storage
 * @param {string} auth0Sub - Auth0 user sub
 * @returns {Promise<string>} - Decrypted Share A hex string
 */
export async function retrieveDeviceShare(auth0Sub) {
  try {
    if (typeof window === 'undefined') {
      throw new Error('Device storage only available in browser');
    }
    
    const storageKey = `${STORAGE_KEY_PREFIX}${auth0Sub}`;
    const encryptedBase64 = localStorage.getItem(storageKey);
    
    if (!encryptedBase64) {
      throw new Error('Device share not found in local storage');
    }
    
    const deviceKey = await getDeviceEncryptionKey(auth0Sub);
    
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
      deviceKey,
      encryptedData
    );
    
    // Convert back to string
    const shareA = new TextDecoder().decode(decryptedBuffer);
    
    return shareA;
  } catch (error) {
    console.error('Error retrieving device share:', error);
    throw new Error(`Failed to retrieve device share: ${error.message}`);
  }
}

/**
 * Check if device share exists
 * @param {string} auth0Sub - Auth0 user sub
 * @returns {boolean} - True if device share exists
 */
export function hasDeviceShare(auth0Sub) {
  if (typeof window === 'undefined') {
    return false;
  }
  
  const storageKey = `${STORAGE_KEY_PREFIX}${auth0Sub}`;
  return localStorage.getItem(storageKey) !== null;
}

/**
 * Remove device share from local storage
 * @param {string} auth0Sub - Auth0 user sub
 * @returns {void}
 */
export function removeDeviceShare(auth0Sub) {
  if (typeof window === 'undefined') {
    return;
  }
  
  const storageKey = `${STORAGE_KEY_PREFIX}${auth0Sub}`;
  localStorage.removeItem(storageKey);
}

/**
 * Clear all device shares (for logout/cleanup)
 * @returns {void}
 */
export function clearAllDeviceShares() {
  if (typeof window === 'undefined') {
    return;
  }
  
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
}

