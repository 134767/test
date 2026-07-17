function writeTimestamp_(request, identity) {
  const lockStartedAtMs = Date.now();
  const lock = LockService.getScriptLock();
  lock.waitLock(LCS_TEST.LOCK_TIMEOUT_MS);
  const lockWaitMs = Date.now() - lockStartedAtMs;

  try {
    const sheet = getOrCreateTimestampSheet_();
    const serverDate = new Date();
    const serverTimestampIso = serverDate.toISOString();
    const row = sheet.getLastRow() + 1;
    const id = Utilities.getUuid();
    const values = [[
      id,
      serverTimestampIso,
      serverDate.getTime(),
      identity.email,
      identity.sub,
      request.requestId,
      request.payload.clientSequence,
      request.payload.clientClickedAtIso,
      serverTimestampIso
    ]];

    const writeStartedAtMs = Date.now();
    sheet.getRange(row, 1, 1, LCS_TEST.HEADER.length).setValues(values);
    SpreadsheetApp.flush();
    const sheetWriteMs = Date.now() - writeStartedAtMs;

    const readStartedAtMs = Date.now();
    const persisted = sheet.getRange(row, 1, 1, LCS_TEST.HEADER.length).getValues()[0];
    const sheetReadMs = Date.now() - readStartedAtMs;

    return {
      ok: true,
      requestId: request.requestId,
      action: request.action,
      record: rowToRecord_(persisted, row),
      identity: { email: identity.email, sub: identity.sub },
      metrics: {
        lockWaitMs: lockWaitMs,
        sheetWriteMs: sheetWriteMs,
        sheetReadMs: sheetReadMs
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function readLatestTimestamp_() {
  const sheet = getOrCreateTimestampSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  const values = sheet.getRange(lastRow, 1, 1, LCS_TEST.HEADER.length).getValues()[0];
  return rowToRecord_(values, lastRow);
}

function getOrCreateTimestampSheet_() {
  const settings = getSettings_();
  const spreadsheet = SpreadsheetApp.openById(settings.spreadsheetId);
  let sheet = spreadsheet.getSheetByName(settings.sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(settings.sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, LCS_TEST.HEADER.length).setValues([LCS_TEST.HEADER]);
    sheet.setFrozenRows(1);
  } else {
    const existing = sheet.getRange(1, 1, 1, LCS_TEST.HEADER.length).getDisplayValues()[0];
    if (JSON.stringify(existing) !== JSON.stringify(LCS_TEST.HEADER)) {
      throw lcsError_('SCHEMA_MISMATCH', 'Timestamp sheet header does not match the isolated test schema.');
    }
  }
  return sheet;
}

function rowToRecord_(row, rowNumber) {
  return {
    row: rowNumber,
    id: String(row[0] || ''),
    serverTimestampIso: row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ''),
    serverTimestampMs: Number(row[2] || 0),
    authorizedEmail: String(row[3] || ''),
    googleSub: String(row[4] || ''),
    requestId: String(row[5] || ''),
    clientSequence: Number(row[6] || 0),
    clientClickedAtIso: row[7] instanceof Date ? row[7].toISOString() : String(row[7] || ''),
    createdAtIso: row[8] instanceof Date ? row[8].toISOString() : String(row[8] || '')
  };
}
