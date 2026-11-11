const DECISIONS = new Set(['pending', 'approved', 'rejected']);

export function summarizeReviewQueue(queue) {
  const cases = queue?.cases || [];
  return {
    total: cases.length,
    approved: cases.filter(item => item.review?.decision === 'approved').length,
    rejected: cases.filter(item => item.review?.decision === 'rejected').length,
    pending: cases.filter(item => item.review?.decision === 'pending').length,
  };
}

export function buildReviewQueue(analysis, previous = { cases: [] }, productVersion) {
  if (!Array.isArray(analysis?.cases) || !Array.isArray(previous?.cases)) throw new Error('审核队列格式无效');
  const prior = new Map();
  for (const item of previous.cases) {
    if (!item.eventId || !DECISIONS.has(item.review?.decision)) throw new Error('已有人工审核结果格式无效');
    if (prior.has(item.eventId)) throw new Error('已有审核队列包含重复事件 ID');
    prior.set(item.eventId, item);
  }
  const seen = new Set();
  const cases = analysis.cases.map(item => {
    if (!item.eventId || seen.has(item.eventId)) throw new Error('候选事件 ID 缺失或重复');
    seen.add(item.eventId);
    return { ...item, review: prior.get(item.eventId)?.review || { decision: 'pending', note: '' } };
  });
  for (const item of previous.cases) {
    if (!seen.has(item.eventId)) cases.push({ ...item, sourceMissing: true });
  }
  return { schemaVersion: 1, productVersion, sourceSummary: analysis.summary, cases };
}

export function approvedDataset(queue) {
  if (!Array.isArray(queue?.cases)) throw new Error('审核队列格式无效');
  return {
    schemaVersion: 1,
    sourceProductVersion: queue.productVersion,
    cases: queue.cases.filter(item => item.review?.decision === 'approved'),
  };
}
