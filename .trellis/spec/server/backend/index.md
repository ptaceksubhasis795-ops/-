# API Server Guidelines

Applies to `server/`, a NestJS + TypeScript + Prisma/MySQL API.

## Pre-Development Checklist

- Read active task artifacts, [Server Contracts](./contracts.md), and [Enterprise Application Contracts](../../nideshop-mini-program/backend/enterprise-application-contracts.md).
- Read the [Shared Thinking Guides](../../guides/index.md).
- Trace controller, domain service, in-memory representation, schema, migration and hydration/sync for changes to persisted fields.

## Quality Check

- Run `npm run api:lint` and `npm run api:build` from the project root.
- For payment/security changes, run `npm --prefix server run check:payment-security` and `npm --prefix server run check:payment-security:runtime`.
- Validate schema and migration status using a configured local test database. Do not print credentials, reset unrelated databases, or modify already-applied migrations.
- Use isolated API regression tests for changed business flows; verify restart persistence and rejected requests have no partial writes.
