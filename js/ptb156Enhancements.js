// 工讀金 1.5.6：Calendar 假日設定雙頁/日期區間正式增強模組。

import {
  getDataMode,
  getCalendarHolidays,
  saveCalendarHoliday,
  deleteCalendarHoliday,
  getHolidayNames,
  saveHolidayName,
  deleteHolidayName,
  isHolidayNameUsed,
  ensureHolidayNamesFromExistingCalendarHolidays
} from './dataStore.js?v=1.6.0-hour-pure-button-hotfix-4';
import { renderCalendarTable } from './calendarPage.js?v=1.6.0-hour-pure-button-hotfix-4';
import { runWithMutationUiLock } from './mutationUi.js?v=1.6.0-hour-pure-button-hotfix-4';
import { showToast, getDatesInRange, formatDateForDisplay } from './utils.js?v=1.6.0-hour-pure-button-hotfix-4';

let holidayPage = 'settings';
let holidayRecordPage = 1;
let holidayNamePage = 1;
const HOLIDAY_PAGE_SIZE = 20;

export function installPtb156Enhancements() {
  injectEnhancementStyles();
  const main = document.getElementById('main-content');
  if (!main) return;
  const scan = () => enhanceCalendarPage(main.querySelector('#page-calendar'));
  new MutationObserver(scan).observe(main, { childList: true, subtree: true });
  scan();
}
function injectEnhancementStyles() {
  if (document.getElementById('ptb-156-enhancement-styles')) return;
  const style = document.createElement('style');
  style.id = 'ptb-156-enhancement-styles';
  style.textContent = `
    .ptb-subpage-tabs { display:flex; gap:8px; margin-bottom:16px; border-bottom:1px solid #e5e7eb; padding-bottom:10px; }
    .ptb-subpage-btn { border:1px solid #cbd5e1; background:#fff; border-radius:8px; padding:8px 14px; cursor:pointer; font-weight:600; }
    .ptb-subpage-btn.active { background:#2563eb; border-color:#2563eb; color:#fff; }
    .ptb-subpage-panel[hidden] { display:none !important; }
    .ptb-holiday-range { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .ptb-list-card { margin-top:14px; border-top:1px solid #e5e7eb; padding-top:10px; }
    .ptb-list-title { font-weight:600; margin-bottom:6px; color:#374151; }
    .ptb-record-list { list-style:none; padding:0; margin:0; max-height:260px; overflow:auto; }
    .ptb-record-list li { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:7px 2px; border-bottom:1px dashed #e5e7eb; }
    .ptb-record-main { min-width:0; overflow-wrap:anywhere; }
    .ptb-delete-link { border:0; background:transparent; color:#c00; cursor:pointer; font-weight:700; font-size:17px; line-height:1; }
    .ptb-inline-form { display:flex; gap:8px; align-items:center; }
    .ptb-inline-form input { flex:1; min-width:0; }
    .ptb-page-controls { display:flex; align-items:center; justify-content:center; gap:10px; margin-top:10px; }
    .ptb-page-controls button { padding:5px 10px; }
    .ptb-page-controls button:disabled { opacity:.45; cursor:not-allowed; }
    #holiday-modal-v2 .modal-content { width:min(680px, calc(100vw - 24px)); }
    @media (max-width:640px) {
      .ptb-holiday-range { grid-template-columns:1fr; }
      .ptb-inline-form { align-items:stretch; flex-direction:column; }
    }
  `;
  document.head.appendChild(style);
}
function valueOf(root, selector) {
  const element = root.querySelector(selector);
  return element ? String(element.value || '') : '';
}

