import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import {
  channelConnectionUpsertInputSchema,
  authProviderIdSchema,
  bulkPublishJobRequestSchema,
  inventoryAdjustmentInputSchema,
  loginInputSchema,
  publishJobRequestSchema,
  productUpsertInputSchema,
  publishPreviewRequestSchema,
  registerInputSchema,
  workspacePlanChangeInputSchema,
  type ChannelId
} from "@omnilist/shared";
import { ZodError } from "zod";

import { createDbClient } from "./db/client";
import { bootstrapDatabase } from "./db/bootstrap";
import { getEnv } from "./config/env";
import { createAuthRepository } from "./modules/auth/auth.repository";
import { createAuthService, OAUTH_STATE_COOKIE_NAME, SESSION_COOKIE_NAME } from "./modules/auth/auth.service";
import { createProductRepository } from "./modules/catalog/catalog.repository";
import { createCatalogService } from "./modules/catalog/catalog.service";
import { createChannelConnectionRepository } from "./modules/channels/channel-connections.repository";
import { createChannelConnectionsService } from "./modules/channels/channel-connections.service";
import { CHANNEL_CONNECT_STATE_COOKIE_NAME, createChannelAuthService } from "./modules/channels/channel-auth.service";
import { listChannels } from "./modules/channels/channels.service";
import { createMediaService } from "./modules/media/media.service";
import { createInventoryRepository } from "./modules/inventory/inventory.repository";
import { createInventoryService } from "./modules/inventory/inventory.service";
import { createPublishJobRepository } from "./modules/publishing/publishing.repository";
import { buildPublishPreview } from "./modules/publishing/publishing.service";
import { createPublishingService } from "./modules/publishing/publishing.service";
import { validateProductAcrossChannels } from "./modules/validation/validation.service";
import { createWorkspaceService } from "./modules/workspace/workspace.service";

function normalizeChannelIds(value: unknown): ChannelId[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    return ["shopify", "ebay", "etsy"];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is ChannelId => item === "shopify" || item === "ebay" || item === "etsy");
}

