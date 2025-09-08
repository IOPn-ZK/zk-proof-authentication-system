import { withSecurityConfig } from '../../../lib/security/middleware.js';
import { addProofJob, getJobStatus } from '../../../lib/queue/proofQueue.js';
import { getFullGroupData } from '../../../lib/db/groupService.js';
import { logProof } from '../../../lib/logging/logger.js';
import logger from '../../../lib/logging/logger.js';

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        success: false, 
        message: 'Method not allowed' 
      });
    }

    const { signal, externalNullifier, groupId = 1 } = req.body;
    const userEmail = req.session.user.email;
    const auth0Sub = req.session.user.sub;
    const sessionId = req.session.id;

    // Validate input
    if (typeof signal !== 'number' || typeof externalNullifier !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Invalid input: signal and externalNullifier must be numbers',
      });
    }

    // Get group data
    let groupData;
    try {
      groupData = await getFullGroupData(groupId);
    } catch (error) {
      logger.error('Failed to get group data for async proof', { error: error.message, groupId, auth0Sub });
      return res.status(500).json({
        success: false,
        message: 'Failed to get group data',
      });
    }

    if (!groupData || !Array.isArray(groupData.members)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group data',
      });
    }

    // Check if user's identity is in the group
    const userCommitment = groupData.members.find(member => 
      member === req.session.identityCommitment
    );

    if (!userCommitment) {
      return res.status(400).json({
        success: false,
        message: 'Your identity is not in the group. Please join the group first.',
      });
    }

    // Prepare job data
    const jobData = {
      signal,
      externalNullifier,
      groupId,
      treeDepth: groupData.treeDepth || 20,
      members: groupData.members,
      auth0Sub,
      userEmail,
      sessionId,
    };

    // Add job to queue
    const jobResult = await addProofJob(jobData);

    logProof('async_queued', jobResult.jobId, {
      signal,
      externalNullifier,
      groupId,
      auth0Sub,
      memberCount: groupData.members.length,
    }, true);

    res.status(202).json({
      success: true,
      message: 'Proof generation queued successfully',
      jobId: jobResult.jobId,
      status: jobResult.status,
      estimatedTime: jobResult.estimatedTime,
      checkStatusUrl: `/api/zk/proof-status/${jobResult.jobId}`,
    });

  } catch (error) {
    logger.error('Async proof generation error', { 
      error: error.message, 
      stack: error.stack,
      userEmail: req.session?.user?.email,
      auth0Sub: req.session?.user?.sub,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to queue proof generation',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
}

export default withSecurityConfig('proofGeneration')(handler);
