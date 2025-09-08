import Queue from 'bull';
import { redis } from '../redis/connection.js';
import { logProof } from '../logging/logger.js';
import { generateProof } from '@semaphore-protocol/proof';
import { Group } from '@semaphore-protocol/group';
import { retrieveIdentity } from '../semaphore/identity.js';

// Create proof generation queue
const proofQueue = new Queue('proof-generation', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// Process proof generation jobs
proofQueue.process(async (job) => {
  const { 
    signal, 
    externalNullifier, 
    groupId, 
    treeDepth, 
    members, 
    auth0Sub, 
    userEmail,
    sessionId 
  } = job.data;

  logProof('start', job.id, { signal, externalNullifier, groupId, auth0Sub }, true);

  try {
    // Retrieve deterministic identity
    const appSecret = process.env.AUTH0_SECRET;
    if (!appSecret) {
      throw new Error('AUTH0_SECRET not configured');
    }

    const identityResult = retrieveIdentity(auth0Sub, appSecret, userEmail);
    const identity = identityResult.identity;

    // Create Semaphore group
    const group = new Group(groupId, treeDepth, members.map(BigInt));

    // Generate proof
    const fullProof = await generateProof(identity, group, externalNullifier, signal);

    logProof('success', job.id, { 
      signal, 
      externalNullifier, 
      groupId, 
      auth0Sub,
      proofSize: JSON.stringify(fullProof).length 
    }, true);

    return {
      success: true,
      proof: fullProof,
      signal,
      externalNullifier,
      groupId,
      treeDepth,
    };

  } catch (error) {
    logProof('error', job.id, { 
      error: error.message, 
      signal, 
      externalNullifier, 
      groupId, 
      auth0Sub 
    }, false);
    throw error;
  }
});

// Queue event handlers
proofQueue.on('completed', (job, result) => {
  logProof('completed', job.id, { 
    duration: Date.now() - job.timestamp,
    resultSize: JSON.stringify(result).length 
  }, true);
});

proofQueue.on('failed', (job, err) => {
  logProof('failed', job.id, { 
    error: err.message, 
    attempts: job.attemptsMade 
  }, false);
});

proofQueue.on('stalled', (job) => {
  logProof('stalled', job.id, { attempts: job.attemptsMade }, false);
});

// Add job to queue
export async function addProofJob(proofData) {
  try {
    const job = await proofQueue.add(proofData, {
      priority: 1,
      delay: 0,
    });

    logProof('queued', job.id, { 
      signal: proofData.signal, 
      groupId: proofData.groupId,
      auth0Sub: proofData.auth0Sub 
    }, true);

    return {
      jobId: job.id,
      status: 'queued',
      estimatedTime: '30-60 seconds',
    };
  } catch (error) {
    logProof('queue_error', null, { error: error.message }, false);
    throw error;
  }
}

// Get job status
export async function getJobStatus(jobId) {
  try {
    const job = await proofQueue.getJob(jobId);
    
    if (!job) {
      return { status: 'not_found' };
    }

    const state = await job.getState();
    const progress = job._progress;
    const result = job.returnvalue;
    const failedReason = job.failedReason;

    return {
      jobId,
      status: state,
      progress,
      result: state === 'completed' ? result : null,
      error: state === 'failed' ? failedReason : null,
      attempts: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  } catch (error) {
    logProof('status_error', jobId, { error: error.message }, false);
    throw error;
  }
}

// Get queue statistics
export async function getQueueStats() {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      proofQueue.getWaiting(),
      proofQueue.getActive(),
      proofQueue.getCompleted(),
      proofQueue.getFailed(),
      proofQueue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total: waiting.length + active.length + completed.length + failed.length + delayed.length,
    };
  } catch (error) {
    logProof('stats_error', null, { error: error.message }, false);
    throw error;
  }
}

// Clean old jobs
export async function cleanOldJobs() {
  try {
    const completed = await proofQueue.clean(24 * 60 * 60 * 1000, 'completed'); // 24 hours
    const failed = await proofQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // 7 days
    
    logProof('cleanup', null, { completed: completed.length, failed: failed.length }, true);
    
    return { completed: completed.length, failed: failed.length };
  } catch (error) {
    logProof('cleanup_error', null, { error: error.message }, false);
    throw error;
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await proofQueue.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await proofQueue.close();
  process.exit(0);
});

export { proofQueue };
