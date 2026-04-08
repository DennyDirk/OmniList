# OmniList Stack and Start Plan

## Recommended technologies

### Core principles

- Minimum boilerplate
- Clear code ownership
- Easy onboarding for future contributors
- Safe path from MVP to scale

### Chosen stack

- Frontend: `Next.js + TypeScript`
- Backend: `Fastify + TypeScript`
- Validation: `Zod`
- Database: `PostgreSQL + Drizzle ORM`
- Async jobs: `BullMQ + Redis`
- Auth: `Better Auth` or `Auth.js` in a later step
- Infra: Docker for local dependencies when persistence is introduced

## Why not NestJS

NestJS is powerful, but for this product it adds decorators, modules, and framework ceremony too early. Fastify keeps request handling, domain services, and adapters direct and readable.

## Why not microservices now

The specification already points to the right tradeoff: start with a modular monolith and background workers. That keeps complexity low while still giving us clean boundaries for future extraction.

## First implementation slice

The first slice should answer one important question:

Can we represent a canonical product and evaluate its readiness across channels in a simple, understandable way?

That is why the initial code focuses on:

- product schema
- channel schema
- validation rules
- readiness score
- publish preview

## Current implementation progress

Completed:

- monorepo structure
- shared product and channel contracts
- registration and login foundation
- private workspace session model
- optional social login provider flow
- PostgreSQL-backed auth/session persistence
- API-first product endpoints
- async publish job model and publish center UI
- workspace and channel connection contracts
- readiness scoring
- publish preview foundation
- optional PostgreSQL repository path through Drizzle
- product create and edit UI flow

Next:

- migrations
- authentication
- workspace-aware data ownership
- queue-backed publishing
