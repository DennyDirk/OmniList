ALTER TABLE "workspaces"
ADD COLUMN IF NOT EXISTS "subscription_plan" varchar(32) NOT NULL DEFAULT 'free';
