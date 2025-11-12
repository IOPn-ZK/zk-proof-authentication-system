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
  tenantId: integer('tenant_id'),
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
  tenantId: integer('tenant_id'),
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
  identityCommitment: text('identity_commitment'),
  encryptedIdentity: text('encrypted_identity'), // Encrypted identity data
  isActive: boolean('is_active').default(true).notNull(),
  tenantId: integer('tenant_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
  sessionIdIdx: uniqueIndex('user_sessions_session_id_idx').on(table.sessionId),
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
  userEmailEnc: text('user_email_enc'),
  userSub: varchar('user_sub', { length: 255 }),
  sessionId: varchar('session_id', { length: 255 }),
  metadata: text('metadata'), // JSON string for additional data
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  success: boolean('success').notNull(),
  errorMessage: text('error_message'),
  tenantId: integer('tenant_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  actionIdx: index('audit_log_action_idx').on(table.action),
  entityTypeIdx: index('audit_log_entity_type_idx').on(table.entityType),
  userEmailIdx: index('audit_log_user_email_idx').on(table.userEmail),
  userSubIdx: index('audit_log_user_sub_idx').on(table.userSub),
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
  tenantId: integer('tenant_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  identifierActionIdx: uniqueIndex('rate_limits_identifier_action_idx').on(table.identifier, table.action),
  expiresAtIdx: index('rate_limits_expires_at_idx').on(table.expiresAt),
}));

/**
 * Users table (RBAC)
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  auth0Sub: varchar('auth0_sub', { length: 255 }).notNull().unique(),
  isAdmin: boolean('is_admin').notNull().default(false),
  tenantId: integer('tenant_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  auth0SubIdx: uniqueIndex('users_auth0_sub_idx').on(table.auth0Sub),
}));

/**
 * Nullifiers table
 * Prevents replay attacks by tracking used nullifiers from ZK proofs
 */
export const nullifiers = pgTable('nullifiers', {
  id: serial('id').primaryKey(),
  nullifierHash: text('nullifier_hash').notNull().unique(),
  identityCommitment: text('identity_commitment').notNull(),
  externalNullifier: text('external_nullifier').notNull(),
  signal: text('signal'),
  groupId: integer('group_id').notNull(),
  usedAt: timestamp('used_at').defaultNow().notNull(),
  tenantId: integer('tenant_id'),
}, (table) => ({
  nullifierHashIdx: uniqueIndex('nullifiers_hash_idx').on(table.nullifierHash),
  identityCommitmentIdx: index('nullifiers_commitment_idx').on(table.identityCommitment),
  externalNullifierIdx: index('nullifiers_external_nullifier_idx').on(table.externalNullifier),
}));

/**
 * Proof Logs table
 * Tracks proof verification attempts for auditing and debugging
 */
export const proofLogs = pgTable('proof_logs', {
  id: serial('id').primaryKey(),
  identityCommitment: text('identity_commitment').notNull(),
  proofStatus: varchar('proof_status', { length: 20 }).notNull(), // 'valid', 'invalid', 'reused_nullifier'
  nullifierHash: text('nullifier_hash'),
  externalNullifier: text('external_nullifier'),
  groupId: integer('group_id'),
  verificationTimeMs: integer('verification_time_ms'),
  errorMessage: text('error_message'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  tenantId: integer('tenant_id'),
}, (table) => ({
  identityCommitmentIdx: index('proof_logs_commitment_idx').on(table.identityCommitment),
  proofStatusIdx: index('proof_logs_status_idx').on(table.proofStatus),
  createdAtIdx: index('proof_logs_created_at_idx').on(table.createdAt),
  nullifierHashIdx: index('proof_logs_nullifier_hash_idx').on(table.nullifierHash),
}));

/**
 * Wallet Bindings table
 * Stores wallet-to-identity commitment bindings for on-chain operations
 */
export const walletBindings = pgTable('wallet_bindings', {
  id: serial('id').primaryKey(),
  identityCommitment: text('identity_commitment').notNull().unique(),
  walletAddress: text('wallet_address').notNull(),
  walletType: varchar('wallet_type', { length: 20 }).notNull(), // 'EOA', 'AA_SMART_ACCOUNT'
  chainId: integer('chain_id').notNull(),
  bindingSignature: text('binding_signature').notNull(),
  bindingProof: text('binding_proof'), // Optional proof of binding
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
  tenantId: integer('tenant_id'),
}, (table) => ({
  walletAddressIdx: index('wallet_bindings_address_idx').on(table.walletAddress),
  identityCommitmentIdx: uniqueIndex('wallet_bindings_commitment_idx').on(table.identityCommitment),
  activeIdx: index('wallet_bindings_active_idx').on(table.isActive, table.expiresAt),
}));

/**
 * Verified Proofs table
 * Stores successfully verified ZK proofs linked to wallet addresses (EOA)
 * Ensures all proofs are publicly verifiable and bound to the same wallet identity
 */
export const verifiedProofs = pgTable('verified_proofs', {
  id: serial('id').primaryKey(),
  walletAddress: text('wallet_address').notNull(),
  identityCommitment: text('identity_commitment').notNull(),
  nullifierHash: text('nullifier_hash').notNull().unique(),
  externalNullifier: text('external_nullifier').notNull(),
  signal: text('signal'),
  groupId: integer('group_id').notNull(),
  treeDepth: integer('tree_depth').notNull().default(20),
  proofData: text('proof_data').notNull(), // JSON string of the full proof
  merkleTreeRoot: text('merkle_tree_root'),
  verificationTimeMs: integer('verification_time_ms'),
  verifiedAt: timestamp('verified_at').defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  tenantId: integer('tenant_id'),
}, (table) => ({
  walletAddressIdx: index('verified_proofs_address_idx').on(table.walletAddress),
  identityCommitmentIdx: index('verified_proofs_commitment_idx').on(table.identityCommitment),
  nullifierHashIdx: uniqueIndex('verified_proofs_nullifier_idx').on(table.nullifierHash),
  groupIdIdx: index('verified_proofs_group_id_idx').on(table.groupId),
  verifiedAtIdx: index('verified_proofs_verified_at_idx').on(table.verifiedAt),
  walletCommitmentIdx: index('verified_proofs_wallet_commitment_idx').on(table.walletAddress, table.identityCommitment),
}));