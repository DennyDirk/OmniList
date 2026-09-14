# OmniMarket Development Status — 2026-09-14

## Current Implementation Status

### P0.0: Minimum Publishing Safety — **IN PROGRESS** 🔴

**COMPLETED:**
- ✅ Repair endpoint added to app.ts
  - `GET /products/:productId/ebay-offer-repair?offerId=X&marketplaceId=Y`
  - Uses `getEbayOfferStatus()` to check offer status after timeout
  - Returns `{ offerId, status, listingStatus, listingId, url, checkedAt }`
  - Updates credentials if expired
  - Import added for `getEbayOfferStatus` in app.ts

**STILL NEEDED:**
- ❌ Full concurrency tests (2 concurrent requests, DB failure, timeout after create, account change)
- ❌ Job recovery after restart
- ❌ PostgreSQL concurrency verification
- ❌ Production build testing

---

### P0.1: Unified Readiness Assessment — **IN PROGRESS**

**COMPLETED:**
- ✅ Created `unified-assessment.service.ts`
  - `UnifiedAssessmentService` class
  - `assessProduct()` method for consolidated validation
  - Merges base validation + eBay category requirements
  - Uses `validateProductForChannel`, `buildEbayAspects`, `validateEbayCategory` from shared
  - Returns `UnifiedAssessment { status, issues, checkedAt }`
  - Proper error handling for category verification

**STILL NEEDED:**
- ❌ Integrate into app.ts readiness endpoint
- ❌ Cache category requirements with staleness check
- ❌ Testing

---

### P0.2: eBay UX with Requirements Panel — **PENDING**

Depends on P0.1 completion. Requires:
- [ ] Category picker with Taxonomy API suggestions
- [ ] Requirements panel showing conditions/aspects
- [ ] Issue card component
- [ ] Inline editing for fixes
- [ ] Workspace rebuild (general + channel tab)
- [ ] Mobile/keyboard testing

---

### P0.3: Etsy as Second Channel — **PENDING**

Can work in parallel with P0.2:
- [ ] OAuth PKCE implementation
- [ ] Eligibility checks
- [ ] Same assessment contracts as eBay

---

### P0.4: Import Existing Catalog — **PARTIAL**

- ✅ Inventory API preview (39/39 tests passing)
- ❌ Trading API for active listings
- ❌ Atomic import + deduplication
- ❌ CSV + Shopify import

---

## What Was Done Earlier (with Codex)

1. ✅ eBay item specifics serialized as arrays
2. ✅ Detailed eBay errors (message, longMessage, parameters)
3. ✅ Category and condition validation
4. ✅ Requirements loaded via Taxonomy API
5. ✅ Inventory API preview with pagination (39/39 tests)

---

## Current Blocker: Shirt Product Issue

**Error:**
```
Condition 1000 (NEW) incompatible with category 261328 (Trading Card Singles)
```

**Root Cause:** Wrong category selected (Trading Cards instead of Apparel)

**Solution Path:** 
1. P0.1 consolidates readiness checks
2. P0.2 UI adds category suggestions so users select correct category BEFORE publishing
3. System catches incompatibilities eBay BEFORE sending request

---

## Files Modified This Session

```
✅ apps/api/src/app.ts
   - Added repair endpoint
   - Import getEbayOfferStatus

✅ apps/api/src/modules/readiness/unified-assessment.service.ts
   - NEW file
   - UnifiedAssessmentService class
```

---

## Next Priority Work

1. **P0.0 completion** (2-3 days)
   - Concurrency tests
   - Recovery after restart

2. **P0.1 integration** (1-2 days)
   - Add to app.ts readiness endpoint
   - Test consolidated validation

3. **P0.2 UX rebuild** (2-3 days)
   - Category picker with API suggestions
   - Requirements panel
   - Issue card component

4. **Parallel P0.3/P0.4** (2-4 days each)
   - Etsy OAuth
   - Trading API import

---

## Key Principles (From New Strategy)

- States instead of percentages: "Ready", "Needs attention", "Not supported", "Not verified"
- Published ≠ Ready (independent states)
- Repair/retry is P0, not later phase
- Deterministic fixes only (no AI guessing)
- Two equal entry points: create new OR import existing

---

## IMPORTANT: NO COMMITS

Following user directive: "никогла ничего не коммитть" (never commit without explicit request).
