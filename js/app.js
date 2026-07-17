const config = window.LCS_RUNTIME_CONFIG;
const actionSlot = document.getElementById('action-slot');
const timestampOutput = document.getElementById('timestamp-output');
const bridgeHost = document.getElementById('bridge-host');

const state = {
  bridgeFrame: null,
  bridgeWindow: null,
  bridgeOrigin: '',
  bridgeReady: false,
  idToken: '',
  authorized: false,
  queue: [],
  inFlight: 0,
  pending: new Map(),
  sequence: 0,
  signInRendered: false,
  completedWrites: 0,
  failedWrites: 0,
  metrics: [],
  latestDisplayedServerMs: 0
};

function configurationIsValid() {
  return Boolean(
    config &&
    /^https:\/\/\d+-script\.google\.com\/.+\/exec$|^https:\/\/script\.google\.com\/.+\/exec$/.test(config.gasWebAppUrl) &&
    /^\d+-.+\.apps\.googleusercontent\.com$|^\d+\.apps\.googleusercontent\.com$/.test(config.googleClientId) &&
    /^https:\/\//.test(config.parentOrigin) &&
    Number.isInteger(config.maxInFlight) &&
    config.maxInFlight >= 1 &&
    config.maxInFlight <= 10
  );
}

function makeButton(label, disabled = false) {
  actionSlot.replaceChildren();
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'lcs-action-button';
  button.className = 'action-button';
  button.textContent = label;
  button.disabled = disabled;
  actionSlot.appendChild(button);
  return button;
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '—');
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false
  }).format(date);
}

function applyTimestampRecord(record) {
  if (!record?.serverTimestampIso) return false;
  const serverMs = Number(record.serverTimestampMs || Date.parse(record.serverTimestampIso));
  if (!Number.isFinite(serverMs) || serverMs < state.latestDisplayedServerMs) return false;
  state.latestDisplayedServerMs = serverMs;
  timestampOutput.value = formatTimestamp(record.serverTimestampIso);
  return true;
}

function createRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function logMetric(kind, payload) {
  const entry = { kind, capturedAtIso: new Date().toISOString(), ...payload };
  state.metrics.push(entry);
  if (state.metrics.length > 2000) state.metrics.splice(0, state.metrics.length - 2000);
  console.log(`[LCS 2.2.0][${kind}]`, entry);
}

function createBridge() {
  const url = new URL(config.gasWebAppUrl);
  url.searchParams.set('mode', 'bridge');
  url.searchParams.set('parentOrigin', config.parentOrigin);
  url.searchParams.set('channel', config.bridgeChannel);
  url.searchParams.set('v', config.appVersion);

  const iframe = document.createElement('iframe');
  iframe.title = 'LCS GAS authentication bridge';
  iframe.src = url.toString();
  iframe.hidden = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  bridgeHost.replaceChildren(iframe);
  state.bridgeFrame = iframe;
  state.bridgeWindow = null;
  state.bridgeOrigin = '';
  state.bridgeReady = false;
}

function sendBridgeRequest(action, payload = {}) {
  if (!state.bridgeReady || !state.bridgeWindow || !state.bridgeOrigin) {
    return Promise.reject(new Error('GAS bridge is not ready.'));
  }

  const requestId = createRequestId();
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      state.pending.delete(requestId);
      reject(new Error(`GAS bridge timeout after ${config.requestTimeoutMs}ms.`));
    }, config.requestTimeoutMs);

    state.pending.set(requestId, { resolve, reject, timeout, startedAt, action });
    state.bridgeWindow.postMessage({
      channel: config.bridgeChannel,
      kind: 'request',
      requestId,
      action,
      idToken: state.idToken,
      payload
    }, state.bridgeOrigin);
  });
}

function handleBridgeMessage(event) {
  const message = event.data;
  if (!message || message.channel !== config.bridgeChannel) return;

  if (message.kind === 'ready') {
    if (!/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)) return;
    if (!event.source || !state.bridgeFrame?.contentWindow) return;
    state.bridgeWindow = event.source;
    state.bridgeOrigin = event.origin;
    state.bridgeReady = true;
    maybeActivateAuthenticatedRuntime();
    return;
  }

  if (event.source !== state.bridgeWindow || event.origin !== state.bridgeOrigin) return;
  if (message.kind !== 'response' || !message.requestId) return;
  const pending = state.pending.get(message.requestId);
  if (!pending) return;

  window.clearTimeout(pending.timeout);
  state.pending.delete(message.requestId);
  const roundTripMs = Math.round((performance.now() - pending.startedAt) * 10) / 10;

  if (message.ok) {
    logMetric(pending.action, { roundTripMs, ...message.result?.metrics });
    pending.resolve({ ...message.result, clientRoundTripMs: roundTripMs });
  } else {
    const error = new Error(message.error?.message || 'GAS bridge request failed.');
    error.code = message.error?.code || 'BRIDGE_ERROR';
    error.roundTripMs = roundTripMs;
    pending.reject(error);
  }
}

