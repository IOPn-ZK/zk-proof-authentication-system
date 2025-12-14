import { generateProof as semaphoreGenerateProof } from '@semaphore-protocol/proof';

/**
 * Generate a Semaphore proof with proper trusted setup handling
 * @param {Identity} identity - Semaphore identity
 * @param {Group} group - Semaphore group
 * @param {bigint} signal - Signal to prove
 * @param {bigint} externalNullifier - External nullifier
 * @param {object} options - Options for proof generation
 * @param {string} options.wasmPath - Path to WASM file
 * @param {string} options.zkeyPath - Path to zkey file
 * @returns {Promise<Object>} Generated proof
 */
export async function generateProofWithSetup(identity, group, signal, externalNullifier, options = {}) {
  try {
    if (!options.wasmPath || !options.zkeyPath) {
      throw new Error('WASM and zkey file paths are required');
    }
    
    // Generate proof with explicit file paths
    const proof = await semaphoreGenerateProof(
      identity,
      group,
      signal,
      externalNullifier,
      {
        wasmFilePath: options.wasmPath,
        zkeyFilePath: options.zkeyPath
      }
    );
    
    return proof;
    
  } catch (error) {
    console.error('Error in generateProofWithSetup:', error);
    throw new Error(`Proof generation failed: ${error.message}`);
  }
}

