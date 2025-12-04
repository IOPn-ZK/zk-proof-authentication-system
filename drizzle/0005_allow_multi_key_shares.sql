ALTER TABLE "key_shares" DROP CONSTRAINT IF EXISTS "key_shares_auth0_sub_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "key_shares_auth0_sub_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "key_shares_auth0_sub_share_type_idx"
  ON "key_shares" ("auth0_sub", "share_type");

