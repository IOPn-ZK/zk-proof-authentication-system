-- Remove user_email column and related index from user_sessions
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_sessions' AND column_name = 'user_email'
  ) THEN
    ALTER TABLE "user_sessions" DROP COLUMN "user_email";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'user_sessions_user_email_idx'
  ) THEN
    DROP INDEX "user_sessions_user_email_idx";
  END IF;
END $$;

