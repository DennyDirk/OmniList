import { test } from "node:test";
import assert from "node:assert/strict";
import { productUpsertInputSchema } from "@omnilist/shared";
import { createPublishJobRepository } from "../apps/api/src/modules/publishing/publishing.repository";
import { withProductRevision } from "../apps/api/src/modules/catalog/product-revision";

const product = withProductRevision({ id: "shirt", ...productUpsertInputSchema.parse({
  title: "Test shirt", description: "A plain cotton test shirt.", sku: "SHIRT", basePrice: 25, quantity: 1,
  images: [], attributes: {}, variants: [], channelOverrides: { ebay: { aspects: { Size: ["M"] } } }
}) });

test("publish snapshot is isolated from caller edits, result updates and public job history", async () => {
  const repo = createPublishJobRepository();
  const source = structuredClone(product);
  const job = await repo.createJob({ workspaceId: "workspace", productId: source.id, productTitle: source.title,
    productSnapshot: source, status: "queued", targets: [] });
  source.channelOverrides.ebay!.aspects!.Size = ["XL"];
  assert.equal("productSnapshot" in job, false);
  const saved = (await repo.getJobProduct("workspace", job.id))!;
  assert.deepEqual(saved, product);
  saved.title = "Changed outside repository";
  await repo.updateJob("workspace", job.id, "failed", []);
  assert.deepEqual(await repo.getJobProduct("workspace", job.id), product);
  assert.equal(await repo.getJobProduct("other-workspace", job.id), undefined);
  assert.equal(await repo.getJobProduct("workspace", "missing"), undefined);
  assert.equal("productSnapshot" in (await repo.listJobs("workspace"))[0], false);
});

test("mismatched or corrupted snapshots never create a job", async () => {
  const repo = createPublishJobRepository();
  for (const snapshot of [{ ...product, id: "other" }, { ...product, title: "Other title" },
    { ...product, quantity: 20 }]) {
    await assert.rejects(repo.createJob({ workspaceId: "workspace", productId: product.id,
      productTitle: product.title, productSnapshot: snapshot, status: "queued", targets: [] }), /snapshot/);
  }
  assert.deepEqual(await repo.listJobs("workspace"), []);
});

test("only one executor can claim a queued job; foreign or completed jobs cannot be claimed", async () => {
  const repo = createPublishJobRepository();
  const job = await repo.createJob({ workspaceId: "workspace", productId: product.id, productTitle: product.title,
    productSnapshot: product, status: "queued", targets: [{ id: "target", channelId: "ebay", channelName: "eBay",
      status: "queued", readinessScore: 100, issueCount: 0 }] });
  assert.equal(await repo.claimJob("foreign", job.id), undefined);
  const claims = await Promise.all([repo.claimJob("workspace", job.id), repo.claimJob("workspace", job.id)]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(claims.find(Boolean)?.targets[0].status, "processing");
  assert.equal(await repo.claimJob("workspace", job.id), undefined);
  await repo.updateJob("workspace", job.id, "completed", [], claims.find(Boolean)!.executionId);
  assert.equal(await repo.claimJob("workspace", job.id), undefined);
});

test("only the claiming executor can finish a job and terminal outcomes cannot be overwritten", async () => {
  const repo = createPublishJobRepository();
  const job = await repo.createJob({ workspaceId: "workspace", productId: product.id, productTitle: product.title,
    productSnapshot: product, status: "queued", targets: [{ id: "target", channelId: "ebay", channelName: "eBay",
      status: "queued", readinessScore: 100, issueCount: 0 }] });
  const claimed = (await repo.claimJob("workspace", job.id))!;
  assert.ok(claimed.executionId);
  for (const token of [undefined, "", "stale-executor"]) {
    await assert.rejects(repo.updateJob("workspace", job.id, "failed", [], token), /execution changed/);
    assert.deepEqual(await repo.getJob("workspace", job.id), claimed);
  }
  assert.equal(await repo.updateJob("foreign", job.id, "failed", [], claimed.executionId), undefined);
  const targets = claimed.targets.map(target => ({ ...target, status: "published" as const }));
  const completed = await repo.updateJob("workspace", job.id, "completed", targets, claimed.executionId);
  await assert.rejects(repo.updateJob("workspace", job.id, "failed", [], claimed.executionId), /execution changed/);
  assert.deepEqual(await repo.getJob("workspace", job.id), completed);
});
