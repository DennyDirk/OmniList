ALTER TABLE "publish_jobs" ADD COLUMN "connection_revisions" jsonb;
ALTER TABLE "publish_jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;
ALTER TABLE "publish_jobs" ADD COLUMN "recovery_of" varchar(64);
ALTER TABLE "channel_listings" ADD COLUMN "execution_id" varchar(64);
CREATE INDEX "publish_jobs_worker" ON "publish_jobs" ("status", "lease_expires_at", "created_at");
-- Legacy executions stay unowned: no automatic replay or inferred lease.