function renderWriteButton() {
  const button = makeButton('寫入目前時間');
  button.addEventListener('click', () => {
    const sequence = ++state.sequence;
    state.queue.push({
      sequence,
      clientClickedAtIso: new Date().toISOString(),
      clientClickedAtMs: Date.now()
    });
    pumpQueue();
  });
}

async function initializeAuthorizedState() {
  const result = await sendBridgeRequest('READ_LATEST');
  state.authorized = true;
  applyTimestampRecord(result.record);
  renderWriteButton();
}

function handleAuthFailure(error) {
  console.error('[LCS 2.2.0][AUTH]', error);
  state.authorized = false;
  state.idToken = '';
  if (error.code === 'ACCESS_DENIED') {
    makeButton('未授權帳號', true);
    return;
  }
  renderGoogleSignIn();
}

function maybeActivateAuthenticatedRuntime() {
  if (!state.bridgeReady || !state.idToken || state.authorized) return;
  makeButton('正在驗證 GAS 權限', true);
  initializeAuthorizedState().catch(handleAuthFailure);
}

async function runWrite(job) {
  const result = await sendBridgeRequest('WRITE_TIMESTAMP', job);
  state.completedWrites += 1;
  applyTimestampRecord(result.record);
  return result;
}

function pumpQueue() {
  while (state.authorized && state.inFlight < config.maxInFlight && state.queue.length > 0) {
    const job = state.queue.shift();
    state.inFlight += 1;
    runWrite(job)
      .catch(error => {
        state.failedWrites += 1;
        console.error('[LCS 2.2.0][WRITE_TIMESTAMP]', { sequence: job.sequence, error });
        if (error.code === 'TOKEN_EXPIRED' || error.code === 'TOKEN_INVALID') {
          handleAuthFailure(error);
        }
      })
      .finally(() => {
        state.inFlight -= 1;
        pumpQueue();
      });
  }
}

function handleCredentialResponse(response) {
  if (!response?.credential) {
    renderGoogleSignIn();
    return;
  }
  state.idToken = response.credential;
  state.authorized = false;
  makeButton('正在連接 GAS', true);
  maybeActivateAuthenticatedRuntime();
}

function renderGoogleSignIn() {
  if (!window.google?.accounts?.id) {
    window.setTimeout(renderGoogleSignIn, 100);
    return;
  }

  actionSlot.replaceChildren();
  state.signInRendered = true;
  window.google.accounts.id.initialize({
    client_id: config.googleClientId,
    callback: handleCredentialResponse,
    auto_select: true,
    cancel_on_tap_outside: false,
    itp_support: true,
    use_fedcm_for_prompt: true
  });
  window.google.accounts.id.renderButton(actionSlot, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    width: 320
  });
  window.google.accounts.id.prompt();
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function installTestHarness() {
  window.LCS_TEST_HARNESS = Object.freeze({
    burst(count, intervalMs = 0) {
      const total = Number(count);
      if (!Number.isInteger(total) || total < 1 || total > 1000) {
        throw new Error('burst count must be an integer between 1 and 1000.');
      }
      const button = document.getElementById('lcs-action-button');
      if (!state.authorized || !button || button.disabled) {
        throw new Error('Runtime is not authorized and ready.');
      }
      if (intervalMs <= 0) {
        for (let index = 0; index < total; index += 1) button.click();
        return;
      }
      let remaining = total;
      const timer = window.setInterval(() => {
        button.click();
        remaining -= 1;
        if (remaining <= 0) window.clearInterval(timer);
      }, intervalMs);
    },
    async waitForIdle(timeoutMs = 180000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (state.queue.length === 0 && state.inFlight === 0 && state.pending.size === 0) return this.snapshot();
        await new Promise(resolve => window.setTimeout(resolve, 100));
      }
      throw new Error('Timed out waiting for the stress queue to become idle.');
    },
    snapshot() {
      const writeRoundTrips = state.metrics
        .filter(entry => entry.kind === 'WRITE_TIMESTAMP' && Number.isFinite(entry.roundTripMs))
        .map(entry => entry.roundTripMs);
      return {
        authorized: state.authorized,
        queued: state.queue.length,
        inFlight: state.inFlight,
        pendingBridgeRequests: state.pending.size,
        clickSequence: state.sequence,
        completedWrites: state.completedWrites,
        failedWrites: state.failedWrites,
        writeRoundTripMs: {
          count: writeRoundTrips.length,
          p50: percentile(writeRoundTrips, 0.5),
          p95: percentile(writeRoundTrips, 0.95),
          max: writeRoundTrips.length ? Math.max(...writeRoundTrips) : null
        }
      };
    }
  });
}

function bootstrap() {
  window.addEventListener('message', handleBridgeMessage);
  installTestHarness();

  if (!configurationIsValid()) {
    makeButton('設定未完成', true);
    console.error('[LCS 2.2.0] Replace googleClientId and gasWebAppUrl in js/runtime-config.js.');
    return;
  }

  makeButton('正在確認 Google 帳號', true);
  createBridge();
  renderGoogleSignIn();
}

bootstrap();
