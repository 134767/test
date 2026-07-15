import { beginDbOperation, endDbOperation } from './dbFeedback.js?v=1.6.0-calendar-wage-hotfix-1';

const active = new WeakSet();

export async function runWithMutationUiLock(controls, mutation, options = {}) {
  const list = (Array.isArray(controls) ? controls : [controls]).filter(Boolean);
  const trigger = list[0];
  if (trigger && active.has(trigger)) throw new Error('操作處理中，請稍候');
  const states = list.map(el => ({ el, disabled: el.disabled, text: el.textContent }));
  if (trigger) active.add(trigger);
  list.forEach(el => { el.disabled = true; });
  if (trigger && options.processingLabel !== false) trigger.textContent = options.processingLabel || '同步中…';
  const token = options.blocking ? beginDbOperation(options.message || '正在同步', { blocking: true }) : null;
  try {
    const result = await mutation();
    if (token) endDbOperation(token, { message: options.successMessage || '已同步', silent: true });
    return result;
  } catch (error) {
    const message = `同步失敗，資料已還原：${error?.message || '未知錯誤'}`;
    if (token) endDbOperation(token, { error: true, message });
    if (window.showToast) window.showToast(message, 'error');
    throw error;
  } finally {
    states.forEach(({ el, disabled, text }) => { el.disabled = disabled; el.textContent = text; });
    if (trigger) active.delete(trigger);
  }
}
