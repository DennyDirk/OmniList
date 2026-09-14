import { test } from "node:test";
import assert from "node:assert/strict";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { productUpsertInputSchema, productSourceSchema, validateProductForChannel } from "@omnilist/shared";
import type { DbClient } from "../apps/api/src/db/client";
import { createProductImportRepository } from "../apps/api/src/modules/catalog/product-import.repository";
import { createProductRepository } from "../apps/api/src/modules/catalog/catalog.repository";
import { createEbayPublishAdapter } from "../apps/api/src/modules/publishing/adapters/ebay-publish.adapter";
import type { ApiEnv } from "../apps/api/src/config/env";

const source = productSourceSchema.parse({ channelId: "ebay", api: "trading", connectionId: "connection", environment: "sandbox", listingId: "123", sellerId: "seller", currency: "USD", importedAt: "2026-09-14T00:00:00.000Z" });
const product = productUpsertInputSchema.parse({ title: "Cotton shirt", description: "A factual description of this cotton shirt.", sku: "SHIRT", basePrice: 25, quantity: 3, images: [], attributes: {}, variants: [], channelOverrides: {} });
const connection = { connection: { id: "connection", workspaceId: "workspace", channelId: "ebay" as const, status: "connected" as const, externalAccountId: "seller", metadata: {} }, credentials: { refreshToken: "secret", environment: "sandbox" } };
const connectionRow = { ...connection.connection, credentials: connection.credentials };

// A transaction contract double, not a PostgreSQL engine or a multi-process concurrency test.
function database(steps: Array<{ table: string; rows: unknown[]; lock?: boolean }>, failInsert = false) {
  const inserts: Record<string, unknown>[] = [];
  const predicates: string[] = [];
  let commits = 0, rollbacks = 0;
  const db = {
    async transaction<T>(run: (tx: unknown) => Promise<T>) {
      const staged: Record<string, unknown>[] = [];
      const tx = {
        select() {
          const expected = steps.shift();
          assert(expected, "Unexpected SELECT");
          let locked = false;
          const builder = {
            from(table: Parameters<typeof getTableName>[0]) { assert.equal(getTableName(table), expected.table); return builder; },
            where(predicate: Parameters<PgDialect["sqlToQuery"]>[0]) { predicates.push(new PgDialect().sqlToQuery(predicate).sql); return builder; },
            limit() { return builder; },
            for(mode: string) { assert.equal(mode, "update"); locked = true; return builder; },
            then(resolve: (value: unknown[]) => unknown) { assert.equal(locked, Boolean(expected.lock)); return Promise.resolve(expected.rows).then(resolve); }
          };
          return builder;
        },
        insert(table: Parameters<typeof getTableName>[0]) {
          assert.equal(getTableName(table), "products");
          return { values(value: Record<string, unknown>) {
            staged.push(value);
            return { async returning() {
              if (failInsert) throw new Error("injected database insert failure");
              return [value];
            } };
          } };
        }
      };
      try { const result = await run(tx); inserts.push(...staged); commits++; return result; }
      catch (error) { rollbacks++; throw error; }
    }
  };
  return { db: db as unknown as DbClient, inserts, predicates, stats: () => ({ commits, rollbacks }) };
}
const lockSteps = () => [
  { table: "workspaces", rows: [{ id: "workspace", subscriptionPlan: "free" }], lock: true },
  { table: "channel_connections", rows: [connectionRow], lock: true }
];
const emptySteps = () => [...lockSteps(), { table: "products", rows: [] },
  { table: "channel_listings", rows: [] }, { table: "channel_listings", rows: [] }, { table: "products", rows: [{ count: 0 }] }];

test("import repository inserts product and source together under workspace and connection locks", async () => {
  const fake = database(emptySteps());
  const result = await createProductImportRepository(fake.db).importProduct("workspace", { product, source, connection });
  assert.equal(result.outcome, "imported");
  assert.equal(fake.inserts.length, 1);
  assert.deepEqual(fake.inserts[0].source, source);
  assert.equal(result.product.currency, "USD");
  assert.deepEqual(fake.stats(), { commits: 1, rollbacks: 0 });
  assert(fake.predicates.some(sql => sql.includes("source") && sql.includes("listingId") && sql.includes("environment")));
});

