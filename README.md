# OmniList

OmniList is a multichannel commerce platform for sellers who want to create a product once and publish it across multiple channels with validation, category guidance, and inventory sync.

## Why this stack

- `TypeScript` end-to-end keeps domain models consistent and readable.
- `Next.js` gives us a straightforward dashboard without extra routing glue.
- `Fastify` keeps the backend explicit and lightweight compared with heavier frameworks.
- `Drizzle + PostgreSQL` is the planned data layer because it stays close to SQL and avoids hard-to-read generated abstractions.
- `BullMQ + Redis` is the planned async layer for publish and sync jobs.

## Current status

This repository is intentionally starting with a modular MVP skeleton:

- `apps/web`: seller dashboard
- `apps/api`: API-first backend
- `packages/shared`: shared domain types, demo data, and channel rules

The first vertical slice covers:

- products
- channels
- readiness validation
- publish preview

The project now supports two persistence modes:

- Memory mode by default for fast local development
- PostgreSQL mode when `DATABASE_URL` is provided

## API snapshot

The backend currently exposes:

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/session`
- `GET /workspace`
- `GET /channels`
- `GET /channel-connections`
- `PUT /channel-connections/:channelId`
- `GET /products`
- `GET /products/:productId`
- `POST /products`
- `PUT /products/:productId`
- `DELETE /products/:productId`
- `GET /products/:productId/readiness`
- `POST /products/:productId/publish-preview`
- `POST /products/:productId/publish`
- `GET /products/:productId/publish-jobs`
- `GET /publish-jobs`
- `GET /publish-jobs/:jobId`

## Local run

1. Install dependencies with `npm install`
2. Start PostgreSQL with `npm run db:up`
3. Apply migrations with `npm run db:migrate`
4. Start the API with `npm run dev:api`
5. Start the dashboard with `npm run dev:web`

If Docker Desktop is installed but not running, `npm run db:up` will fail until Docker Desktop is started.

If `OMNILIST_API_URL` is set, the dashboard will read from the API. If it is not set or the API is unavailable, the dashboard falls back to demo data so the UI remains usable.

If `DATABASE_URL` is set for the API, the app will initialize a demo workspace and use PostgreSQL through Drizzle. Otherwise it runs on the in-memory repository.

For local development, the web app now defaults to `http://localhost:4000` as the API base URL, so auth works even if `NEXT_PUBLIC_OMNILIST_API_URL` is not explicitly set.

The local PostgreSQL container is mapped to host port `55432` to avoid conflicts with any existing PostgreSQL service on `5432`.

The dashboard now includes:

- registration and sign-in
- optional Google and Facebook login buttons
- private seller workspace routing
- workspace-level channel visibility
- product workspace pages
- create product flow
- edit product flow
- async publish center with channel-level job results

## Current auth status

The app is no longer intended to be a public shared demo page.

- Private cabinet access now goes through registration and login
- The API uses an HTTP-only session cookie
- Product and channel data are scoped to the authenticated workspace

For now, authentication is memory-backed in the API process. That is enough to build and validate the private-cabinet flow, and the next persistence step is moving users, sessions, and workspaces fully into PostgreSQL.

That next step is now implemented when `DATABASE_URL` is provided:

- users are stored in PostgreSQL
- workspaces are created in PostgreSQL
- session tokens are stored in PostgreSQL
- OAuth identities are stored in PostgreSQL

If `DATABASE_URL` is not set, the app still falls back to the in-memory auth repository for simple local development.

## Auth Persistence Tables

The current PostgreSQL auth model includes:

- `workspaces`
- `users`
- `auth_sessions`
- `oauth_identities`

The current publish pipeline model includes:

- `publish_jobs`
- `publish_job_targets`

## Supabase

The project is now ready for `Supabase DB + Storage`:

- `Supabase Postgres` works through the existing `DATABASE_URL`
- product photos can be pushed to `Supabase Storage` when these API env vars are set:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_STORAGE_BUCKET`

How to use Supabase DB:

- point `DATABASE_URL` to your Supabase Postgres connection string
- for a long-running backend, prefer a direct connection string or session pooler mode according to Supabase guidance: [Connect to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)

How product images work now:

- frontend still lets sellers upload files from their device
- backend receives those images and, if Supabase Storage env vars are configured, uploads them to the configured bucket
- stored product images are then saved as public Supabase URLs instead of inline `data:` strings

Storage references:

- [Supabase Storage overview](https://supabase.com/docs/guides/storage)
- [Upload files with JavaScript](https://supabase.com/docs/reference/javascript/storage-from-upload)
- [Get public URL](https://supabase.com/docs/reference/javascript/storage-from-getpublicurl)

## Social Login Setup

Google and Facebook login are now wired as optional providers.

Set these environment variables for the API:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `FACEBOOK_CLIENT_ID`
- `FACEBOOK_CLIENT_SECRET`
- `OMNILIST_API_URL`
- `OMNILIST_WEB_URL`

Local defaults:

- API: `http://localhost:4000`
- Web: `http://localhost:3000`
- Postgres: `localhost:55432`

OAuth callback URLs:

- Google: `http://localhost:4000/auth/oauth/google/callback`
- Facebook: `http://localhost:4000/auth/oauth/facebook/callback`

## Database Workflow

Commands:

- `npm run db:up` to start local PostgreSQL in Docker
- `npm run db:generate` to generate new Drizzle migrations from schema changes
- `npm run db:migrate` to apply migrations to the running database
- `npm run db:down` to stop local containers

The first generated migration is already in [0000_absent_sumo.sql](C:\Users\des\IdeaProjects\OmniMarket\drizzle\0000_absent_sumo.sql).

## Next milestones

1. Add Drizzle migrations and seed scripts
2. Add authentication and workspace ownership
3. Add queue-backed publish jobs
4. Add Shopify, eBay, and Etsy adapters
5. Add inventory and order sync
