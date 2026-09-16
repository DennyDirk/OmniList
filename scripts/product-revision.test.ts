import { test } from "node:test";
import assert from "node:assert/strict";
import { productUpsertInputSchema } from "@omnilist/shared";
import { createProductRepository } from "../apps/api/src/modules/catalog/catalog.repository";
import { withProductRevision } from "../apps/api/src/modules/catalog/product-revision";

const input = productUpsertInputSchema.parse({ title: "Test shirt", description: "A plain cotton test shirt.",
  sku: "SHIRT", basePrice: 25, quantity: 1, images: [], attributes: {}, variants: [], channelOverrides: {} });

test("concurrent editors cannot both save the same product revision", async () => {
  const repo = createProductRepository();
  const product = await repo.createProduct("workspace", input);
  assert.match(product.revision!, /^[a-f0-9]{64}$/);
  const results = await Promise.allSettled(["First edit", "Second edit"].map(title =>
    repo.updateProduct("workspace", product.id, { ...input, title }, product.revision)));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  const current = (await repo.getProductById("workspace", product.id))!;
  assert.equal(current.title, "First edit");
  assert.notEqual(current.revision, product.revision);
  assert.equal((await repo.updateProduct("workspace", product.id, { ...input, title: "Updated again" }, current.revision))?.title, "Updated again");
});

test("product revision includes stock and ignores object key order and its own token", () => {
  const a = withProductRevision({ ...input, id: "product", attributes: { color: "Black", size: "M" } });
  const b = withProductRevision({ ...a, revision: "forged", attributes: { size: "M", color: "Black" } });
  assert.equal(a.revision, b.revision);
  assert.notEqual(a.revision, withProductRevision({ ...a, quantity: 2 }).revision);
  assert.equal("revision" in productUpsertInputSchema.parse(a), false);
});

test("returned snapshots cannot mutate storage and revisions are workspace isolated", async () => {
  const repo = createProductRepository();
  const product = await repo.createProduct("workspace", input);
  product.title = "Changed outside repository";
  assert.equal((await repo.getProductById("workspace", product.id))?.title, input.title);
  assert.equal(await repo.updateProduct("other", product.id, input, product.revision), undefined);
  const snapshot = (await repo.listProducts("workspace"))[0];
  snapshot.attributes.color = "Red";
  assert.deepEqual((await repo.getProductById("workspace", product.id))?.attributes, {});
});
