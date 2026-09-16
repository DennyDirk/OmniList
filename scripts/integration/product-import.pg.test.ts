import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { productSourceSchema, productUpsertInputSchema } from "@omnilist/shared";
import * as schema from "../../apps/api/src/db/schema";
import { createProductRepository } from "../../apps/api/src/modules/catalog/catalog.repository";
import { createProductImportRepository } from "../../apps/api/src/modules/catalog/product-import.repository";
import { createChannelListingRepository, type ListingIdentity } from "../../apps/api/src/modules/publishing/channel-listings.repository";
import { createPublishJobRepository } from "../../apps/api/src/modules/publishing/publishing.repository";

// Explicit opt-in; never fall back to the application's DATABASE_URL.
test("PostgreSQL product import and migration contracts", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  assert.notEqual(url.port, "6543", "Use a direct or session connection, not transaction pooling.");
  const namespace = `omnilist_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const clients = Array.from({ length: 3 }, () => new pg.Client({
    connectionString: url.toString(),
    ssl: url.hostname.endsWith(".supabase.com") || url.hostname.endsWith(".supabase.co")
      ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
    application_name: namespace
  }));
  const [a, b, coordinator] = clients;
  let created = false;
  const migrations = ["0000_absent_sumo", "0001_graceful_gideon", "0002_channel_overrides",
    "0003_workspace_subscription_plan", "0004_channel_connection_credentials", "0005_inventory_movements",
    "0006_publish_target_references", "0007_channel_listings", "0008_product_source"];
  const migration = async (name: string) => (await readFile(resolve("drizzle", `${name}.sql`), "utf8"))
    .replaceAll('"public".', `"${namespace}".`);
  const product = productUpsertInputSchema.parse({ title: "Test shirt", description: "A plain test shirt.",
    sku: "TEST-SHIRT", basePrice: 25, quantity: 3, images: [], attributes: {}, variants: [], channelOverrides: {} });
  const source = productSourceSchema.parse({ channelId: "ebay", api: "trading", connectionId: "connection",
    environment: "sandbox", listingId: "123", sellerId: "seller", currency: "USD", importedAt: "2026-09-14T00:00:00.000Z" });
  const connection = { connection: { id: "connection", workspaceId: "workspace", channelId: "ebay" as const,
    status: "connected" as const, externalAccountId: "seller", metadata: { z: "last", a: "first" } },
    credentials: { refreshToken: "test-only", environment: "sandbox" } };
  const input = { product, source, connection };
  const dbA = drizzle({ client: a, schema }), dbB = drizzle({ client: b, schema });
  const importerA = createProductImportRepository(dbA), importerB = createProductImportRepository(dbB);
  const native = createProductRepository(dbA);
  const listingsA = createChannelListingRepository(dbA), listingsB = createChannelListingRepository(dbB);
  const count = async () => Number((await coordinator.query("SELECT count(*) FROM products")).rows[0].count);
  const reset = async () => {
    await coordinator.query("TRUNCATE channel_listings, products, channel_connections, workspaces CASCADE");
    await coordinator.query("INSERT INTO workspaces (id,name) VALUES ('workspace','Test workspace')");
    await coordinator.query(`INSERT INTO channel_connections (id,workspace_id,channel_id,status,external_account_id,metadata,credentials)
      VALUES ('connection','workspace','ebay','connected','seller',$1,$2)`,
    [JSON.stringify(connection.connection.metadata), JSON.stringify(connection.credentials)]);
  };
  // Hold the common lock until both independent backend sessions are actually waiting.
  const compete = async <A, B>(first: () => Promise<A>, second: () => Promise<B>) => {
    const pidA = (await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const pidB = (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    assert.notEqual(pidA, pidB);
    await coordinator.query("BEGIN");
    await coordinator.query("SELECT id FROM workspaces WHERE id='workspace' FOR UPDATE");
    const results = Promise.allSettled([first(), second()]);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await coordinator.query(`SELECT cardinality(pg_blocking_pids($1)) > 0
          AND cardinality(pg_blocking_pids($2)) > 0 AS waiting`, [pidA, pidB]);
        if (result.rows[0].waiting) { waiting = true; break; }
        await delay(20);
      }
      assert(waiting, "Both transactions must overlap and wait for the workspace lock");
    } finally {
      await coordinator.query("ROLLBACK");
      await results;
    }
    return results;
  };
  const waitUntilBlocked = async (pid: number) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await coordinator.query("SELECT cardinality(pg_blocking_pids($1)) > 0 AS waiting", [pid]);
      if (result.rows[0].waiting) return;
      await delay(20);
    }
    assert.fail(`Backend ${pid} did not wait for the workspace lock`);
  };

  try {
    for (const client of clients) await client.connect();
    await coordinator.query(`CREATE SCHEMA "${namespace}"`);
    created = true;
    for (const client of clients) {
      // No public fallback: missing fixture tables must fail, never touch application tables.
      await client.query(`SET search_path TO "${namespace}"`);
      assert.equal((await client.query("SELECT current_schema() AS name")).rows[0].name, namespace);
    }
    await t.test("migration chain builds an empty schema; 0008 upgrades existing rows transactionally", async () => {
      for (const name of migrations.slice(0, -1)) await coordinator.query(await migration(name));
      await coordinator.query("INSERT INTO workspaces (id,name) VALUES ('legacy','Legacy')");
      await coordinator.query(`INSERT INTO products (id,workspace_id,title,description,sku,base_price,quantity,images,attributes,variants)
        VALUES ('legacy','legacy','Legacy shirt','Original text','LEGACY',12.34,2,'[]','{}','[]')`);
      const before = (await coordinator.query("SELECT to_jsonb(p) AS row FROM products p")).rows[0].row;
      await coordinator.query("BEGIN");
      await coordinator.query(await migration(migrations[8]));
      await coordinator.query("ROLLBACK");
      assert.equal((await coordinator.query(`SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema=$1 AND table_name='products' AND column_name IN ('currency','source')`, [namespace])).rows[0].n, 0);
      await coordinator.query(await migration(migrations[8]));
      const after = (await coordinator.query("SELECT to_jsonb(p) AS row FROM products p")).rows[0].row;
      assert.equal(after.currency, "USD");
      assert.equal(after.source, null);
      delete after.currency; delete after.source;
      assert.deepEqual(after, before);
    });
    await t.test("0009 adds durable checkpoints; SQL rejects stale results and executing recovery", async () => {
      await coordinator.query(await migration("0009_publish_recovery"));
      await reset();
      const item = await native.createProduct("workspace", product);
      const identity: ListingIdentity = { workspaceId: "workspace", productId: item.id,
        connectionId: "connection", channelId: "ebay", environment: "sandbox", marketplaceId: "EBAY_US",
        sku: product.sku, externalAccountId: "seller" };
      const remote = { channelId: "ebay" as const, environment: "sandbox" as const,
        marketplaceId: "EBAY_US", sku: product.sku, offerId: "saved-offer" };
      await listingsA.claim(identity, "current");
      await listingsA.recordCheckpoint(identity, "current", { stage: "offer_saved", remoteListing: remote });
      assert.deepEqual((await listingsB.get(identity))?.remoteListing, remote);
      assert.equal((await listingsB.get(identity))?.executionStage, "offer_saved");
      await assert.rejects(listingsB.recordResult(identity, { status: "failed", revision: "old" }), /attempt changed/);
      await assert.rejects(listingsB.reconcileActive(identity, remote, { ...remote, listingId: "123" }), /listing changed/);
      assert.equal((await listingsA.get(identity))?.status, "publishing");
      await listingsA.recordResult(identity, { status: "failed", revision: "current", requiresReconciliation: true });
      const results = await Promise.allSettled([listingsA, listingsB].map(repo =>
        repo.reconcileActive(identity, remote, { ...remote, listingId: "123" })));
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      assert.equal((await listingsA.get(identity))?.appliedRevision, null);
    });
    await t.test("0010 preserves legacy jobs and reads confirmed snapshots through a new repository", async () => {
      await reset();
      const item = await native.createProduct("workspace", product);
      await a.query(`INSERT INTO publish_jobs (id, workspace_id, product_id, product_title, status)
        VALUES ('legacy-job', 'workspace', $1, $2, 'processing')`, [item.id, item.title]);
      await coordinator.query(await migration("0010_publish_job_snapshot"));
      const writer = createPublishJobRepository(dbA);
      const reader = createPublishJobRepository(dbB);
      assert.equal(await reader.getJobProduct("workspace", "legacy-job"), undefined);
      const original = (await native.getProductById("workspace", item.id))!;
      const job = await writer.createJob({ workspaceId: "workspace", productId: item.id, productTitle: item.title,
        productSnapshot: original, status: "queued", targets: [{ id: "snapshot-target", channelId: "ebay",
          channelName: "eBay", connectionId: "connection", status: "queued", readinessScore: 100, issueCount: 0 }] });
      await native.updateProduct("workspace", item.id, { ...product, title: "Changed later" }, original.revision);
      assert.deepEqual(await reader.getJobProduct("workspace", job.id), original);
      assert.equal(await reader.getJobProduct("other-workspace", job.id), undefined);
      assert.equal(await reader.claimJob("other-workspace", job.id), undefined);
      const claims = await Promise.all([writer.claimJob("workspace", job.id), reader.claimJob("workspace", job.id)]);
      assert.equal(claims.filter(Boolean).length, 1);
      assert.equal((await reader.getJob("workspace", job.id))?.targets[0].status, "processing");
      assert.equal(await writer.claimJob("workspace", job.id), undefined);
      await reader.updateJob("workspace", job.id, "failed", job.targets.map(target => ({ ...target, status: "failed" })));
      assert.deepEqual(await writer.getJobProduct("workspace", job.id), original);
      assert.equal("productSnapshot" in (await reader.getJob("workspace", job.id))!, false);
    });
    await t.test("two PostgreSQL editors cannot overwrite the same product revision", async () => {
      await reset();
      const existing = await native.createProduct("workspace", product);
      const snapshot = (await native.getProductById("workspace", existing.id))!;
      const other = createProductRepository(dbB);
      const pidA = (await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const pidB = (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await coordinator.query("BEGIN");
      await coordinator.query("SELECT id FROM products WHERE id=$1 FOR UPDATE", [existing.id]);
      const results = Promise.allSettled([
        native.updateProduct("workspace", existing.id, { ...product, title: "First editor" }, snapshot.revision),
        other.updateProduct("workspace", existing.id, { ...product, title: "Second editor" }, snapshot.revision)
      ]);
      try {
        await waitUntilBlocked(pidA);
        await waitUntilBlocked(pidB);
      } finally {
        await coordinator.query("ROLLBACK");
      }
      const settled = await results;
      assert.equal(settled.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(settled.filter(result => result.status === "rejected").length, 1);
      const current = (await native.getProductById("workspace", existing.id))!;
      assert.notEqual(current.revision, snapshot.revision);
      await assert.rejects(native.updateProduct("workspace", existing.id, product, snapshot.revision), /product changed/);
    });
    await t.test("parallel imports produce one product; repeat preserves local edits", async () => {
      await reset();
      const results = await compete(() => importerA.importProduct("workspace", input), () => importerB.importProduct("workspace", input));
      const values = results.map(result => { assert.equal(result.status, "fulfilled"); return (result as PromiseFulfilledResult<Awaited<ReturnType<typeof importerA.importProduct>>>).value; });
      assert.deepEqual(values.map(value => value.outcome).sort(), ["existing", "imported"]);
      assert.equal(values[0].product.id, values[1].product.id);
      assert.equal(await count(), 1);
      await native.updateProduct("workspace", values[0].product.id, { ...product, title: "Local edit" });
      const repeated = await importerB.importProduct("workspace", input);
      assert.equal(repeated.product.title, "Local edit");
      assert.deepEqual(repeated.product.source, source);
    });
    await t.test("native create and import cannot both consume the last free slot", async () => {
      await reset();
      for (let i = 0; i < 9; i++) await native.createProduct("workspace", { ...product, sku: `SEED-${i}` });
      const results = await compete(() => native.createProduct("workspace", { ...product, sku: "NATIVE" }),
        () => importerB.importProduct("workspace", input));
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      const failure = results.find(result => result.status === "rejected") as PromiseRejectedResult;
      assert.match(failure.reason.message, /limit reached/);
      assert.equal(await count(), 10);
    });
    await t.test("publish first prevents a concurrent import of the same eBay SKU", async () => {
      await reset();
      const nativeProduct = await native.createProduct("workspace", product);
      const identity: ListingIdentity = { workspaceId: "workspace", productId: nativeProduct.id,
        connectionId: "connection", channelId: "ebay", environment: "sandbox", marketplaceId: "EBAY_US",
        sku: product.sku, externalAccountId: "seller" };
      const pidA = (await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const pidB = (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await coordinator.query("BEGIN");
      await coordinator.query("SELECT id FROM workspaces WHERE id='workspace' FOR UPDATE");
      const publish = listingsA.claim(identity);
      await waitUntilBlocked(pidA);
      const importAttempt = importerB.importProduct("workspace", input);
      await waitUntilBlocked(pidB);
      await coordinator.query("COMMIT");
      assert.equal((await publish).status, "publishing");
      await assert.rejects(importAttempt, /publication or SKU link/);
      assert.equal(await count(), 1);
    });
    await t.test("import first prevents a concurrent native publish of the same eBay SKU", async () => {
      await reset();
      const nativeProduct = await native.createProduct("workspace", product);
      const identity: ListingIdentity = { workspaceId: "workspace", productId: nativeProduct.id,
        connectionId: "connection", channelId: "ebay", environment: "sandbox", marketplaceId: "EBAY_US",
        sku: product.sku, externalAccountId: "seller" };
      const pidA = (await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const pidB = (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await coordinator.query("BEGIN");
      await coordinator.query("SELECT id FROM workspaces WHERE id='workspace' FOR UPDATE");
      const imported = importerA.importProduct("workspace", input);
      await waitUntilBlocked(pidA);
      const publishAttempt = listingsB.claim(identity);
      await waitUntilBlocked(pidB);
      await coordinator.query("COMMIT");
      assert.equal((await imported).outcome, "imported");
      await assert.rejects(publishAttempt, /imported from an existing listing/);
      assert.equal(await count(), 2);
    });
    await t.test("claim rechecks a connection changed while it waited for the workspace lock", async () => {
      await reset();
      const nativeProduct = await native.createProduct("workspace", product);
      const identity: ListingIdentity = { workspaceId: "workspace", productId: nativeProduct.id,
        connectionId: "connection", channelId: "ebay", environment: "sandbox", marketplaceId: "EBAY_US",
        sku: product.sku, externalAccountId: "seller" };
      const pidA = (await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await coordinator.query("BEGIN");
      await coordinator.query("SELECT id FROM workspaces WHERE id='workspace' FOR UPDATE");
      const publishAttempt = listingsA.claim(identity);
      await waitUntilBlocked(pidA);
      await coordinator.query("UPDATE channel_connections SET status='disconnected' WHERE id='connection'");
      await coordinator.query("COMMIT");
      await assert.rejects(publishAttempt, /store changed/);
      assert.equal((await coordinator.query("SELECT count(*)::int AS n FROM channel_listings")).rows[0].n, 0);
    });
    await t.test("unique source index rejects duplicates independently of the repository", async () => {
      await reset();
      await importerA.importProduct("workspace", input);
      const duplicate = `INSERT INTO products (id,workspace_id,title,description,sku,base_price,quantity,images,attributes,variants,source)
        SELECT $1,workspace_id,title,description,sku,base_price,quantity,images,attributes,variants,$2 FROM products LIMIT 1`;
      await assert.rejects(a.query(duplicate, ["duplicate", JSON.stringify({ ...source, connectionId: "reconnected" })]),
        (error: unknown) => (error as { code?: string }).code === "23505");
      await a.query(duplicate, ["production", JSON.stringify({ ...source, environment: "production" })]);
      assert.equal(await count(), 2);
    });
    await t.test("database failure after INSERT rolls back product and source; retry works", async () => {
      await reset();
      await coordinator.query(`CREATE FUNCTION fail_import() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected import failure'; END $$`);
      await coordinator.query("CREATE TRIGGER fail_import AFTER INSERT ON products FOR EACH ROW EXECUTE FUNCTION fail_import()");
      try {
        await assert.rejects(importerA.importProduct("workspace", input), (error: unknown) =>
          (error as { cause?: { message?: string } }).cause?.message === "injected import failure");
        assert.equal(await count(), 0);
      } finally { await coordinator.query("DROP TRIGGER fail_import ON products"); }
      assert.equal((await importerB.importProduct("workspace", input)).outcome, "imported");
      assert.equal(await count(), 1);
    });
    await t.test("exact managed listing is reused; disconnected account cannot import", async () => {
      await reset();
      const existing = await native.createProduct("workspace", product);
      await a.query(`INSERT INTO channel_listings (id,channel_id,workspace_id,product_id,connection_id,environment,
        marketplace_id,sku,external_account_id,status,remote_listing)
        VALUES ('managed','ebay','workspace',$1,'connection','sandbox','EBAY_US','TEST-SHIRT','seller','published',$2)`,
      [existing.id, JSON.stringify({ listingId: source.listingId })]);
      const result = await importerB.importProduct("workspace", input);
      assert.equal(result.outcome, "managed");
      assert.equal(result.product.id, existing.id);
      assert.equal(result.product.source, undefined);
      assert.equal(await count(), 1);
      await a.query("UPDATE channel_connections SET status='disconnected'");
      await assert.rejects(importerB.importProduct("workspace", input), /connection changed/);
      assert.equal(await count(), 1);
    });
  } finally {
    for (const client of clients) await client.query("ROLLBACK").catch(() => undefined);
    if (created) {
      assert.match(namespace, /^omnilist_test_[a-f0-9]{32}$/);
      await coordinator.query(`DROP SCHEMA "${namespace}" CASCADE`);
    }
    for (const client of clients) await client.end();
  }
});
