-- RBAC users table
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
CREATE UNIQUE INDEX IF NOT EXISTS "users_auth0_sub_idx" ON "users" ("auth0_sub");

-- Tenancy columns
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "tenant_id" integer;
ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "tenant_id" integer;
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "tenant_id" integer;
ALTER TABLE "rate_limits" ADD COLUMN IF NOT EXISTS "tenant_id" integer;
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "tenant_id" integer;

-- Audit columns for privacy-friendly tracing
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "user_email_enc" text;
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "user_sub" varchar(255);
CREATE INDEX IF NOT EXISTS "audit_log_user_sub_idx" ON "audit_log" ("user_sub");

