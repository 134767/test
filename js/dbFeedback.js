// js/dbFeedback.js
// 工讀金 1.4.4b：所有與 DB（Google Sheet / GAS）相關的延遲，統一顯示子視窗訊息並鎖定按鈕。
// 參考近期系統：收帳 setBusy、月統計 loading toast、刷還操作中提示，整理成獨立全域管理器。

let installed = false;
let seq = 0;
const activeOps = new Map();

function ensureDom() {
  if (document.getElementById('db-feedback-root')) return;

  const root = document.createElement('div');
  root.id = 'db-feedback-root';
  root.innerHTML = `
    <div id="db-feedback-overlay" class="db-feedback-overlay is-hidden" aria-live="polite" aria-busy="true">
      <div class="db-feedback-dialog">
        <div class="db-feedback-spinner" aria-hidden="true"></div>
        <div>
          <div id="db-feedback-overlay-title" class="db-feedback-title">資料更新中</div>
          <div id="db-feedback-overlay-message" class="db-feedback-message">正在與資料庫同步，請勿重複點擊。</div>
        </div>
      </div>
    </div>
    <div id="db-toast-stack" class="db-toast-stack" aria-live="polite"></div>
  `;
  document.body.appendChild(root);
}

function getPrimaryOp() {
  const ops = Array.from(activeOps.values());
  return ops[ops.length - 1] || null;
}

function isBlocking() {
  return Array.from(activeOps.values()).some(op => op.blocking);
}

function lockButtons() {
  document.querySelectorAll('button').forEach(btn => {
    if (btn.dataset.dbLockExempt === 'true') return;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.dataset.dbLockedByFeedback = 'true';
  });
  document.body.classList.add('db-is-busy');
}

function unlockButtons() {
  document.querySelectorAll('button[data-db-locked-by-feedback="true"]').forEach(btn => {
    btn.disabled = false;
    delete btn.dataset.dbLockedByFeedback;
  });
  document.body.classList.remove('db-is-busy');
}

function renderBusy() {
  ensureDom();

  const overlay = document.getElementById('db-feedback-overlay');
  const overlayTitle = document.getElementById('db-feedback-overlay-title');
  const overlayMessage = document.getElementById('db-feedback-overlay-message');
  const toastStack = document.getElementById('db-toast-stack');

  if (activeOps.size === 0) {
    if (overlay) overlay.classList.add('is-hidden');
    const busyToast = document.getElementById('db-busy-toast');
    if (busyToast) busyToast.remove();
    unlockButtons();
    return;
  }

  lockButtons();

  const primary = getPrimaryOp();
  const message = primary && primary.message ? primary.message : '資料同步中...';
  const detail = activeOps.size > 1 ? `目前有 ${activeOps.size} 個資料庫動作處理中，請勿重複點擊。` : '正在與資料庫同步，請勿重複點擊。';

  if (isBlocking()) {
    if (overlayTitle) overlayTitle.textContent = '資料更新中';
    if (overlayMessage) overlayMessage.textContent = message;
    if (overlay) overlay.classList.remove('is-hidden');
  } else if (overlay) {
    overlay.classList.add('is-hidden');
  }

  let busyToast = document.getElementById('db-busy-toast');
  if (!busyToast) {
    busyToast = document.createElement('div');
    busyToast.id = 'db-busy-toast';
    busyToast.className = 'db-toast db-toast-loading';
    busyToast.innerHTML = '<span class="db-feedback-spinner small" aria-hidden="true"></span><span class="db-toast-text"></span>';
    toastStack.appendChild(busyToast);
  }
  const text = busyToast.querySelector('.db-toast-text');
  if (text) text.textContent = `${message}｜${detail}`;
}

function pushToast(message, type = 'info', duration = 2200) {
  ensureDom();
  const stack = document.getElementById('db-toast-stack');
  const toast = document.createElement('div');
  toast.className = `db-toast db-toast-${type}`;
  toast.textContent = message || '處理完成';
  stack.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('is-fading');
    window.setTimeout(() => toast.remove(), 260);
  }, duration);
  return toast;
}

export function installDbFeedback() {
  if (installed) return;
  installed = true;
  ensureDom();

  window.WorkStudyDbFeedback = {
    begin(message, options = {}) {
      const token = `dbop_${Date.now()}_${++seq}`;
      activeOps.set(token, {
        message: message || '資料同步中...',
        blocking: !!options.blocking,
        startedAt: Date.now()
      });
      renderBusy();
      return token;
    },

    update(token, message) {
      const op = activeOps.get(token);
      if (!op) return;
      op.message = message || op.message;
      renderBusy();
    },

    end(token, options = {}) {
      if (token && activeOps.has(token)) activeOps.delete(token);
      const type = options.error ? 'error' : (options.silent ? 'info' : 'success');
      const message = options.message || (options.error ? '資料庫同步失敗' : '資料庫同步完成');

      renderBusy();

      if (!options.silent || options.error) {
        pushToast(message, type, options.error ? 4200 : 1800);
      }
    },

    toast: pushToast,
    isBusy() {
      return activeOps.size > 0;
    }
  };

  // 舊頁面或資料層若呼叫 window.showToast，也導向同一套視覺提示。
  window.showToast = function(message, type = 'info') {
    return pushToast(message, type);
  };
}

export function beginDbOperation(message, options = {}) {
  installDbFeedback();
  return window.WorkStudyDbFeedback.begin(message, options);
}

export function endDbOperation(token, options = {}) {
  installDbFeedback();
  window.WorkStudyDbFeedback.end(token, options);
}
