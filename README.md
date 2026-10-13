# Zerops Xray / sing-box Panel — repaired panel package

This package fixes the previous panel's static asset route, creates runtime data/config directories automatically, adds startup diagnostics, and keeps the repository free of empty directories. It is a Node.js admin-panel prototype, **not yet a production-ready proxy server**.

## What works in this package

- Node.js/Express panel with login and session cookie.
- Create/delete configuration records in the panel database.
- Generate QR codes for the displayed URI and copy-link UI.
- Store generated Xray/sing-box JSON templates under `DATA_DIR/configs`.
- Explicit `/static/app.js` route plus static middleware using an absolute path.
- `/health`, `/api/state`, and `/api/core-status` diagnostics.
- Runtime-created data directories, so no empty `data/`, `configs/`, or `scripts/` directories need to be committed to GitHub.

## Important limitations

The package does **not** start or supervise Xray or sing-box daemons. The generated inbound JSON files are templates only, not verified operational configs. The URI generator currently describes TLS on the public host while the generated core templates do not configure TLS; therefore these URIs must not be considered ready for v2rayNG or real-delay use. Real proxy service requires implementing and validating the core binaries, TLS/ingress routing, correct public ports/hosts, transport compatibility, persistent storage, and end-to-end client tests. Do not use generated links as if tested.

## Deploy from GitHub / blitz.cloud

1. Upload the **contents** of this folder to the repository root (so `package.json`, `server.js`, `zerops.yaml`, and `public/app.js` are at the root). Do not upload a nested ZIP file as the application.
2. Set the build/start command to `npm install` and `npm start` (or use the host's Node.js deployment flow). Node.js 20 or later is required.
3. Set environment variables in the host dashboard:
   - `ADMIN_USER`: desired admin username.
   - `ADMIN_PASSWORD`: a unique password of at least 14 characters, set before first boot.
   - `SESSION_SECRET`: at least 32 random characters.
   - `PUBLIC_DOMAIN`: public hostname only, without `https://`.
   - `DATA_DIR`: a writable persistent directory if the platform supports volumes; otherwise leave unset for `./data`.
   - `COOKIE_SECURE`: set `true` only if HTTPS cookies are correctly supported by the platform proxy. Otherwise the login session may not persist.
4. Redeploy the app. Confirm logs show `[panel] static app.js: ... (present)`.
5. Test `https://YOUR_HOST/health`, then `https://YOUR_HOST/static/app.js`, then sign in and check `/api/state`.
6. If the host sleeps free apps, opening the page may wake it; API requests may fail while the app is asleep. This hosting behavior is separate from panel code.

## Default login

If `ADMIN_USER` and `ADMIN_PASSWORD` are not set before the very first initialization, the legacy bootstrap default is `admin` / `ChangeMe-Immediately-42!`. Set a unique `ADMIN_PASSWORD` before first deployment and change it after login. If the database has already been bootstrapped, changing the environment variable does not reset the stored password.

## Environment and persistence

`DATA_DIR` defaults to `./data`. On startup the app creates this directory and a `configs` subdirectory inside it. The session secret is generated once into `DATA_DIR/session.secret` only when `SESSION_SECRET` is absent. For stable logins and data across redeployments, use a persistent writable volume and an explicit `SESSION_SECRET`.

## Verify static assets

The panel HTML loads `/static/app.js`. The server now registers an explicit handler for this file and mounts Express static middleware with `path.join(__dirname, 'public')`, following the Express static-file guidance: https://expressjs.com/en/5x/starter/static-files/.