export async function buildApp() {
  const env = getEnv();
  const app = Fastify({ logger: true });
  const db = env.databaseUrl ? createDbClient(env.databaseUrl) : undefined;
  const authRepository = createAuthRepository(db);
  const authService = createAuthService(env, authRepository);
  const productRepository = createProductRepository(db);
  const channelConnectionRepository = createChannelConnectionRepository(db);
  const publishJobRepository = createPublishJobRepository(db);
  const inventoryRepository = createInventoryRepository(db);
  const mediaService = createMediaService(env);
  const catalogService = createCatalogService(productRepository, mediaService);
  const inventoryService = createInventoryService(productRepository, inventoryRepository);
  const channelConnectionsService = createChannelConnectionsService(channelConnectionRepository);
  const channelAuthService = createChannelAuthService(channelConnectionRepository, env);
  const publishingService = createPublishingService(publishJobRepository, channelConnectionRepository, env);
  const workspaceService = createWorkspaceService(authRepository, productRepository);

  if (db) {
    await bootstrapDatabase(db);
  }

  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(cookie, {
    secret: "omnilist-dev-cookie-secret"
  });

  async function getRequiredSession(request: FastifyRequest, reply: FastifyReply) {
    const session = await authService.getSession(request.cookies[SESSION_COOKIE_NAME]);

    if (!session) {
      await reply.code(401).send({
        message: "Authentication required."
      });
      return undefined;
    }

    return session;
  }

  app.get("/health", async () => ({
    status: "ok",
    service: "omnilist-api"
  }));

  app.get("/channels", async () => ({
    items: listChannels()
  }));

  app.get("/channel-capabilities", async () => ({
    items: channelAuthService.listCapabilities()
  }));

  app.post("/auth/register", async (request, reply) => {
    try {
      const input = registerInputSchema.parse(request.body);
      const result = await authService.register(input);

      reply.setCookie(SESSION_COOKIE_NAME, result.sessionToken, {
        httpOnly: true,
        path: "/",
        sameSite: "lax"
      });

      return reply.code(201).send({
        item: result.session
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          message: "Invalid registration payload.",
          issues: error.flatten()
        });
      }

      if (error instanceof Error && error.message === "EMAIL_TAKEN") {
        return reply.code(409).send({
          message: "A user with this email already exists."
        });
      }

      throw error;
    }
  });

  app.post("/auth/login", async (request, reply) => {
    try {
      const input = loginInputSchema.parse(request.body);
      const result = await authService.login(input);

      if (!result) {
        return reply.code(401).send({
          message: "Invalid email or password."
        });
      }

      reply.setCookie(SESSION_COOKIE_NAME, result.sessionToken, {
        httpOnly: true,
        path: "/",
        sameSite: "lax"
      });

      return {
        item: result.session
      };
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          message: "Invalid login payload.",
          issues: error.flatten()
        });
      }

      throw error;
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    await authService.logout(request.cookies[SESSION_COOKIE_NAME]);
    reply.clearCookie(SESSION_COOKIE_NAME, {
      path: "/"
    });

    return reply.code(204).send();
  });

  app.get("/auth/session", async (request, reply) => {
    const session = await authService.getSession(request.cookies[SESSION_COOKIE_NAME]);

    if (!session) {
      return reply.code(401).send({
        message: "Authentication required."
      });
    }

    return {
      item: session
    };
  });

  app.get("/auth/providers", async () => ({
    items: authService.listProviders()
  }));

  app.get("/auth/oauth/:provider/start", async (request, reply) => {
    try {
      const params = request.params as { provider: string };
      const provider = authProviderIdSchema.parse(params.provider);
      const result = authService.beginOAuth(provider);

      reply.setCookie(OAUTH_STATE_COOKIE_NAME, result.state, {
        httpOnly: true,
        path: "/",
        sameSite: "lax"
      });

      return reply.redirect(result.authorizationUrl);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          message: "Unsupported OAuth provider."
        });
      }

      if (error instanceof Error && error.message === "PROVIDER_NOT_CONFIGURED") {
        return reply.code(503).send({
          message: "OAuth provider is not configured yet."
        });
      }

      throw error;
    }
  });

  app.get("/auth/oauth/:provider/callback", async (request, reply) => {
    try {
      const params = request.params as { provider: string };
      const query = request.query as { code?: string; state?: string };
      const provider = authProviderIdSchema.parse(params.provider);

      if (!query.code || !query.state) {
        return reply.code(400).send({
          message: "Missing OAuth callback parameters."
        });
      }

      const result = await authService.finishOAuth(
        provider,
        query.code,
        query.state,
        request.cookies[OAUTH_STATE_COOKIE_NAME]
      );

      reply.setCookie(SESSION_COOKIE_NAME, result.sessionToken, {
        httpOnly: true,
        path: "/",
        sameSite: "lax"
      });

      reply.clearCookie(OAUTH_STATE_COOKIE_NAME, {
        path: "/"
      });

      return reply.redirect(authService.getWebRedirectUrl());
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          message: "Unsupported OAuth provider."
        });
      }

      if (
        error instanceof Error &&
        [
          "PROVIDER_NOT_CONFIGURED",
          "INVALID_OAUTH_STATE",
          "OAUTH_TOKEN_EXCHANGE_FAILED",
          "OAUTH_PROFILE_FETCH_FAILED",
          "OAUTH_EMAIL_REQUIRED"
        ].includes(error.message)
      ) {
        return reply.redirect(`${authService.getWebRedirectUrl()}/login?error=${encodeURIComponent(error.message)}`);
      }

      throw error;
    }
  });

  app.get("/workspace", async (request, reply) => {
    const session = await getRequiredSession(request, reply);
    if (!session) {
      return;
    }

    return {
      item: session.workspace
    };
  });

  app.get("/workspace/usage", async (request, reply) => {
    const session = await getRequiredSession(request, reply);
    if (!session) {
      return;
    }

    const usage = await workspaceService.getWorkspaceUsage(session.workspace.id);

    if (!usage) {
      return reply.code(404).send({
        message: "Workspace not found."
      });
    }

    return {
      item: usage
    };
  });

  app.post("/workspace/plan", async (request, reply) => {
    try {
      const session = await getRequiredSession(request, reply);
      if (!session) {
        return;
      }

      const input = workspacePlanChangeInputSchema.parse(request.body);
      const workspace = await workspaceService.updateWorkspacePlan(session.workspace.id, input.subscriptionPlan);

      if (!workspace) {
        return reply.code(404).send({
          message: "Workspace not found."
        });
      }

      return {
        item: workspace
      };
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          message: "Invalid workspace plan payload.",
          issues: error.flatten()
        });
      }

      throw error;
    }
  });

  app.get("/channel-connections", async (request, reply) => {
    const session = await getRequiredSession(request, reply);
    if (!session) {
      return;
    }

    return {
      items: await channelConnectionsService.listConnections(session.workspace.id)
    };
  });

  app.get("/channel-connections/:channelId/connect/start", async (request, reply) => {
    try {
      const session = await getRequiredSession(request, reply);
      if (!session) {
        return;
      }

      const params = request.params as { channelId: ChannelId };
      const result = channelAuthService.beginConnection(session.workspace.id, params.channelId);

      reply.setCookie(CHANNEL_CONNECT_STATE_COOKIE_NAME, result.stateCookieValue, {
        httpOnly: true,
        path: "/",
        sameSite: "lax"
      });

      return reply.redirect(result.authorizationUrl);
    } catch (error) {
      if (error instanceof Error && error.message === "CHANNEL_CONNECTOR_NOT_CONFIGURED") {
        return reply.code(503).send({
          message: "This channel connector is not configured yet."
        });
      }

      throw error;
    }
  });

  app.get("/channel-connections/:channelId/connect/callback", async (request, reply) => {
    try {
      const session = await getRequiredSession(request, reply);
      if (!session) {
        return;
      }

      const params = request.params as { channelId: ChannelId };
      const query = request.query as { code?: string; state?: string };

      if (!query.code || !query.state) {
        return reply.redirect(`${env.publicWebUrl}/channels?error=${encodeURIComponent("MISSING_CHANNEL_CONNECT_PARAMS")}`);
      }

      await channelAuthService.completeConnection({
        workspaceId: session.workspace.id,
        channelId: params.channelId,
        code: query.code,
        returnedState: query.state,
        stateCookieValue: request.cookies[CHANNEL_CONNECT_STATE_COOKIE_NAME]
      });

      reply.clearCookie(CHANNEL_CONNECT_STATE_COOKIE_NAME, {
        path: "/"
      });

      return reply.redirect(`${env.publicWebUrl}/channels?connected=${encodeURIComponent(params.channelId)}`);
    } catch (error) {
      reply.clearCookie(CHANNEL_CONNECT_STATE_COOKIE_NAME, {
        path: "/"
      });

      if (
        error instanceof Error &&
        ["INVALID_CHANNEL_CONNECT_STATE", "CHANNEL_CONNECTOR_NOT_CONFIGURED", "EBAY_TOKEN_EXCHANGE_FAILED"].includes(
          error.message
        )
      ) {
        return reply.redirect(`${env.publicWebUrl}/channels?error=${encodeURIComponent(error.message)}`);
      }

      throw error;
    }
  });

  app.put("/channel-connections/:channelId", async (request, reply) => {
    try {
      const session = await getRequiredSession(request, reply);
      if (!session) {
        return;
      }

      const params = request.params as { channelId: ChannelId };
      const input = channelConnectionUpsertInputSchema.parse(request.body);
      const connection = await channelConnectionsService.upsertConnection(session.workspace.id, params.channelId, input);

      return {
        item: connection
      };
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          message: "Invalid connection payload.",
          issues: error.flatten()
        });
      }

      throw error;
    }
  });

  app.get("/products", async (request, reply) => {
    const session = await getRequiredSession(request, reply);
    if (!session) {
      return;
    }

    return {
      items: await catalogService.listProducts(session.workspace.id)
    };
  });

  app.get("/products/:productId", async (request, reply) => {
    const session = await getRequiredSession(request, reply);
    if (!session) {
      return;
    }

    const params = request.params as { productId: string };
    const product = await catalogService.getProductById(session.workspace.id, params.productId);

    if (!product) {
      return reply.code(404).send({
        message: "Product not found."
      });
    }

    return { item: product };
  });

  app.post("/products", async (request, reply) => {
    try {
      const session = await getRequiredSession(request, reply);
      if (!session) {
        return;
      }

      const input = productUpsertInputSchema.parse(request.body);
      const productCount = await catalogService.countProducts(session.workspace.id);

      if (!workspaceService.canCreateProduct(session.workspace.subscriptionPlan, productCount)) {
        return reply.code(403).send({
          message: "Free plan product limit reached. Upgrade to Pro to add more products."
        });
      }

      const product = await catalogService.createProduct(session.workspace.id, input);

      return reply.code(201).send({
        item: product
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          message: "Invalid product payload.",
          issues: error.flatten()
        });
      }

      throw error;
    }
  });

  app.put("/products/:productId", async (request, reply) => {
    try {
      const session = await getRequiredSession(request, reply);
      if (!session) {
        return;
      }

      const params = request.params as { productId: string };
      const input = productUpsertInputSchema.parse(request.body);
      const product = await catalogService.updateProduct(session.workspace.id, params.productId, input);

      if (!product) {
        return reply.code(404).send({
          message: "Product not found."
        });
      }

      return {
        item: product
      };
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          message: "Invalid product payload.",
          issues: error.flatten()
        });
      }

      throw error;
    }
  });

  app.delete("/products/:productId", async (request, reply) => {
    const session = await getRequiredSession(request, reply);
    if (!session) {
      return;
    }

    const params = request.params as { productId: string };
    const deleted = await catalogService.deleteProduct(session.workspace.id, params.productId);

    if (!deleted) {
      return reply.code(404).send({
        message: "Product not found."
      });
    }

    return reply.code(204).send();
  });

  app.get("/products/:productId/readiness", async (request, reply) => {
    const session = await getRequiredSession(request, reply);
    if (!session) {
      return;
    }

    const params = request.params as { productId: string };
    const query = request.query as { channels?: string };
    const product = await catalogService.getProductById(session.workspace.id, params.productId);

    if (!product) {
      return reply.code(404).send({
        message: "Product not found."
      });
    }

    return {
      productId: product.id,
      items: validateProductAcrossChannels(product, normalizeChannelIds(query.channels))
    };
  });

  app.get("/products/:productId/inventory", async (request, reply) => {
    const session = await getRequiredSession(request, reply);
    if (!session) {
      return;
    }

    const params = request.params as { productId: string };
    const snapshot = await inventoryService.getSnapshot(session.workspace.id, params.productId);

    if (!snapshot) {
      return reply.code(404).send({
        message: "Product not found."
      });
    }

    return {
      item: snapshot
    };
  });

  app.post("/products/:productId/inventory/adjust", async (request, reply) => {
    try {
      const session = await getRequiredSession(request, reply);
      if (!session) {
        return;
      }

      const params = request.params as { productId: string };
      const input = inventoryAdjustmentInputSchema.parse(request.body ?? {});
      const result = await inventoryService.adjustInventory(session.workspace.id, params.productId, input);

      if (result.kind === "not_found") {
        return reply.code(404).send({
          message: "Product not found."
        });
      }

      if (result.kind === "variant_not_found") {
        return reply.code(404).send({
          message: "Variant not found."
        });
      }

      if (result.kind === "variant_required") {
        return reply.code(400).send({
          message: "Select a specific variant when adjusting inventory for a product with variants."
        });
      }

      if (result.kind === "insufficient_stock") {
        return reply.code(400).send({
          message: "This adjustment would make inventory go below zero."
        });
      }

      return {
        item: result.product,
        movement: result.movement
      };
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          message: "Invalid inventory adjustment payload.",
          issues: error.flatten()
        });
      }

      throw error;
    }
  });

  app.get("/publish-jobs", async (request, reply) => {
    const session = await getRequiredSession(request, reply);
    if (!session) {
      return;
    }

    return {
      items: await publishingService.listJobs(session.workspace.id)
    };
  });

  app.post("/publish-jobs/bulk", async (request, reply) => {
    try {
      const session = await getRequiredSession(request, reply);
      if (!session) {
        return;
      }

      const body = bulkPublishJobRequestSchema.parse(request.body ?? {});
      const connections = await channelConnectionsService.listConnections(session.workspace.id);
      const connectionRecords = await Promise.all(
        body.channels.map((channelId) => channelConnectionRepository.getConnectionRecord(session.workspace.id, channelId))
      );

      const queuedJobs = [];
      const skipped: Array<{ productId: string; reason: string }> = [];

      for (const productId of body.productIds) {
        const product = await catalogService.getProductById(session.workspace.id, productId);

        if (!product) {
          skipped.push({
            productId,
            reason: "Product not found."
          });
          continue;
        }

        const job = await publishingService.enqueuePublishJob({
          workspaceId: session.workspace.id,
          product,
          channelIds: body.channels,
          connections,
          connectionRecords: connectionRecords.filter((item): item is NonNullable<typeof item> => Boolean(item))
        });

        queuedJobs.push(job);
      }

      return reply.code(202).send({
        items: queuedJobs,
        queuedCount: queuedJobs.length,
        skipped
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          message: "Invalid bulk publish payload.",
          issues: error.flatten()
        });
      }

      throw error;
    }
  });

  app.get("/products/:productId/publish-jobs", async (request, reply) => {
    const session = await getRequiredSession(request, reply);
    if (!session) {
      return;
    }

    const params = request.params as { productId: string };

    return {
      items: await publishingService.listJobs(session.workspace.id, params.productId)
    };
  });

  app.get("/publish-jobs/:jobId", async (request, reply) => {
    const session = await getRequiredSession(request, reply);
    if (!session) {
      return;
    }

    const params = request.params as { jobId: string };
    const job = await publishingService.getJob(session.workspace.id, params.jobId);

    if (!job) {
      return reply.code(404).send({
        message: "Publish job not found."
      });
    }

    return {
      item: job
    };
  });

  app.post("/products/:productId/publish-preview", async (request, reply) => {
    try {
      const session = await getRequiredSession(request, reply);
      if (!session) {
        return;
      }

      const params = request.params as { productId: string };
      const body = publishPreviewRequestSchema.parse(request.body ?? {});
      const product = await catalogService.getProductById(session.workspace.id, params.productId);

      if (!product) {
        return reply.code(404).send({
          message: "Product not found."
        });
      }

      const channelIds: ChannelId[] = body.channels?.length ? body.channels : ["shopify", "ebay", "etsy"];

      return buildPublishPreview(product, channelIds);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          message: "Invalid publish preview payload.",
          issues: error.flatten()
        });
      }

      throw error;
    }
  });

  app.post("/products/:productId/publish", async (request, reply) => {
    try {
      const session = await getRequiredSession(request, reply);
      if (!session) {
        return;
      }

      const params = request.params as { productId: string };
      const body = publishJobRequestSchema.parse(request.body ?? {});
      const product = await catalogService.getProductById(session.workspace.id, params.productId);

      if (!product) {
        return reply.code(404).send({
          message: "Product not found."
        });
      }

      const channelIds: ChannelId[] = body.channels?.length ? body.channels : ["shopify", "ebay", "etsy"];
      const connections = await channelConnectionsService.listConnections(session.workspace.id);
      const connectionRecords = await Promise.all(
        channelIds.map((channelId) => channelConnectionRepository.getConnectionRecord(session.workspace.id, channelId))
      );
      const job = await publishingService.enqueuePublishJob({
        workspaceId: session.workspace.id,
        product,
        channelIds,
        connections,
        connectionRecords: connectionRecords.filter((item): item is NonNullable<typeof item> => Boolean(item))
      });

      return reply.code(202).send({
        item: job
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          message: "Invalid publish job payload.",
          issues: error.flatten()
        });
      }

      throw error;
    }
  });

  app.get("/products/:productId/channels/:channelId/draft", async (request, reply) => {
    const session = await getRequiredSession(request, reply);
    if (!session) {
      return;
    }

    const params = request.params as { productId: string; channelId: ChannelId };
    const product = await catalogService.getProductById(session.workspace.id, params.productId);

    if (!product) {
      return reply.code(404).send({
        message: "Product not found."
      });
    }

    const connectionRecord = await channelConnectionRepository.getConnectionRecord(session.workspace.id, params.channelId);
    const draft = publishingService.buildChannelDraft(product, params.channelId, connectionRecord);

    if (!draft) {
      return reply.code(404).send({
        message: "Draft preview is not available for this channel."
      });
    }

    return {
      item: draft
    };
  });

  return app;
}
