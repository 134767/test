// js/dataStore.js
// 資料服務層：所有 CRUD 集中在此。
// 1.4.4d local-csv-db-test：保留原本同步頁面 API，底層可切 localStorage / GAS Sheet；本地端可從 db/*.csv 載入空白測試 DB。

const LS_KEYS = {
  budgets: 'workStudy_budgets',
  units: 'workStudy_units',
  scheduleTypes: 'workStudy_scheduleTypes',
  hourSettings: 'workStudy_hourSettings',
  calendarPeriods: 'workStudy_calendarPeriods',
  calendarRows: 'workStudy_calendarRows',
  calendarHolidays: 'workStudy_calendarHolidays',
  salaryEntries: 'workStudy_salaryEntries',
  forecastEvaluations: 'workStudy_forecastEvaluations',
  holidayNames: 'workStudy_holidayNames',
  seeded: 'workStudy_seeded'
};

const COLLECTIONS = [
  'budgets',
  'units',
  'scheduleTypes',
  'hourSettings',
  'calendarPeriods',
  'calendarRows',
  'calendarHolidays',
  'salaryEntries',
  'forecastEvaluations',
  'holidayNames'
];

const WRITE_ENABLED_COLLECTIONS = new Set([
  'budgets',
  'units',
  'hourSettings',
  'calendarPeriods',
  'calendarRows',
  'calendarHolidays',
  'salaryEntries',
  'forecastEvaluations'
]);

let _cache = {
  budgets: null,
  units: null,
  scheduleTypes: null,
  hourSettings: null,
  calendarPeriods: null,
  calendarRows: null,
  calendarHolidays: null,
  salaryEntries: null,
  forecastEvaluations: null,
  holidayNames: null
};

let _dataMode = 'localStorage';
let _gasReady = false;
let _isInitializing = false;
let _syncTimers = {};
let _syncUiTokens = {};
let _syncGenerations = {};
const GAS_ACTIONS = new Set([
  'saveBudget','deleteBudget','saveUnit','deleteUnit','saveHourSetting','saveHourSettingsBatch','deleteHourSettings',
  'saveCalendarPeriod','deleteCalendarPeriods','saveCalendarRowsBatch','deleteCalendarRowsByScope',
  'saveCalendarHoliday','deleteCalendarHoliday','saveSalaryEntry','deleteSalaryEntry',
  'saveForecastEvaluation','deleteForecastEvaluation','saveScheduleType','deleteScheduleType','saveHolidayName','deleteHolidayName'
]);

function _emptyCache() {
  return {
    budgets: null,
    units: null,
    scheduleTypes: null,
    hourSettings: null,
    calendarPeriods: null,
    calendarRows: null,
    calendarHolidays: null,
    salaryEntries: null,
    forecastEvaluations: null,
    holidayNames: null
  };
}

function _clone(value) {
  return JSON.parse(JSON.stringify(value || []));
}

function _detectDataMode() {
  const cfg = window.WORK_STUDY_CONFIG || {};
  if (cfg.DATA_MODE) return cfg.DATA_MODE;
  if (window.google && window.google.script && window.google.script.run) return 'gasSheet';
  return 'localStorage';
}

function _serverCall(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.script || !window.google.script.run) {
      reject(new Error('google.script.run 不存在，目前不是 GAS Shell 執行環境'));
      return;
    }

    window.google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(reject)
      .runServerFunction(action, payload);
  });
}

function _isGasWriteEnabled() {
  const runtime = window.WORK_STUDY_RUNTIME_CONFIG || {};
  return runtime.writeMode === 'enabled';
}

function _allowGasLocalFallback() {
  const runtime = window.WORK_STUDY_RUNTIME_CONFIG || {};
  return runtime.allowLocalFallback === true;
}

function _loadLocal(name) {
  try {
    const raw = localStorage.getItem(LS_KEYS[name]);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('localStorage parse error', name, e);
    return [];
  }
}

function _saveLocal(name, data) {
  try {
    localStorage.setItem(LS_KEYS[name], JSON.stringify(data));
  } catch (e) {
    console.error('localStorage save error', name, e);
  }
}

function _getCollection(name) {
  if (_cache[name] === null) {
    _cache[name] = _loadLocal(name);
  }
  return _cache[name];
}

function _setCollection(name, data, options = {}) {
  const sync = options.sync !== false;
  _cache[name] = data;
  if (_dataMode !== 'gasSheet') _saveLocal(name, data);

  if (_dataMode === 'gasSheet' && _gasReady && !_isInitializing && sync && _isGasWriteEnabled()) {
    console.warn(`[DataStore] ${name} must use an explicit GAS mutation API`);
  }
}

function _collectionLabel(name) {
  const labels = {
    budgets: '預算設定',
    units: '單位設定',
    scheduleTypes: '作息類型設定',
    hourSettings: '時數設定',
    calendarPeriods: '行事曆週期',
    calendarRows: '行事曆作息',
    calendarHolidays: '行事曆假日',
    salaryEntries: '時薪登記',
    forecastEvaluations: '未來評估',
    holidayNames: '節日名稱設定'
  };
  return labels[name] || name;
}

