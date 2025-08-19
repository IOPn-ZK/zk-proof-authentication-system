import { generateProofWithSetup } from '../../../lib/semaphore/proof.js';
import { Group } from '@semaphore-protocol/group';
import { retrieveIdentity } from '../../../lib/semaphore/identity.js';
import { getGroupData } from '../../../lib/semaphore/group.js';
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

    // Get the actual group data from storage
    console.log('Fetching group data from storage...');
    const groupData = await getGroupData();
    
    console.log('Retrieved group data:', {
      id: groupData.id,
      treeDepth: groupData.treeDepth,
      memberCount: groupData.members.length
    });
    
    // Verify the identity is in the group
    if (!groupData.members.includes(identity.commitment.toString())) {
      return res.status(400).json({
        success: false,
        message: 'Identity not found in group',
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
    const fullProof = await generateProofWithSetup(
      identity, 
      group, 
      BigInt(signal), 
      BigInt(externalNullifier)
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