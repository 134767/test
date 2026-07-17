const LCS_TEST = Object.freeze({
  APP_VERSION: '2.2.0-isolated-runtime-test',
  DEFAULT_SHEET_NAME: 'timestamp_log',
  HEADER: Object.freeze([
    'id',
    'serverTimestampIso',
    'serverTimestampMs',
    'authorizedEmail',
    'googleSub',
    'requestId',
    'clientSequence',
    'clientClickedAtIso',
    'createdAtIso'
  ]),
  ALLOWED_ACTIONS: Object.freeze(['READ_LATEST', 'WRITE_TIMESTAMP']),
  TOKEN_CACHE_SECONDS: 300,
  LOCK_TIMEOUT_MS: 30000
});

const LCS_PROPERTY_KEYS = Object.freeze({
  SPREADSHEET_ID: 'LCS_TEST_SPREADSHEET_ID',
  SHEET_NAME: 'LCS_TEST_SHEET_NAME',
  GOOGLE_CLIENT_ID: 'LCS_TEST_GOOGLE_CLIENT_ID',
  AUTHORIZED_EMAILS: 'LCS_TEST_AUTHORIZED_EMAILS',
  ALLOWED_PARENT_ORIGIN: 'LCS_TEST_ALLOWED_PARENT_ORIGIN',
  BRIDGE_CHANNEL: 'LCS_TEST_BRIDGE_CHANNEL'
});