function enhanceCalendarPage(root) {
  if (!root || root.dataset.ptb156HolidayEnhanced === 'true') return;

  const originalButton = root.querySelector('#btn-holiday-setting');
  if (!originalButton) return;

  root.dataset.ptb156HolidayEnhanced = 'true';

  const replacementButton = originalButton;
  replacementButton.addEventListener('click', () => openHolidayModalV2(root));

  const oldModal = root.querySelector('#holiday-modal');
  if (oldModal) {
    oldModal.style.display = 'none';
    oldModal.setAttribute('aria-hidden', 'true');
  }

  const modal = document.createElement('div');
  modal.id = 'holiday-modal-v2';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>國定與校定假日設定</h3>
      </div>
      <div class="modal-body">
        <div class="ptb-subpage-tabs" role="tablist" aria-label="假日設定功能">
          <button type="button" class="ptb-subpage-btn active" data-holiday-page="settings">設定假日</button>
          <button type="button" class="ptb-subpage-btn" data-holiday-page="names">新增節日</button>
        </div>

        <section class="ptb-subpage-panel" data-holiday-panel="settings">
          <div class="ptb-holiday-range">
            <div class="form-group">
              <label>起始日期 <span class="required">*</span></label>
              <input type="date" id="holiday-start-v2">
            </div>
            <div class="form-group">
              <label>結束日期 <span class="required">*</span></label>
              <input type="date" id="holiday-end-v2">
            </div>
          </div>
          <div class="form-group">
            <label>節日名稱 <span class="required">*</span></label>
            <select id="holiday-name-v2"></select>
          </div>
          <div style="color:#dc3545; font-size:14px; line-height:1.4; margin:4px 0 8px;">
            校慶、畢業典禮等特殊假日若仍需上班，請不要設定為假日。
          </div>
          <div class="ptb-list-card">
            <div class="ptb-list-title">目前已設定假日</div>
            <ul id="holiday-record-list-v2" class="ptb-record-list"></ul>
            <div id="holiday-record-pages-v2" class="ptb-page-controls"></div>
          </div>
        </section>

        <section class="ptb-subpage-panel" data-holiday-panel="names" hidden>
          <div class="form-group">
            <label>新增節日 <span class="required">*</span></label>
            <div class="ptb-inline-form">
              <input type="text" id="holiday-name-new-v2" placeholder="例如：國慶日、中秋節、校定假日">
              <button type="button" id="holiday-name-save-v2" class="btn-primary">儲存節日</button>
            </div>
          </div>
          <div class="ptb-list-card">
            <div class="ptb-list-title">目前記錄的節日</div>
            <ul id="holiday-name-list-v2" class="ptb-record-list"></ul>
            <div id="holiday-name-pages-v2" class="ptb-page-controls"></div>
          </div>
        </section>
      </div>
      <div class="modal-footer">
        <button type="button" id="holiday-save-v2" class="btn-primary">儲存假日</button>
        <button type="button" id="holiday-close-v2" class="btn-secondary">退出</button>
      </div>
    </div>
  `;
  root.appendChild(modal);

  modal.querySelectorAll('[data-holiday-page]').forEach(button => {
    button.addEventListener('click', () => setHolidayPage(root, button.dataset.holidayPage));
  });

  const startInput = modal.querySelector('#holiday-start-v2');
  const endInput = modal.querySelector('#holiday-end-v2');
  startInput.addEventListener('change', () => {
    if (!endInput.value) endInput.value = startInput.value;
  });

  modal.querySelector('#holiday-save-v2').addEventListener('click', () => saveHolidayRange(root));
  modal.querySelector('#holiday-name-save-v2').addEventListener('click', () => saveHolidayMasterName(root));
  modal.querySelector('#holiday-close-v2').addEventListener('click', () => closeHolidayModalV2(root));
}

function openHolidayModalV2(root) {
  const before = getHolidayNames().length;
  ensureHolidayNamesFromExistingCalendarHolidays();

  holidayRecordPage = 1;
  holidayNamePage = 1;
  setHolidayPage(root, 'settings');

  const modal = root.querySelector('#holiday-modal-v2');
  modal.querySelector('#holiday-start-v2').value = '';
  modal.querySelector('#holiday-end-v2').value = '';
  modal.querySelector('#holiday-name-new-v2').value = '';
  populateHolidayNameSelectV2(root);
  renderHolidayRecordListV2(root);
  renderHolidayNameListV2(root);
  modal.style.display = 'flex';
}

function closeHolidayModalV2(root) {
  const modal = root.querySelector('#holiday-modal-v2');
  if (modal) modal.style.display = 'none';
}

function setHolidayPage(root, page) {
  holidayPage = page === 'names' ? 'names' : 'settings';
  const modal = root.querySelector('#holiday-modal-v2');
  if (!modal) return;

  modal.querySelectorAll('[data-holiday-page]').forEach(button => {
    button.classList.toggle('active', button.dataset.holidayPage === holidayPage);
  });
  modal.querySelectorAll('[data-holiday-panel]').forEach(panel => {
    panel.hidden = panel.dataset.holidayPanel !== holidayPage;
  });

  const saveHolidayButton = modal.querySelector('#holiday-save-v2');
  if (saveHolidayButton) saveHolidayButton.style.display = holidayPage === 'settings' ? '' : 'none';

  if (holidayPage === 'settings') {
    populateHolidayNameSelectV2(root);
    renderHolidayRecordListV2(root);
  } else {
    renderHolidayNameListV2(root);
  }
}

function populateHolidayNameSelectV2(root) {
  const select = root.querySelector('#holiday-name-v2');
  if (!select) return;

  const selected = select.value;
  const names = getHolidayNames()
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'));

  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = names.length > 0 ? '請選擇節日名稱' : '請先到「新增節日」建立節日名稱';
  select.appendChild(placeholder);

  names.forEach(item => {
    const option = document.createElement('option');
    option.value = item.name;
    option.textContent = item.name;
    select.appendChild(option);
  });

  select.value = names.some(item => item.name === selected) ? selected : '';
}

async function saveHolidayRange(root) {
  const start = valueOf(root, '#holiday-start-v2');
  const end = valueOf(root, '#holiday-end-v2') || start;
  const name = valueOf(root, '#holiday-name-v2').trim();

  if (!start || !end || !name) {
    showToast('請填寫起始日期、結束日期與節日名稱', 'error');
    return;
  }
  if (start > end) {
    showToast('起始日期不可大於結束日期', 'error');
    return;
  }

  const existingDates = new Set(getCalendarHolidays().map(item => item.date));
  const dates = getDatesInRange(start, end);
  let added = 0;
  let skipped = 0;

  const writes = [];
  dates.forEach(date => {
    if (existingDates.has(date)) {
      skipped += 1;
      return;
    }
    writes.push(saveCalendarHoliday({ date, name }));
  });
  try { const saved=await runWithMutationUiLock(root.querySelector('#holiday-save-v2'),()=>Promise.all(writes),{blocking:true}); added=saved.filter(Boolean).length; } catch { return; }

  if (added === 0) {
    showToast('所選日期皆已設定假日', 'error');
    return;
  }

  const modal = root.querySelector('#holiday-modal-v2');
  modal.querySelector('#holiday-start-v2').value = '';
  modal.querySelector('#holiday-end-v2').value = '';
  holidayRecordPage = 1;
  renderHolidayRecordListV2(root);
  renderCalendarTable();

  const suffix = skipped > 0 ? `，略過 ${skipped} 個已設定日期` : '';
  showToast(`假日設定已儲存（新增 ${added} 天${suffix}）`);
}

async function saveHolidayMasterName(root) {
  const input = root.querySelector('#holiday-name-new-v2');
  const name = input ? input.value.trim() : '';
  if (!name) {
    showToast('節日名稱不可空白', 'error');
    return;
  }

  let saved;
  try {
    saved = await runWithMutationUiLock(root.querySelector('#holiday-name-save-v2'),()=>saveHolidayName({ name }));
  } catch (error) {
    showToast(error && error.message ? error.message : '節日儲存失敗', 'error');
    return;
  }

  input.value = '';
  input.focus();
  holidayNamePage = 1;
  populateHolidayNameSelectV2(root);
  renderHolidayNameListV2(root);
  showToast('節日已儲存');
}

function renderHolidayRecordListV2(root) {
  const list = root.querySelector('#holiday-record-list-v2');
  const controls = root.querySelector('#holiday-record-pages-v2');
  if (!list || !controls) return;

  const records = getCalendarHolidays()
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const pageData = paginate(records, holidayRecordPage);
  holidayRecordPage = pageData.page;

  list.innerHTML = '';
  if (pageData.items.length === 0) {
    list.innerHTML = '<li><span style="color:#888;">目前無假日設定</span></li>';
  } else {
    pageData.items.forEach(record => {
      const item = document.createElement('li');
      item.innerHTML = `
        <span class="ptb-record-main">${escapeHtml(formatDateForDisplay(record.date))}　${escapeHtml(record.name)}</span>
        <button type="button" class="ptb-delete-link" title="刪除">×</button>
      `;
      item.querySelector('button').addEventListener('click', async () => {
        if (!confirm(`確定刪除 ${formatDateForDisplay(record.date)}「${record.name}」的假日設定？`)) return;
        try { await runWithMutationUiLock(item.querySelector('button'),()=>deleteCalendarHoliday(record.id)); } catch { return; }
        renderHolidayRecordListV2(root);
        renderCalendarTable();
        showToast('假日設定已刪除');
      });
      list.appendChild(item);
    });
  }

  renderPageControls(controls, pageData, page => {
    holidayRecordPage = page;
    renderHolidayRecordListV2(root);
  });
}

function renderHolidayNameListV2(root) {
  const list = root.querySelector('#holiday-name-list-v2');
  const controls = root.querySelector('#holiday-name-pages-v2');
  if (!list || !controls) return;

  const names = getHolidayNames()
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'));
  const pageData = paginate(names, holidayNamePage);
  holidayNamePage = pageData.page;

  list.innerHTML = '';
  if (pageData.items.length === 0) {
    list.innerHTML = '<li><span style="color:#888;">目前無節日紀錄</span></li>';
  } else {
    pageData.items.forEach(record => {
      const item = document.createElement('li');
      item.innerHTML = `
        <span class="ptb-record-main">${escapeHtml(record.name)}</span>
        <button type="button" class="ptb-delete-link" title="刪除">×</button>
      `;
      item.querySelector('button').addEventListener('click', async () => {
        if (isHolidayNameUsed(record.name)) {
          showToast('此節日已被假日紀錄使用，請先移除相關假日設定再刪除', 'error');
          return;
        }
        if (!confirm(`確定刪除節日名稱「${record.name}」？`)) return;

        try {
          await runWithMutationUiLock(item.querySelector('button'),()=>deleteHolidayName(record.id));
        } catch (error) {
          showToast(error && error.message ? error.message : '節日刪除失敗', 'error');
          return;
        }

        populateHolidayNameSelectV2(root);
        renderHolidayNameListV2(root);
        showToast('節日名稱已刪除');
      });
      list.appendChild(item);
    });
  }

  renderPageControls(controls, pageData, page => {
    holidayNamePage = page;
    renderHolidayNameListV2(root);
  });
}

function paginate(items, requestedPage) {
  const totalPages = Math.max(1, Math.ceil(items.length / HOLIDAY_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * HOLIDAY_PAGE_SIZE;
  return {
    items: items.slice(start, start + HOLIDAY_PAGE_SIZE),
    page,
    totalPages,
    total: items.length
  };
}

function renderPageControls(container, pageData, onPageChange) {
  container.innerHTML = '';
  if (pageData.totalPages <= 1) return;

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'btn-secondary';
  previous.textContent = '上一頁';
  previous.disabled = pageData.page <= 1;
  previous.addEventListener('click', () => onPageChange(pageData.page - 1));

  const label = document.createElement('span');
  label.textContent = `${pageData.page} / ${pageData.totalPages}`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn-secondary';
  next.textContent = '下一頁';
  next.disabled = pageData.page >= pageData.totalPages;
  next.addEventListener('click', () => onPageChange(pageData.page + 1));

  container.append(previous, label, next);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
