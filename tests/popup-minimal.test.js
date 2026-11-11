import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('popup has one immediate grouping action and no rule or backend controls', async () => {
  const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
  assert.match(html, /id="organize"/);
  assert.equal((html.match(/<button\b/g) || []).length, 1);
  assert.doesNotMatch(html, /<(?:input|select)\b/);
  assert.doesNotMatch(html, /openHistory|groupSelect|scope|enabled/);
});

test('popup asks for one-click update when a new strategy is pending', async () => {
  const status = { textContent: '' };
  let click;
  const button = { disabled: false, textContent: '', addEventListener(_event, callback) { click = callback; } };
  const messages = [];
  globalThis.document = { querySelector(selector) { return selector === '#organize' ? button : status; } };
  globalThis.chrome = {
    tabs: { async query() { return [{ windowId: 7 }]; } },
    runtime: { async sendMessage(message) {
      messages.push(message);
      return message.type === 'updateStatus' ? { ok: true, pending: true }
        : { ok: true, changed: 4, skippedGroups: 1 };
    } },
  };
  try {
    await import('../popup.js');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(button.textContent, '更新');
    assert.match(status.textContent, /检测到新版本，请更新/);
    await click();
    assert.deepEqual(messages, [{ type: 'updateStatus' }, { type: 'applyVersionUpdate' }]);
    assert.match(status.textContent, /跳过 1 个来源不明的标签组/);
    assert.equal(button.disabled, false);
  } finally {
    delete globalThis.document;
    delete globalThis.chrome;
  }
});

test('without a pending update, the button still refreshes the current window', async () => {
  const status = { textContent: '' };
  let click;
  const button = { disabled: true, textContent: '', addEventListener(_event, callback) { click = callback; } };
  const messages = [];
  globalThis.document = { querySelector(selector) { return selector === '#organize' ? button : status; } };
  globalThis.chrome = {
    tabs: { async query() { return [{ windowId: 7 }]; } },
    runtime: { async sendMessage(message) {
      messages.push(message);
      return message.type === 'updateStatus' ? { ok: true, pending: false } : { ok: true, changed: 0 };
    } },
  };
  try {
    await import('../popup.js?current-window');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(button.textContent, '立即更新分组');
    await click();
    assert.deepEqual(messages, [{ type: 'updateStatus' }, { type: 'organizeWindow', windowId: 7 }]);
  } finally {
    delete globalThis.document;
    delete globalThis.chrome;
  }
});
