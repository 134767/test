// js/budgetPage.js
import { getBudgets, saveBudget, deleteBudgets, getUnits } from './dataStore.js?v=1.6.0-mutation-hotfix-1';
import { formatNumber, showToast } from './utils.js?v=1.6.0-mutation-hotfix-1';
import { normalizeBudgetRecord, normalizeBudgetUnitCodes, validateRocAcademicYear } from './budgetGroupUtils.js?v=1.6.0-mutation-hotfix-1';
import { runWithMutationUiLock } from './mutationUi.js?v=1.6.0-mutation-hotfix-1';

let currentEditingId = null;
let containerEl = null;
let selectedUnitCodes = [];

export function initBudgetPage(container) {
  containerEl = container;
  container.innerHTML = `
    <div class="page-header"><h2>預算設定</h2><div class="toolbar"><button id="btn-add-budget" class="btn-primary">新增預算</button><button id="btn-delete-budget" class="btn-danger">刪除</button></div></div>
    <div class="table-wrapper"><table class="data-table" id="budget-table"><thead><tr><th style="width:42px"><input type="checkbox" id="budget-all-check"></th><th>學年度</th><th>單位名稱</th><th>單位群組</th><th>預算金額</th><th>備註</th><th style="width:80px">操作</th></tr></thead><tbody id="budget-tbody"></tbody></table></div>
    <div id="budget-modal" class="modal"><div class="modal-content"><div class="modal-header"><h3 id="budget-modal-title">新增預算</h3></div><div class="modal-body">
      <div class="form-group"><label>學年度 <span class="required">*</span></label><input type="text" id="budget-academicYear" placeholder="例如 114" maxlength="10"></div>
      <div class="form-group"><label>單位名稱 <span class="required">*</span></label><input type="text" id="budget-name" placeholder="例如 公博流通"></div>
      <div class="form-group"><label>單位群組 <span class="required">*</span></label><div id="budget-unit-buttons" class="weekday-buttons budget-unit-buttons"></div></div>
      <div class="form-group"><label>預算金額 <span class="required">*</span></label><input type="text" id="budget-amount" placeholder="例如 5744800"></div>
      <div class="form-group"><label>備註</label><textarea id="budget-note" rows="3" placeholder="可選填"></textarea></div>
    </div><div class="modal-footer"><button id="budget-save-btn" class="btn-primary">儲存</button><button id="budget-cancel-btn" class="btn-secondary">取消</button></div></div></div>`;
  bindBudgetEvents();
  renderBudgetTable();
}

function bindBudgetEvents() {
  containerEl.querySelector('#btn-add-budget').addEventListener('click', () => showBudgetModal());
  containerEl.querySelector('#btn-delete-budget').addEventListener('click', handleDeleteSelected);
  containerEl.querySelector('#budget-all-check').addEventListener('change', e => containerEl.querySelectorAll('#budget-tbody .row-check').forEach(b => b.checked = e.target.checked));
  containerEl.querySelector('#budget-save-btn').addEventListener('click', handleSaveBudget);
  containerEl.querySelector('#budget-cancel-btn').addEventListener('click', hideBudgetModal);
  containerEl.querySelector('#budget-modal').addEventListener('click', e => { if (e.target.id === 'budget-modal') hideBudgetModal(); });
}

function unitNameMap() { return new Map(getUnits().map(u => [u.unitCode, u.unitName || u.unitCode])); }
function displayUnitCodes(codes) { const m = unitNameMap(); return codes.map(c => escapeHtml(m.get(c) || c)).join('、'); }
function isLegacyBudget(b) { return !b.budgetName || normalizeBudgetUnitCodes(b.unitCodes).length === 0; }

