# Native Mini Program Guidelines

Applies to root `app.js`, `app.json`, `app.wxss`, `pages/`, `services/`, `config/`, and `utils/`.

## Pre-Development Checklist

- Read the active task PRD, design, implementation plan, and curated JSONL context.
- Read [Mini Program Contracts](./contracts.md).
- Read the [Shared Thinking Guides](../../guides/index.md).
- Read [Enterprise Application Contracts](../../nideshop-mini-program/backend/enterprise-application-contracts.md) when changing API, order, prescription, authentication, or file flows.

## Quality Check

- From the project root, run `npm run mini:check`.
- Run `node --check` on changed JavaScript files.
- Validate the affected flow in WeChat Developer Tools when available. Clearly distinguish manifest/syntax checks from actual UI, payment, or device validation.
