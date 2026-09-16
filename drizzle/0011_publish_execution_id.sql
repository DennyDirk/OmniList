ALTER TABLE "publish_jobs" ADD COLUMN "execution_id" varchar(64);
-- Legacy jobs have no verified owner; never infer one from status or timestamps.