function _scheduleCollectionSync(name) {
  if (!COLLECTIONS.includes(name)) return;

  if (!WRITE_ENABLED_COLLECTIONS.has(name)) {
    console.warn(`[GAS Sheet Sync] ${name} is not write-enabled in 1.6.0`);
    return;
  }

  const label = _collectionLabel(name);
  _syncGenerations[name] = (_syncGenerations[name] || 0) + 1;
  const generation = _syncGenerations[name];

  if (!_syncUiTokens[name]) {
    _syncUiTokens[name] = beginDbOperation(`${label} syncing to Google Sheet...`, { blocking: false });
  } else if (window.WorkStudyDbFeedback) {
    window.WorkStudyDbFeedback.update(_syncUiTokens[name], `${label} syncing to Google Sheet...`);
  }

  clearTimeout(_syncTimers[name]);
  _syncTimers[name] = setTimeout(() => {
    const rows = _clone(_cache[name] || []);
    _serverCall('replaceCollection', { collection: name, rows })
      .then(result => {
        if (!result || result.ok === false) {
          const message =
            result && (result.error || result.message)
              ? (result.error || result.message)
              : 'GAS Sheet sync returned an invalid response.';
          throw new Error(message);
        }

        const syncedRows = Array.isArray(result.rows) ? result.rows : rows;
        _cache[name] = syncedRows;
        _saveLocal(name, syncedRows);
        console.log(`[GAS Sheet Sync] ${name} synced (${syncedRows.length})`);

        if (_syncGenerations[name] === generation) {
          endDbOperation(_syncUiTokens[name], { message: `${label} synced`, silent: true });
          _syncUiTokens[name] = null;
        }
      })
      .catch(err => {
        console.error(`[GAS Sheet Sync] ${name} failed`, err);
        if (_syncGenerations[name] === generation) {
          const detail = err && err.message ? err.message : String(err);
          endDbOperation(_syncUiTokens[name], { error: true, message: `${label} Sheet sync failed: ${detail}` });
          _syncUiTokens[name] = null;
        }
      });
  }, 250);
}

async function _loadFromGasSheet() {
  const result = await _serverCall('getWorkStudyBootstrapData', {});

  if (!result || result.ok === false) {
    const message =
      result && result.error
        ? result.error
        : 'GAS Sheet backend returned an invalid response.';
    throw new Error(message);
  }

  if (!result.data || typeof result.data !== 'object') {
    throw new Error('GAS Sheet backend response missing data.');
  }

  const payload = result.result || result;
  const data = payload.data;

  COLLECTIONS.forEach(name => {
    const rows = Array.isArray(data[name]) ? data[name] : [];
    _cache[name] = rows;
  });
  _gasReady = true;
  console.log('[DataStore] loaded from GAS Sheet backend');
}

async function _loadFromLocalCsvDb() {
  const csvData = await loadCsvDb('./db/');
  COLLECTIONS.forEach(name => {
    const rows = Array.isArray(csvData && csvData[name]) ? csvData[name] : [];
    _cache[name] = rows;
    _saveLocal(name, rows);
  });
  localStorage.setItem(LS_KEYS.seeded, 'true');
  console.log('[DataStore] loaded from local CSV DB seed');
  return csvData;
}

function _snapshotCollections() {
  const snapshot = {};
  COLLECTIONS.forEach(name => {
    snapshot[name] = _clone(_getCollection(name));
  });
  return snapshot;
}


// 初始化：localStorage 模式沿用 seedData；GAS Shell 模式啟動時一次載入 Sheet 到前端 cache。
import { beginDbOperation, endDbOperation } from './dbFeedback.js?v=1.6.0';
import { loadCsvDb, exportCsvDbSnapshot } from './csvDb.js?v=1.6.0';
import { normalizeBudgetRecord, normalizeBudgetUnitCodes } from './budgetGroupUtils.js?v=1.6.0';
import {
  seedBudgets,
  seedUnits,
  seedHourSettings,
  seedCalendarPeriods,
  seedCalendarRows,
  seedCalendarHolidays
} from './seedData.js?v=1.6.0';

export async function initDataStore() {
  _dataMode = _detectDataMode();
  _isInitializing = true;

  if (_dataMode === 'gasSheet') {
    try {
      await _loadFromGasSheet();
      ensureScheduleTypesFromExistingHourSettings();
      ensureHolidayNamesFromExistingCalendarHolidays();
      _isInitializing = false;
      return;
    } catch (e) {
      console.error('[DataStore] GAS Sheet backend load failed', e);

      if (!_allowGasLocalFallback()) {
        _isInitializing = false;
        _gasReady = false;
        throw e;
      }

      console.warn('[DataStore] fallback to localStorage because allowLocalFallback is true');
      if (window.showToast) window.showToast('Sheet 後端載入失敗，已暫時改用本機資料', 'error');
      _dataMode = 'localStorage';
      _gasReady = false;
    }
  }

  const alreadySeeded = localStorage.getItem(LS_KEYS.seeded) === 'true';
  if (alreadySeeded) {
    COLLECTIONS.forEach(_getCollection);
    ensureScheduleTypesFromExistingHourSettings();
    ensureHolidayNamesFromExistingCalendarHolidays();
    _isInitializing = false;
    console.log('[DataStore] localStorage mode: loaded existing local data');
    return;
  }

  // 1.4.4d：本地端優先使用 /db/*.csv 作為測試 DB seed。
  // 空白 CSV 只有表頭時，會初始化成空資料庫。
  try {
    await _loadFromLocalCsvDb();
    ensureScheduleTypesFromExistingHourSettings();
    ensureHolidayNamesFromExistingCalendarHolidays();
    _isInitializing = false;
    return;
  } catch (e) {
    console.warn('[DataStore] local CSV DB load failed, fallback to seedData', e);
  }

  const hasBudgets = _loadLocal('budgets').length > 0;
  const hasUnits = _loadLocal('units').length > 0;

  if (!hasBudgets && !hasUnits) {
    _setCollection('budgets', _clone(seedBudgets), { sync: false });
    _setCollection('units', _clone(seedUnits), { sync: false });
    _setCollection('scheduleTypes', [], { sync: false });
    _setCollection('hourSettings', _clone(seedHourSettings), { sync: false });
    _setCollection('calendarPeriods', _clone(seedCalendarPeriods), { sync: false });
    _setCollection('calendarRows', _clone(seedCalendarRows), { sync: false });
    _setCollection('calendarHolidays', _clone(seedCalendarHolidays), { sync: false });
    _setCollection('salaryEntries', [], { sync: false });
    _setCollection('forecastEvaluations', [], { sync: false });
    _setCollection('holidayNames', [], { sync: false });
  }

  localStorage.setItem(LS_KEYS.seeded, 'true');
  _cache = _emptyCache();
  ensureScheduleTypesFromExistingHourSettings();
  ensureHolidayNamesFromExistingCalendarHolidays();
  _isInitializing = false;
  console.log('[DataStore] localStorage mode: loaded fallback seedData');
}

