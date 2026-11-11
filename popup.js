const button = document.querySelector('#organize');
const status = document.querySelector('#status');
let updatePending = false;

async function refreshUpdateStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'updateStatus' });
    if (!response?.ok) throw new Error(response?.error || '检查失败');
    updatePending = Boolean(response.pending);
    button.textContent = updatePending ? '更新' : '立即更新分组';
    status.textContent = updatePending ? '检测到新版本，请更新。点击后整理已打开的所有窗口。'
      : '多选时自动成组；此按钮可刷新当前窗口的自动分组。';
    button.disabled = false;
  } catch (error) {
    status.textContent = `检查更新失败：${error.message}`;
  }
}

refreshUpdateStatus();

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = updatePending ? '正在更新已打开的窗口…' : '正在更新当前窗口…';
  try {
    let response;
    if (updatePending) {
      response = await chrome.runtime.sendMessage({ type: 'applyVersionUpdate' });
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) throw new Error('找不到当前窗口');
      response = await chrome.runtime.sendMessage({ type: 'organizeWindow', windowId: tabs[0].windowId });
    }
    if (!response?.ok) throw new Error(response?.error || '更新失败');
    if (updatePending) {
      updatePending = false;
      button.textContent = '立即更新分组';
      status.textContent = `已处理所有窗口，更新 ${response.changed} 个标签页。`
        + (response.skippedGroups ? `跳过 ${response.skippedGroups} 个来源不明的标签组。` : '');
    } else {
      status.textContent = response.changed ? `已更新 ${response.changed} 个标签页。` : '已检查当前窗口，分组无需调整。';
    }
  } catch (error) {
    status.textContent = `更新失败：${error.message}`;
  } finally {
    button.disabled = false;
  }
});
