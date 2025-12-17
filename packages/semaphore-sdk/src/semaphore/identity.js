import { Identity } from '@semaphore-protocol/identity';
import crypto from 'crypto';
import { Wallet } from 'ethers';

/**
 * Generate a deterministic Semaphore identity using HKDF
 * @param {string} auth0Sub - OAuth user sub (unique identifier)
 * @param {string} appSecret - Application secret for salting
 * @param {string|null} userEmail - Optional user email to strengthen uniqueness across linked accounts
 * @param {string} infoLabel - Optional HKDF info label (versioned)
 * @param {object} options - Optional configuration
 * @param {string} options.issuer - OAuth issuer URL
 * @param {string} options.clientId - OAuth client ID
 * @param {string} options.derivationStrategy - Derivation strategy: 'sub', 'email', or 'sub+email'
 * @returns {Object} Object containing identity and commitment
 */
export function generateDeterministicIdentity(
  auth0Sub,
  appSecret,
  userEmail = null,
  infoLabel = 'semaphore-identity-v3',
  options = {}
) {
  try {
    if (!auth0Sub || !appSecret) {
      throw new Error('Auth0 sub and app secret are required');
    }
    
    // Create HKDF key derivation
    const info = Buffer.from(infoLabel, 'utf8');
    const ikm = Buffer.from(appSecret, 'utf8');
    const normalizedEmail = typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : '';
    const issuer = options.issuer || '';
    const clientId = options.clientId || '';
    const derivationStrategy = (options.derivationStrategy || 'sub+email').toLowerCase();
    
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
 * @param {string} auth0Sub - OAuth user sub
 * @param {string} appSecret - Application secret
 * @param {string|null} userEmail - Optional user email
 * @param {object} options - Optional configuration
 * @returns {Object} Identity object
 */
export function retrieveIdentity(auth0Sub, appSecret, userEmail = null, options = {}) {
  if (!auth0Sub || !appSecret) {
    throw new Error('Auth0 sub and app secret are required');
  }
  return generateDeterministicIdentity(auth0Sub, appSecret, userEmail, 'semaphore-identity-v3', options);
}

/**
 * Generate a deterministic private key and wallet using HKDF from OAuth sub claim
 * 
 * @param {string} auth0Sub - OAuth user sub (unique identifier from ID token)
 * @param {string} salt - Salt for HKDF (typically app secret or a fixed value)
 * @param {string} infoLabel - HKDF info label (default: "semaphore-identity")
 * @returns {Object} Object containing private key, wallet address, and wallet instance
 */
export function generateDeterministicWallet(auth0Sub, salt, infoLabel = 'semaphore-identity') {
  try {
    if (!auth0Sub || !salt) {
      throw new Error('Auth0 sub and salt are required');
    }

    // Convert inputs to buffers
    const ikm = Buffer.from(auth0Sub, 'utf8'); // Input Key Material (the Auth0 sub)
    const saltBuffer = Buffer.from(salt, 'utf8'); // Salt for HKDF
    const info = Buffer.from(infoLabel, 'utf8'); // Info label

    // Generate 32-byte seed using HKDF: hkdf(sha256, auth0Sub, salt, "semaphore-identity", 32)
    const seed = crypto.hkdfSync('sha256', ikm, saltBuffer, info, 32);
    const seedBuffer = Buffer.isBuffer(seed) ? seed : Buffer.from(seed);

    // Convert seed to hex string for ethers wallet
    const privateKey = seedBuffer.toString('hex');

    // Create ethers wallet from the deterministic private key
    const wallet = new Wallet('0x' + privateKey);

    return {
      privateKey: '0x' + privateKey,
      walletAddress: wallet.address,
      wallet: wallet,
      seed: seedBuffer
    };
  } catch (error) {
    console.error('Error generating deterministic wallet:', error);
    throw new Error('Failed to generate deterministic wallet');
  }
}

/**
 * Generate deterministic Semaphore identity and wallet from OAuth sub
 * This combines both Semaphore identity and ethers wallet generation
 * 
 * @param {string} auth0Sub - OAuth user sub (unique identifier)
 * @param {string} appSecret - Application secret for salting
 * @param {string|null} userEmail - Optional user email (for backward compatibility)
 * @param {object} options - Optional configuration
 * @returns {Object} Object containing identity, commitment, wallet, and wallet address
 */
export function generateDeterministicIdentityWithWallet(auth0Sub, appSecret, userEmail = null, options = {}) {
  try {
    if (!auth0Sub || !appSecret) {
      throw new Error('Auth0 sub and app secret are required');
    }

    // Generate deterministic wallet using simple HKDF approach
    const walletResult = generateDeterministicWallet(auth0Sub, appSecret, 'semaphore-identity');

    // Use the same private key for Semaphore identity
    const identity = new Identity(walletResult.privateKey);

    return {
      identity,
      commitment: identity.commitment.toString(),
      privateKey: walletResult.privateKey,
      walletAddress: walletResult.walletAddress,
      wallet: walletResult.wallet,
      auth0Sub: auth0Sub
    };
  } catch (error) {
    console.error('Error generating deterministic identity with wallet:', error);
    throw new Error('Failed to generate deterministic identity with wallet');
  }
}

/**
 * Verify identity commitment matches expected value
 * @param {string} auth0Sub - OAuth user sub
 * @param {string} appSecret - Application secret
 * @param {string} expectedCommitment - Expected commitment to verify
 * @param {string|null} userEmail - Optional user email
 * @param {object} options - Optional configuration
 * @returns {boolean} True if commitment matches
 */
export function verifyIdentityCommitment(auth0Sub, appSecret, expectedCommitment, userEmail = null, options = {}) {
  try {
    if (!auth0Sub || !appSecret || !expectedCommitment) {
      return false;
    }
    const { commitment } = generateDeterministicIdentity(auth0Sub, appSecret, userEmail, 'semaphore-identity-v3', options);
    return commitment === expectedCommitment;
  } catch (error) {
    console.error('Error verifying identity commitment:', error);
    return false;
  }
}