export function getDataMode() {
  return _dataMode;
}

export async function callGasMutation(action, payload = {}, collection = '') {
  if (_dataMode !== 'gasSheet') throw new Error('callGasMutation 僅適用於 gasSheet 模式');
  if (!GAS_ACTIONS.has(action)) throw new Error(`不允許的 GAS 操作：${action}`);
  const response = await _serverCall(action, payload);
  if (!response || response.ok === false) {
    const err = new Error(response?.message || response?.error || 'GAS 連線失敗');
    err.code = response?.code || 'GAS_ERROR';
    err.details = response?.details || {};
    throw err;
  }
  const result = response.result ?? response;
  if (collection && Array.isArray(result?.addedRecords)) {
    _cache[collection] = [...(_cache[collection] || []), ...result.addedRecords];
  }
  return result;
}

function _upsertCacheRecord(collection, record) {
  const current = _cache[collection] || [];
  const idx = current.findIndex(item => item.id === record.id);
  _cache[collection] = idx < 0 ? [...current, record] : current.map((item, i) => i === idx ? record : item);
  return record;
}

function _removeConfirmedCacheIds(collection, ids) {
  const confirmed = new Set((ids || []).map(String));
  _cache[collection] = (_cache[collection] || []).filter(item => !confirmed.has(String(item.id)));
}

export async function saveHourSettingsBatch(records) {
  if (_dataMode !== 'gasSheet') {
    const addedRecords = await Promise.all((records || []).map(record => saveHourSetting(record)));
    return { selected: records.length, added: addedRecords.length, addedRecords, skipped: [] };
  }
  return callGasMutation('saveHourSettingsBatch', { records }, 'hourSettings');
}

export async function saveCalendarRowsBatch(records) {
  if (_dataMode !== 'gasSheet') { const addedRecords=addCalendarRows(records); return { addedRecords, added: addedRecords.length }; }
  return callGasMutation('saveCalendarRowsBatch', { records }, 'calendarRows');
}

export async function deleteCalendarRowsByScope(payload) {
  if (_dataMode !== 'gasSheet') {
    const budgets = (_cache.budgets || []).filter(b=>b.budgetName===payload.selectedBudgetName);
    const byYear = new Map(budgets.map(b=>[String(b.academicYear),new Set(normalizeBudgetUnitCodes(b.unitCodes))]));
    const sourceIds = new Set(payload.sourceHourSettingIds || []);
    const deletedIds = (_cache.calendarRows || []).filter(r=>r.date>=payload.startDate&&r.date<=payload.endDate&&byYear.get(String(r.academicYear))?.has(String(r.unitCode))&&(!sourceIds.size||sourceIds.has(r.sourceHourSettingId))).map(r=>r.id);
    _removeConfirmedCacheIds('calendarRows',deletedIds); _saveLocal('calendarRows',_cache.calendarRows);
    return { deletedIds, deletedCount: deletedIds.length };
  }
  const result=await callGasMutation('deleteCalendarRowsByScope', payload); _removeConfirmedCacheIds('calendarRows',result.deletedIds); return result;
}

export function exportLocalCsvDbSnapshot() {
  exportCsvDbSnapshot(_snapshotCollections());
}

export async function resetLocalDataFromCsvDb() {
  if (_dataMode === 'gasSheet') {
    throw new Error('目前是 gasSheet 模式，不可用本地 CSV 重置');
  }
  COLLECTIONS.forEach(name => {
    localStorage.removeItem(LS_KEYS[name]);
  });
  localStorage.removeItem(LS_KEYS.seeded);
  _cache = _emptyCache();
  _isInitializing = true;
  await _loadFromLocalCsvDb();
  ensureScheduleTypesFromExistingHourSettings();
  ensureHolidayNamesFromExistingCalendarHolidays();
  _isInitializing = false;
}

// ===== BUDGETS =====
export function getBudgets() {
  return [..._getCollection('budgets')].map(normalizeBudgetRecord);
}

