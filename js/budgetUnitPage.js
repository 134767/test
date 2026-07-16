// PTB 1.6.0：整合「預算設定」與「單位設定」為單一管理頁。
// 顯示層提供預算單位查詢、雙容器、每頁 10 筆與 Z-A 排序；
// 實際新增、編輯、刪除與驗證仍委派既有 budgetPage / unitPage 模組。

import { initBudgetPage, renderBudgetTable } from './budgetPage.js?v=1.6.0-salary-summary-cards-hotfix-12';
import { initUnitPage, renderUnitTable } from './unitPage.js?v=1.6.0-salary-summary-cards-hotfix-12';
import { getBudgets, getUnits } from './dataStore.js?v=1.6.0-salary-summary-cards-hotfix-12';
import { formatNumber } from './utils.js?v=1.6.0-salary-summary-cards-hotfix-12';
import {
  normalizeBudgetRecord,
  normalizeBudgetUnitCodes
} from './budgetGroupUtils.js?v=1.6.0-salary-summary-cards-hotfix-12';
import { diagnoseBudgetDuplicateGroups } from './hourBudgetScopeUtils.js?v=1.6.0-salary-summary-cards-hotfix-12';

const PAGE_SIZE = 10;
let state = null;

export function initBudgetUnitPage(container) {
  state = {
    container,
    selectedBudgetName: '',
    queried: false,
    budgetPage: 1,
    unitPage: 1,
    renderQueued: false,
    observers: []
  };

  container.innerHTML = `
    <div class="page-header ptb-budget-unit-header">
      <h2>預算與單位</h2>
      <div class="toolbar">
        <button type="button" id="btn-integrated-add-unit" class="btn-primary">新增單位</button>
        <button type="button" id="btn-integrated-add-budget" class="btn-primary">新增預算</button>
      </div>
    </div>

    <div class="query-panel ptb-budget-unit-query-panel">
      <div class="query-row">
        <div class="query-field">
          <label for="budget-unit-filter">預算單位</label>
          <select id="budget-unit-filter">
            <option value="">請選擇預算單位</option>
          </select>
        </div>
        <div class="query-actions">
          <button type="button" id="budget-unit-query" class="btn-primary" disabled>查詢</button>
        </div>
      </div>
      <div id="budget-unit-query-summary" class="cal-query-summary" style="display:none"></div>
    </div>

    <section class="ptb-budget-unit-card" aria-labelledby="integrated-budget-title">
      <header class="ptb-budget-unit-card-header">
        <div>
          <h3 id="integrated-budget-title">預算設定</h3>
          <p>目前預算單位的預算資料｜Z–A 排序｜每頁最多 10 筆</p>
        </div>
        <button type="button" id="btn-integrated-delete-budget" class="btn-danger" disabled>刪除選取</button>
      </header>
      <div id="integrated-budget-warning" class="budget-duplicate-warning" role="alert" hidden></div>
      <div id="integrated-budget-empty" class="ptb-budget-unit-empty">
        請選擇預算單位並按「查詢」。
      </div>
      <div id="integrated-budget-results" hidden>
        <div class="table-wrapper">
          <table class="data-table" id="integrated-budget-table">
            <thead>
              <tr>
                <th style="width:42px"><input type="checkbox" id="integrated-budget-all-check" aria-label="選取本頁全部預算"></th>
                <th>學年度</th>
                <th>單位名稱</th>
                <th>單位群組</th>
                <th>預算金額</th>
                <th>備註</th>
                <th style="width:80px">操作</th>
              </tr>
            </thead>
            <tbody id="integrated-budget-tbody"></tbody>
          </table>
        </div>
        <div class="ptb-budget-unit-pagination" data-pagination="budget">
          <button type="button" class="btn-secondary" data-page-action="previous">上一頁</button>
          <span data-page-status></span>
          <button type="button" class="btn-secondary" data-page-action="next">下一頁</button>
        </div>
      </div>
    </section>

    <section class="ptb-budget-unit-card" aria-labelledby="integrated-unit-title">
      <header class="ptb-budget-unit-card-header">
        <div>
          <h3 id="integrated-unit-title">單位設定</h3>
          <p>目前預算單位涵蓋的實際單位｜Z–A 排序｜每頁最多 10 筆</p>
        </div>
        <button type="button" id="btn-integrated-delete-unit" class="btn-danger" disabled>刪除選取</button>
      </header>
      <div id="integrated-unit-empty" class="ptb-budget-unit-empty">
        請選擇預算單位並按「查詢」。
      </div>
      <div id="integrated-unit-results" hidden>
        <div class="table-wrapper">
          <table class="data-table" id="integrated-unit-table">
            <thead>
              <tr>
                <th style="width:42px"><input type="checkbox" id="integrated-unit-all-check" aria-label="選取本頁全部單位"></th>
                <th>代碼</th>
                <th>單位</th>
                <th>顏色</th>
                <th>備註</th>
                <th style="width:80px">操作</th>
              </tr>
            </thead>
            <tbody id="integrated-unit-tbody"></tbody>
          </table>
        </div>
        <div class="ptb-budget-unit-pagination" data-pagination="unit">
          <button type="button" class="btn-secondary" data-page-action="previous">上一頁</button>
          <span data-page-status></span>
          <button type="button" class="btn-secondary" data-page-action="next">下一頁</button>
        </div>
      </div>
    </section>

    <div id="page-unit" class="ptb-budget-unit-source"></div>
    <div id="page-budget" class="ptb-budget-unit-source"></div>
  `;

  ensureStylesheet();

  state.unitSource = container.querySelector('#page-unit');
  state.budgetSource = container.querySelector('#page-budget');
  initUnitPage(state.unitSource);
  initBudgetPage(state.budgetSource);

  bindEvents();
  observeLegacySources();
  refreshBudgetUnitPage();
}

