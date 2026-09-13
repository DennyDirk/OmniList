CREATE TABLE "channel_listings" (
  "id" varchar(64) PRIMARY KEY,
  "channel_id" varchar(32) NOT NULL,
  "workspace_id" varchar(64) NOT NULL REFERENCES "workspaces"("id"),
  "product_id" varchar(64) NOT NULL REFERENCES "products"("id"),
  "connection_id" varchar(64) NOT NULL REFERENCES "channel_connections"("id"),
  "environment" varchar(32) NOT NULL,
  "marketplace_id" varchar(64) NOT NULL,
  "sku" varchar(128) NOT NULL,
  "external_account_id" text NOT NULL,
  "remote_listing" jsonb,
  "status" varchar(32) NOT NULL,
  "applied_revision" varchar(64),
  "last_published_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_listing_product_scope" ON "channel_listings"
  ("workspace_id", "connection_id", "environment", "marketplace_id", "product_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_listing_sku_scope" ON "channel_listings"
  ("workspace_id", "connection_id", "environment", "marketplace_id", "sku");