export function renderBudgetTable() {
  if (!containerEl) return;
  const tbody = containerEl.querySelector('#budget-tbody');
  const data = getBudgets().map(normalizeBudgetRecord).sort((a,b)=>String(b.academicYear).localeCompare(String(a.academicYear),'zh-Hant'));
  tbody.innerHTML = '';
  data.forEach(item => {
    const legacy = isLegacyBudget(item);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input type="checkbox" class="row-check" data-id="${item.id}"></td><td>${escapeHtml(item.academicYear)}</td><td>${legacy ? '待補設定' : escapeHtml(item.budgetName)}</td><td>${legacy ? '待補設定' : displayUnitCodes(item.unitCodes)}</td><td style="text-align:right">${formatNumber(item.budgetAmount)}</td><td>${escapeHtml(item.note)}</td><td><button class="btn-edit" data-id="${item.id}">編輯</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', () => showBudgetModal(getBudgets().find(b => b.id === btn.dataset.id))));
  containerEl.querySelector('#budget-all-check').checked = false;
}

function renderUnitButtons(codes=[]) {
  selectedUnitCodes = normalizeBudgetUnitCodes(codes);
  const wrap = containerEl.querySelector('#budget-unit-buttons');
  wrap.innerHTML = '';
  getUnits().forEach(u => {
    const btn = document.createElement('button'); btn.type='button'; btn.className='weekday-btn'; btn.dataset.unitCode=u.unitCode; btn.textContent=u.unitName || u.unitCode;
    if (selectedUnitCodes.includes(u.unitCode)) btn.classList.add('active');
    btn.addEventListener('click', () => { const c = u.unitCode; selectedUnitCodes = selectedUnitCodes.includes(c) ? selectedUnitCodes.filter(x=>x!==c) : [...selectedUnitCodes,c]; btn.classList.toggle('active'); });
    wrap.appendChild(btn);
  });
  if (!getUnits().length) wrap.innerHTML = '<div class="help-text">尚無單位設定</div>';
}

async function handleDeleteSelected() { const ids = Array.from(containerEl.querySelectorAll('#budget-tbody .row-check:checked')).map(c=>c.dataset.id); if(!ids.length) return showToast('請先勾選要刪除的資料','error'); if(confirm(`確定要刪除選取的 ${ids.length} 筆預算嗎？`)){ try { await runWithMutationUiLock(containerEl.querySelector('#btn-delete-budget'),()=>deleteBudgets(ids)); showToast('刪除成功'); renderBudgetTable(); } catch {} } }
function showBudgetModal(item=null) {
  const b = normalizeBudgetRecord(item||{});
  const ayInput = containerEl.querySelector('#budget-academicYear');
  currentEditingId = item ? item.id : null;
  containerEl.querySelector('#budget-modal-title').textContent = item ? '編輯預算' : '新增預算';
  ayInput.value = b.academicYear;
  ayInput.disabled = !!item;
  containerEl.querySelector('#budget-name').value = b.budgetName;
  containerEl.querySelector('#budget-amount').value = item ? b.budgetAmount : '';
  containerEl.querySelector('#budget-note').value = b.note;
  renderUnitButtons(b.unitCodes);
  containerEl.querySelector('#budget-modal').style.display='flex';
  ayInput.focus();
}
function hideBudgetModal(){ containerEl.querySelector('#budget-modal').style.display='none'; containerEl.querySelector('#budget-academicYear').disabled=false; currentEditingId=null; selectedUnitCodes=[]; }

async function handleSaveBudget() {
  const ay = containerEl.querySelector('#budget-academicYear').value.trim(); const name = containerEl.querySelector('#budget-name').value.trim(); const amtStr = containerEl.querySelector('#budget-amount').value.trim(); const note = containerEl.querySelector('#budget-note').value.trim(); const amount = Number(amtStr); const codes = normalizeBudgetUnitCodes(selectedUnitCodes);
  if (!validateRocAcademicYear(ay)) return showToast('學年度必須為正整數（例如 114）','error');
  if (!name) return showToast('單位名稱不可空白','error');
  if (!codes.length) return showToast('請至少選擇一個實際單位','error');
  if (!amtStr || !Number.isFinite(amount) || amount < 0) return showToast('預算金額必須為有效且不小於零的數字','error');
  const units = unitNameMap();
  for (const b0 of getBudgets().map(normalizeBudgetRecord)) {
    if (b0.id === currentEditingId || String(b0.academicYear) !== ay) continue;
    if (b0.budgetName === name) return showToast(`${ay} 學年度已存在「${name}」預算。`, 'error');
    for (const c of codes) if (b0.unitCodes.includes(c)) return showToast(`單位「${units.get(c)||c}」已屬於 ${ay} 學年度的「${b0.budgetName}」。`, 'error');
  }
  const wasEditing = Boolean(currentEditingId);
  try {
    await runWithMutationUiLock([containerEl.querySelector('#budget-save-btn'),containerEl.querySelector('#budget-cancel-btn')],()=>saveBudget({ id: currentEditingId, academicYear: ay, budgetName: name, unitCodes: codes, budgetAmount: amount, note }));
    renderBudgetTable(); hideBudgetModal(); showToast(wasEditing ? '更新成功' : '新增成功');
  } catch {}
}
function escapeHtml(str){ return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
