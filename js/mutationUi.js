import { beginDbOperation, endDbOperation } from './dbFeedback.js?v=1.6.0';

const active = new WeakSet();

export async function runWithMutationUiLock(controls, mutation, options = {}) {
  const list = (Array.isArray(controls) ? controls : [controls]).filter(Boolean);
  const trigger = list[0];
  if (trigger && active.has(trigger)) throw new Error('操作處理中，請稍候');
  const states = list.map(el => ({ el, disabled: el.disabled, text: el.textContent }));
  if (trigger) active.add(trigger);
  list.forEach(el => { el.disabled = true; });
  if (trigger && options.processingLabel !== false) trigger.textContent = options.processingLabel || '處理中…';
  const token = options.blocking ? beginDbOperation(options.message || '資料處理中', { blocking: true }) : null;
  try {
    const result = await mutation();
    if (token) endDbOperation(token, { message: options.successMessage || '處理完成', silent: true });
    return result;
  } catch (error) {
    if (token) endDbOperation(token, { error: true, message: error?.message || '處理失敗' });
    if (window.showToast) window.showToast(error?.message || '處理失敗', 'error');
    throw error;
  } finally {
    states.forEach(({ el, disabled, text }) => { el.disabled = disabled; el.textContent = text; });
    if (trigger) active.delete(trigger);
  }
}
