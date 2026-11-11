const CORRECTION_TYPES = {
  group_renamed: 'naming',
  rule_saved: 'grouping',
  tab_moved: 'grouping',
  group_reorganized: 'grouping',
};

function linkedDecision(event, decisions) {
  const eventTime = Date.parse(event.time);
  const pages = new Set((event.tabs || []).map(tab => tab.page).filter(Boolean));
  return decisions
    .filter(decision => {
      const age = eventTime - Date.parse(decision.time);
      if (!Number.isFinite(age) || age < 0 || age > 7 * 24 * 60 * 60 * 1000) return false;
      return (event.groupId != null && decision.groupId === event.groupId)
        || (pages.size > 0 && (decision.tabs || []).some(tab => pages.has(tab.page)));
    })
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0] || null;
}

export function analyzeFeedback(data) {
  if (!Array.isArray(data?.events) || !Array.isArray(data?.decisions)) throw new Error('导出文件缺少 events 或 decisions 数组');
  const cases = data.events.flatMap(event => {
    const type = CORRECTION_TYPES[event.kind];
    if (!type) return [];
    const decision = linkedDecision(event, data.decisions);
    const sites = [...new Set((event.tabs || []).map(tab => tab.site).filter(Boolean))];
    return [{
      eventId: event.id || null,
      decisionId: decision?.id || null,
      time: event.time,
      type,
      kind: event.kind,
      site: sites.length === 1 ? sites[0] : sites.length > 1 ? '跨站' : null,
      before: event.before ?? null,
      after: event.after ?? null,
      generatedTitle: decision?.title || null,
      groupingVersion: decision?.groupingVersion || event.groupingVersion || event.strategyVersion || null,
      namingVersion: decision?.namingVersion || event.namingVersion || event.strategyVersion || null,
    }];
  });
  const patterns = new Map();
  for (const item of cases) {
    const key = JSON.stringify([item.type, item.site, item.before, item.after]);
    const existing = patterns.get(key);
    if (existing) { existing.count += 1; existing.eventIds.push(item.eventId); }
    else patterns.set(key, { type: item.type, site: item.site, before: item.before, after: item.after, count: 1, eventIds: [item.eventId] });
  }
  return {
    summary: {
      generated: data.decisions.length,
      corrections: cases.length,
      naming: cases.filter(item => item.type === 'naming').length,
      grouping: cases.filter(item => item.type === 'grouping').length,
      unmatched: cases.filter(item => !item.decisionId).length,
    },
    cases: cases.sort((a, b) => Date.parse(b.time) - Date.parse(a.time)),
    patterns: [...patterns.values()].sort((a, b) => b.count - a.count),
  };
}
