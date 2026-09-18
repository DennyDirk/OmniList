CREATE TABLE "channel_oauth_attempts" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(64) NOT NULL REFERENCES "workspaces"("id"),
  "channel_id" varchar(32) NOT NULL,
  "connection_id" varchar(64) NOT NULL REFERENCES "channel_connections"("id"),
  "connection_version" text NOT NULL,
  "browser_hash" varchar(64) NOT NULL,
  "verifier" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "claimed_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_oauth_attempt_scope" ON "channel_oauth_attempts" ("workspace_id", "channel_id");
--> statement-breakpoint
-- Only the backend table owner / BYPASSRLS role may access OAuth secrets.
-- No policies are granted to browser Supabase roles.
ALTER TABLE "channel_oauth_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "channel_connections" ENABLE ROW LEVEL SECURITY;
