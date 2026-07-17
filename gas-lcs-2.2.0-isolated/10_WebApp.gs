function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.mode !== 'bridge') {
    return HtmlService.createHtmlOutput('LCS 2.2.0 Isolated Runtime Test');
  }

  const settings = getSettings_();
  if (params.parentOrigin !== settings.allowedParentOrigin) {
    throw lcsError_('ORIGIN_DENIED', 'Parent origin is not allowed.');
  }
  if (params.channel !== settings.bridgeChannel) {
    throw lcsError_('CHANNEL_DENIED', 'Bridge channel is not allowed.');
  }

  const template = HtmlService.createTemplateFromFile('Bridge');
  template.bridgeBootstrapJson = JSON.stringify({
    appVersion: LCS_TEST.APP_VERSION,
    allowedParentOrigin: settings.allowedParentOrigin,
    bridgeChannel: settings.bridgeChannel
  }).replace(/</g, '\\u003c');

  return template.evaluate()
    .setTitle('LCS 2.2.0 GAS Bridge')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function bridgeDispatch(request) {
  const startedAtMs = Date.now();
  const normalized = validateBridgeRequest_(request);
  const identity = verifyAndAuthorizeIdToken_(normalized.idToken);

  if (normalized.action === 'READ_LATEST') {
    const readStartedAtMs = Date.now();
    const record = readLatestTimestamp_();
    return {
      ok: true,
      requestId: normalized.requestId,
      action: normalized.action,
      record: record,
      identity: { email: identity.email, sub: identity.sub },
      metrics: {
        sheetReadMs: Date.now() - readStartedAtMs,
        totalServerMs: Date.now() - startedAtMs
      }
    };
  }

  if (normalized.action === 'WRITE_TIMESTAMP') {
    const result = writeTimestamp_(normalized, identity);
    result.metrics.totalServerMs = Date.now() - startedAtMs;
    return result;
  }

  throw lcsError_('ACTION_DENIED', 'Unsupported action.');
}
