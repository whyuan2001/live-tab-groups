export const NATIVE_HOST = 'local.live_tab_groups';
const CURSOR_KEY = 'nativeSyncCursor';
const STATUS_KEY = 'nativeSyncStatus';

export function createNativeSync(chromeApi, readers, options = {}) {
  const batchSize = options.batchSize ?? 50;
  const maxBatches = options.maxBatches ?? 20;
  let inFlight;

  async function sync() {
    if (typeof chromeApi.runtime.sendNativeMessage !== 'function') throw new Error('当前 Chrome 无法使用本机通信');
    const stored = await chromeApi.storage.local.get({ [CURSOR_KEY]: { events: 0, decisions: 0 } });
    const cursor = { events: stored[CURSOR_KEY]?.events || 0, decisions: stored[CURSOR_KEY]?.decisions || 0 };
    const remote = await chromeApi.runtime.sendNativeMessage(NATIVE_HOST, { type: 'status' });
    if (!remote?.ok || !remote.cursor || !remote.count) throw new Error(remote?.error || '无法确认本机数据状态');
    for (const stream of ['events', 'decisions']) {
      const localCount = await readers[`count${stream === 'events' ? 'Feedback' : 'Decisions'}`]();
      if (remote.cursor[stream] < cursor[stream] || remote.count[stream] < localCount && remote.cursor[stream] <= cursor[stream]) cursor[stream] = 0;
    }
    if (cursor.events !== stored[CURSOR_KEY]?.events || cursor.decisions !== stored[CURSOR_KEY]?.decisions) {
      await chromeApi.storage.local.set({ [CURSOR_KEY]: { ...cursor } });
    }
    let batches = 0;
    for (const [stream, read] of [['events', readers.listFeedbackAfter], ['decisions', readers.listDecisionsAfter]]) {
      while (batches < maxBatches) {
        const entries = await read(cursor[stream], batchSize);
        if (!entries.length) break;
        const records = entries.map(record => ({ stream, record }));
        const response = await chromeApi.runtime.sendNativeMessage(NATIVE_HOST, { type: 'append', records });
        if (!response?.ok || response.processed !== records.length) {
          throw new Error(response?.error || '本机同步未确认全部记录');
        }
        cursor[stream] = entries.at(-1).seq;
        await chromeApi.storage.local.set({ [CURSOR_KEY]: { ...cursor } });
        batches += 1;
        if (entries.length < batchSize) break;
      }
    }
    return { cursor, more: batches >= maxBatches };
  }

  return {
    run() {
      if (!inFlight) inFlight = (async () => {
        try {
          const result = await sync();
          await chromeApi.storage.local.set({ [STATUS_KEY]: { state: 'ok', time: new Date().toISOString(), cursor: result.cursor } });
          return result;
        } catch (error) {
          await chromeApi.storage.local.set({ [STATUS_KEY]: { state: 'retrying', time: new Date().toISOString(), error: error.message } }).catch(() => {});
          throw error;
        }
      })().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
