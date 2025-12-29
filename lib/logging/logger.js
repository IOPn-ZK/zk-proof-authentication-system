import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// Serverless environments have read-only filesystems
const isServerless = process.env.VERCEL === '1' || 
                     process.env.AWS_LAMBDA_FUNCTION_NAME || 
                     process.env.VERCEL_ENV ||
                     process.env.NODE_ENV === 'production' && !fs.existsSync('/tmp');

// Check if we can write to the filesystem
let canWriteFiles = false;
const logsDir = path.join(process.cwd(), 'logs');

if (!isServerless) {
  try {
    // Try to create logs directory (or check if it exists and is writable)
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    // Test write access
    const testFile = path.join(logsDir, '.test-write');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    canWriteFiles = true;
  } catch (error) {
    console.warn('Cannot write to filesystem, using console logging only:', error.message);
    canWriteFiles = false;
  }
}

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development and serverless
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    return log;
  })
);

// Create transports array
const transports = [];

// Only add file transports if we can write to filesystem
if (canWriteFiles) {
  try {
    transports.push(
      // Error logs
      new DailyRotateFile({
        filename: path.join(logsDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxSize: '20m',
        maxFiles: '14d',
        zippedArchive: true,
      }),
      
      // Combined logs
      new DailyRotateFile({
        filename: path.join(logsDir, 'combined-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        zippedArchive: true,
      }),
      
      // Audit logs
      new DailyRotateFile({
        filename: path.join(logsDir, 'audit-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'info',
        maxSize: '20m',
        maxFiles: '30d',
        zippedArchive: true,
      })
    );
  } catch (error) {
    console.warn('Failed to create file transports, using console only:', error.message);
  }
}

// Always add console transport (for serverless and development)
transports.push(new winston.transports.Console({
  format: consoleFormat,
}));

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'semaphore-oauth-demo' },
  transports: transports,
  // Handle exceptions and rejections
  exceptionHandlers: transports,
  rejectionHandlers: transports,
});

// Create specialized loggers with file system check
const createSpecializedLogger = (type, filename) => {
  const transports = [];
  
  if (canWriteFiles) {
    try {
      transports.push(
        new DailyRotateFile({
          filename: path.join(logsDir, filename),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: type === 'audit' || type === 'security' ? '30d' : '14d',
          zippedArchive: true,
        })
      );
    } catch (error) {
      console.warn(`Failed to create file transport for ${type} logger:`, error.message);
    }
  }
  
  // Always add console transport
  transports.push(new winston.transports.Console({
    format: consoleFormat,
  }));
  
  return winston.createLogger({
    level: 'info',
    format: logFormat,
    defaultMeta: { service: 'semaphore-oauth-demo', type },
    transports: transports,
    exceptionHandlers: transports,
    rejectionHandlers: transports,
  });
};

export const auditLogger = createSpecializedLogger('audit', 'audit-%DATE%.log');
export const securityLogger = createSpecializedLogger('security', 'security-%DATE%.log');
export const proofLogger = createSpecializedLogger('proof', 'proof-%DATE%.log');

// Helper functions for structured logging
export function logAudit(action, entityType, entityId, userSub, sessionId, metadata, success) {
  auditLogger.info('Audit event', {
    action,
    entityType,
    entityId,
    userSub,
    sessionId,
    metadata,
    success,
    timestamp: new Date().toISOString(),
  });
}

export function logSecurity(event, details, severity = 'info') {
  securityLogger.log(severity, 'Security event', {
    event,
    details,
    timestamp: new Date().toISOString(),
  });
}

export function logProof(operation, proofId, details, success) {
  proofLogger.info('Proof operation', {
    operation,
    proofId,
    details,
    success,
    timestamp: new Date().toISOString(),
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down logger...');
  logger.end();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down logger...');
  logger.end();
  process.exit(0);
});

export default logger;