test("repeat import returns the existing locally edited product even at the plan limit", async () => {
  const row = { ...product, id: "existing", workspaceId: "workspace", source, title: "Locally edited title" };
  const fake = database([...lockSteps(), { table: "products", rows: [row] }]);
  const result = await createProductImportRepository(fake.db).importProduct("workspace", { product, source, connection });
  assert.equal(result.outcome, "existing");
  assert.equal(result.product.title, "Locally edited title");
  assert.equal(fake.inserts.length, 0);
});

test("a listing already published from OmniList resolves to its existing product without turning it read-only", async () => {
  const row = { ...product, id: "native", workspaceId: "workspace", source: null };
  const fake = database([...lockSteps(), { table: "products", rows: [] },
    { table: "channel_listings", rows: [{ productId: "native" }] }, { table: "products", rows: [row] }]);
  const result = await createProductImportRepository(fake.db).importProduct("workspace", { product, source, connection });
  assert.equal(result.outcome, "managed");
  assert.equal(result.product.id, "native");
  assert.equal(result.product.source, undefined);
  assert.equal(fake.inserts.length, 0);
});

test("invalid connection snapshots, pending publication and a full plan prevent import", async () => {
  for (const steps of [
    [lockSteps()[0], { table: "channel_connections", rows: [{ ...connectionRow, status: "disconnected" }], lock: true }],
    [...lockSteps(), { table: "products", rows: [] }, { table: "channel_listings", rows: [] }, { table: "channel_listings", rows: [{ status: "publishing" }] }],
    [...emptySteps().slice(0, -1), { table: "products", rows: [{ count: 10 }] }]
  ]) {
    const fake = database(steps);
    await assert.rejects(createProductImportRepository(fake.db).importProduct("workspace", { product, source, connection }));
    assert.equal(fake.inserts.length, 0);
    assert.equal(fake.stats().rollbacks, 1);
  }
});

test("failed insert leaves no separately committed source or product", async () => {
  const fake = database(emptySteps(), true);
  await assert.rejects(createProductImportRepository(fake.db).importProduct("workspace", { product, source, connection }), /insert failure/);
  assert.equal(fake.inserts.length, 0);
  assert.deepEqual(fake.stats(), { commits: 0, rollbacks: 1 });
});

test("native product creation checks the quota inside the same workspace lock", async () => {
  const fake = database([{ table: "workspaces", rows: [{ id: "workspace", subscriptionPlan: "free" }], lock: true },
    { table: "products", rows: [{ count: 10 }] }]);
  await assert.rejects(createProductRepository(fake.db).createProduct("workspace", product), /limit reached/);
  assert.equal(fake.inserts.length, 0);
  assert.equal(fake.stats().rollbacks, 1);
});

test("import rejects another workspace and unsupported variants before starting a transaction", async () => {
  const fake = database([]);
  const repo = createProductImportRepository(fake.db);
  await assert.rejects(repo.importProduct("other", { product, source, connection }), /does not match/);
  await assert.rejects(repo.importProduct("workspace", { product: { ...product, variants: [{ id: "v", sku: "v", price: 25, quantity: 1, options: [] }] }, source, connection }), /does not match/);
  assert.deepEqual(fake.stats(), { commits: 0, rollbacks: 0 });
});

test("client product payload cannot forge a source, and currencies are never silently converted", async () => {
  const parsed = productUpsertInputSchema.parse({ ...product, source });
  assert.equal("source" in parsed, false);
  assert.throws(() => productUpsertInputSchema.parse({ ...product, currency: "EUR" }));
  const repo = createProductRepository();
  const created = await repo.createProduct("workspace", parsed);
  assert.equal(created.currency, "USD");
  assert.equal(created.source, undefined);
  assert.equal((await repo.updateProduct("workspace", created.id, { ...parsed, title: "Updated shirt" }))?.currency, "USD");
});

test("imported Trading products cannot be republished to eBay even through the direct adapter", async () => {
  const imported = { ...product, id: "product", source };
  assert(validateProductForChannel(imported, "ebay").issues.some(issue => issue.code === "source_listing_read_only" && issue.severity === "blocking"));
  const env = { ebayEnvironment: "sandbox", ebayScopes: [] } as unknown as ApiEnv;
  const original = globalThis.fetch;
  globalThis.fetch = async () => { assert.fail("No external call allowed"); };
  try {
    const result = await createEbayPublishAdapter(env).publish(imported, connection);
    assert.equal(result.status, "failed");
  } finally { globalThis.fetch = original; }
});
