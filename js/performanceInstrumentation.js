// PTB 1.6.0 data performance instrumentation.
// Read-only telemetry: does not change mutation payloads, responses, or persistence behavior.

const LOG_LIMIT = 200;
let installed = false;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function approxBytes(value) {
  try {
    const text = JSON.stringify(value ?? null);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
    return text.length;
  } catch {
    return 0;
  }
}

function ensureLog() {
  if (!Array.isArray(window.PTB_PERFORMANCE_LOG)) window.PTB_PERFORMANCE_LOG = [];
  return window.PTB_PERFORMANCE_LOG;
}

export function recordPerformance(entry) {
  const normalized = {
    at: new Date().toISOString(),
    ...entry
  };
  const log = ensureLog();
  log.push(normalized);
  if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
  console.info('[PTB Performance]', normalized);
  window.dispatchEvent(new CustomEvent('ptb:performance', { detail: normalized }));
  return normalized;
}

function installDbFeedbackProbe() {
  const feedback = window.WorkStudyDbFeedback;
  if (!feedback || feedback.__ptbPerformanceWrapped === true) return false;

  const active = new Map();
  const originalBegin = feedback.begin.bind(feedback);
  const originalUpdate = feedback.update.bind(feedback);
  const originalEnd = feedback.end.bind(feedback);

  feedback.begin = (message, options = {}) => {
    const token = originalBegin(message, options);
    active.set(token, {
      startedAt: nowMs(),
      initialMessage: String(message || '資料同步中'),
      latestMessage: String(message || '資料同步中'),
      blocking: Boolean(options.blocking)
    });
    return token;
  };

  feedback.update = (token, message) => {
    const operation = active.get(token);
    if (operation && message) operation.latestMessage = String(message);
    return originalUpdate(token, message);
  };

  feedback.end = (token, options = {}) => {
    const operation = active.get(token);
    const endedAt = nowMs();
    const result = originalEnd(token, options);
    if (operation) {
      active.delete(token);
      recordPerformance({
        type: 'db-operation',
        label: operation.latestMessage || operation.initialMessage,
        durationMs: roundMs(endedAt - operation.startedAt),
        blocking: operation.blocking,
        status: options.error ? 'error' : 'success',
        message: String(options.message || '')
      });
    }
    return result;
  };

  Object.defineProperty(feedback, '__ptbPerformanceWrapped', {
    value: true,
    configurable: false,
    enumerable: false
  });
  return true;
}

function extractServerPerformance(response) {
  if (!response || typeof response !== 'object') return null;
  return response.performance || response.result?.performance || response.result?.timings || response.timings || null;
}

function finishRequest(context, status, responseOrError) {
  if (!context || context.finished) return;
  context.finished = true;
  const durationMs = roundMs(nowMs() - context.startedAt);
  const serverPerformance = status === 'success' ? extractServerPerformance(responseOrError) : null;
  recordPerformance({
    type: 'gas-request',
    action: context.action || 'unknown',
    durationMs,
    requestBytes: context.requestBytes || 0,
    responseBytes: status === 'success' ? approxBytes(responseOrError) : 0,
    status,
    server: serverPerformance,
    error: status === 'error' ? String(responseOrError?.message || responseOrError || '') : ''
  });
}

function wrapRunner(runner, context = null) {
  return new Proxy(runner, {
    get(target, property) {
      if (property === 'then') return undefined;

      if (property === 'withSuccessHandler') {
        return handler => {
          const requestContext = context || {};
          const next = target.withSuccessHandler(value => {
            finishRequest(requestContext, 'success', value);
            return handler(value);
          });
          return wrapRunner(next, requestContext);
        };
      }

      if (property === 'withFailureHandler') {
        return handler => {
          const requestContext = context || {};
          const next = target.withFailureHandler(error => {
            finishRequest(requestContext, 'error', error);
            return handler(error);
          });
          return wrapRunner(next, requestContext);
        };
      }

      if (property === 'runServerFunction') {
        return (action, payload) => {
          const requestContext = context || {};
          requestContext.action = String(action || '');
          requestContext.requestBytes = approxBytes(payload);
          requestContext.startedAt = nowMs();
          requestContext.finished = false;
          return target.runServerFunction(action, payload);
        };
      }

      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function installGasRequestProbe() {
  const script = window.google?.script;
  if (!script || !script.run || script.__ptbPerformanceRunWrapped === true) return false;

  try {
    const wrapped = wrapRunner(script.run);
    let installedRunner = false;

    try {
      script.run = wrapped;
      installedRunner = script.run === wrapped;
    } catch {
      installedRunner = false;
    }

    if (!installedRunner) {
      const descriptor = Object.getOwnPropertyDescriptor(script, 'run');
      if (!descriptor || descriptor.configurable) {
        Object.defineProperty(script, 'run', {
          value: wrapped,
          configurable: true,
          enumerable: true,
          writable: true
        });
        installedRunner = true;
      }
    }

    if (!installedRunner) return false;
    Object.defineProperty(script, '__ptbPerformanceRunWrapped', {
      value: true,
      configurable: false,
      enumerable: false
    });
    return true;
  } catch (error) {
    console.warn('[PTB Performance] google.script.run 包裝失敗，仍保留 DB operation 計時。', error);
    return false;
  }
}

export function installPerformanceInstrumentation() {
  if (installed) return;
  installed = true;
  ensureLog();
  const dbFeedback = installDbFeedbackProbe();
  const gasRequest = installGasRequestProbe();

  window.getPtbPerformanceLog = () => [...ensureLog()];
  window.clearPtbPerformanceLog = () => {
    ensureLog().splice(0);
    console.info('[PTB Performance] log cleared');
  };

  recordPerformance({
    type: 'instrumentation',
    status: 'installed',
    dbFeedback,
    gasRequest
  });
}
