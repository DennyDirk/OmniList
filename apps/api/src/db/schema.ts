import { integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import type { ProductAsset, ProductChannelOverride, ProductVariant } from "@omnilist/shared";

export const workspacesTable = pgTable("workspaces", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  subscriptionPlan: varchar("subscription_plan", { length: 32 }).notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const usersTable = pgTable(
  "users",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 64 })
      .references(() => workspacesTable.id)
      .notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    usersEmailUnique: uniqueIndex("users_email_unique").on(table.email)
  })
);

export const authSessionsTable = pgTable("auth_sessions", {
  token: varchar("token", { length: 128 }).primaryKey(),
  userId: varchar("user_id", { length: 64 })
    .references(() => usersTable.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const oauthIdentitiesTable = pgTable(
  "oauth_identities",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    userId: varchar("user_id", { length: 64 })
      .references(() => usersTable.id)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    oauthProviderUnique: uniqueIndex("oauth_provider_account_unique").on(table.provider, table.providerAccountId)
  })
);

export const productsTable = pgTable("products", {
  id: varchar("id", { length: 64 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 64 })
    .references(() => workspacesTable.id)
    .notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  brand: varchar("brand", { length: 255 }),
  sku: varchar("sku", { length: 128 }).notNull(),
  basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull(),
  categoryId: varchar("category_id", { length: 255 }),
  categoryLabel: varchar("category_label", { length: 255 }),
  images: jsonb("images").$type<ProductAsset[]>().notNull(),
  attributes: jsonb("attributes").$type<Record<string, string>>().notNull(),
  variants: jsonb("variants").$type<ProductVariant[]>().notNull(),
  channelOverrides: jsonb("channel_overrides").$type<Partial<Record<"shopify" | "ebay" | "etsy", ProductChannelOverride>>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const publishJobsTable = pgTable("publish_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 64 })
    .references(() => workspacesTable.id)
    .notNull(),
  productId: varchar("product_id", { length: 64 })
    .references(() => productsTable.id)
    .notNull(),
  productTitle: varchar("product_title", { length: 255 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const publishJobTargetsTable = pgTable("publish_job_targets", {
  id: varchar("id", { length: 64 }).primaryKey(),
  publishJobId: varchar("publish_job_id", { length: 64 })
    .references(() => publishJobsTable.id)
    .notNull(),
  channelId: varchar("channel_id", { length: 32 }).notNull(),
  channelName: varchar("channel_name", { length: 128 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  readinessScore: integer("readiness_score").notNull(),
  issueCount: integer("issue_count").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const channelConnectionsTable = pgTable("channel_connections", {
  id: varchar("id", { length: 64 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 64 })
    .references(() => workspacesTable.id)
    .notNull(),
  channelId: varchar("channel_id", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  externalAccountId: varchar("external_account_id", { length: 255 }),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull(),
  credentials: jsonb("credentials").$type<Record<string, string>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const inventoryMovementsTable = pgTable("inventory_movements", {
  id: varchar("id", { length: 64 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 64 })
    .references(() => workspacesTable.id)
    .notNull(),
  productId: varchar("product_id", { length: 64 })
    .references(() => productsTable.id)
    .notNull(),
  variantId: varchar("variant_id", { length: 64 }),
  delta: integer("delta").notNull(),
  previousQuantity: integer("previous_quantity").notNull(),
  nextQuantity: integer("next_quantity").notNull(),
  source: varchar("source", { length: 32 }).notNull(),
  reason: text("reason"),
  channelId: varchar("channel_id", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
