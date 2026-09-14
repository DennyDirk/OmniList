ALTER TABLE "products" ADD COLUMN "currency" varchar(3) DEFAULT 'USD' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source" jsonb;
--> statement-breakpoint
CREATE UNIQUE INDEX "product_source_identity" ON "products"
  ("workspace_id", ("source"->>'channelId'), ("source"->>'environment'), ("source"->>'listingId'))
  WHERE "source" IS NOT NULL;
