CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(255),
	"user_email" varchar(255),
	"session_id" varchar(255),
	"metadata" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"success" boolean NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"commitment" text NOT NULL,
	"member_index" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"tree_depth" integer DEFAULT 20 NOT NULL,
	"root" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "groups_group_id_unique" UNIQUE("group_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"action" varchar(100) NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"window_start" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"user_email" varchar(255) NOT NULL,
	"identity_commitment" text,
	"encrypted_identity" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "user_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_entity_type_idx" ON "audit_log" ("entity_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_user_email_idx" ON "audit_log" ("user_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_success_idx" ON "audit_log" ("success");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_members_group_id_idx" ON "group_members" ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_members_commitment_idx" ON "group_members" ("commitment");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "group_members_group_commitment_idx" ON "group_members" ("group_id","commitment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_members_member_index_idx" ON "group_members" ("member_index");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "groups_group_id_idx" ON "groups" ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limits_identifier_action_idx" ON "rate_limits" ("identifier","action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_expires_at_idx" ON "rate_limits" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_session_id_idx" ON "user_sessions" ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_user_email_idx" ON "user_sessions" ("user_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_identity_commitment_idx" ON "user_sessions" ("identity_commitment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_active_idx" ON "user_sessions" ("is_active","expires_at");