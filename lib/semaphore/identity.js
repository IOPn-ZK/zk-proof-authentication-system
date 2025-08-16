import { Identity } from '@semaphore-protocol/identity';
import crypto from 'crypto';

/**
 * Generate a deterministic Semaphore identity using HKDF
 * @param {string} auth0Sub - Auth0 user sub (unique identifier)
 * @param {string} appSecret - Application secret for salting
 * @param {string} salt - Optional additional salt
 * @returns {Object} Object containing identity and commitment
 */
export function generateDeterministicIdentity(auth0Sub, appSecret, salt = 'semaphore-identity-v1') {
  try {
    if (!auth0Sub || !appSecret) {
      throw new Error('Auth0 sub and app secret are required');
    }
    
    // Create HKDF key derivation
    const info = Buffer.from(salt, 'utf8');
    const key = Buffer.from(appSecret, 'utf8');
    const saltBuffer = Buffer.from(auth0Sub, 'utf8');
    
    // Generate 32-byte derived key using HKDF
    const derivedKey = crypto.hkdfSync('sha256', key, saltBuffer, info, 32);
    
    // Convert to hex string for Semaphore Identity
    const privateKey = derivedKey.toString('hex');
    
    // Create Semaphore Identity
    const identity = new Identity(privateKey);
    
    return {
      identity,
      commitment: identity.commitment.toString(),
      privateKey: privateKey,
      auth0Sub: auth0Sub
    };
  } catch (error) {
    console.error('Error generating deterministic identity:', error);
    throw new Error('Failed to generate deterministic identity');
  }
}

/**
 * Retrieve existing identity for a user (deterministic)
 * @param {string} auth0Sub - Auth0 user sub
 * @param {string} appSecret - Application secret
 * @returns {Object} Identity object
 */
export function retrieveIdentity(auth0Sub, appSecret) {
  if (!auth0Sub || !appSecret) {
    throw new Error('Auth0 sub and app secret are required');
  }
  return generateDeterministicIdentity(auth0Sub, appSecret);
}

/**
 * Verify identity commitment matches expected value
 * @param {string} auth0Sub - Auth0 user sub
 * @param {string} appSecret - Application secret
 * @param {string} expectedCommitment - Expected commitment to verify
 * @returns {boolean} True if commitment matches
 */
export function verifyIdentityCommitment(auth0Sub, appSecret, expectedCommitment) {
  try {
    if (!auth0Sub || !appSecret || !expectedCommitment) {
      return false;
    }
    const { commitment } = generateDeterministicIdentity(auth0Sub, appSecret);
    return commitment === expectedCommitment;
  } catch (error) {
    console.error('Error verifying identity commitment:', error);
    return false;
  }
} 