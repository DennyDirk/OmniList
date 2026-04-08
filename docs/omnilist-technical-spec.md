# OmniList

## Product and Technical Specification

Version: 1.0  
Date: 2026-04-06  
Status: Draft for validation

## 1. Executive Summary

OmniList is a SaaS platform that lets sellers create a product once and publish it across multiple sales channels from a single dashboard. The system adapts product data to each channel's category model, listing rules, validation requirements, and inventory behavior, reducing repetitive manual work and listing errors.

The product is intended to solve a common multichannel commerce problem: sellers often maintain the same catalog separately in marketplaces and stores such as eBay, Amazon, Etsy, Walmart, Shopify-based shops, and regional channels. This leads to duplicated work, inconsistent listings, inventory mismatches, slow time-to-market, and avoidable compliance errors.

OmniList will provide:

- A unified seller workspace
- A central product catalog
- One-to-many listing publication
- Channel-specific validation and category mapping
- Inventory and order synchronization
- AI-assisted listing optimization

## 2. Problem Statement

Sellers who operate on multiple channels face the following issues:

- They must recreate or manually adapt the same listing for every marketplace
- Each platform has different required fields, category trees, attributes, policies, and media constraints
- Inventory often becomes inconsistent across channels, creating overselling risk
- Orders are fragmented across multiple dashboards
- Non-technical sellers struggle to understand why a listing is rejected

The result is lower operational efficiency, longer publishing time, lower listing success rate, and reduced revenue potential.

## 3. Market Relevance and Opportunity

This opportunity is commercially relevant.

Reasons:

- Major marketplaces and commerce platforms actively expose APIs for listings, inventory, orders, and taxonomy/attribute management, which makes this category technically viable.
- Large platforms continue to invest in third-party seller ecosystems and partner tooling.
- The market is already validated by existing multichannel products such as Shopify Marketplace Connect, Sellbrite, Linnworks, and ChannelEngine. This indicates proven demand, but also means OmniList must differentiate on simplicity, guided validation, and ease of onboarding.

Working conclusion:

- The idea is valid and timely.
- The strongest wedge is not "connect everything immediately" but "make multichannel selling dramatically simpler for small and medium sellers."
- The most defensible differentiators are UX simplicity, guided data completion, smart category/attribute mapping, and reliable sync.

## 4. Recommended Product Positioning

**Positioning statement:**  
OmniList helps small and medium sellers publish faster across multiple marketplaces without learning each platform's rules.

**Primary value proposition:**

- Create once, publish everywhere
- Know what is missing before publishing
- Keep stock aligned across channels
- Manage orders in one place

**Core differentiation:**

- Validation-first UX
- AI-assisted listing enrichment
- Channel-specific guidance in plain language
- Minimal-step publishing flow

## 5. Target Users

Primary users:

- Small and medium ecommerce sellers
- Resellers
- Dropshippers
- Handmade and niche-brand sellers
- Local marketplace sellers expanding to additional channels

Secondary users:

- Marketplace agencies
- Small operations teams
- Virtual assistants managing product listings

## 6. Channel Strategy and Integration Prioritization

### 6.1 Important Correction

Shopify should be treated as a connected commerce channel and catalog/order source, not as a classic marketplace destination. It remains important, but its role in the product should be modeled differently from eBay or Amazon.

### 6.2 Recommended Initial Rollout

**Phase 1A: Best MVP set**

- Shopify as source catalog and order-capable connected channel
- eBay as marketplace destination
- Etsy as marketplace destination

**Why this set:**

- Strong API coverage
- Relatively clear seller workflows
- Good fit for SMB sellers
- Lower implementation risk than Amazon-first

**Phase 1B: Controlled beta**

- Amazon SP-API

**Why Amazon is not ideal for first release despite demand:**

- More complex schemas and product-type definitions
- More approval and compliance overhead
- More edge cases around catalog matching, restrictions, and listing data

**Phase 2: Expansion**

- Walmart Marketplace
- ROZETKA for regional growth if Ukraine/CEE is part of go-to-market

**Phase 3: Conditional / higher-risk**

- TikTok Shop
- OLX

### 6.3 Channel Feasibility Notes

**Highly suitable now**

- eBay
- Etsy
- Shopify
- Walmart
- Amazon, with higher implementation complexity

**Suitable only after market and API validation**

- ROZETKA
- TikTok Shop
- OLX

Notes:

