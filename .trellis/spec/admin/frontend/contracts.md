# Admin Contracts

## Actual Structure

- `admin/src/main.ts` defines Vue Router routes. `App.vue` owns the shell, navigation, staff login and workspace selection.
- `SalesWorkspace.vue`, `CustomerWorkspace.vue`, `DataWorkspace.vue`, `SettingsWorkspace.vue`, and `ProductWorkspace.vue` are routed workspaces; `EnterpriseModules.vue` retains legacy module behavior.
- `ArticleEditor.vue`, `ContentManager.vue`, and `ImageCropper.vue` handle content editing and media crops. Preserve existing content behavior when changing the shell.
- `admin/src/api.ts` owns API errors, tokens, list decoding, upload and export.

## Page and Permission Rules

- Give each business subpage an addressable route and appropriate actions; do not create several URLs that show the same unfinished form.
- Staff visibility and client state are presentation concerns; the server must enforce permissions on every request.
- Keep numeric status/amount transformations consistent. Store money as fen on the server, format yuan only for display.
- Saving failures must keep entered form data and show the actual error. Destructive actions need the existing confirmation flow.
- Customer health views and exports require the server's authorization, scope and audit checks.

## Promoter Editor

- The promoter dialog uses one identity selector with exactly two values: `销售人员（高级会员）` and `会员`.
- Do not expose separate type and level selectors; the backend owns normalization of the legacy `type`/`level` storage fields.
- When editing an existing row, derive the selected identity from `promoterClass` (or legacy `type`/`level`) and submit `promoterClass` plus the compatibility `type` field.

## Sales Domain Workspaces

- Promoter, member application, promotion application, relation tree and reward rule views must use paginated data and expose loading, empty and error states.
- Member applications use three status tabs and keep rejected records visible; approval requires choosing a sales person when the server cannot resolve one.
- Relation management has a sales-person list on the left and a selected tree on the right. Batch selection is always available alongside drag-and-drop, and every write requires a reason.
- Reward rule editing is product-scoped and submits all three tiers together; the UI must clear the inactive amount field when switching between percentage and fixed methods.

## Sales AI Visual Review Package

- Store the generated sales visuals under `output/sales-center-assets-redesign-v2/` with one folder per route group and a stable filename for each state.
- Treat `generation/records.jsonl` as the source of traceability: every final image must have its own successful record, prompt, model, output path, attempt count, and SHA-256.
- Keep the master design image separate from the 82 final page/state images; contact sheets are for review only and must never be used as runtime assets.
- Do not put API keys or runtime secrets in prompts, records, manifests, documentation, screenshots, or ZIP files.
- Review images against the real route/API state machine: drawers represent details, modals represent approval or confirmation, and loading/error/permission states must map to executable UI behavior.

## Verification

Use `admin/tests/nested_smoke.py` for routed workspace checks, and authenticated content tests for article/media changes. Configure `API_URL` and `ADMIN_URL` for an isolated environment. Some legacy tests create data: inspect them before running against an existing database.
