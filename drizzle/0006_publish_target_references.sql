ALTER TABLE "publish_job_targets"
ADD COLUMN IF NOT EXISTS "connection_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "publish_job_targets"
ADD COLUMN IF NOT EXISTS "remote_listing" jsonb;
