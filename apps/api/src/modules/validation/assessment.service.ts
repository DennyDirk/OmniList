import { createHash } from "node:crypto";
import { validateProductForChannel, buildEbayAspects, validateEbayCategory,
  type ChannelId, type Product, type UnifiedAssessment } from "@omnilist/shared";
import { getEbayCategoryRequirements } from "../channels/adapters/ebay-category";
import { ensureValidEbayAccessToken } from "../channels/adapters/ebay-client";
import type { ChannelConnectionRecord, ChannelConnectionRepository } from "../channels/channel-connections.repository";
import { createEbayPublishAdapter } from "../publishing/adapters/ebay-publish.adapter";
import type { ApiEnv } from "../../config/env";

export type { UnifiedAssessment } from "@omnilist/shared";

const dependencies = { authorize: ensureValidEbayAccessToken, requirements: getEbayCategoryRequirements };

export class UnifiedAssessmentService {
  constructor(private env: ApiEnv, private connections: ChannelConnectionRepository,
    private remote: typeof dependencies = dependencies) {}

  async assessProduct(product: Product, channelId: ChannelId, connection?: ChannelConnectionRecord): Promise<UnifiedAssessment> {
    const base = validateProductForChannel(product, channelId);
    const issues = [...base.issues];
    const revision = createHash("sha256").update(JSON.stringify({ product, channelId,
      connection: connection?.connection, environment: this.env.ebayEnvironment })).digest("hex");
    const finish = (status: UnifiedAssessment["status"]): UnifiedAssessment => ({
      productId: product.id, channelId, connectionId: connection?.connection.id,
      status, score: status === "ready" ? base.score : 0, issues, revision, checkedAt: new Date().toISOString()
    });
    const block = (code: string, field: string, message: string) => issues.push({ code, field, message, severity: "blocking" });
    if (channelId !== "ebay") {
      block("channel_not_supported", "connection", "Publishing to this channel is not available yet.");
      return finish("not_supported");
    }
    if (product.source?.channelId === "ebay") {
      block("source_listing_read_only", "source", "This product already has an eBay source listing. Managing it is not supported yet.");
      return finish("not_supported");
    }
    if (!connection || connection.connection.channelId !== channelId || connection.connection.status !== "connected") {
      block("channel_not_connected", "connection", "Connect eBay before publishing.");
      return finish("needs_attention");
    }
    const snapshot = structuredClone(connection);
    const metadata = snapshot.connection.metadata;
    if ((metadata.marketplaceId?.trim() || "EBAY_US") !== "EBAY_US" || (metadata.currency?.trim() || "USD") !== "USD") {
      block("market_not_supported", "connection", "This release supports eBay US with USD only.");
      return finish("not_supported");
    }
    if (product.variants.length) return finish("not_supported");
    if (snapshot.credentials.environment && snapshot.credentials.environment !== this.env.ebayEnvironment) {
      block("connection_environment_changed", "connection", "Reconnect eBay for the current environment.");
      return finish("needs_attention");
    }
    if (issues.some(issue => issue.severity === "blocking")) return finish("needs_attention");
    for (const message of createEbayPublishAdapter(this.env).buildDraft(product, snapshot).missingConfiguration) {
      if (!issues.some(issue => issue.message === message)) block("ebay_configuration", "connection", message);
    }
    if (issues.some(issue => issue.severity === "blocking")) return finish("needs_attention");
    if (!this.env.ebayClientId || !this.env.ebayClientSecret || !this.env.ebayRedirectUriName) {
      block("ebay_server_configuration", "connection", "eBay verification is unavailable. Contact support.");
      return finish("not_checked");
    }
    try {
      const auth = await this.remote.authorize(this.env, snapshot.credentials);
      const requirements = await this.remote.requirements(this.env, auth.accessToken,
        metadata.marketplaceId?.trim() || "EBAY_US", product.channelOverrides.ebay!.categoryId!.trim());
      const current = await this.connections.getConnectionRecordById(snapshot.connection.workspaceId, snapshot.connection.id);
      if (!current || current.connection.status !== "connected"
        || JSON.stringify(current.connection) !== JSON.stringify(snapshot.connection)
        || current.credentials.refreshToken !== snapshot.credentials.refreshToken) {
        block("connection_changed", "connection", "The connection changed. Check the product again.");
        return finish("not_checked");
      }
      await this.connections.setCredentialsForConnection(snapshot.connection.workspaceId, snapshot.connection.id, snapshot.credentials, auth.credentials);
      for (const message of validateEbayCategory(requirements, product.channelOverrides.ebay?.condition, buildEbayAspects(product))) {
        block("ebay_category_requirement", "ebayCategory", message);
      }
      return finish(issues.some(issue => issue.severity === "blocking") ? "needs_attention" : "ready");
    } catch {
      block("ebay_verification_unavailable", "connection", "Could not verify eBay requirements. Check the connection and try again.");
      return finish("not_checked");
    }
  }
}
