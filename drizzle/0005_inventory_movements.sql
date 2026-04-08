CREATE TABLE IF NOT EXISTS "inventory_movements" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(64) NOT NULL REFERENCES "workspaces"("id"),
  "product_id" varchar(64) NOT NULL REFERENCES "products"("id"),
  "variant_id" varchar(64),
  "delta" integer NOT NULL,
  "previous_quantity" integer NOT NULL,
  "next_quantity" integer NOT NULL,
  "source" varchar(32) NOT NULL,
  "reason" text,
  "channel_id" varchar(32),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
