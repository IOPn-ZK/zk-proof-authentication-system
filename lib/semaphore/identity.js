import { Identity } from '@semaphore-protocol/identity';
import crypto from 'crypto';
import { Wallet } from 'ethers';

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
 * Generate a deterministic private key and wallet using HKDF from Auth0 sub claim
 * This is a simpler approach that uses only the Auth0 sub claim as input.
 * 
 * @param {string} auth0Sub - Auth0 user sub (unique identifier from ID token)
 * @param {string} salt - Salt for HKDF (typically AUTH0_SECRET or a fixed value)
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

    console.log('privateKey', privateKey);
    console.log('walletAddress', wallet.address);
    console.log('infoLabel', infoLabel);
    console.log('seed buffer', seedBuffer);
    console.log('seed', seed);

    if (process.env.NODE_ENV !== 'production') {
      console.log('Deterministic wallet generated:', {
        auth0SubPrefix: auth0Sub.slice(0, 16) + '...',
        walletAddress: wallet.address,
        infoLabel,
        seedPrefix: privateKey.slice(0, 16) + '...'
      });
    }

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
 * Generate deterministic Semaphore identity and wallet from Auth0 sub
 * This combines both Semaphore identity and ethers wallet generation
 * 
 * @param {string} auth0Sub - Auth0 user sub (unique identifier)
 * @param {string} appSecret - Application secret for salting
 * @param {string|null} userEmail - Optional user email (for backward compatibility)
 * @returns {Object} Object containing identity, commitment, wallet, and wallet address
 */
export function generateDeterministicIdentityWithWallet(auth0Sub, appSecret, userEmail = null) {
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