- ROZETKA appears promising for regional strategy, and seller documentation references API-based workflows, but should be prioritized only if the business is targeting Ukraine or nearby markets.
- TikTok Shop has partner documentation, but access and market availability are more operationally constrained.
- OLX should not be a Phase 1 commitment until a stable, officially supported seller integration path is confirmed for the target geography.

## 7. Product Goals

### 7.1 Business Goals

- Reduce average listing creation and publication time by at least 60%
- Increase successful first-pass publication rate
- Improve seller retention by centralizing catalog, inventory, and orders
- Build a subscription SaaS business with tiered monetization

### 7.2 User Goals

- Publish a product to multiple channels in 3 steps or fewer
- Understand exactly what prevents publication
- Avoid overselling
- Manage listings and orders without platform-by-platform switching

## 8. Scope

### 8.1 In Scope for MVP

- Seller account and workspace
- Product catalog
- Product variants
- Image upload and management
- SKU management
- Channel connections via OAuth or supported auth flow
- Category mapping engine
- Validation engine
- Publish workflow
- Inventory synchronization
- Basic pricing rules
- Order aggregation dashboard
- AI suggestions for title, description, and category
- Retry and error visibility

### 8.2 Out of Scope for MVP

- Full ERP functionality
- Warehouse management
- Advanced analytics and BI
- Returns management
- Ad campaign management
- Automatic repricing against competitor prices
- Full international tax engine

## 9. Functional Requirements

### 9.1 Identity and Workspace

- Users can sign up, sign in, and manage a workspace
- Users can connect one or more channels to their workspace
- Users can invite team members in later phases

### 9.2 Product Management

- Create, edit, duplicate, archive, and delete products
- Support title, description, brand, images, attributes, price, stock, SKU, barcode, dimensions, and weight
- Support variants such as size, color, material, and bundle options
- Support channel-specific overrides for title, description, price, category, and attributes
- Allow bulk editing for selected fields

### 9.3 Image Management

- Upload multiple product images
- Reorder images
- Validate minimum image requirements per channel
- Store original asset plus transformed versions where needed

### 9.4 Channel Connection

- Connect supported channels through OAuth or platform-specific auth
- Store and refresh tokens securely
- Show channel connection status, permissions, and last sync time

### 9.5 Category Mapping Engine

- Maintain an internal canonical category tree
- Map internal categories to channel-specific categories
- Suggest best-fit categories using rules plus AI assistance
- Retrieve category-specific required attributes where APIs support it
- Provide manual override when confidence is low
- Learn from accepted user overrides over time

### 9.6 Validation Engine

- Validate product readiness for each selected channel before publish
- Check required fields, category attributes, image requirements, pricing format, inventory status, prohibited values, and policy conflicts where possible
- Return human-readable issues grouped by severity
- Provide a publish readiness score per channel

Severity model:

- Blocking: publish cannot proceed
- Warning: publish can proceed, but quality or visibility may be affected
- Suggestion: optimization recommendation only

### 9.7 Publishing Workflow

- Select one or more channels for publication
- Preview channel-specific listing output before publish
- Publish one product or many products in bulk
- Publish asynchronously through background jobs
- Track job status: queued, processing, succeeded, partially succeeded, failed
- Show detailed channel response and next action

### 9.8 Inventory Synchronization

- Maintain centralized stock per SKU
- Sync inventory changes to connected channels
- Support reserved stock for in-progress orders
- Prevent overselling using locking or reservation logic
- Support webhook-driven sync where available and polling fallback where necessary

### 9.9 Pricing Rules

- Set a base price at product or variant level
- Apply channel-level price adjustments as fixed amount or percentage
- Support later extensions for currency conversion and fee-aware pricing

### 9.10 Order Aggregation

- Import orders from connected channels
- Show unified order list with source channel, status, buyer info, line items, and fulfillment state
- Support status refresh and basic order detail view
- Preserve external channel order identifiers

### 9.11 AI Assistant

- Suggest optimized product titles
- Suggest platform-appropriate descriptions
- Recommend categories and attributes
- Highlight missing information that would improve listing acceptance or quality
- Never auto-publish without passing validation or explicit user confirmation

## 10. UX Requirements

### 10.1 Design Principles

- Non-technical seller friendly
- Minimal cognitive load
- Guided rather than form-heavy
- Clear system status and recovery paths

### 10.2 Primary User Flow

Target flow:

