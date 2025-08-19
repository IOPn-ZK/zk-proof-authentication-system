import { Identity } from '@semaphore-protocol/identity';
import crypto from 'crypto';

/**
 * Generate a deterministic Semaphore identity using HKDF
 * @param {string} auth0Sub - Auth0 user sub (unique identifier)
 * @param {string} appSecret - Application secret for salting
 * @param {string|null} userEmail - Optional user email to strengthen uniqueness across linked accounts
 * @param {string} infoLabel - Optional HKDF info label (versioned)
 * @returns {Object} Object containing identity and commitment
 */
export function generateDeterministicIdentity(auth0Sub, appSecret, userEmail = null, infoLabel = 'semaphore-identity-v3') {
  try {
    if (!auth0Sub || !appSecret) {
      throw new Error('Auth0 sub and app secret are required');
    }
    
    // Create HKDF key derivation
    const info = Buffer.from(infoLabel, 'utf8');
    const ikm = Buffer.from(appSecret, 'utf8');
    const normalizedEmail = typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : '';
    const issuer = process.env.AUTH0_ISSUER_BASE_URL || '';
    const clientId = process.env.AUTH0_CLIENT_ID || '';
    const derivationStrategy = (process.env.IDENTITY_DERIVATION || 'sub+email').toLowerCase();
    let saltInput;
    switch (derivationStrategy) {
      case 'email':
        saltInput = `${issuer}|${clientId}|${normalizedEmail}`;
        break;
      case 'sub':
        saltInput = `${issuer}|${clientId}|${auth0Sub}`;
        break;
      case 'sub+email':
      default:
        saltInput = `${issuer}|${clientId}|${auth0Sub}|${normalizedEmail}`;
        break;
    }
    const saltBuffer = crypto.createHmac('sha256', Buffer.from(appSecret, 'utf8')).update(saltInput).digest();
    
    // Generate 32-byte derived key using HKDF
    const hkdfOutput = crypto.hkdfSync('sha256', ikm, saltBuffer, info, 32);
    const derivedKey = Buffer.isBuffer(hkdfOutput) ? hkdfOutput : Buffer.from(hkdfOutput);
    
    // Convert to hex string for Semaphore Identity
    const privateKey = derivedKey.toString('hex');
    if (process.env.NODE_ENV !== 'production') {
      try {
        const debugLog = {
          infoLabel,
          issuerPrefix: issuer.slice(0, 16) + (issuer.length > 16 ? '...' : ''),
          clientIdPrefix: clientId.slice(0, 16) + (clientId.length > 16 ? '...' : ''),
          auth0SubPrefix: (auth0Sub || '').toString().slice(0, 16) + '...',
          emailPrefix: normalizedEmail.slice(0, 16) + (normalizedEmail.length > 16 ? '...' : ''),
          derivationStrategy,
          saltHmacPrefix: saltBuffer.toString('hex').slice(0, 16) + '...',
          derivedKeyPrefix: privateKey.slice(0, 16) + '...'
        };
        console.log('Identity v3 derivation debug:', debugLog);
      } catch {}
    }
    
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
export function retrieveIdentity(auth0Sub, appSecret, userEmail = null) {
  if (!auth0Sub || !appSecret) {
    throw new Error('Auth0 sub and app secret are required');
  }
  return generateDeterministicIdentity(auth0Sub, appSecret, userEmail);
}

/**
 * Verify identity commitment matches expected value
 * @param {string} auth0Sub - Auth0 user sub
 * @param {string} appSecret - Application secret
 * @param {string} expectedCommitment - Expected commitment to verify
 * @returns {boolean} True if commitment matches
 */
export function verifyIdentityCommitment(auth0Sub, appSecret, expectedCommitment, userEmail = null) {
  try {
    if (!auth0Sub || !appSecret || !expectedCommitment) {
      return false;
    }
    const { commitment } = generateDeterministicIdentity(auth0Sub, appSecret, userEmail);
    return commitment === expectedCommitment;
  } catch (error) {
    console.error('Error verifying identity commitment:', error);
    return false;
  }
} 