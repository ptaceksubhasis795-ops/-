# Administration Frontend Guidelines

Applies to `admin/`, a Vue 3 + TypeScript + Vite administration application.

## Pre-Development Checklist

- Read active task artifacts and [Admin Contracts](./contracts.md).
- Read the [Shared Thinking Guides](../../guides/index.md).
- Read [Enterprise Application Contracts](../../nideshop-mini-program/backend/enterprise-application-contracts.md) for API and sensitive-data changes.

## Quality Check

- From the project root, run `npm run admin:build`; this runs `vue-tsc` and Vite.
- Exercise affected routes and actual save/error behavior with the tests under `admin/tests/`, using an isolated local test API.
- Verify deep-link refresh, back navigation, permitted roles, loading/error states, and failed-save form retention. A route heading alone does not prove a business flow works.
