ALTER TABLE "channel_listings" ADD COLUMN "execution_stage" varchar(32) DEFAULT 'claimed' NOT NULL;
ALTER TABLE "channel_listings" ADD COLUMN "attempt_revision" varchar(64);
ALTER TABLE "channel_listings" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

UPDATE "channel_listings"
SET "execution_stage" = CASE
  WHEN "status" = 'published' OR "status" = 'failed' THEN 'finished'
  WHEN "status" = 'needs_review' AND "remote_listing" IS NOT NULL THEN 'publish_requested'
  ELSE 'claimed'
END;

CREATE INDEX "channel_listing_recovery_status" ON "channel_listings" USING btree ("status", "updated_at");
