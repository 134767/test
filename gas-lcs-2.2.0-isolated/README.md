# LCS 2.2.0 Isolated Runtime Test — GAS

This directory is the complete source contract for the standalone Apps Script project named `LCS 2.2.0 Isolated Runtime Test`.

Required Script Properties:

- `LCS_TEST_SPREADSHEET_ID`: isolated test spreadsheet ID.
- `LCS_TEST_SHEET_NAME`: optional; default `timestamp_log`.
- `LCS_TEST_GOOGLE_CLIENT_ID`: same public Google Web OAuth client ID used by `js/runtime-config.js`.
- `LCS_TEST_AUTHORIZED_EMAILS`: comma-separated exact allowlist. Must include `fjulibrs@gmail.com` and the GAS shared-account email used in the matrix.
- `LCS_TEST_ALLOWED_PARENT_ORIGIN`: `https://134767.github.io`.
- `LCS_TEST_BRIDGE_CHANNEL`: `LCS_2_2_0_ISOLATED_BRIDGE`.

Deploy as a Web app:

- Execute as: Me (`fjulibrs@gmail.com`).
- Who has access: Anyone, including anonymous (`ANYONE_ANONYMOUS`). The bridge exposes no data without a verified Google ID token and exact server-side allowlist match.
- Use the `/exec` deployment URL in `js/runtime-config.js`.

The Sheet must remain private to the deployment owner. Authorization is enforced by verified Google ID token plus exact server-side email allowlist on every read/write call.

`oauth2.googleapis.com/tokeninfo` is used only for this isolated proof. Replace it with production-grade server-side JWT validation before any production rollout.
