// js/unitPage.js
import {
  getUnits,
  saveUnit,
  deleteUnits,
  isUnitUsed,
  moveUnitOrder
} from './dataStore.js?v=1.6.0-mutation-hotfix-1';
import { showToast } from './utils.js?v=1.6.0-mutation-hotfix-1';
import { runWithMutationUiLock } from './mutationUi.js?v=1.6.0-mutation-hotfix-1';

let containerEl = null;
let currentEditingId = null;

export function initUnitPage(container) {
  containerEl = container;
  container.innerHTML = `
    <div class="page-header">
      <h2>單位設定</h2>
      <div class="toolbar">
        <button id="btn-add-unit" class="btn-primary">新增單位</button>
        <button id="btn-delete-unit" class="btn-danger">刪除</button>
      </div>
    </div>
    <div class="table-wrapper">
      <table class="data-table" id="unit-table">
        <thead>
          <tr>
            <th style="width:42px"><input type="checkbox" id="unit-all-check"></th>
            <th style="width:92px">排序</th>
            <th>代碼</th>
            <th>單位</th>
            <th>備註</th>
            <th style="width:80px">操作</th>
          </tr>
        </thead>
        <tbody id="unit-tbody"></tbody>
      </table>
    </div>

    <div id="unit-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="unit-modal-title">新增單位</h3>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>代碼 <span class="required">*</span></label>
            <input type="text" id="unit-code" placeholder="例如 AB_1" maxlength="20">
          </div>
          <div class="form-group">
            <label>單位 <span class="required">*</span></label>
            <input type="text" id="unit-name" placeholder="例如 公博流通">
          </div>
          <div class="form-group">
            <label>顏色</label>
            <select id="unit-color">
              <option value="default">預設</option>
              <option value="blue">藍</option>
              <option value="green">綠</option>
              <option value="orange">橘</option>
              <option value="purple">紫</option>
              <option value="red">紅</option>
              <option value="gray">灰</option>
            </select>
          </div>
          <div class="form-group">
            <label>備註</label>
            <textarea id="unit-note" rows="3"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button id="unit-save-btn" class="btn-primary">儲存</button>
          <button id="unit-cancel-btn" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>
  `;

  bindUnitEvents();
  renderUnitTable();
}

function bindUnitEvents() {
  const addBtn = containerEl.querySelector('#btn-add-unit');
  const delBtn = containerEl.querySelector('#btn-delete-unit');
  const allCheck = containerEl.querySelector('#unit-all-check');

  addBtn.addEventListener('click', () => showUnitModal());
  delBtn.addEventListener('click', handleDeleteSelected);

  allCheck.addEventListener('change', (e) => {
    const checked = e.target.checked;
    containerEl.querySelectorAll('#unit-tbody .row-check').forEach(b => b.checked = checked);
  });

  const saveBtn = containerEl.querySelector('#unit-save-btn');
  const cancelBtn = containerEl.querySelector('#unit-cancel-btn');
  const modal = containerEl.querySelector('#unit-modal');

  saveBtn.addEventListener('click', handleSaveUnit);
  cancelBtn.addEventListener('click', () => hideUnitModal());

  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideUnitModal();
  });
}

export function renderUnitTable() {
  if (!containerEl) return;
  const tbody = containerEl.querySelector('#unit-tbody');
  const allCheck = containerEl.querySelector('#unit-all-check');
  if (!tbody) return;

  const data = getUnits();

  tbody.innerHTML = '';

  data.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="row-check" data-id="${item.id}"></td>
      <td>
        <button type="button" class="btn-unit-move" data-id="${item.id}" data-direction="up" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn-unit-move" data-id="${item.id}" data-direction="down" ${idx === data.length - 1 ? 'disabled' : ''}>↓</button>
      </td>
      <td>${escapeHtml(item.unitCode)}</td>
      <td>${escapeHtml(item.unitName)}</td>
      <td>${escapeHtml(item.note || '')}</td>
      <td>
        <button class="btn-edit" data-id="${item.id}">編輯</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.row-check').forEach(chk => {
    chk.addEventListener('change', updateUnitAllCheck);
  });

  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = getUnits().find(u => u.id === id);
      if (item) showUnitModal(item);
    });
  });

  tbody.querySelectorAll('.btn-unit-move').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const direction = btn.dataset.direction;
      try {
        if (await moveUnitOrder(id, direction)) {
          renderUnitTable();
          showToast('單位排序已同步');
        }
      } catch { renderUnitTable(); }
    });
  });

  if (allCheck) allCheck.checked = false;
}

