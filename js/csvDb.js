// js/csvDb.js
// 1.4.4d local-csv-db-test
// 本地端 CSV mock DB 工具：啟動時可從 /db/*.csv 載入 seed，寫入仍由 dataStore/localStorage 保存。
// 注意：一般瀏覽器不能直接把資料寫回專案資料夾中的 CSV 檔；若要保存成檔案，請使用匯出快照。

export const CSV_DB_CONFIG = {
  budgets: {
    file: '01_budgets.csv',
    headers: ['id', 'academicYear', 'budgetName', 'unitCodes', 'budgetAmount', 'note', 'createdAt', 'updatedAt']
  },
  units: {
    file: '02_units.csv',
    headers: ['id', 'unitCode', 'unitName', 'colorKey', 'note', 'createdAt', 'updatedAt']
  },
  scheduleTypes: {
    file: '09_schedule_types.csv',
    headers: ['id', 'name', 'note', 'createdAt', 'updatedAt']
  },
  hourSettings: {
    file: '03_hour_settings.csv',
    headers: ['id', 'academicYear', 'scheduleType', 'unitCode', 'unitName', 'weekdays', 'startTime', 'endTime', 'hours', 'hourlyWage', 'note', 'createdAt', 'updatedAt']
  },
  calendarPeriods: {
    file: '04_calendar_periods.csv',
    headers: ['id', 'date', 'weekday', 'createdAt']
  },
  calendarRows: {
    file: '05_calendar_rows.csv',
    headers: ['id', 'date', 'academicYear', 'weekday', 'scheduleType', 'unitCode', 'unitName', 'startTime', 'endTime', 'hours', 'hourlyWage', 'sourceHourSettingId', 'createdAt']
  },
  calendarHolidays: {
    file: '06_calendar_holidays.csv',
    headers: ['id', 'date', 'name', 'type', 'note', 'createdAt', 'updatedAt']
  },
  salaryEntries: {
    file: '07_salary_entries.csv',
    headers: ['id', 'academicYear', 'year', 'month', 'unitCode', 'unitName', 'actualHours', 'hourlyWage', 'actualAmount', 'note', 'createdAt', 'updatedAt']
  },
  forecastEvaluations: {
    file: '08_forecast_evaluations.csv',
    headers: ['id', 'name', 'budget', 'baseHourlyWage', 'intervals', 'createdAt', 'updatedAt']
  },
  holidayNames: {
    file: '10_holiday_names.csv',
    headers: ['id', 'name', 'note', 'createdAt', 'updatedAt']
  }
};

const NUMBER_FIELDS = new Set([
  'budgetAmount',
  'hours',
  'hourlyWage',
  'year',
  'month',
  'actualHours',
  'actualAmount',
  'budget',
  'baseHourlyWage'
]);

const JSON_FIELDS = new Set(['intervals', 'unitCodes']);

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function normalizeCellValue(field, value) {
  const s = String(value ?? '').trim();
  if (s === '') return '';

  if (JSON_FIELDS.has(field)) {
    try {
      return JSON.parse(s);
    } catch (e) {
      console.warn(`[CSV DB] JSON 欄位解析失敗：${field}`, e);
      return [];
    }
  }

  if (NUMBER_FIELDS.has(field)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  return s;
}

export function parseCsv(text, fallbackHeaders = []) {
  const normalized = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n').filter(line => line.trim() !== '');
  if (lines.length <= 1) return [];

  const headers = parseCsvLine(lines[0]).map(h => h.trim()).filter(Boolean);
  const safeHeaders = headers.length ? headers : fallbackHeaders;
  const rows = [];

  lines.slice(1).forEach(line => {
    const cells = parseCsvLine(line);
    const row = {};
    let hasValue = false;
    safeHeaders.forEach((header, idx) => {
      const value = cells[idx] ?? '';
      if (String(value).trim() !== '') hasValue = true;
      row[header] = normalizeCellValue(header, value);
    });
    if (hasValue) rows.push(row);
  });

  return rows;
}

function csvEscape(value) {
  let s = '';
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    s = JSON.stringify(value);
  } else {
    s = String(value ?? '');
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows, headers) {
  const out = [headers.join(',')];
  (rows || []).forEach(row => {
    out.push(headers.map(header => csvEscape(row ? row[header] : '')).join(','));
  });
  return out.join('\r\n') + '\r\n';
}

export async function loadCsvDb(basePath = './db/') {
  const data = {};
  let loadedAnyFile = false;

  for (const [collection, config] of Object.entries(CSV_DB_CONFIG)) {
    const url = `${basePath}${config.file}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`CSV DB 載入失敗：${url} (${response.status})`);
    }
    loadedAnyFile = true;
    const text = await response.text();
    data[collection] = parseCsv(text, config.headers);
  }

  if (!loadedAnyFile) throw new Error('CSV DB 未載入任何檔案');
  return data;
}

export function exportCsvDbSnapshot(collections) {
  Object.entries(CSV_DB_CONFIG).forEach(([collection, config], idx) => {
    const rows = Array.isArray(collections && collections[collection]) ? collections[collection] : [];
    const csv = toCsv(rows, config.headers);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = config.file;
    document.body.appendChild(a);
    setTimeout(() => {
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, idx * 120);
  });
}
