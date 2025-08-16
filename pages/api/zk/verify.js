import { verifyProof } from '@semaphore-protocol/proof';
import { withSecurityConfig } from '../../../lib/security/middleware.js';

async function handler(req, res) {
  try {
    // Request body already validated by security middleware
    const { fullProof } = req.body;
    
    console.log('ZK Proof verification request received');
    console.log('Proof structure validation passed');
    
    // Verify the zero-knowledge proof
    const treeDepth = 20;
    const startTime = Date.now();
    const isValid = await verifyProof(fullProof, treeDepth);
    const verificationTime = Date.now() - startTime;
    
    console.log(`Proof verification completed in ${verificationTime}ms: ${isValid ? 'VALID' : 'INVALID'}`);
    
    // Log verification attempt (without sensitive proof data)
    console.log('Verification result:', {
      valid: isValid,
      verificationTime,
      timestamp: new Date().toISOString(),
      treeDepth
    });
    
    res.status(200).json({ 
      valid: isValid,
      verificationTime,
      timestamp: new Date().toISOString(),
      message: isValid ? 'Proof verified successfully' : 'Proof verification failed'
    });
    
  } catch (error) {
    console.error('ZK Proof verification error:', error);
    
    res.status(500).json({ 
      valid: false, 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Verification failed',
      timestamp: new Date().toISOString()
    });
  }
}

// Apply security middleware with ZK proof configuration (no auth required for verification)
export default withSecurityConfig('zkProof')(handler);