# Enterprise Application Contracts

## 1. Scope / Trigger

This contract applies to changes spanning the NestJS API, native mini program, Vue administration console, Prisma/MySQL, payment adapters, and uploaded media. It is required whenever an order, prescription, content item, inventory record, staff session, or sensitive customer field crosses those boundaries.

## 2. Signatures

- `POST /api/v1/orders/preview` and `POST /api/v1/orders`: request items contain `productId`, optional `skuId`, and positive integer `quantity`; the server returns `amountFen`, `freightFen`, `totalAmountFen` and display yuan fields.
- `POST /api/v1/payments/wechat/jsapi`: creates a payment request only; `POST /api/v1/payments/wechat/notify` is the only production payment confirmation path.
- `POST /api/v1/files` accepts multipart field `file` plus `purpose`; `GET /api/v1/files/:id` is owner/privileged only. Banner media has public `GET /api/v1/content/banners/:id/image`.
- Article custom covers use `purpose=article-cover` and public `GET /api/v1/content/articles/:id/cover`.
- `GET/POST /api/v1/admin/articles`, `GET/POST /api/v1/admin/banners`, and their delete endpoints are the administration source of truth for public content.
- `POST /api/v1/auth/staff/login` returns a signed bearer session with role `admin`, `pharmacist`, or `fulfillment`; production rejects development headers.

## 3. Contracts

- Money is calculated and persisted as integer fen (`priceFen`, `unitPriceFen`, `amountFen`, `totalAmountFen`). Yuan fields are display compatibility only.
- An order item carries `skuId` when a product has specifications. The service verifies that the SKU belongs to the product, is active, and has enough non-expired stock before reserving inventory.
- A prescription carries `patientId`, `fileKey`, `productId`, optional `skuId`, `validUntil`, reviewer, and usage state. A production payment request must match the prescription owner, patient, product, validity window, and one-time usage.
- A custom banner is saved only after a fixed `16:7` crop (`1280x560` recommendation). A public response must contain a usable image URL or data URI, never a private file identifier.
- An article cover uses `coverMode=system|custom`; system covers are the seven category assets, custom covers are cropped to `16:9` at `1280x720`, and public articles expose `coverImage`.
- `PUBLIC_API_BASE_URL` must be an HTTPS origin in production. `DATABASE_URL`, `REPOSITORY_MODE=prisma`, `AUTH_SECRET`, `FIELD_ENCRYPTION_KEY`, and at least one hashed `STAFF_ACCOUNTS_JSON` account are required before startup.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Missing/expired bearer session in production | `401`, no fallback role |
| Staff role outside its module scope | `403`, audit unchanged |
| Client calls order `pay` without payment callback source | `403` in production |
| Invalid SKU, inactive product, insufficient or expired batch | `400`, no order or stock mutation |
| Prescription owner/patient/product mismatch or expired prescription | `400`/`403`, no payment state change |
| Sensitive customer view without admin/pharmacist consent and reason | `400`/`403`, no sensitive data |
| Upload with invalid purpose/type/owner | `400`/`403`, no file record |
| Failed refund/provider call | refund remains `processing`/`failed`; order is not falsely `refunded` |

## 5. Good / Base / Bad Cases

- Good: create an order with a real active `skuId`; preview and create return identical fen totals, reserve a batch, and an idempotency retry returns the same order.
- Base: third-party hospital, invoice, logistics, or payment credentials are absent; the request becomes an auditable manual task and the business status remains pending/manual.
- Bad: treating `x-role` as authentication, marking an order paid from a client button, using an item name to guess a prescription product, or returning a banner file id as a mini program image URL.

## 6. Tests Required

- Type-check and build `server`, build `admin`, run `mini:check`, and run JavaScript syntax checks for every mini program page.
- API smoke must assert order idempotency, SKU rejection, cancel stock rollback, unauthorized staff access, fake payment rejection, public content, media permissions, and user-scoped aftersales/invoices.
- Prisma migration status must be up to date; restarting Prisma mode must preserve content, order totals, payment records, inventory, audit logs, refunds, files, and settings.
- Browser smoke must authenticate a staff user and verify article/banner/product/SKU/batch save, failed-save form retention, and role menu isolation.

## 7. Wrong vs Correct

### Wrong

```typescript
// The client decides payment and the server trusts a role header.
order.status = 'paid';
const role = headers['x-role'];
```

### Correct

```typescript
// Payment callback is verified, amount checked, and the session is signed.
business.updateOrder(order.id, 'pay', actor, {
  source: 'payment_callback',
  provider: 'wechat',
  transactionId,
});
```