function updateUnitAllCheck() {
  const allCheck = containerEl.querySelector('#unit-all-check');
  const checks = containerEl.querySelectorAll('#unit-tbody .row-check');
  const allChecked = checks.length > 0 && Array.from(checks).every(c => c.checked);
  if (allCheck) allCheck.checked = allChecked;
}

function getSelectedUnitIds() {
  const checks = containerEl.querySelectorAll('#unit-tbody .row-check:checked');
  return Array.from(checks).map(c => c.dataset.id);
}

async function handleDeleteSelected() {
  const ids = getSelectedUnitIds();
  if (ids.length === 0) {
    showToast('請先勾選要刪除的資料', 'error');
    return;
  }

  const units = getUnits();
  const usedUnits = [];
  const safeIds = [];

  ids.forEach(id => {
    const u = units.find(x => x.id === id);
    if (u && isUnitUsed(u.unitCode)) {
      usedUnits.push(u.unitName || u.unitCode);
    } else {
      safeIds.push(id);
    }
  });

  if (usedUnits.length > 0) {
    showToast(`以下單位已被使用，無法刪除：${usedUnits.join('、')}`, 'error');
  }

  if (safeIds.length === 0) return;

  if (!confirm(`確定刪除選取的 ${safeIds.length} 筆單位嗎？`)) return;

  try { await runWithMutationUiLock(containerEl.querySelector('#btn-delete-unit'),()=>deleteUnits(safeIds)); showToast('刪除成功'); renderUnitTable(); } catch {}
}

function showUnitModal(item = null) {
  currentEditingId = item ? item.id : null;

  const modal = containerEl.querySelector('#unit-modal');
  const titleEl = containerEl.querySelector('#unit-modal-title');
  const codeEl = containerEl.querySelector('#unit-code');
  const nameEl = containerEl.querySelector('#unit-name');
  const colorEl = containerEl.querySelector('#unit-color');
  const noteEl = containerEl.querySelector('#unit-note');

  titleEl.textContent = item ? '編輯單位' : '新增單位';

  if (item) {
    codeEl.value = item.unitCode;
    nameEl.value = item.unitName;
    colorEl.value = item.colorKey || 'default';
    noteEl.value = item.note || '';
    codeEl.disabled = true;
  } else {
    codeEl.value = '';
    nameEl.value = '';
    colorEl.value = 'default';
    noteEl.value = '';
    codeEl.disabled = false;
  }

  modal.style.display = 'flex';
  codeEl.focus();
}

function hideUnitModal() {
  const modal = containerEl.querySelector('#unit-modal');
  modal.style.display = 'none';
  currentEditingId = null;
}

async function handleSaveUnit() {
  const code = containerEl.querySelector('#unit-code').value.trim();
  const name = containerEl.querySelector('#unit-name').value.trim();
  const colorKey = containerEl.querySelector('#unit-color').value || 'default';
  const note = containerEl.querySelector('#unit-note').value.trim();

  if (!code) {
    showToast('代碼不可空白', 'error');
    return;
  }
  if (!name) {
    showToast('單位不可空白', 'error');
    return;
  }

  const units = getUnits();

  // 重複代碼檢查
  if (!currentEditingId) {
    if (units.some(u => u.unitCode === code)) {
      showToast('單位代碼不可重複', 'error');
      return;
    }
  } else {
    if (units.some(u => u.unitCode === code && u.id !== currentEditingId)) {
      showToast('單位代碼不可重複', 'error');
      return;
    }
  }

  const wasEditing = Boolean(currentEditingId);
  try { await runWithMutationUiLock([containerEl.querySelector('#unit-save-btn'),containerEl.querySelector('#unit-cancel-btn')],()=>saveUnit({
    id: currentEditingId,
    unitCode: code,
    unitName: name,
    colorKey,
    note
  }));
  renderUnitTable(); hideUnitModal(); showToast(wasEditing ? '更新成功' : '新增成功'); } catch {}
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