1. Create or import product
2. Select channels
3. Fix issues and publish

### 10.3 UX Requirements

- Users should reach publish-ready status with minimal clicks
- Every blocking error must explain what is wrong, why it matters, and how to fix it
- Category and attribute selection should be assisted, not manual-first
- Bulk operations must be available for sellers with many products
- The dashboard must highlight sync health, failed jobs, low-stock items, and recent orders

## 11. Non-Functional Requirements

### 11.1 Performance

- Core synchronous API reads and updates should target less than 300 ms p95 where realistic
- Long-running publish and sync actions must be asynchronous
- Bulk operations must be processed through job queues

### 11.2 Availability

- Target 99.9% uptime for production
- External platform outages must not bring down the application

### 11.3 Scalability

- The system must support horizontal worker scaling for publish and sync jobs
- The architecture must support future service extraction by domain

### 11.4 Security

- Encrypt tokens and sensitive credentials at rest
- Use role-based access controls for future team features
- Maintain audit logs for channel connections, publish actions, and critical changes
- Follow least-privilege access practices for every integration

### 11.5 Reliability

- Use idempotent publish and sync jobs
- Implement retries with backoff for transient API failures
- Store failure reasons and expose retry controls to the user
- Track dead-letter jobs for unresolved failures

### 11.6 Observability

- Structured logs
- Metrics for publish jobs, sync lag, validation failures, channel error rates, and webhook health
- Distributed tracing readiness for future service decomposition

## 12. Recommended System Architecture

### 12.1 Important Recommendation

For MVP, do **not** start with full microservices. Start with a **modular monolith** plus asynchronous workers and strong domain boundaries.

Reason:

- Faster to build
- Easier to operate
- Lower coordination cost
- Still compatible with later service extraction

### 12.2 Suggested Architecture

Components:

- Web app / seller dashboard
- Backend API
- Background worker service
- Relational database
- Queue system
- Object storage for images
- Integration adapters per channel
- AI service layer

### 12.3 Core Domains

- Identity and workspace
- Catalog
- Channel integrations
- Category mapping
- Validation
- Publishing
- Inventory
- Orders
- Billing
- Notifications

### 12.4 Integration Pattern

Each channel adapter should abstract:

- Authentication
- Category lookup
- Attribute requirements
- Listing create/update
- Inventory update
- Order ingest
- Error normalization

This adapter model is critical to keeping the rest of the system channel-agnostic.

## 13. Data Model Overview

Core entities:

- User
- Workspace
- ChannelConnection
- Product
- ProductVariant
- ProductAsset
- ProductAttribute
- CanonicalCategory
- ChannelCategoryMapping
- Listing
- ListingOverride
- ValidationIssue
- PublishJob
- InventoryRecord
- InventoryReservation
- Order
- OrderLine
- AuditEvent

Key design rule:

- Product is the canonical entity inside OmniList
- Listing is the channel-specific representation of that product

## 14. API Requirements

- API-first design for all frontend actions
- Versioned public/internal API strategy
- Webhook endpoints for supported channels
- Idempotency keys for publish and inventory updates
- Pagination for all list endpoints
- Filter and search for products, listings, orders, and jobs

## 15. Billing and Monetization

### 15.1 Recommended Pricing Direction

The originally proposed range of $10-50/month is attractive for entry-level sellers, but may be too low if the product includes multi-channel sync, AI assistance, and order aggregation from day one.

Recommended pricing logic:

- Free: up to 10 products, limited channels, no AI, community support
- Starter: small catalog, selected channels, basic sync
- Growth: unlimited or high catalog caps, AI assistance, bulk publishing, advanced sync
- Higher tiers later: agency/team features, priority support, advanced automations

Practical note:

- A higher paid tier is likely necessary to support integration maintenance and support overhead.

## 16. KPIs

Primary KPIs:

- Time to first published multichannel listing
- Average time to publish product
- Listing success rate on first attempt
- Number of connected channels per active workspace
- Sync failure rate
- Inventory mismatch rate
- Monthly active sellers
- Conversion from free to paid
- GMV per active seller

## 17. Risks and Mitigations

### 17.1 Integration Complexity

Risk:

- Every marketplace evolves APIs, schemas, policies, and rate limits independently

Mitigation:

- Build adapter isolation
- Version integration contracts
- Maintain integration monitoring and regression tests

### 17.2 Category and Attribute Accuracy

Risk:

