-- Verified Proofs table for storing successfully verified ZK proofs
-- Links proofs to wallet addresses (EOA) for public verifiability
CREATE TABLE IF NOT EXISTS "verified_proofs" (
  "id" serial PRIMARY KEY NOT NULL,
  "wallet_address" text NOT NULL,
  "identity_commitment" text NOT NULL,
  "nullifier_hash" text NOT NULL,
  "external_nullifier" text NOT NULL,
  "signal" text,
  "group_id" integer NOT NULL,
  "tree_depth" integer NOT NULL DEFAULT 20,
  "proof_data" text NOT NULL,
  "merkle_tree_root" text,
  "verification_time_ms" integer,
  "verified_at" timestamp DEFAULT now() NOT NULL,
  "ip_address" varchar(45),
  "user_agent" text,
  "tenant_id" integer,
  CONSTRAINT "verified_proofs_nullifier_unique" UNIQUE("nullifier_hash")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_proofs_address_idx" ON "verified_proofs" ("wallet_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_proofs_commitment_idx" ON "verified_proofs" ("identity_commitment");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verified_proofs_nullifier_idx" ON "verified_proofs" ("nullifier_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_proofs_group_id_idx" ON "verified_proofs" ("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_proofs_verified_at_idx" ON "verified_proofs" ("verified_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_proofs_wallet_commitment_idx" ON "verified_proofs" ("wallet_address", "identity_commitment");

