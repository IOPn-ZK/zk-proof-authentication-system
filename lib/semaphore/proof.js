import { generateProof as semaphoreGenerateProof } from '@semaphore-protocol/proof';
import { getTrustedSetupPaths } from './config.js';

/**
 * Generate a Semaphore proof with proper trusted setup handling
 * @param {Identity} identity - Semaphore identity
 * @param {Group} group - Semaphore group
 * @param {bigint} signal - Signal to prove
 * @param {bigint} externalNullifier - External nullifier
 * @returns {Promise<Object>} Generated proof
 */
export async function generateProofWithSetup(identity, group, signal, externalNullifier) {
  try {
    console.log('Starting proof generation with trusted setup...');
    
    // Get the tree depth from the group
    const treeDepth = group.depth || 20;
    console.log('Using tree depth:', treeDepth);
    
    // Download/get trusted setup files
    const { wasmPath, zkeyPath } = await getTrustedSetupPaths(treeDepth);
    console.log('Trusted setup files ready:', { wasmPath, zkeyPath });
    
    // Generate proof with explicit file paths
    console.log('Generating proof...');
    const proof = await semaphoreGenerateProof(
      identity,
      group,
      signal,
      externalNullifier,
      {
        wasmFilePath: wasmPath,
        zkeyFilePath: zkeyPath
      }
    );
    
    console.log('Proof generated successfully');
    return proof;
    
  } catch (error) {
    console.error('Error in generateProofWithSetup:', error);
    throw new Error(`Proof generation failed: ${error.message}`);
  }
}