- Poor category mapping can lower listing acceptance and visibility

Mitigation:

- Use marketplace taxonomy APIs where available
- Provide confidence scoring and manual override
- Store historical successful mappings

### 17.3 Overselling

Risk:

- Sync delays can create stock inconsistency

Mitigation:

- Reservation model
- Webhooks where possible
- Retry and reconciliation jobs

### 17.4 AI Hallucination or Low-Quality Suggestions

Risk:

- AI may generate incorrect or non-compliant attributes

Mitigation:

- AI suggestions must always pass deterministic validation
- Keep AI assistive, not authoritative

### 17.5 Over-Scoping the MVP

Risk:

- Building too many channels too early will slow delivery and reduce reliability

Mitigation:

- Launch with a narrow but strong channel set
- Add channels only after stable publish and sync quality

## 18. Delivery Plan

### Phase 0: Discovery and Validation

- Validate target geography and seller segment
- Finalize MVP channels
- Confirm API access requirements
- Define canonical product schema

### Phase 1: MVP Foundation

- Auth and workspace
- Product catalog
- Shopify connection
- eBay and Etsy publishing
- Validation engine
- Basic inventory sync
- Basic order aggregation

### Phase 2: Reliability and Growth

- Bulk publishing
- Retry center
- Audit logs
- Channel-specific overrides
- Pricing rules
- AI assistant improvements

### Phase 3: Expansion

- Amazon beta
- Walmart integration
- Regional marketplace expansion
- Team and agency features

## 19. What Should Be Added or Corrected vs. the Original Draft

The original draft is directionally strong, but the following changes are recommended:

- Treat Shopify as a commerce channel/source, not as a standard marketplace destination
- Do not start with full microservices; use a modular monolith for MVP
- Make validation and category mapping first-class product pillars, not just supporting features
- Add channel-specific overrides
- Add publish preview and retry center
- Make publishing asynchronous
- Add audit logs, observability, and idempotency
- Move Amazon to controlled beta unless the project explicitly targets Amazon-first sellers
- Treat OLX as experimental until official seller integration is verified for the target market
- Clarify that the less-than-300-ms target applies to synchronous app actions, not external publish completion

## 20. Final Recommendation

OmniList is a viable product concept with clear market demand, but success will depend on focus. The most effective MVP is not "all channels at once." The best path is:

- Build an opinionated, easy-to-use multichannel listing core
- Start with Shopify, eBay, and Etsy
- Add Amazon after the listing model, validation engine, and sync pipeline are proven
- Use simplicity and guided compliance as the main competitive advantage

## 21. Research Notes and Source Links

The following sources were used to validate current integration feasibility and market relevance:

- eBay Taxonomy API overview: https://developer.ebay.com/api-docs/commerce/taxonomy/static/overview.html
- Amazon Selling Partner API, Product Type Definitions: https://developer-docs.amazon.com/sp-api/reference/product-type-definitions-v2020-09-01
- Amazon Selling Partner API, Feeds API: https://developer-docs.amazon.com/sp-api/docs/feeds-api
- Etsy Open API v3 overview: https://developer.etsy.com/documentation/
- Shopify Admin GraphQL, productSet mutation: https://shopify.dev/docs/api/admin-graphql/unstable/mutations/productSet
- Shopify Admin GraphQL, order query: https://shopify.dev/docs/api/admin-graphql/unstable/queries/order
- Shopify Admin GraphQL, inventoryAdjustQuantities mutation: https://shopify.dev/docs/api/admin-graphql/2023-07/mutations/inventoryAdjustQuantities
- Walmart Marketplace API overview: https://developer.walmart.com/us-marketplace/docs
- Shopify Marketplace Connect app listing: https://apps.shopify.com/marketplace-connect
- TikTok Shop Partner Center documentation entry point: https://partner.tiktokshop.com/docv2/page/get-transactions-by-order-202309
- ROZETKA seller help example referencing API-based workflows: https://sellerhelp.rozetka.com.ua/p187-product-reviews.html
- Amazon small business ecosystem article: https://www.aboutamazon.com/news/small-business/economic-impact-for-small-businesses-powered-by-partnership-with-amazon
- Sellbrite pricing page for competitive positioning context: https://www.sellbrite.com/pricing-power/

Note:

- OLX integration was intentionally not treated as confirmed for Phase 1 because a stable official seller API for the likely target markets was not clearly verifiable from official sources during research.