export async function saveBudget(budget) {
  if (_dataMode === 'gasSheet') return _upsertCacheRecord('budgets', await callGasMutation('saveBudget', budget));
  const list = _getCollection('budgets');
  const now = new Date().toISOString();
  const normalized = normalizeBudgetRecord(budget);
  let newItem;

  if (budget.id) {
    const idx = list.findIndex(b => b.id === budget.id);
    if (idx !== -1) {
      const existing = normalizeBudgetRecord(list[idx]);
      newItem = {
        ...existing,
        ...normalized,
        id: budget.id,
        createdAt: existing.createdAt,
        updatedAt: now
      };
      list[idx] = newItem;
    } else {
      newItem = { ...normalized, id: budget.id, createdAt: now, updatedAt: now };
      list.push(newItem);
    }
  } else {
    newItem = {
      ...normalized,
      id: 'BUD_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      createdAt: now,
      updatedAt: now
    };
    list.push(newItem);
  }

  _setCollection('budgets', list);
  return newItem;
}

export async function deleteBudgets(ids) {
  if (_dataMode === 'gasSheet') { const r=await callGasMutation('deleteBudget',{ids}); _removeConfirmedCacheIds('budgets',r.deletedIds); return r; }
  let list = _getCollection('budgets');
  list = list.filter(b => !ids.includes(b.id));
  _setCollection('budgets', list);
  return { deletedIds: ids, deletedCount: ids.length };
}
export const deleteBudget = deleteBudgets;

// ===== UNITS =====
export function getUnits() {
  return [..._getCollection('units')];
}

export async function saveUnit(unit) {
  if (_dataMode === 'gasSheet') return _upsertCacheRecord('units', await callGasMutation('saveUnit', unit));
  const list = _getCollection('units');
  const now = new Date().toISOString();
  let newItem;

  if (unit.id) {
    const idx = list.findIndex(u => u.id === unit.id);
    if (idx !== -1) {
      newItem = {
        ...list[idx],
        ...unit,
        updatedAt: now
      };
      list[idx] = newItem;
    } else {
      newItem = {
        id: unit.id,
        unitCode: unit.unitCode,
        unitName: unit.unitName,
        colorKey: unit.colorKey || 'default',
        note: unit.note || '',
        createdAt: now,
        updatedAt: now
      };
      list.push(newItem);
    }
  } else {
    newItem = {
      id: 'UNIT_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      unitCode: unit.unitCode,
      unitName: unit.unitName,
      colorKey: unit.colorKey || 'default',
      note: unit.note || '',
      createdAt: now,
      updatedAt: now
    };
    list.push(newItem);
  }

  _setCollection('units', list);
  return newItem;
}

export async function deleteUnits(ids) {
  if (_dataMode === 'gasSheet') { const r=await callGasMutation('deleteUnit',{ids}); _removeConfirmedCacheIds('units',r.deletedIds); return r; }
  let list = _getCollection('units');
  list = list.filter(u => !ids.includes(u.id));
  _setCollection('units', list);
  return { deletedIds: ids, deletedCount: ids.length };
}
export const deleteUnit = deleteUnits;

export function moveUnitOrder(id, direction) {
  const list = _getCollection('units');
  const idx = list.findIndex(u => u.id === id);
  if (idx === -1) return false;

  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= list.length) return false;

  const next = [...list];
  const temp = next[idx];
  next[idx] = next[targetIdx];
  next[targetIdx] = temp;

  _setCollection('units', next);
  return true;
}

// 檢查單位是否被使用（時數設定或行事曆）
export function isUnitUsed(unitCode) {
  const hourSettings = _getCollection('hourSettings');
  const rows = _getCollection('calendarRows');

  const usedInHour = hourSettings.some(h => h.unitCode === unitCode);
  const usedInRows = rows.some(r => r.unitCode === unitCode);
  const usedInBudgets = _getCollection('budgets').some(b => normalizeBudgetUnitCodes(b.unitCodes).includes(unitCode));
  return usedInHour || usedInRows || usedInBudgets;
}

// ===== SCHEDULE TYPES (全域作息類型) =====
export function getScheduleTypes() {
  return [..._getCollection('scheduleTypes')];
}

export async function saveScheduleType(payload) {
  if (_dataMode === 'gasSheet') return _upsertCacheRecord('scheduleTypes', await callGasMutation('saveScheduleType', payload));
  const list = _getCollection('scheduleTypes');
  const now = new Date().toISOString();
  let name = (payload.name || '').trim();
  if (!name) {
    throw new Error('作息類型名稱為必填');
  }

  // case-insensitive duplicate check
  const lowerName = name.toLowerCase();
  const dup = list.some(s => (s.name || '').toLowerCase() === lowerName);
  if (dup) {
    throw new Error('作息類型名稱已存在');
  }

  let newItem;
  if (payload.id) {
    const idx = list.findIndex(s => s.id === payload.id);
    if (idx !== -1) {
      newItem = {
        ...list[idx],
        name,
        note: payload.note || list[idx].note || '',
        updatedAt: now
      };
      list[idx] = newItem;
    } else {
      newItem = {
        id: payload.id,
        name,
        note: payload.note || '',
        createdAt: now,
        updatedAt: now
      };
      list.push(newItem);
    }
  } else {
    newItem = {
      id: 'STYPE_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
      name,
      note: payload.note || '',
      createdAt: now,
      updatedAt: now
    };
    list.push(newItem);
  }

  _setCollection('scheduleTypes', list, { sync: false });
  return newItem;
}

