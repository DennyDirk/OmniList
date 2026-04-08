ALTER TABLE "channel_connections"
ADD COLUMN IF NOT EXISTS "credentials" jsonb NOT NULL DEFAULT '{}'::jsonb;
