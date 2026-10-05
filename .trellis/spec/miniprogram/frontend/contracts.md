# Mini Program Contracts

## Actual Structure

- Pages are native WeChat JS/WXML/WXSS/JSON files. Register page paths in root `app.json`.
- `services/api.js` owns API calls, login checks, file upload/download, and response errors.
- `config/runtime.js` selects development/trial/release API configuration. Never ship a release that depends on loopback URLs or demo state.
- `services/store.js` owns local cart state and demo data. Server-backed business data must remain authoritative.

## Rendering and Navigation

- Compute display amounts, status text, and string transformations in JS before `setData`; WXML cannot invoke `Number`, `toFixed`, `slice`, or arbitrary functions. `scripts/check-mini-project.js` checks this boundary.
- Use `wx.switchTab` for tabBar pages and `wx.navigateTo` for other pages; carry referral/draft IDs explicitly through navigation and login.
- Forms need clear validation and loading/error/empty states. Never display payment, transfer, or upload success until the corresponding action confirms it.

## Cross-Layer Changes

- Keep fen amounts, SKU IDs, prescription IDs, owner IDs, and referral IDs aligned with server contracts.
- A client payment result is not permission to mark an order paid; verified payment notifications own that transition.
- Health authorization must be a real user choice. Persist and revoke consent through the API, rather than showing a decorative check mark.
