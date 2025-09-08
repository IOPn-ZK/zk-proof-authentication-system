import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development
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

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'semaphore-oauth-demo' },
  transports: [
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
    }),
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// Create specialized loggers
export const auditLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'semaphore-oauth-demo', type: 'audit' },
  transports: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true,
    }),
  ],
});

export const securityLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'semaphore-oauth-demo', type: 'security' },
  transports: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'security-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true,
    }),
  ],
});

export const proofLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'semaphore-oauth-demo', type: 'proof' },
  transports: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'proof-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ],
});

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