export async function deleteScheduleType(id) {
  if (_dataMode === 'gasSheet') { const r=await callGasMutation('deleteScheduleType',{ids:[id]}); _removeConfirmedCacheIds('scheduleTypes',r.deletedIds); return r; }
  let list = _getCollection('scheduleTypes');
  list = list.filter(s => s.id !== id);
  _setCollection('scheduleTypes', list, { sync: false });
  return { deletedIds:[id], deletedCount:1 };
}

export function isScheduleTypeUsed(name) {
  const hours = _getCollection('hourSettings');
  const rows = _getCollection('calendarRows');
  const lower = (name || '').toLowerCase();
  const usedInHour = hours.some(h => (h.scheduleType || '').toLowerCase() === lower);
  const usedInRows = rows.some(r => (r.scheduleType || '').toLowerCase() === lower);
  return usedInHour || usedInRows;
}

export function ensureScheduleTypesFromExistingHourSettings() {
  if (_dataMode === 'gasSheet') return;
  const types = _getCollection('scheduleTypes');
  if (types.length > 0) return; // 已有則不處理

  const hours = _getCollection('hourSettings');
  const existingNames = new Set();
  const toAdd = [];

  hours.forEach(h => {
    const n = (h.scheduleType || '').trim();
    if (!n) return;
    const lower = n.toLowerCase();
    if (!existingNames.has(lower)) {
      existingNames.add(lower);
      toAdd.push({
        id: 'STYPE_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        name: n,
        note: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  });

  if (toAdd.length > 0) {
    const newList = [...types, ...toAdd];
    _setCollection('scheduleTypes', newList, { sync: false });
    console.log('[DataStore] ensureScheduleTypesFromExistingHourSettings: migrated', toAdd.length);
  }
}

// ===== HOLIDAY NAMES (節日名稱主檔) =====
export function getHolidayNames() {
  return [..._getCollection('holidayNames')];
}

export function getHolidayNameOptionsFromCalendarHolidays() {
  const holidays = _getCollection('calendarHolidays');
  const map = new Map();

  holidays.forEach(h => {
    const name = (h.name || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        id: 'HNAME_DERIVED_' + key,
        name,
        note: '',
        source: 'calendarHolidays'
      });
    }
  });

  return Array.from(map.values());
}

export async function saveHolidayName(payload) {
  if (_dataMode === 'gasSheet') return _upsertCacheRecord('holidayNames', await callGasMutation('saveHolidayName', payload));
  const list = _getCollection('holidayNames');
  const now = new Date().toISOString();
  let name = (payload.name || '').trim();
  if (!name) {
    throw new Error('節日名稱為必填');
  }

  // case-insensitive duplicate check
  const lowerName = name.toLowerCase();
  const dup = list.some(h => (h.name || '').toLowerCase() === lowerName);
  if (dup) {
    throw new Error('節日名稱已存在');
  }

  let newItem;
  if (payload.id) {
    const idx = list.findIndex(h => h.id === payload.id);
    if (idx !== -1) {
      newItem = {
        ...list[idx],
        name,
        note: payload.note || list[idx].note || '',
        updatedAt: now
      };
      list[idx] = newItem;
    } else {
      newItem = {
        id: payload.id,
        name,
        note: payload.note || '',
        createdAt: now,
        updatedAt: now
      };
      list.push(newItem);
    }
  } else {
    newItem = {
      id: 'HNAME_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
      name,
      note: payload.note || '',
      createdAt: now,
      updatedAt: now
    };
    list.push(newItem);
  }

  _setCollection('holidayNames', list, { sync: false });
  return newItem;
}

export async function deleteHolidayName(id) {
  if (_dataMode === 'gasSheet') { const r=await callGasMutation('deleteHolidayName',{ids:[id]}); _removeConfirmedCacheIds('holidayNames',r.deletedIds); return r; }
  let list = _getCollection('holidayNames');
  list = list.filter(h => h.id !== id);
  _setCollection('holidayNames', list, { sync: false });
  return { deletedIds:[id], deletedCount:1 };
}

export function isHolidayNameUsed(name) {
  const holidays = _getCollection('calendarHolidays');
  const lower = (name || '').toLowerCase();
  return holidays.some(h => (h.name || '').toLowerCase() === lower);
}

export function ensureHolidayNamesFromExistingCalendarHolidays() {
  if (_dataMode === 'gasSheet') return;
  const names = _getCollection('holidayNames');
  if (names.length > 0) return; // 已有則不處理

  const holidays = _getCollection('calendarHolidays');
  const existingNames = new Set();
  const toAdd = [];

  holidays.forEach(h => {
    const n = (h.name || '').trim();
    if (!n) return;
    const lower = n.toLowerCase();
    if (!existingNames.has(lower)) {
      existingNames.add(lower);
      toAdd.push({
        id: 'HNAME_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        name: n,
        note: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  });

  if (toAdd.length > 0) {
    const newList = [...names, ...toAdd];
    _setCollection('holidayNames', newList, { sync: false });
    console.log('[DataStore] ensureHolidayNamesFromExistingCalendarHolidays: migrated', toAdd.length);
  }
}

// ===== HOUR SETTINGS =====
export function getHourSettings() {
  return [..._getCollection('hourSettings')];
}

export async function saveHourSetting(setting) {
  if (_dataMode === 'gasSheet') return _upsertCacheRecord('hourSettings', await callGasMutation('saveHourSetting', setting));
  const list = _getCollection('hourSettings');
  const now = new Date().toISOString();
  let newItem;

  if (setting.id) {
    const idx = list.findIndex(h => h.id === setting.id);
    if (idx !== -1) {
      newItem = {
        ...list[idx],
        ...setting,
        updatedAt: now
      };
      list[idx] = newItem;
    } else {
      newItem = { ...setting, createdAt: now, updatedAt: now };
      list.push(newItem);
    }
  } else {
    newItem = {
      id: 'HOUR_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      academicYear: setting.academicYear,
      scheduleType: setting.scheduleType,
      unitCode: setting.unitCode,
      unitName: setting.unitName,
      weekdays: setting.weekdays,
      startTime: setting.startTime,
      endTime: setting.endTime,
      hours: Number(setting.hours),
      hourlyWage: Number(setting.hourlyWage),
      note: setting.note || '',
      createdAt: now,
      updatedAt: now
    };
    list.push(newItem);
  }

  _setCollection('hourSettings', list);
  return newItem;
}

export async function deleteHourSettings(ids) {
  if (_dataMode === 'gasSheet') { const r=await callGasMutation('deleteHourSettings',{ids}); _removeConfirmedCacheIds('hourSettings',r.deletedIds); return r; }
  let list = _getCollection('hourSettings');
  list = list.filter(h => !ids.includes(h.id));
  _setCollection('hourSettings', list);
  return { deletedIds: ids, deletedCount: ids.length };
}

// 檢查時數設定是否被行事曆使用
export function isHourSettingUsed(hourSettingId) {
  const rows = _getCollection('calendarRows');
  return rows.some(r => r.sourceHourSettingId === hourSettingId);
}

// ===== CALENDAR PERIODS =====
export function getCalendarPeriods() {
  return [..._getCollection('calendarPeriods')];
}

export async function addCalendarPeriod(period) {
  if (_dataMode === 'gasSheet') return _upsertCacheRecord('calendarPeriods', await callGasMutation('saveCalendarPeriod', period));
  const list = _getCollection('calendarPeriods');
  const exists = list.some(p => p.date === period.date);
  if (exists) return null;

  const newItem = {
    id: 'PERIOD_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    date: period.date,           // 'YYYY-MM-DD' 內部統一
    weekday: period.weekday,     // '星期一'
    createdAt: new Date().toISOString()
  };
  list.push(newItem);
  _setCollection('calendarPeriods', list);
  return newItem;
}

export async function deleteCalendarPeriodsByDateRange(startDate, endDate) {
  if (_dataMode === 'gasSheet') { const ids=(_cache.calendarPeriods||[]).filter(p=>p.date>=startDate&&p.date<=endDate).map(p=>p.id); const r=await callGasMutation('deleteCalendarPeriods',{ids,startDate,endDate}); _removeConfirmedCacheIds('calendarPeriods',r.deletedIds); _removeConfirmedCacheIds('calendarRows',r.deletedCalendarRowIds||[]); return r; }
  // 刪除 period 及該區間內的 rows
  let periods = _getCollection('calendarPeriods');
  let rows = _getCollection('calendarRows');

  const start = startDate;
  const end = endDate;

  periods = periods.filter(p => {
    const d = p.date;
    return !(d >= start && d <= end);
  });

  rows = rows.filter(r => {
    const d = r.date;
    return !(d >= start && d <= end);
  });

  _setCollection('calendarPeriods', periods);
  _setCollection('calendarRows', rows);
  return { deletedCount: 0 };
}

// ===== CALENDAR ROWS =====
export function getCalendarRows() {
  return [..._getCollection('calendarRows')];
}

export function addCalendarRows(rowsToAdd) {
  const list = _getCollection('calendarRows');
  const existingKeys = new Set(
    list.map(r => `${r.date}|${r.academicYear}|${r.scheduleType}|${r.unitCode}|${r.startTime}|${r.endTime}`)
  );

  const added = [];
  const now = new Date().toISOString();

  for (const row of rowsToAdd) {
    const key = `${row.date}|${row.academicYear}|${row.scheduleType}|${row.unitCode}|${row.startTime}|${row.endTime}`;
    if (existingKeys.has(key)) continue;

    const newRow = {
      id: 'ROW_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
      date: row.date,
      academicYear: row.academicYear,
      weekday: row.weekday,
      scheduleType: row.scheduleType,
      unitCode: row.unitCode,
      unitName: row.unitName,
      startTime: row.startTime,
      endTime: row.endTime,
      hours: Number(row.hours),
      hourlyWage: Number(row.hourlyWage),
      sourceHourSettingId: row.sourceHourSettingId || null,
      createdAt: now
    };
    list.push(newRow);
    added.push(newRow);
    existingKeys.add(key);
  }

  _setCollection('calendarRows', list);
  return added;
}

export function deleteCalendarRowsByCriteria(criteria) {
  // criteria: { startDate, endDate, academicYear?, scheduleType?, unitCode?, sourceHourSettingId? }
  let rows = _getCollection('calendarRows');

  rows = rows.filter(r => {
    if (r.date < criteria.startDate || r.date > criteria.endDate) return true;

    if (criteria.academicYear && r.academicYear !== criteria.academicYear) return true;
    if (criteria.scheduleType && r.scheduleType !== criteria.scheduleType) return true;
    if (criteria.unitCode && r.unitCode !== criteria.unitCode) return true;
    if (criteria.sourceHourSettingId && r.sourceHourSettingId !== criteria.sourceHourSettingId) return true;

    return false; // 符合刪除條件 → 濾掉
  });

  _setCollection('calendarRows', rows);
}

// ===== CALENDAR HOLIDAYS (國定/校定假日) =====
export function getCalendarHolidays() {
  return [..._getCollection('calendarHolidays')];
}

export async function saveCalendarHoliday(payload) {
  if (_dataMode === 'gasSheet') return _upsertCacheRecord('calendarHolidays', await callGasMutation('saveCalendarHoliday', payload));
  const list = _getCollection('calendarHolidays');
  const now = new Date().toISOString();
  const date = payload.date; // 預期 'YYYY-MM-DD'

  const exists = list.some(h => h.date === date);
  if (exists) {
    return null; // 阻擋重複日期
  }

  // 儲存前先清除該日期所有上班區間 (rows)
  let rows = _getCollection('calendarRows');
  const origLen = rows.length;
  rows = rows.filter(r => r.date !== date);
  if (rows.length !== origLen) {
    _setCollection('calendarRows', rows);
  }

  const newItem = {
    id: 'HOLIDAY_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    date: date,
    name: payload.name || '',
    createdAt: now,
    updatedAt: now
  };
  list.push(newItem);
  _setCollection('calendarHolidays', list);
  return newItem;
}

export async function deleteCalendarHoliday(id) {
  if (_dataMode === 'gasSheet') { const r=await callGasMutation('deleteCalendarHoliday',{ids:[id]}); _removeConfirmedCacheIds('calendarHolidays',r.deletedIds); return r; }
  let list = _getCollection('calendarHolidays');
  list = list.filter(h => h.id !== id);
  _setCollection('calendarHolidays', list);
  return { deletedIds: [id], deletedCount: 1 };
}

export function findCalendarHolidayByDate(date) {
  // date 必須為 'YYYY-MM-DD' 與 periods/rows 一致
  const list = _getCollection('calendarHolidays');
  return list.find(h => h.date === date) || null;
}

// 取得學年度列表（來自 budgets）
export function getAcademicYears() {
  const budgets = getBudgets();
  return [...new Set(budgets.map(b => b.academicYear).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a, 'zh-Hant')); // 較新的在前
}

// 取得指定學年度的作息類型（來自 hourSettings）
export function getScheduleTypesByYear(academicYear) {
  const hours = _getCollection('hourSettings');
  const types = [...new Set(hours.filter(h => h.academicYear === academicYear).map(h => h.scheduleType))];
  return types;
}

// 取得單位（來自 hourSettings 篩選）
export function getUnitsByYearAndType(academicYear, scheduleType) {
  const hours = _getCollection('hourSettings');
  const filtered = hours.filter(h =>
    h.academicYear === academicYear &&
    (scheduleType ? h.scheduleType === scheduleType : true)
  );

  const map = new Map();
  filtered.forEach(h => {
    if (!map.has(h.unitCode)) {
      map.set(h.unitCode, { unitCode: h.unitCode, unitName: h.unitName });
    }
  });
  const master = _getCollection('units');
  const orderMap = new Map(master.map((u, i) => [u.unitCode, i]));
  const arr = Array.from(map.values());
  arr.sort((a, b) => {
    const oa = orderMap.has(a.unitCode) ? orderMap.get(a.unitCode) : 999999;
    const ob = orderMap.has(b.unitCode) ? orderMap.get(b.unitCode) : 999999;
    if (oa !== ob) return oa - ob;
    return String(a.unitCode || a.unitName).localeCompare(String(b.unitCode || b.unitName), 'zh-Hant');
  });
  return arr;
}

// 取得符合的時數設定（用於行事曆新增作息區間）
export function findHourSettings(academicYear, scheduleType, unitCode) {
  const hours = _getCollection('hourSettings');
  return hours.filter(h =>
    h.academicYear === academicYear &&
    h.scheduleType === scheduleType &&
    h.unitCode === unitCode
  );
}

// 取得所有 calendar row 用於檢查重複等
export function getAllCalendarRowsRaw() {
  return _getCollection('calendarRows');
}

// 清除全部資料（開發用）
export function clearAllData() {
  Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k));
  _cache = _emptyCache();
  if (_dataMode === 'gasSheet' && _gasReady && _isGasWriteEnabled()) {
    COLLECTIONS.forEach(name => {
      if (WRITE_ENABLED_COLLECTIONS.has(name)) {
        _scheduleCollectionSync(name);
      }
    });
  }
}

// ===== SALARY ENTRIES (時薪登記 / 核銷) =====
export function getSalaryEntries() {
  return [..._getCollection('salaryEntries')];
}

export async function saveSalaryEntry(entry) {
  if (_dataMode === 'gasSheet') return _upsertCacheRecord('salaryEntries', await callGasMutation('saveSalaryEntry', entry));
  const list = _getCollection('salaryEntries');
  const now = new Date().toISOString();

  const academicYear = entry.academicYear;
  const year = Number(entry.year);
  const month = Number(entry.month);
  const unitCode = entry.unitCode;

  // 尋找是否已存在（學年度 + 年 + 月 + 單位 唯一）
  const idx = list.findIndex(e =>
    e.academicYear === academicYear &&
    Number(e.year) === year &&
    Number(e.month) === month &&
    e.unitCode === unitCode
  );

  const existing = idx !== -1 ? list[idx] : null;
  const hasActualHours = entry.actualHours !== null && typeof entry.actualHours !== 'undefined' && entry.actualHours !== '';
  const hasHourlyWage = entry.hourlyWage !== null && typeof entry.hourlyWage !== 'undefined' && entry.hourlyWage !== '';

  const actualHours = hasActualHours
    ? (Number(entry.actualHours) || 0)
    : (existing ? (Number(existing.actualHours) || 0) : 0);
  const hourlyWage = hasHourlyWage
    ? (Number(entry.hourlyWage) || 0)
    : (existing ? (Number(existing.hourlyWage) || 0) : 0);

  const hasDirectActualAmount =
    entry.actualAmount !== null &&
    typeof entry.actualAmount !== 'undefined' &&
    entry.actualAmount !== '';

  const directActualAmount = Number(entry.actualAmount);
  const actualAmount =
    hasDirectActualAmount && !isNaN(directActualAmount)
      ? directActualAmount
      : actualHours * hourlyWage;

  let newItem;

  if (idx !== -1) {
    // 更新
    newItem = {
      ...existing,
      actualHours,
      hourlyWage,
      actualAmount,
      note: entry.note || existing.note || '',
      updatedAt: now
    };
    list[idx] = newItem;
  } else {
    // 新增
    newItem = {
      id: 'SAL_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
      academicYear: String(academicYear),
      year,
      month,
      unitCode,
      unitName: entry.unitName || '',
      actualHours,
      hourlyWage,
      actualAmount,
      note: entry.note || '',
      createdAt: now,
      updatedAt: now
    };
    list.push(newItem);
  }

  _setCollection('salaryEntries', list);
  return newItem;
}

export async function deleteSalaryEntry(id) {
  if (_dataMode === 'gasSheet') { const r=await callGasMutation('deleteSalaryEntry',{ids:[id]}); _removeConfirmedCacheIds('salaryEntries',r.deletedIds); return r; }
  let list = _getCollection('salaryEntries');
  list = list.filter(e => e.id !== id);
  _setCollection('salaryEntries', list);
  return { deletedIds: [id], deletedCount: 1 };
}

export function getSalaryEntriesByAcademicYear(academicYear) {
  const list = _getCollection('salaryEntries');
  return list.filter(e => e.academicYear === String(academicYear));
}

export function getSalaryEntriesByDateRange(startYm, endYm) {
  // startYm / endYm 格式: '2025-08' 或 null
  const list = _getCollection('salaryEntries');
  if (!startYm && !endYm) return [...list];

  return list.filter(e => {
    const ym = `${e.year}-${String(e.month).padStart(2, '0')}`;
    if (startYm && ym < startYm) return false;
    if (endYm && ym > endYm) return false;
    return true;
  });
}

// ===== FORECAST EVALUATIONS (新增專用，僅用於差額與預估頁的未來評估方案) =====
export function getForecastEvaluations() {
  return [..._getCollection('forecastEvaluations')];
}

export function generateForecastEvaluationId() {
  return 'FE_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
}

export async function saveForecastEvaluation(evaluation) {
  if (_dataMode === 'gasSheet') return _upsertCacheRecord('forecastEvaluations', await callGasMutation('saveForecastEvaluation', evaluation));
  const list = _getCollection('forecastEvaluations');
  const now = new Date().toISOString();
  let newItem;

  if (evaluation.id) {
    // update existing
    const idx = list.findIndex(ev => ev.id === evaluation.id);
    if (idx !== -1) {
      newItem = {
        ...list[idx],
        ...evaluation,
        updatedAt: now
      };
      list[idx] = newItem;
    } else {
      // id not found, treat as new
      newItem = {
        id: evaluation.id || generateForecastEvaluationId(),
        name: evaluation.name || '',
        budget: Number(evaluation.budget) || 0,
        baseHourlyWage: Number(evaluation.baseHourlyWage) || 0,
        intervals: Array.isArray(evaluation.intervals) ? evaluation.intervals : [],
        createdAt: now,
        updatedAt: now
      };
      list.push(newItem);
    }
  } else {
    // new
    newItem = {
      id: generateForecastEvaluationId(),
      name: evaluation.name || '',
      budget: Number(evaluation.budget) || 0,
      baseHourlyWage: Number(evaluation.baseHourlyWage) || 0,
      intervals: Array.isArray(evaluation.intervals) ? evaluation.intervals : [],
      createdAt: now,
      updatedAt: now
    };
    list.push(newItem);
  }

  _setCollection('forecastEvaluations', list);
  return newItem;
}

export async function deleteForecastEvaluation(id) {
  if (_dataMode === 'gasSheet') { const r=await callGasMutation('deleteForecastEvaluation',{ids:[id]}); _removeConfirmedCacheIds('forecastEvaluations',r.deletedIds); return r; }
  let list = _getCollection('forecastEvaluations');
  list = list.filter(ev => ev.id !== id);
  _setCollection('forecastEvaluations', list);
  return { deletedIds: [id], deletedCount: 1 };
}