export function refreshBudgetUnitPage() {
  if (!state?.container) return;
  renderUnitTable();
  renderBudgetTable();
  refreshBudgetOptions();
  renderIntegratedResults();
}

function ensureStylesheet() {
  const id = 'ptb-budget-unit-integrated-css';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = new URL(
    '../css/budgetUnitPage.css?v=1.6.0-budget-unit-integrated-hotfix-1',
    import.meta.url
  ).href;
  document.head.appendChild(link);
}

function bindEvents() {
  const root = state.container;
  const filter = root.querySelector('#budget-unit-filter');
  const queryButton = root.querySelector('#budget-unit-query');

  filter.addEventListener('change', () => {
    state.queried = false;
    state.selectedBudgetName = '';
    state.budgetPage = 1;
    state.unitPage = 1;
    queryButton.disabled = !filter.value;
    hideQueryResults();
  });

  queryButton.addEventListener('click', () => {
    if (!filter.value) return;
    state.selectedBudgetName = filter.value;
    state.queried = true;
    state.budgetPage = 1;
    state.unitPage = 1;
    renderIntegratedResults();
  });

  root.querySelector('#btn-integrated-add-unit').addEventListener('click', () => {
    state.unitSource.querySelector('#btn-add-unit')?.click();
  });
  root.querySelector('#btn-integrated-add-budget').addEventListener('click', () => {
    state.budgetSource.querySelector('#btn-add-budget')?.click();
  });

  root.querySelector('#btn-integrated-delete-unit').addEventListener('click', () => {
    delegateDelete('unit');
  });
  root.querySelector('#btn-integrated-delete-budget').addEventListener('click', () => {
    delegateDelete('budget');
  });

  root.querySelector('#integrated-unit-all-check').addEventListener('change', event => {
    togglePageChecks('#integrated-unit-tbody', event.target.checked);
    updateDeleteButtons();
  });
  root.querySelector('#integrated-budget-all-check').addEventListener('change', event => {
    togglePageChecks('#integrated-budget-tbody', event.target.checked);
    updateDeleteButtons();
  });

  root.querySelectorAll('[data-pagination]').forEach(pagination => {
    pagination.querySelector('[data-page-action="previous"]').addEventListener('click', () => {
      changePage(pagination.dataset.pagination, -1);
    });
    pagination.querySelector('[data-page-action="next"]').addEventListener('click', () => {
      changePage(pagination.dataset.pagination, 1);
    });
  });
}

