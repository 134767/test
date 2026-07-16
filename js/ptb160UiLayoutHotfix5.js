// PTB 1.6.0 hotfix-5：統一「預算單位」文案，並簡化行事曆查詢操作。

let calendarGoogleViewsPromise = null;
let calendarGoogleDayListPromise = null;

function setFieldLabel(root, selector, text) {
  const field = root.querySelector(selector);
  const group = field?.closest('.form-group, .query-field');
  const label = group?.querySelector('label');
  if (!label) return;

  const required = label.querySelector('.required');
  if (!required) {
    if (label.textContent.trim() !== text) label.textContent = text;
    return;
  }

  const desiredText = `${text} `;
  const directText = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
  if (directText && directText.nodeValue !== desiredText) directText.nodeValue = desiredText;
  else if (!directText) label.insertBefore(document.createTextNode(desiredText), required);
}

function replaceBudgetTerminology(root) {
  if (!root) return;

  setFieldLabel(root, '#hour-budget-group', '預算單位');
  setFieldLabel(root, '#salary-budget-name', '預算單位');
  setFieldLabel(root, '#cal-filter-budget-group', '預算單位');

  root.querySelectorAll('option[value=""]').forEach(option => {
    if (option.closest('#page-differenceForecast')) return;
    const text = option.textContent.trim();
    if (text === '請選擇群組' || text === '請選擇預算群組') {
      option.textContent = '請選擇預算單位';
    } else if (text === '請先選擇群組' || text === '請先選擇預算群組') {
      option.textContent = '請先選擇預算單位';
    }
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach(node => {
    const parent = node.parentElement;
    if (!parent) return;
    if (parent.closest('#page-differenceForecast')) return;
    if (parent.closest('tbody')) return;
    if (parent.matches('option') && parent.value) return;

    let next = node.nodeValue || '';
    next = next.replaceAll('預算群組', '預算單位');
    if (next.trim() === '請選擇群組') next = next.replace('請選擇群組', '請選擇預算單位');
    if (next.trim() === '請先選擇群組') next = next.replace('請先選擇群組', '請先選擇預算單位');
    if (next !== node.nodeValue) node.nodeValue = next;
  });
}

function selectFirstCalendarAcademicYear(root) {
  const mode = root.querySelector('#cal-filter-mode');
  const year = root.querySelector('#cal-filter-year');
  if (!mode || !year) return;

  if (mode.value !== 'academicYear') {
    mode.value = 'academicYear';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const firstYear = Array.from(year.options).find(option => option.value);
  if (firstYear && year.value !== firstYear.value) {
    year.value = firstYear.value;
    year.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function enhanceCalendarBudgetFlow(root) {
  const budget = root?.querySelector('#cal-filter-budget-group');
  if (!budget || budget.dataset.autoYearBound === 'true') return;
  budget.dataset.autoYearBound = 'true';

  budget.addEventListener('change', () => {
    if (!budget.value) return;
    // 讓 calendarPage 原本的 change handler 先完成年度選單重建，再帶入預設值。
    setTimeout(() => {
      selectFirstCalendarAcademicYear(root);
      replaceBudgetTerminology(root);
    }, 0);
  });
}

function ensureCalendarWeekVerticalStyles() {
  const id = 'ptb-calendar-google-week-vertical-css';
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = new URL(
    '../css/calendarGoogleWeekVertical.css?v=1.6.0-calendar-google-views-hotfix-2',
    import.meta.url
  ).href;
  document.head.appendChild(link);
}

function requestCalendarGoogleViews(root) {
  if (!root || root.dataset.calendarGoogleViewsRequested === 'true') return;
  if (!root.querySelector('#calendar-table-wrap')) return;

  root.dataset.calendarGoogleViewsRequested = 'true';
  ensureCalendarWeekVerticalStyles();
  calendarGoogleViewsPromise ||= import(
    './calendarGoogleViews.js?v=1.6.0-calendar-google-views-hotfix-1'
  );
  calendarGoogleDayListPromise ||= import(
    './calendarGoogleDayListView.js?v=1.6.0-calendar-google-views-hotfix-3'
  );

  calendarGoogleViewsPromise
    .then(module => {
      module.installCalendarGoogleViews(root);
      return calendarGoogleDayListPromise;
    })
    .then(module => module.installCalendarGoogleDayListView(root))
    .catch(error => {
      root.dataset.calendarGoogleViewsRequested = 'false';
      console.error('[行事曆] 日／週／月／年檢視載入失敗', error);
    });
}

export function installPtb160UiLayoutHotfix5() {
  const main = document.getElementById('main-content');
  if (!main || main.dataset.ptb160UiHotfix5 === 'true') return;
  main.dataset.ptb160UiHotfix5 = 'true';

  const scan = () => {
    replaceBudgetTerminology(main);
    const calendarRoot = main.querySelector('#page-calendar');
    enhanceCalendarBudgetFlow(calendarRoot);
    requestCalendarGoogleViews(calendarRoot);
  };

  new MutationObserver(scan).observe(main, {
    childList: true,
    subtree: true,
    characterData: true
  });
  scan();
}
