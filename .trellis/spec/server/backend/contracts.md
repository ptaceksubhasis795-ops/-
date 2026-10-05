# Server Contracts

## Actual Structure

- `src/app.module.ts` wires controllers, domain services, global authentication guard, infrastructure and scheduling.
- `src/domain/business.service.ts` handles orders, inventory reservations, prescription checks and sales summaries.
- `src/domain/operations.service.ts` handles administration, member review, attribution, rewards, withdrawal workflows, customer consent and reporting.
- `src/domain/memory.store.ts` maintains runtime state. `src/infrastructure/prisma-sync.service.ts` hydrates and synchronizes it to MySQL when configured. This is a current implementation boundary, not a transactional repository guarantee.
- `prisma/schema.prisma` and numbered `prisma/migrations/` define persistence. Extend them together with domain types and hydration/sync mappings.

## Contracts and Known Risks

- Calculate monetary values in integer fen. Display yuan fields are compatibility only.
- `SessionGuard` requires a valid signed session; development headers are opt-in and forbidden in production.
- Separate user IDs and promoter IDs. Member assignment, customer attribution, rewards and visibility must resolve the same identity consistently.
- Preserve ciphertext and nullable fields across restart, edit and deletion. A successful in-memory response is not evidence of a durable database transaction.
- Cancellation, refunds, settlements and withdrawals must be idempotent and leave auditable records. Verify available balances after settlement, holds, payment, failures and refund reversals.
- Third-party adapters without credentials must report pending/manual states. Do not claim a real integration from an environment variable alone.
- Never copy `.env`, private keys, raw phone/ID fields or health contents into logs or task reports.

## Promoter Identity Contract

### 1. Scope / Trigger

The sales hierarchy is fixed as `公司 → 销售人员（高级会员）→ 会员 → 客户`. This contract applies when an administrator creates or edits a promoter through `/api/v1/admin/promoters`.

### 2. Signatures

- `POST /api/v1/admin/promoters`
- `POST /api/v1/admin/promoters/:id`
- `GET /api/v1/admin/promoters`

### 3. Contracts

- The request may use `promoterClass` (`sales` or `member`); legacy `type` values remain accepted for compatibility.
- `sales` is stored as `type=sales, level=STAFF` and is displayed as `销售人员（高级会员）`.
- `member` is stored as `type=member, level=ORDINARY_MEMBER` for new assignments.
- Responses include `promoterClass` and `promoterClassText`; legacy `type` and `level` remain available to existing consumers.

### 4. Validation & Error Matrix

- Missing `name` → `推广人名称不能为空`.
- A bound `userId` already attached to another promoter → reject with `该用户已经绑定推广人`.
- Unknown class values → normalize to `member` for backward compatibility; clients must send one of the two documented classes.
- A class change always rewrites the paired legacy `type`/`level`; arbitrary type/level combinations are not persisted.

### 5. Good/Base/Bad Cases

- Good: `{ name: "华南销售", promoterClass: "sales" }` → sales class and `STAFF` storage level.
- Base: `{ name: "普通会员", type: "member" }` → member class and `ORDINARY_MEMBER` storage level.
- Bad: UI exposes independent type and level selectors, allowing a member with `STAFF` or a sales person with `ORDINARY_MEMBER`.

### 6. Tests Required

- API integration: create/update each class and assert `promoterClass`, `promoterClassText`, `type`, and `level`.
- Admin browser flow: the dialog exposes exactly `销售人员（高级会员）` and `会员`, and submitted JSON contains no independent `level` field.
- Compatibility: the promotion smoke payload using legacy `type`/`level` still resolves to the same canonical class.

### 7. Wrong vs Correct

#### Wrong

```json
{ "type": "member", "level": "STAFF" }
```

#### Correct

```json
{ "promoterClass": "member" }
```

## Migrations and Testing

Add a new migration for each schema repair instead of editing previously-applied SQL. Use the existing script names in `server/package.json`; the current `lint` command is a TypeScript check, not ESLint. API smoke scripts may create records; run them only against deliberate test data.

## Sales Domain Rebuild Contracts

- Promoter list endpoints return `{ items, total, page, pageSize }` when pagination is requested; default active filtering excludes archived promoters.
- Promoter deletion writes an immutable archive snapshot before releasing active memberships, customer attributions and relations. The bound user remains available.
- Member approval requires a valid `salesPromoterId`; rejected applications remain queryable with optional `reviewNote`.
- Promotion eligibility reads non-cancelled, non-self `PerformanceLedger` rows for the latest three periods and stores a snapshot in `PromotionApplication` before review.
- Reward rules are one `RewardRuleSet` per product with exactly `SALES`, `MEMBER`, and `COMPANY` tiers. Each tier uses exactly one method: `PERCENT` or `FIXED`.
- Admin reward-rule product lookup must match both the product number (`Product.id`) and product name; saving a selected product upserts its single rule set and returns all three tiers.

## Sales Operations API and AI Visual Delivery Contract

### 1. Scope / Trigger

This contract covers the sales workspace additions for read-only agent-order drafts, promotion assets, and the reviewable AI visual package generated for those routes and states.

### 2. Signatures

- `GET /api/v1/admin/sales/order-drafts?page=&pageSize=&status=` (admin session)
- `GET /api/v1/sales/promo-assets` (admin, sales, or member session)
- `output/sales-center-assets-redesign-v2/generation/records.jsonl` (one record per final page image)

### 3. Contracts

- The draft endpoint returns `{ items, total, page, pageSize }`; each item exposes its draft token, promoter/customer IDs, item count, expiry, and derived status.
- Draft status is derived as `sent`, `customer_confirmed`, `paid`, `cancelled`, or `expired`; an unconfirmed draft past `expiresAt` is read-only `expired`.
- Promotion assets return `promoterId`, `sharePath`, `articleSharePath`, `poster.status`, and `qrPayload` without claiming QR generation or payment completion.
- Each visual record includes `route`, `state`, `prompt`, `model`, `output`, `sha256`, `status`, and `attempts`; API keys are runtime-only and never serialized.

### 4. Validation & Error Matrix

- Non-admin access to draft listing → `403`.
- Missing/invalid session for either endpoint → `401`.
- Unsupported asset actor role → `403`.
- Missing final image or mismatched hash → package validation fails; do not substitute a placeholder.
- Repeated settlement for the same period → return the existing settled batch and create no second wallet entry.

### 5. Good/Base/Bad Cases

- Good: an admin requests `status=expired&page=1`, receives only expired unconfirmed drafts with pagination metadata.
- Base: a sales or member session requests assets and receives paths scoped to its actor ID.
- Bad: a client marks a draft paid or exposes a generated image without a matching record/hash; the server/UI must keep the state pending or fail validation.

### 6. Tests Required

- Authenticated API test: draft listing enforces role scope, pagination, and expiry derivation.
- Authenticated API test: promotion assets include actor-scoped paths and reject unsupported roles.
- Settlement regression: execute the same period twice and assert one batch plus one set of wallet entries.
- Artifact test: assert 82 final PNG records, readable `1536×1024` images, unique SHA-256 values, no API-key pattern, and a clean ZIP.

### 7. Wrong vs Correct

#### Wrong

```json
{"status":"paid","orderId":"fake-order","apiKey":"sk-..."}
```

#### Correct

```json
{"status":"customer_confirmed","token":"draft-token","expiresAt":"2026-10-03T12:00:00.000Z"}
```
