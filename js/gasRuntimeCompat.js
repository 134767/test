// js/gasRuntimeCompat.js
// Normalize legacy/current GAS response envelopes and preserve backend error details.

function responseErrorText(response) {
  if (!response || typeof response !== 'object') return '';
  const code = String(response.code || '').trim();
  const message = String(response.message || response.error || '').trim();
  return [code, message].filter(Boolean).join(': ');
}

export function normalizeGasRuntimeResponse(response) {
  if (!response || typeof response !== 'object') return response;

  const nested = response.result && typeof response.result === 'object'
    ? response.result
    : null;
  const payload = nested || response;

  if (payload.ok === false && !payload.error) {
    return { ...payload, error: responseErrorText(payload) || 'GAS backend error' };
  }

  if (nested && !response.data && nested.data && typeof nested.data === 'object') {
    return nested;
  }

  return response;
}

export function formatGasRuntimeError(error) {
  if (!error) return '未知錯誤';
  if (typeof error === 'string') return error;
  const code = String(error.code || '').trim();
  const message = String(error.message || error.error || error).trim();
  return [code, message].filter(Boolean).join(': ') || '未知錯誤';
}

export function installGasRuntimeCompatibility() {
  const runner = globalThis.google?.script?.run;
  if (!runner || runner.__ptbResponseCompatInstalled) return false;

  const originalWithSuccessHandler = runner.withSuccessHandler;
  if (typeof originalWithSuccessHandler !== 'function') return false;

  try {
    runner.withSuccessHandler = function withCompatibleSuccessHandler(handler) {
      return originalWithSuccessHandler.call(
        this,
        response => handler(normalizeGasRuntimeResponse(response))
      );
    };
    Object.defineProperty(runner, '__ptbResponseCompatInstalled', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
    return true;
  } catch (error) {
    console.warn('[PTB] GAS response compatibility layer could not be installed', error);
    return false;
  }
}
