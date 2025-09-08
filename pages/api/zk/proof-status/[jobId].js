import { withSecurityConfig } from '../../../../lib/security/middleware.js';
import { getJobStatus } from '../../../../lib/queue/proofQueue.js';
import logger from '../../../../lib/logging/logger.js';

async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ 
        success: false, 
        message: 'Method not allowed' 
      });
    }

    const { jobId } = req.query;
    const userEmail = req.session.user.email;
    const auth0Sub = req.session.user.sub;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'Job ID is required',
      });
    }

    // Get job status
    const jobStatus = await getJobStatus(jobId);

    if (jobStatus.status === 'not_found') {
      return res.status(404).json({
        success: false,
        message: 'Job not found',
      });
    }

    logger.info('Proof status checked', {
      jobId,
      status: jobStatus.status,
      auth0Sub,
      userEmail,
    });

    res.status(200).json({
      success: true,
      jobId,
      status: jobStatus.status,
      progress: jobStatus.progress,
      result: jobStatus.result,
      error: jobStatus.error,
      attempts: jobStatus.attempts,
      timestamp: jobStatus.timestamp,
      processedOn: jobStatus.processedOn,
      finishedOn: jobStatus.finishedOn,
    });

  } catch (error) {
    logger.error('Proof status check error', { 
      error: error.message, 
      jobId: req.query.jobId,
      userEmail: req.session?.user?.email,
      auth0Sub: req.session?.user?.sub,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to check proof status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
}

export default withSecurityConfig('groupData')(handler);
