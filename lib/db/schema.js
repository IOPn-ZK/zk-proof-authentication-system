import { pgTable, serial, varchar, text, timestamp, integer, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Semaphore Groups table
 * Stores group metadata and configuration
 */
export const groups = pgTable('groups', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').notNull().unique(),
  treeDepth: integer('tree_depth').notNull().default(20),
  root: text('root'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  groupIdIdx: uniqueIndex('groups_group_id_idx').on(table.groupId),
}));

/**
 * Group Members table
 * Stores individual member commitments with indexing for fast lookups
 */
export const groupMembers = pgTable('group_members', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').notNull(),
  commitment: text('commitment').notNull(),
  memberIndex: integer('member_index').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  groupIdIdx: index('group_members_group_id_idx').on(table.groupId),
  commitmentIdx: index('group_members_commitment_idx').on(table.commitment),
  groupCommitmentIdx: uniqueIndex('group_members_group_commitment_idx').on(table.groupId, table.commitment),
  memberIndexIdx: index('group_members_member_index_idx').on(table.memberIndex),
}));

/**
 * User Sessions table
 * Stores encrypted user session data and identity commitments
 */
export const userSessions = pgTable('user_sessions', {
  id: serial('id').primaryKey(),
  sessionId: varchar('session_id', { length: 255 }).notNull().unique(),
  userEmail: varchar('user_email', { length: 255 }).notNull(),
  identityCommitment: text('identity_commitment'),
  encryptedIdentity: text('encrypted_identity'), // Encrypted identity data
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
  sessionIdIdx: uniqueIndex('user_sessions_session_id_idx').on(table.sessionId),
  userEmailIdx: index('user_sessions_user_email_idx').on(table.userEmail),
  identityCommitmentIdx: index('user_sessions_identity_commitment_idx').on(table.identityCommitment),
  activeSessionsIdx: index('user_sessions_active_idx').on(table.isActive, table.expiresAt),
}));

/**
 * Audit Log table
 * Tracks all important operations for security and debugging
 */
export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: varchar('entity_id', { length: 255 }),
  userEmail: varchar('user_email', { length: 255 }),
  sessionId: varchar('session_id', { length: 255 }),
  metadata: text('metadata'), // JSON string for additional data
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  success: boolean('success').notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  actionIdx: index('audit_log_action_idx').on(table.action),
  entityTypeIdx: index('audit_log_entity_type_idx').on(table.entityType),
  userEmailIdx: index('audit_log_user_email_idx').on(table.userEmail),
  createdAtIdx: index('audit_log_created_at_idx').on(table.createdAt),
  successIdx: index('audit_log_success_idx').on(table.success),
}));

/**
 * Rate Limiting table
 * Stores rate limiting data per user/IP
 */
export const rateLimits = pgTable('rate_limits', {
  id: serial('id').primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(), // IP or user email
  action: varchar('action', { length: 100 }).notNull(),
  count: integer('count').notNull().default(1),
  windowStart: timestamp('window_start').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  identifierActionIdx: uniqueIndex('rate_limits_identifier_action_idx').on(table.identifier, table.action),
  expiresAtIdx: index('rate_limits_expires_at_idx').on(table.expiresAt),
}));