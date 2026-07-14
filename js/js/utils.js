// js/utils.js
// 工具函式

const WEEKDAY_MAP = {
  0: '星期日',
  1: '星期一',
  2: '星期二',
  3: '星期三',
  4: '星期四',
  5: '星期五',
  6: '星期六'
};

export function getWeekdayFromDate(dateStr) {
  // dateStr: 'YYYY-MM-DD'
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return WEEKDAY_MAP[d.getDay()];
}

export function formatDateForDisplay(dateStr) {
  // '2026-08-03' → '2026/8/3'
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parseInt(parts[0], 10)}/${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
}

export function parseDateInput(input) {
  // 接受 '2026/8/3' 或 '2026-08-03' → '2026-08-03'
  if (!input) return '';
  let s = input.trim().replace(/\//g, '-');
  const parts = s.split('-');
  if (parts.length !== 3) return '';
  const y = parts[0].padStart(4, '0');
  const m = parts[1].padStart(2, '0');
  const d = parts[2].padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

export function formatNumber(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (isNaN(num)) return n;
  return num.toLocaleString('zh-TW');
}

export function formatTimeRange(start, end) {
  return `${start}~${end}`;
}

export function parseTimeRange(str) {
  // '08:00~21:30' → {start: '08:00', end: '21:30'}
  if (!str) return { start: '', end: '' };
  const parts = str.split('~');
  return { start: parts[0] || '', end: parts[1] || '' };
}

export function generateId(prefix = 'ID') {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function compareTime(a, b) {
  // '08:00' < '21:30' etc. return -1,0,1
  return a.localeCompare(b);
}

export function formatWeekdayList(weekdaysStr) {
  if (!weekdaysStr) return '';
  return weekdaysStr.replace(/\|/g, '、');
}

export function getWeekdaysArray(weekdaysStr) {
  if (!weekdaysStr) return [];
  return weekdaysStr.split('|');
}

export function arrayToWeekdays(arr) {
  return (arr || []).join('|');
}

// 日期區間展開
export function getDatesInRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// 簡單 toast
export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    background:${type === 'error' ? '#dc3545' : type === 'success' ? '#198754' : '#0d6efd'};
    color:white;padding:10px 16px;border-radius:6px;box-shadow:0 3px 8px rgba(0,0,0,0.2);
    font-size:16px;max-width:320px;
  `;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

// ===== UNIFIED DATE INPUT HELPERS (date-input-unified-hotfix) =====
export function normalizeDateInput(value) {
  // 接受 yyyy/mm/dd 或 yyyy-mm-dd 等 → 'YYYY-MM-DD'，不合法回傳 ''
  if (!value) return '';
  let s = String(value).trim().replace(/\//g, '-');
  const parts = s.split('-');
  if (parts.length !== 3) return '';
  const y = parts[0].padStart(4, '0');
  const m = parts[1].padStart(2, '0');
  const d = parts[2].padStart(2, '0');
  const norm = `${y}-${m}-${d}`;
  const dt = new Date(norm);
  if (isNaN(dt.getTime())) return '';
  // 嚴格檢查避免 rollover (e.g. 2026-02-30)
  if (dt.getFullYear() !== parseInt(y, 10) ||
      (dt.getMonth() + 1) !== parseInt(m, 10) ||
      dt.getDate() !== parseInt(d, 10)) {
    return '';
  }
  return norm;
}

export function formatDateForManualInput(dateStr) {
  // '2026-10-02' → '2026/10/02' (手動輸入與顯示統一用帶前導0的 yyyy/mm/dd)
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
}

export function bindDatePickerField(root, textSelector, nativeSelector, btnSelector) {
  const textEl = root ? root.querySelector(textSelector) : null;
  const nativeEl = root ? root.querySelector(nativeSelector) : null;
  const btnEl = root ? root.querySelector(btnSelector) : null;
  if (!textEl || !nativeEl || !btnEl) return;

  // 點擊 📅 按鈕開啟原生日期選擇器
  btnEl.addEventListener('click', () => {
    // 先將 text 的值同步到 native 作為 picker 錨點與預設值（確保位置正確）
    const norm = normalizeDateInput(textEl.value);
    if (norm) {
      nativeEl.value = norm;
    }
    if (typeof nativeEl.showPicker === 'function') {
      try {
        nativeEl.showPicker();
      } catch (e) {
        nativeEl.click();
      }
    } else {
      nativeEl.click();
    }
  });

  // native date 改變 → 同步到文字輸入 (轉 yyyy/mm/dd)
  nativeEl.addEventListener('change', () => {
    if (nativeEl.value) {
      textEl.value = formatDateForManualInput(nativeEl.value);
    }
  });

  // 文字輸入 blur 時自動正規化顯示為 yyyy/mm/dd
  textEl.addEventListener('blur', () => {
    const norm = normalizeDateInput(textEl.value);
    if (norm) {
      textEl.value = formatDateForManualInput(norm);
    }
  });
}

// ===== CALENDAR FILTER HELPER =====
export function inferAcademicYearFromDate(dateStr) {
  // 學年度以 8 月為起點
  // 2026-08-01 ~ 2027-07-31 屬 115
  // 2026-07-31 屬 114
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const roc = year - 1911;
  const ay = (month >= 8) ? roc : roc - 1;
  return String(ay);
}

export function renderPagination(container, currentPage, totalPages, onPageChange) {
  if (!container) return;
  container.innerHTML = '';

  const makeBtn = (label, page, isActive = false) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    if (isActive) btn.classList.add('active');
    const valid = page >= 1 && page <= totalPages;
    if (!valid || page === currentPage) {
      btn.disabled = true;
    }
    btn.addEventListener('click', () => {
      if (valid && page !== currentPage) {
        onPageChange(page);
      }
    });
    return btn;
  };

  // 首頁
  container.appendChild(makeBtn('首頁', 1));

  // -2, -1 (顯示實際頁碼)
  for (let d = -2; d <= -1; d++) {
    const p = currentPage + d;
    if (p >= 1 && p <= totalPages) {
      container.appendChild(makeBtn(String(p), p));
    }
  }

  // 本頁
  container.appendChild(makeBtn(String(currentPage), currentPage, true));

  // +1, +2
  for (let d = 1; d <= 2; d++) {
    const p = currentPage + d;
    if (p >= 1 && p <= totalPages) {
      container.appendChild(makeBtn(String(p), p));
    }
  }

  // 末頁
  container.appendChild(makeBtn('末頁', totalPages));

  // 頁碼搜索欄
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'page-input';
  input.value = currentPage;
  input.min = '1';
  input.max = String(totalPages);
  input.title = '輸入頁碼後按 Enter 或離開欄位跳轉';

  const goToPage = () => {
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val >= 1 && val <= totalPages && val !== currentPage) {
      onPageChange(val);
    } else {
      input.value = currentPage;
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goToPage();
  });
  input.addEventListener('blur', goToPage);

  const label = document.createElement('span');
  label.className = 'page-label';
  label.textContent = '頁';
  container.appendChild(label);
  container.appendChild(input);
}
