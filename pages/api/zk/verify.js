import { verifyProof } from '@semaphore-protocol/proof';
import { withSecurityConfig } from '../../../lib/security/middleware.js';
import { isNullifierUsed, markNullifierUsed } from '../../../lib/db/nullifierService.js';
import { logProofVerification } from '../../../lib/db/proofLogService.js';

async function handler(req, res) {
  let proofStatus = 'invalid';
  let nullifierHash = null;
  let externalNullifier = null;
  let groupId = null;
  let identityCommitment = null;
  
  try {
    // Request body already validated by security middleware
    const { fullProof } = req.body;
    
    console.log('ZK Proof verification request received');
    console.log('Proof structure keys:', fullProof ? Object.keys(fullProof) : 'null');
    
    // Extract nullifier from proof (nullifier is in the proof structure)
    // Semaphore proof structure: { merkleTreeRoot, nullifier, signal, externalNullifier, proof }
    // nullifier can be BigInt, string, or number
    if (fullProof) {
      // Try different ways to extract nullifier
      if (fullProof.nullifier !== undefined && fullProof.nullifier !== null) {
        // Handle BigInt, string, or number
        nullifierHash = typeof fullProof.nullifier === 'bigint' 
          ? fullProof.nullifier.toString() 
          : String(fullProof.nullifier);
      }
      
      if (fullProof.externalNullifier !== undefined && fullProof.externalNullifier !== null) {
        externalNullifier = typeof fullProof.externalNullifier === 'bigint'
          ? fullProof.externalNullifier.toString()
          : String(fullProof.externalNullifier);
      }
      
      if (fullProof.merkleTreeRoot) {
        identityCommitment = typeof fullProof.merkleTreeRoot === 'bigint'
          ? fullProof.merkleTreeRoot.toString()
          : String(fullProof.merkleTreeRoot);
      }
    }
    
    console.log('Extracted values:', {
      nullifierHash: nullifierHash ? nullifierHash.substring(0, 20) + '...' : 'null',
      externalNullifier: externalNullifier || 'null',
      hasNullifier: !!nullifierHash
    });
    
    // STEP 1: Check if nullifier has been used before (REPLAY PREVENTION)
    if (nullifierHash) {
      console.log('Checking if nullifier has been used...');
      const isUsed = await isNullifierUsed(nullifierHash);
      console.log('Nullifier check result:', isUsed ? 'ALREADY USED' : 'NOT USED');
      
      if (isUsed) {
        console.warn(`⚠️ Replay attack detected: Nullifier ${nullifierHash.substring(0, 16)}... already used`);
        proofStatus = 'reused_nullifier';
        
        // Log the replay attempt
        await logProofVerification(
          identityCommitment || 'unknown',
          'reused_nullifier',
          nullifierHash,
          externalNullifier,
          groupId,
          null,
          'Nullifier has already been used - replay attack prevented',
          req
        );
        
        return res.status(400).json({ 
          valid: false,
          error: 'REUSED_NULLIFIER',
          message: 'This proof has already been used. Replay attack prevented.',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      console.warn('⚠️ No nullifier found in proof! Replay prevention cannot work without nullifier.');
      console.log('Proof structure:', JSON.stringify(fullProof, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value, 2).substring(0, 500));
    }
    
    // STEP 2: Verify the zero-knowledge proof
    const treeDepth = fullProof?.merkleTreeRoot ? 20 : 20; // Default to 20, can be extracted from proof if available
    const startTime = Date.now();
    let isValid = false;
    let verificationError = null;
    
    try {
      isValid = await verifyProof(fullProof, treeDepth);
    } catch (error) {
      verificationError = error.message;
      isValid = false;
    }
    
    const verificationTime = Date.now() - startTime;
    
    console.log(`Proof verification completed in ${verificationTime}ms: ${isValid ? 'VALID' : 'INVALID'}`);
    
    // STEP 3: If proof is valid, mark nullifier as used (prevent future reuse)
    if (isValid && nullifierHash) {
      try {
        // Extract identity commitment from session if available
        const sessionCommitment = req.session?.identityCommitment || null;
        
        console.log('Marking nullifier as used...');
        const marked = await markNullifierUsed(
          nullifierHash,
          sessionCommitment || identityCommitment || 'unknown',
          externalNullifier || '0',
          fullProof?.signal ? (typeof fullProof.signal === 'bigint' ? fullProof.signal.toString() : String(fullProof.signal)) : null,
          groupId || 1,
          null // tenantId - can be extracted from session if available
        );
        
        if (marked) {
          console.log(`✅ Nullifier ${nullifierHash.substring(0, 16)}... marked as used`);
        } else {
          console.warn(`⚠️ Failed to mark nullifier as used (may already exist)`);
        }
      } catch (error) {
        console.error('❌ Error marking nullifier as used:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          stack: error.stack?.substring(0, 200)
        });
        // Don't fail the verification if nullifier storage fails, but log it
      }
    } else if (isValid && !nullifierHash) {
      console.warn('⚠️ Proof is valid but no nullifier found - cannot prevent replay attacks!');
    }
    
    // STEP 4: Log the verification attempt
    proofStatus = isValid ? 'valid' : 'invalid';
    await logProofVerification(
      identityCommitment || req.session?.identityCommitment || 'unknown',
      proofStatus,
      nullifierHash,
      externalNullifier,
      groupId,
      verificationTime,
      verificationError,
      req
    );
    
    // STEP 5: Return result
    res.status(200).json({ 
      valid: isValid,
      verificationTime,
      timestamp: new Date().toISOString(),
      message: isValid ? 'Proof verified successfully' : 'Proof verification failed',
      ...(verificationError && { error: verificationError })
    });
    
  } catch (error) {
    console.error('ZK Proof verification error:', error);
    
    // Log the error
    await logProofVerification(
      identityCommitment || 'unknown',
      'invalid',
      nullifierHash,
      externalNullifier,
      groupId,
      null,
      error.message,
      req
    );
    
    res.status(500).json({ 
      valid: false, 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Verification failed',
      timestamp: new Date().toISOString()
    });
  }
}

// Apply security middleware with ZK proof configuration (no auth required for verification)
export default withSecurityConfig('zkProof')(handler);