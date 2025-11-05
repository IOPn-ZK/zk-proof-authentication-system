-- Nullifiers table for replay attack prevention
CREATE TABLE IF NOT EXISTS "nullifiers" (
  "id" serial PRIMARY KEY NOT NULL,
  "nullifier_hash" text NOT NULL,
  "identity_commitment" text NOT NULL,
  "external_nullifier" text NOT NULL,
  "signal" text,
  "group_id" integer NOT NULL,
  "used_at" timestamp DEFAULT now() NOT NULL,
  "tenant_id" integer,
  CONSTRAINT "nullifiers_hash_unique" UNIQUE("nullifier_hash")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nullifiers_hash_idx" ON "nullifiers" ("nullifier_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nullifiers_commitment_idx" ON "nullifiers" ("identity_commitment");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nullifiers_external_nullifier_idx" ON "nullifiers" ("external_nullifier");

-- Proof Logs table for verification tracking
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
  "created_at" timestamp DEFAULT now() NOT NULL,
  "tenant_id" integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proof_logs_commitment_idx" ON "proof_logs" ("identity_commitment");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proof_logs_status_idx" ON "proof_logs" ("proof_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proof_logs_created_at_idx" ON "proof_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proof_logs_nullifier_hash_idx" ON "proof_logs" ("nullifier_hash");

-- Wallet Bindings table for wallet-identity linking
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
  CONSTRAINT "wallet_bindings_commitment_unique" UNIQUE("identity_commitment")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_bindings_address_idx" ON "wallet_bindings" ("wallet_address");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_bindings_commitment_idx" ON "wallet_bindings" ("identity_commitment");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_bindings_active_idx" ON "wallet_bindings" ("is_active", "expires_at");

