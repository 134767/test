function validateBridgeRequest_(request) {
  if (!request || typeof request !== 'object') {
    throw lcsError_('VALIDATION_ERROR', 'Request object is required.');
  }

  const settings = getSettings_();
  const channel = cleanString_(request.channel);
  const requestId = cleanString_(request.requestId);
  const action = cleanString_(request.action);
  const idToken = cleanString_(request.idToken);
  const payload = request.payload && typeof request.payload === 'object' ? request.payload : {};

  if (channel !== settings.bridgeChannel) throw lcsError_('CHANNEL_DENIED', 'Bridge channel mismatch.');
  if (!requestId || requestId.length > 128) throw lcsError_('VALIDATION_ERROR', 'Invalid requestId.');
  if (LCS_TEST.ALLOWED_ACTIONS.indexOf(action) === -1) throw lcsError_('ACTION_DENIED', 'Action is not allowed.');
  if (!idToken || idToken.length > 8192) throw lcsError_('TOKEN_REQUIRED', 'Google ID token is required.');

  if (action === 'WRITE_TIMESTAMP') {
    const sequence = Number(payload.clientSequence);
    const clickedAtIso = cleanString_(payload.clientClickedAtIso);
    if (!Number.isInteger(sequence) || sequence < 1) {
      throw lcsError_('VALIDATION_ERROR', 'clientSequence must be a positive integer.');
    }
    if (!clickedAtIso || Number.isNaN(Date.parse(clickedAtIso))) {
      throw lcsError_('VALIDATION_ERROR', 'clientClickedAtIso must be a valid ISO timestamp.');
    }
    payload.clientSequence = sequence;
    payload.clientClickedAtIso = new Date(clickedAtIso).toISOString();
  }

  return {
    channel: channel,
    requestId: requestId,
    action: action,
    idToken: idToken,
    payload: payload
  };
}

function getSettings_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = cleanString_(properties.getProperty(LCS_PROPERTY_KEYS.SPREADSHEET_ID));
  const googleClientId = cleanString_(properties.getProperty(LCS_PROPERTY_KEYS.GOOGLE_CLIENT_ID));
  const allowedParentOrigin = cleanString_(properties.getProperty(LCS_PROPERTY_KEYS.ALLOWED_PARENT_ORIGIN));
  const bridgeChannel = cleanString_(properties.getProperty(LCS_PROPERTY_KEYS.BRIDGE_CHANNEL));
  const sheetName = cleanString_(properties.getProperty(LCS_PROPERTY_KEYS.SHEET_NAME)) || LCS_TEST.DEFAULT_SHEET_NAME;
  const authorizedEmails = cleanString_(properties.getProperty(LCS_PROPERTY_KEYS.AUTHORIZED_EMAILS))
    .split(',')
    .map(function(value) { return value.trim().toLowerCase(); })
    .filter(Boolean);

  if (!spreadsheetId) throw lcsError_('CONFIG_ERROR', LCS_PROPERTY_KEYS.SPREADSHEET_ID + ' is required.');
  if (!googleClientId) throw lcsError_('CONFIG_ERROR', LCS_PROPERTY_KEYS.GOOGLE_CLIENT_ID + ' is required.');
  if (!/^https:\/\//.test(allowedParentOrigin)) throw lcsError_('CONFIG_ERROR', LCS_PROPERTY_KEYS.ALLOWED_PARENT_ORIGIN + ' is invalid.');
  if (!bridgeChannel) throw lcsError_('CONFIG_ERROR', LCS_PROPERTY_KEYS.BRIDGE_CHANNEL + ' is required.');
  if (!authorizedEmails.length) throw lcsError_('CONFIG_ERROR', LCS_PROPERTY_KEYS.AUTHORIZED_EMAILS + ' is required.');

  return {
    spreadsheetId: spreadsheetId,
    sheetName: sheetName,
    googleClientId: googleClientId,
    authorizedEmails: authorizedEmails,
    allowedParentOrigin: allowedParentOrigin,
    bridgeChannel: bridgeChannel
  };
}

function cleanString_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function lcsError_(code, message) {
  const error = new Error(code + ': ' + message);
  error.name = code;
  return error;
}
