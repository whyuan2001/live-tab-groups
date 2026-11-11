export function createRenameCollector(save, delayMs = 1500) {
  const pending = new Map();

  function observe(groupId, before, after) {
    const prior = pending.get(groupId);
    if (prior?.timer) clearTimeout(prior.timer);
    const item = { groupId, before: prior?.before ?? before, after };
    item.timer = setTimeout(() => {
      pending.delete(groupId);
      if (item.before === item.after) return;
      Promise.resolve(save({ groupId, before: item.before, after: item.after })).catch(console.error);
    }, delayMs);
    pending.set(groupId, item);
  }

  function cancel(groupId) {
    const item = pending.get(groupId);
    if (item?.timer) clearTimeout(item.timer);
    pending.delete(groupId);
  }

  return { observe, cancel };
}
