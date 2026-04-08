ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "channel_overrides" jsonb NOT NULL DEFAULT '{}'::jsonb;
