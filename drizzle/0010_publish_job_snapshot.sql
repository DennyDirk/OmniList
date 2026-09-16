ALTER TABLE "publish_jobs" ADD COLUMN "product_snapshot" jsonb;
-- Historical jobs have no confirmed snapshot. Do not backfill from mutable products.
