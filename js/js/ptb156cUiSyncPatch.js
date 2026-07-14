// 工讀金 1.6.0：GitHub/GAS 共用 UI 文案與跨來源 iframe 日期選擇器相容補丁。

const PLACEHOLDER_OVERRIDES = Object.freeze({
  '#unit-code': '01',
  '#unit-name': 'xx組',
  '#fe-name': '調薪後評估',
  '#budget-academicYear': '109',
  '#budget-amount': '999999'
});

const FORECAST_ANALYSIS_NOTE = '響應式版面。查詢結果僅供分析，不會寫回任何資料。';

export function installPtb156cUiSyncPatch() {
  injectUiSyncStyles();

  const main = document.getElementById('main-content');
  if (!main) return;

  const scan = () => {
    applySharedUiCopy(main);
    prepareNativeDatePickers(main);
    patchHolidayRangeDateFields(main);
  };

  new MutationObserver(scan).observe(main, {
    childList: true,
    subtree: true
  });

  scan();
}

function injectUiSyncStyles() {
  if (document.getElementById('ptb-156c-ui-sync-styles')) return;

  const style = document.createElement('style');
  style.id = 'ptb-156c-ui-sync-styles';
  style.textContent = `
    /* Apps Script HTML Service 位於跨來源 iframe。
       讓使用者實際點擊原生 date input，不再依賴受限制的 showPicker()。 */
    .date-input-wrap {
      position: relative;
    }
    .date-picker-btn {
      min-width: 42px;
      pointer-events: none;
      user-select: none;
    }
    .date-native-input {
      position: absolute;
      top: 0;
      right: 0;
      bottom: auto;
      width: 42px;
      height: 100%;
      min-height: 34px;
      margin: 0;
      padding: 0;
      border: 0;
      opacity: 0;
      pointer-events: auto;
      cursor: pointer;
      z-index: 3;
    }
    #holiday-modal-v2 .ptb-holiday-range .form-group {
      margin-bottom: 0;
    }
    #holiday-modal-v2 .date-input-wrap {
      width: 100%;
    }
  `;
  document.head.appendChild(style);
}

function applySharedUiCopy(main) {
  main.querySelectorAll('p').forEach(element => {
    if (element.textContent.trim() === FORECAST_ANALYSIS_NOTE) {
      element.remove();
    }
  });

  Object.entries(PLACEHOLDER_OVERRIDES).forEach(([selector, placeholder]) => {
    const field = main.querySelector(selector);
    if (field && field.placeholder !== placeholder) {
      field.placeholder = placeholder;
    }
  });
}

function prepareNativeDatePickers(main) {
  main.querySelectorAll('.date-input-wrap').forEach(wrap => {
    const button = wrap.querySelector('.date-picker-btn');
    const nativeInput = wrap.querySelector('.date-native-input');
    if (!button || !nativeInput) return;

    button.tabIndex = -1;
    button.setAttribute('aria-hidden', 'true');
    nativeInput.setAttribute('title', button.title || '選擇日期');
    if (!nativeInput.getAttribute('aria-label')) {
      nativeInput.setAttribute('aria-label', button.title || '選擇日期');
    }
  });
}

function patchHolidayRangeDateFields(main) {
  const modal = main.querySelector('#holiday-modal-v2');
  if (!modal || modal.dataset.ptb156cDatePatched === 'true') return;

  const startNative = modal.querySelector('#holiday-start-v2');
  const endNative = modal.querySelector('#holiday-end-v2');
  if (!startNative || !endNative) return;

  modal.dataset.ptb156cDatePatched = 'true';

  const startText = wrapHolidayDateInput(startNative, 'holiday-start-v2-text', '選擇起始日期');
  const endText = wrapHolidayDateInput(endNative, 'holiday-end-v2-text', '選擇結束日期');

  const syncStart = () => {
    syncTextFromNative(startNative, startText);
    setTimeout(() => syncTextFromNative(endNative, endText), 0);
  };
  const syncEnd = () => syncTextFromNative(endNative, endText);

  startNative.addEventListener('change', syncStart);
  endNative.addEventListener('change', syncEnd);
  bindManualDateInput(startText, startNative);
  bindManualDateInput(endText, endNative);

  const saveButton = modal.querySelector('#holiday-save-v2');
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      setTimeout(() => {
        syncTextFromNative(startNative, startText);
        syncTextFromNative(endNative, endText);
      }, 0);
    });
  }

  new MutationObserver(() => {
    if (modal.style.display === 'flex') {
      syncTextFromNative(startNative, startText);
      syncTextFromNative(endNative, endText);
    }
  }).observe(modal, { attributes: true, attributeFilter: ['style'] });

  syncStart();
  syncEnd();
  prepareNativeDatePickers(modal);
}

function wrapHolidayDateInput(nativeInput, textId, title) {
  nativeInput.classList.add('date-native-input');
  nativeInput.setAttribute('aria-label', title);

  const wrap = document.createElement('div');
  wrap.className = 'date-input-wrap';

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.id = textId;
  textInput.className = 'date-text-input';
  textInput.placeholder = 'yyyy/mm/dd';
  textInput.inputMode = 'numeric';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'date-picker-btn';
  button.title = title;
  button.textContent = '📅';

  nativeInput.parentNode.insertBefore(wrap, nativeInput);
  wrap.append(textInput, button, nativeInput);
  return textInput;
}

function bindManualDateInput(textInput, nativeInput) {
  const commit = () => {
    const normalized = normalizeDateValue(textInput.value);
    if (!normalized) {
      if (!textInput.value.trim()) nativeInput.value = '';
      return;
    }

    nativeInput.value = normalized;
    textInput.value = formatManualDate(normalized);
    nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
  };

  textInput.addEventListener('blur', commit);
  textInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  });
}

function syncTextFromNative(nativeInput, textInput) {
  textInput.value = nativeInput.value ? formatManualDate(nativeInput.value) : '';
}

function normalizeDateValue(value) {
  const source = String(value || '').trim().replace(/\//g, '-');
  const parts = source.split('-');
  if (parts.length !== 3) return '';

  const year = parts[0].padStart(4, '0');
  const month = parts[1].padStart(2, '0');
  const day = parts[2].padStart(2, '0');
  const normalized = `${year}-${month}-${day}`;
  const date = new Date(`${normalized}T00:00:00`);

  if (Number.isNaN(date.getTime())) return '';
  if (date.getFullYear() !== Number(year) ||
      date.getMonth() + 1 !== Number(month) ||
      date.getDate() !== Number(day)) {
    return '';
  }

  return normalized;
}

function formatManualDate(value) {
  const parts = String(value || '').split('-');
  return parts.length === 3 ? `${parts[0]}/${parts[1]}/${parts[2]}` : value;
}
