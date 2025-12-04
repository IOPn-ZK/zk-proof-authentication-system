CREATE TABLE IF NOT EXISTS "key_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth0_sub" varchar(255) NOT NULL,
	"user_id" integer,
	"share_type" varchar(20) NOT NULL,
	"share_index" integer NOT NULL,
	"encrypted_share" text NOT NULL,
	"cloud_backup_url" text,
	"cloud_backup_encrypted" boolean DEFAULT true,
	"share_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"tenant_id" integer,
	CONSTRAINT "key_shares_auth0_sub_unique" UNIQUE("auth0_sub")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nullifiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"nullifier_hash" text NOT NULL,
	"identity_commitment" text NOT NULL,
	"external_nullifier" text NOT NULL,
	"signal" text,
	"group_id" integer NOT NULL,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nullifiers_nullifier_hash_unique" UNIQUE("nullifier_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proof_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"identity_commitment" text NOT NULL,
	"proof_status" varchar(20) NOT NULL,
	"nullifier_hash" text,
	"external_nullifier" text,
	"group_id" integer,
	"verification_time_ms" integer,
	"error_message" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth0_sub" varchar(255) NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth0_sub_unique" UNIQUE("auth0_sub")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verified_proofs" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"identity_commitment" text NOT NULL,
	"nullifier_hash" text NOT NULL,
	"external_nullifier" text NOT NULL,
	"signal" text,
	"group_id" integer NOT NULL,
	"tree_depth" integer DEFAULT 20 NOT NULL,
	"proof_data" text NOT NULL,
	"merkle_tree_root" text,
	"verification_time_ms" integer,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"tenant_id" integer,
	CONSTRAINT "verified_proofs_nullifier_hash_unique" UNIQUE("nullifier_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_bindings" (
	"id" serial PRIMARY KEY NOT NULL,
	"identity_commitment" text NOT NULL,
	"wallet_address" text NOT NULL,
	"wallet_type" varchar(20) NOT NULL,
	"chain_id" integer NOT NULL,
	"binding_signature" text NOT NULL,
	"binding_proof" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"tenant_id" integer,
	CONSTRAINT "wallet_bindings_identity_commitment_unique" UNIQUE("identity_commitment")
);
--> statement-breakpoint
DROP INDEX IF EXISTS "audit_log_user_email_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "audit_log_success_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "group_members_commitment_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "user_sessions_user_email_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "rate_limits_identifier_action_idx";--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "user_email_enc" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "user_sub" varchar(255);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "rate_limits" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "key_shares_auth0_sub_idx" ON "key_shares" ("auth0_sub");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "key_shares_share_type_idx" ON "key_shares" ("share_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "key_shares_user_id_idx" ON "key_shares" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nullifiers_nullifier_hash_idx" ON "nullifiers" ("nullifier_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nullifiers_identity_commitment_idx" ON "nullifiers" ("identity_commitment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nullifiers_group_id_idx" ON "nullifiers" ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proof_logs_identity_commitment_idx" ON "proof_logs" ("identity_commitment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proof_logs_proof_status_idx" ON "proof_logs" ("proof_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proof_logs_group_id_idx" ON "proof_logs" ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proof_logs_created_at_idx" ON "proof_logs" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_auth0_sub_idx" ON "users" ("auth0_sub");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_proofs_address_idx" ON "verified_proofs" ("wallet_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_proofs_commitment_idx" ON "verified_proofs" ("identity_commitment");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verified_proofs_nullifier_idx" ON "verified_proofs" ("nullifier_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_proofs_group_id_idx" ON "verified_proofs" ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_proofs_verified_at_idx" ON "verified_proofs" ("verified_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_proofs_wallet_commitment_idx" ON "verified_proofs" ("wallet_address","identity_commitment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_bindings_address_idx" ON "wallet_bindings" ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_bindings_commitment_idx" ON "wallet_bindings" ("identity_commitment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_bindings_active_expires_idx" ON "wallet_bindings" ("is_active","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_user_sub_idx" ON "audit_log" ("user_sub");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_identifier_action_idx" ON "rate_limits" ("identifier","action");--> statement-breakpoint
ALTER TABLE "user_sessions" DROP COLUMN IF EXISTS "user_email";