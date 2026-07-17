import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('frontend is isolated to one action slot and one timestamp output', async () => {
  const html = await read('index.html');
  assert.match(html, /id="action-slot"/);
  assert.match(html, /id="timestamp-output"/);
  assert.doesNotMatch(html, /<input\b|<select\b|<textarea\b/);
});

test('frontend caps concurrent google.script.run bridge requests at ten', async () => {
  const config = await read('js/runtime-config.js');
  const app = await read('js/app.js');
  assert.match(config, /maxInFlight:\s*10/);
  assert.match(app, /state\.inFlight < config\.maxInFlight/);
});

test('bridge crosses the Apps Script host wrapper without trusting arbitrary responses', async () => {
  const app = await read('js/app.js');
  const bridge = await read('gas-lcs-2.2.0-isolated/Bridge.html');
  assert.match(bridge, /top\.postMessage/);
  assert.match(bridge, /event\.source !== top/);
  assert.match(app, /googleusercontent/);
  assert.match(app, /event\.source !== state\.bridgeWindow/);
  assert.match(app, /event\.origin !== state\.bridgeOrigin/);
  assert.match(app, /state\.bridgeWindow\.postMessage/);
});

test('backend re-verifies token and allowlist before every action', async () => {
  const webApp = await read('gas-lcs-2.2.0-isolated/10_WebApp.gs');
  const auth = await read('gas-lcs-2.2.0-isolated/20_Auth.gs');
  assert.match(webApp, /verifyAndAuthorizeIdToken_\(normalized\.idToken\)/);
  assert.match(auth, /claims\.aud/);
  assert.match(auth, /claims\.iss/);
  assert.match(auth, /claims\.exp/);
  assert.match(auth, /authorizedEmails\.indexOf\(email\)/);
});

test('timestamp writes are serialized and read back from the sheet', async () => {
  const store = await read('gas-lcs-2.2.0-isolated/30_TimestampStore.gs');
  assert.match(store, /LockService\.getScriptLock\(\)/);
  assert.match(store, /setValues\(values\)/);
  assert.match(store, /SpreadsheetApp\.flush\(\)/);
  assert.match(store, /getValues\(\)\[0\]/);
});
