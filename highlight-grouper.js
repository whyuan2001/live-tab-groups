export function createHighlightGrouper({ query, group, setTimer = setTimeout, clearTimer = clearTimeout, delay = 650 }) {
  const pending = new Map();

  function onHighlighted({ windowId, tabIds }) {
    if (pending.has(windowId)) clearTimer(pending.get(windowId));
    pending.delete(windowId);
    if (tabIds.length < 2) return;
    const ids = [...tabIds].sort((a, b) => a - b);
    const timer = setTimer(async () => {
      pending.delete(windowId);
      let current;
      try { current = await query(windowId); } catch { return; }
      const currentIds = current.map(tab => tab.id).sort((a, b) => a - b);
      if (currentIds.length !== ids.length || currentIds.some((id, index) => id !== ids[index])) return;
      await group(ids);
    }, delay);
    pending.set(windowId, timer);
  }

  return { onHighlighted };
}
