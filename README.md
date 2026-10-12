# Zerops Xray + sing-box Panel (starter deployment)

## Important status / honest limitations

This ZIP contains a deployable Node.js admin panel, password login, create/delete records, QR generation, link formatting, and generated Xray/sing-box JSON templates. **It does not yet start Xray or sing-box daemons**, and its generated protocol configs are templates, not a verified working proxy deployment. Do not distribute or rely on generated links until the core runtime, Zerops routing, and client compatibility are completed and tested. The status endpoint explicitly reports whether binaries/config files exist; it does not claim connectivity.

The four requested variants are represented: VLESS WS, Trojan WS, VLESS XHTTP, Trojan XHTTP. Zerops `.zerops.app` public access is an HTTP(S) balancer that terminates TLS and forwards to internal HTTP ports. This is suitable for HTTP/WebSocket-style routing when the platform's routing supports the required upgrade/streaming behavior; it is not equivalent to raw TLS passthrough. Direct native TCP access may require direct port access and platform IP configuration. XHTTP compatibility and Trojan-over-XHTTP must be verified against the exact Xray/sing-box versions and client; support is not guaranteed merely by generating a URI.

## Deploy on Zerops

1. Create a Zerops account and a project. Choose a lightweight core for a test deployment if available.
2. Put this folder in a Git repository and connect the repository to Zerops, or deploy it using the Zerops CLI according to the current Zerops workflow.
3. Ensure the root contains `zerops.yaml`, `package.json`, and `server.js`.
4. Create a runtime service named `panel` matching `setup: panel` in `zerops.yaml`.
5. Add environment variables in the service/project settings:
   - `ADMIN_USER`: your chosen admin username
   - `ADMIN_PASSWORD`: a unique long password (at least 14 characters)
   - `SESSION_SECRET`: a random secret of 32+ characters
   - `COOKIE_SECURE=false` for the initial `.zerops.app` HTTP-balancer setup. Set true only when the browser's HTTPS setup and proxy behavior are verified.
6. Trigger deployment and inspect build/runtime logs. The app listens on port 3000 and provides `/health`.
7. In the service settings, enable Zerops subdomain access for internal HTTP port 3000. Open the generated `https://...zerops.app` address and log in.
8. Change the admin password from the panel. The initial password is read only on first initialization; set `ADMIN_PASSWORD` before the first successful start.
9. Enter the public host shown by Zerops into the Domain field only for dashboard testing. The current prototype makes links use the entered hostname; it does not automatically discover per-port subdomains.

## Port and routing warning

`zerops.yaml` declares ports 3001–3004 for the four future inbound listeners. If you enable public subdomain access for each port, Zerops may assign distinct hostnames to those ports. A single domain value in this prototype does not model those distinct hosts. Before real client use, configure and verify the correct hostname for each inbound and implement daemon startup/health checks.

## Data persistence

`data/panel.json` stores account/config records. Runtime containers can be replaced on deployment; attach a persistent storage solution or external database before relying on durable data. Never store this file in a public repository.

## Local development

Requires Node.js 20+.

```sh
npm install
ADMIN_USER=admin ADMIN_PASSWORD='a-long-unique-password' SESSION_SECRET='change-this-long-secret' npm start
```

Open `http://localhost:3000/health` and then `/login`.

## Next required engineering work for a production-ready proxy

- Pin and download supported Xray and sing-box release binaries with checksum/signature verification.
- Validate generated JSON against the exact binaries and version-specific schema.
- Implement supervised daemon startup, graceful restarts, log capture, and per-inbound health checks.
- Map each inbound to its actual Zerops public hostname/port and confirm HTTP/WebSocket upgrade and XHTTP request behavior through the edge balancer.
- Verify VLESS/Trojan WS and XHTTP clients end-to-end, including real-delay tests.
- Use persistent storage, rate limits, CSRF protection, audit logs, and secure session-cookie settings before production.
