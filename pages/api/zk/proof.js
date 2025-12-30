import { generateProofWithSetup, retrieveIdentity, Group } from '@iopn-zk/zk-proof-authentication-sdk';
import { getFullGroupData } from '../../../lib/db/groupService.js';
import { withSecurityConfig } from '../../../lib/security/middleware.js';

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        success: false, 
        message: 'Method not allowed' 
      });
    }

    // Session is already validated by security middleware
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'No valid session found',
        error: 'SESSION_MISSING'
      });
    }

    const { signal, externalNullifier, groupId, treeDepth } = req.body;
    
    if (!signal || !externalNullifier || !groupId || !treeDepth) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters',
        error: 'MISSING_PARAMETERS'
      });
    }

    // Get Auth0 sub from session
    const auth0Sub = req.session.user.sub;
    const userEmail = req.session.user.email;
    if (!auth0Sub) {
      return res.status(400).json({
        success: false,
        message: 'No Auth0 sub found in session',
        error: 'AUTH0_SUB_MISSING'
      });
    }

    // Retrieve deterministic identity
    const appSecret = process.env.AUTH0_SECRET;
    if (!appSecret) {
      return res.status(500).json({
        success: false,
        message: 'AUTH0_SECRET not configured',
        error: 'SECRET_MISSING'
      });
    }

    console.log('Retrieving deterministic identity for proof generation');
    
    const identityResult = retrieveIdentity(auth0Sub, appSecret, userEmail);
    const identity = identityResult.identity;

    // Get the actual group data from database
    console.log('Fetching group data from database...');
    const groupData = await getFullGroupData(groupId);
    
    console.log('Retrieved group data:', {
      id: groupData.id,
      treeDepth: groupData.treeDepth,
      memberCount: groupData.members.length
    });
    
    // Verify the identity is in the group
    if (!groupData.members.includes(identity.commitment.toString())) {
      return res.status(400).json({
        success: false,
        message: 'Your identity is not in the group. Please complete step 2.',
        error: 'IDENTITY_NOT_IN_GROUP'
      });
    }
    
    // Create group with actual members for proof generation
    const group = new Group(groupData.id, groupData.treeDepth, groupData.members.map(BigInt));
    
    console.log('Group created for proof generation:', {
      groupId: groupData.id,
      treeDepth: groupData.treeDepth,
      memberCount: groupData.members.length,
      identityCommitment: identity.commitment.toString()
    });

    // Generate ZK proof
    console.log('Generating ZK proof...');
    const path = await import('path');
    const fs = await import('fs');
    
    // Get file paths - handle both local and Vercel environments
    let wasmPath, zkeyPath;
    
    if (process.env.VERCEL) {
      // In Vercel serverless, try multiple possible locations
      const basePaths = [
        path.join('/var/task', 'public'),
        path.join('/var/task', '.next', 'static'),
        path.join(process.cwd(), 'public'),
      ];
      
      const depth = groupData.treeDepth.toString();
      let found = false;
      
      for (const base of basePaths) {
        const testWasm = path.join(base, 'semaphore', depth, 'semaphore.wasm');
        const testZkey = path.join(base, 'semaphore', depth, 'semaphore.zkey');
        
        if (fs.existsSync(testWasm) && fs.existsSync(testZkey)) {
          wasmPath = testWasm;
          zkeyPath = testZkey;
          found = true;
          console.log('Found files in:', base);
          break;
        }
      }
      
      if (!found) {
        // Fallback: use expected path (files should be included in build)
        const fallbackDir = path.join('/var/task', 'public', 'semaphore', depth);
        wasmPath = path.join(fallbackDir, 'semaphore.wasm');
        zkeyPath = path.join(fallbackDir, 'semaphore.zkey');
        console.warn('Files not found in expected locations, using fallback:', fallbackDir);
      }
    } else {
      // Local development
      const publicDir = path.join(process.cwd(), 'public', 'semaphore', groupData.treeDepth.toString());
      wasmPath = path.join(publicDir, 'semaphore.wasm');
      zkeyPath = path.join(publicDir, 'semaphore.zkey');
    }
    
    // Verify files exist
    if (!fs.existsSync(wasmPath)) {
      const errorMsg = `WASM file not found at: ${wasmPath}. ` +
        `In Vercel, ensure public/semaphore/${groupData.treeDepth}/ files are included in deployment.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    if (!fs.existsSync(zkeyPath)) {
      const errorMsg = `zkey file not found at: ${zkeyPath}. ` +
        `In Vercel, ensure public/semaphore/${groupData.treeDepth}/ files are included in deployment.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('Using trusted setup files:', { wasmPath, zkeyPath });
    
    const fullProof = await generateProofWithSetup(
      identity, 
      group, 
      BigInt(signal), 
      BigInt(externalNullifier),
      {
        wasmPath,
        zkeyPath
      }
    );

    console.log('ZK proof generated successfully');
    res.status(200).json({
      success: true,
      proof: fullProof,
      message: 'Proof generated successfully'
    });

  } catch (error) {
    console.error('Error generating proof:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate proof',
      error: 'PROOF_GENERATION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}

export default withSecurityConfig('proofGeneration')(handler);