function observeLegacySources() {
  [state.unitSource, state.budgetSource].forEach(source => {
    const observer = new MutationObserver(queueRender);
    observer.observe(source, { childList: true, subtree: true, characterData: true });
    state.observers.push(observer);
  });
}

function queueRender() {
  if (!state || state.renderQueued) return;
  state.renderQueued = true;
  queueMicrotask(() => {
    state.renderQueued = false;
    refreshBudgetOptions();
    renderIntegratedResults();
  });
}

function refreshBudgetOptions() {
  const select = state.container.querySelector('#budget-unit-filter');
  const previous = select.value;
  const names = [...new Set(
    getBudgets()
      .map(normalizeBudgetRecord)
      .map(item => item.budgetName)
      .filter(Boolean)
  )].sort(sortTextDesc);

  select.replaceChildren(new Option('請選擇預算單位', ''));
  names.forEach(name => select.appendChild(new Option(name, name)));

  if (names.includes(previous)) {
    select.value = previous;
  } else if (state.selectedBudgetName && names.includes(state.selectedBudgetName)) {
    select.value = state.selectedBudgetName;
  } else if (state.selectedBudgetName) {
    state.selectedBudgetName = '';
    state.queried = false;
  }

  state.container.querySelector('#budget-unit-query').disabled = !select.value;
}

function hideQueryResults() {
  const root = state.container;
  root.querySelector('#budget-unit-query-summary').style.display = 'none';
  root.querySelector('#integrated-budget-results').hidden = true;
  root.querySelector('#integrated-unit-results').hidden = true;
  root.querySelector('#integrated-budget-empty').hidden = false;
  root.querySelector('#integrated-unit-empty').hidden = false;
  root.querySelector('#integrated-budget-empty').textContent = '請選擇預算單位並按「查詢」。';
  root.querySelector('#integrated-unit-empty').textContent = '請選擇預算單位並按「查詢」。';
  root.querySelector('#integrated-budget-warning').hidden = true;
  clearSelections();
}

function renderIntegratedResults() {
  if (!state?.container) return;
  if (!state.queried || !state.selectedBudgetName) {
    hideQueryResults();
    return;
  }

  const budgets = getFilteredBudgets();
  const units = getFilteredUnits(budgets);

  renderQuerySummary(budgets, units);
  renderBudgetSection(budgets);
  renderUnitSection(units);
  renderDuplicateWarning();
  updateDeleteButtons();
}

function getFilteredBudgets() {
  return getBudgets()
    .map(normalizeBudgetRecord)
    .filter(item => item.budgetName === state.selectedBudgetName)
    .sort((left, right) => {
      const nameCompare = sortTextDesc(left.budgetName, right.budgetName);
      if (nameCompare !== 0) return nameCompare;
      const yearCompare = Number(right.academicYear || 0) - Number(left.academicYear || 0);
      if (yearCompare !== 0) return yearCompare;
      return sortTextDesc(left.id, right.id);
    });
}

function getFilteredUnits(budgets) {
  const allowedCodes = new Set();
  budgets.forEach(item => {
    normalizeBudgetUnitCodes(item.unitCodes).forEach(code => allowedCodes.add(code));
  });

  return getUnits()
    .filter(item => allowedCodes.has(item.unitCode))
    .sort((left, right) => {
      const nameCompare = sortTextDesc(left.unitName || left.unitCode, right.unitName || right.unitCode);
      if (nameCompare !== 0) return nameCompare;
      return sortTextDesc(left.unitCode, right.unitCode);
    });
}

function renderQuerySummary(budgets, units) {
  const summary = state.container.querySelector('#budget-unit-query-summary');
  summary.textContent =
    `預算單位：${state.selectedBudgetName}｜預算資料：${budgets.length} 筆｜涵蓋單位：${units.length} 筆`;
  summary.style.display = 'block';
}

