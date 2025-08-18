import fs from 'fs';
import path from 'path';

/**
 * Get paths to trusted setup files from public directory
 * @param {number} treeDepth - Tree depth for the circuit
 * @returns {Promise<{wasmPath: string, zkeyPath: string}>}
 */
export async function getTrustedSetupPaths(treeDepth = 20) {
  const publicDir = path.join(process.cwd(), 'public', 'semaphore', treeDepth.toString());
  const wasmPath = path.join(publicDir, 'semaphore.wasm');
  const zkeyPath = path.join(publicDir, 'semaphore.zkey');
  
  // Verify files exist
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`WASM file not found at: ${wasmPath}`);
  }
  
  if (!fs.existsSync(zkeyPath)) {
    throw new Error(`zkey file not found at: ${zkeyPath}`);
  }
  
  console.log('Using trusted setup files from public directory:', {
    wasmPath,
    zkeyPath
  });
  
  return { wasmPath, zkeyPath };
}