function renderBudgetSection(data) {
  const root = state.container;
  const results = root.querySelector('#integrated-budget-results');
  const empty = root.querySelector('#integrated-budget-empty');
  const tbody = root.querySelector('#integrated-budget-tbody');
  const pageInfo = paginate(data, state.budgetPage);
  state.budgetPage = pageInfo.page;

  tbody.replaceChildren();
  pageInfo.items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="row-check" data-id="${escapeHtml(item.id)}"></td>
      <td>${escapeHtml(item.academicYear)}</td>
      <td>${escapeHtml(item.budgetName)}</td>
      <td>${escapeHtml(displayUnitNames(item.unitCodes))}</td>
      <td class="numeric">${formatNumber(item.budgetAmount)}</td>
      <td>${escapeHtml(item.note)}</td>
      <td><button type="button" class="btn-edit" data-id="${escapeHtml(item.id)}">編輯</button></td>
    `;
    tbody.appendChild(tr);
  });

  bindVisibleRows(tbody, 'budget');
  root.querySelector('#integrated-budget-all-check').checked = false;
  results.hidden = data.length === 0;
  empty.hidden = data.length !== 0;
  empty.textContent = data.length ? '' : '目前預算單位沒有預算資料。';
  renderPagination('budget', pageInfo);
}

function renderUnitSection(data) {
  const root = state.container;
  const results = root.querySelector('#integrated-unit-results');
  const empty = root.querySelector('#integrated-unit-empty');
  const tbody = root.querySelector('#integrated-unit-tbody');
  const pageInfo = paginate(data, state.unitPage);
  state.unitPage = pageInfo.page;

  tbody.replaceChildren();
  pageInfo.items.forEach(item => {
    const tr = document.createElement('tr');
    const colorKey = item.colorKey || 'default';
    tr.innerHTML = `
      <td><input type="checkbox" class="row-check" data-id="${escapeHtml(item.id)}"></td>
      <td>${escapeHtml(item.unitCode)}</td>
      <td>${escapeHtml(item.unitName)}</td>
      <td><span class="ptb-unit-color-chip unit-color-${escapeHtml(colorKey)}">${escapeHtml(colorLabel(colorKey))}</span></td>
      <td>${escapeHtml(item.note || '')}</td>
      <td><button type="button" class="btn-edit" data-id="${escapeHtml(item.id)}">編輯</button></td>
    `;
    tbody.appendChild(tr);
  });

  bindVisibleRows(tbody, 'unit');
  root.querySelector('#integrated-unit-all-check').checked = false;
  results.hidden = data.length === 0;
  empty.hidden = data.length !== 0;
  empty.textContent = data.length ? '' : '目前預算單位尚未涵蓋任何單位。';
  renderPagination('unit', pageInfo);
}

function renderDuplicateWarning() {
  const warning = state.container.querySelector('#integrated-budget-warning');
  const duplicate = diagnoseBudgetDuplicateGroups(getBudgets())
    .filter(group => group.budgetName === state.selectedBudgetName);

  warning.hidden = duplicate.length === 0;
  warning.textContent = duplicate.length
    ? `偵測到「${state.selectedBudgetName}」存在同學年度重複預算資料，請保留正確資料並刪除其餘項目。`
    : '';
}

function bindVisibleRows(tbody, type) {
  tbody.querySelectorAll('.row-check').forEach(check => {
    check.addEventListener('change', updateDeleteButtons);
  });

  tbody.querySelectorAll('.btn-edit').forEach(button => {
    button.addEventListener('click', () => delegateEdit(type, button.dataset.id));
  });
}

function delegateEdit(type, id) {
  if (type === 'budget') {
    renderBudgetTable();
    findButton(state.budgetSource, '#budget-tbody .btn-edit', id)?.click();
  } else {
    renderUnitTable();
    findButton(state.unitSource, '#unit-tbody .btn-edit', id)?.click();
  }
}

function delegateDelete(type) {
  const integratedBody = state.container.querySelector(
    type === 'budget' ? '#integrated-budget-tbody' : '#integrated-unit-tbody'
  );
  const ids = [...integratedBody.querySelectorAll('.row-check:checked')].map(item => item.dataset.id);
  if (!ids.length) return;

  const source = type === 'budget' ? state.budgetSource : state.unitSource;
  if (type === 'budget') renderBudgetTable();
  else renderUnitTable();

  source.querySelectorAll('.row-check').forEach(check => {
    check.checked = ids.includes(check.dataset.id);
  });

  source.querySelector(type === 'budget' ? '#btn-delete-budget' : '#btn-delete-unit')?.click();
}

function findButton(source, selector, id) {
  return [...source.querySelectorAll(selector)].find(button => button.dataset.id === id) || null;
}

function togglePageChecks(tbodySelector, checked) {
  state.container.querySelectorAll(`${tbodySelector} .row-check`).forEach(item => {
    item.checked = checked;
  });
}

function updateDeleteButtons() {
  if (!state?.container) return;
  const budgetSelected = state.container.querySelectorAll('#integrated-budget-tbody .row-check:checked').length;
  const unitSelected = state.container.querySelectorAll('#integrated-unit-tbody .row-check:checked').length;
  state.container.querySelector('#btn-integrated-delete-budget').disabled = budgetSelected === 0;
  state.container.querySelector('#btn-integrated-delete-unit').disabled = unitSelected === 0;

  updateAllCheck('#integrated-budget-tbody', '#integrated-budget-all-check');
  updateAllCheck('#integrated-unit-tbody', '#integrated-unit-all-check');
}

function updateAllCheck(bodySelector, allSelector) {
  const checks = [...state.container.querySelectorAll(`${bodySelector} .row-check`)];
  const all = state.container.querySelector(allSelector);
  all.checked = checks.length > 0 && checks.every(item => item.checked);
  all.indeterminate = checks.some(item => item.checked) && !checks.every(item => item.checked);
}

function clearSelections() {
  state.container.querySelectorAll('#integrated-budget-tbody .row-check, #integrated-unit-tbody .row-check')
    .forEach(item => { item.checked = false; });
  updateDeleteButtons();
}

function changePage(type, direction) {
  if (!state.queried) return;
  const budgets = getFilteredBudgets();
  const units = getFilteredUnits(budgets);
  const data = type === 'budget' ? budgets : units;
  const pageCount = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const key = type === 'budget' ? 'budgetPage' : 'unitPage';
  state[key] = Math.min(pageCount, Math.max(1, state[key] + direction));
  if (type === 'budget') renderBudgetSection(data);
  else renderUnitSection(data);
  updateDeleteButtons();
}

function renderPagination(type, pageInfo) {
  const pagination = state.container.querySelector(`[data-pagination="${type}"]`);
  pagination.querySelector('[data-page-status]').textContent =
    `第 ${pageInfo.page} / ${pageInfo.pageCount} 頁｜共 ${pageInfo.total} 筆`;
  pagination.querySelector('[data-page-action="previous"]').disabled = pageInfo.page <= 1;
  pagination.querySelector('[data-page-action="next"]').disabled = pageInfo.page >= pageInfo.pageCount;
}

function paginate(data, requestedPage) {
  const total = data.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, requestedPage));
  const start = (page - 1) * PAGE_SIZE;
  return {
    total,
    page,
    pageCount,
    items: data.slice(start, start + PAGE_SIZE)
  };
}

function displayUnitNames(codes) {
  const map = new Map(getUnits().map(item => [item.unitCode, item.unitName || item.unitCode]));
  return normalizeBudgetUnitCodes(codes).map(code => map.get(code) || code).join('、');
}

function sortTextDesc(left, right) {
  return String(right || '').localeCompare(String(left || ''), 'zh-Hant', {
    numeric: true,
    sensitivity: 'base'
  });
}

function colorLabel(value) {
  return ({
    default: '預設',
    blue: '藍',
    green: '綠',
    orange: '橘',
    purple: '紫',
    red: '紅',
    gray: '灰'
  })[value] || value;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
