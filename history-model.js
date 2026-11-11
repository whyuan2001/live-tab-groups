// Product milestones include development builds; status states their actual release state.
export const releases = [
  {
    version: '1.0.0',
    status: '首个正式版候选，待 Chrome 核验与商店上架',
    groupingVersion: '1.0.0',
    namingVersion: '1.1.0',
    summary: '以开发版 0.12.0 的功能作为首个正式版基线；公开分发尚未开始。',
  },
  {
    version: '0.12.0',
    status: '开发版；源码已构建，待在 Chrome 加载',
    groupingVersion: '1.0.0',
    namingVersion: '1.1.0',
    summary: '新版本在插件弹窗提示一键应用；自动组归属持久保存，点击后整理所有窗口并保护来源不明的组。',
  },
  {
    version: '0.11.0',
    status: '开发版；源码已构建，待在 Chrome 加载',
    groupingVersion: '1.0.0',
    namingVersion: '1.1.0',
    summary: '手动选中网页自动命名；本机审核队列将候选纠错与人工决策分开。',
  },
  {
    version: '0.10.0',
    status: '开发版；源码已构建，待在 Chrome 加载',
    groupingVersion: '1.0.0',
    namingVersion: '1.0.0',
    summary: '多选标签停稳后自动建立手动组；开发者工作台合并记录时间线并按需展开详情。',
  },
  {
    version: '0.9.0',
    status: '开发版；源码已构建，待在 Chrome 加载',
    groupingVersion: '1.0.0',
    namingVersion: '1.0.0',
    summary: '多选未分组网页后可一键手动成组；开发者工作台提供本机独立网址。',
  },
  {
    version: '0.8.0',
    status: '开发版；源码已构建，待在 Chrome 加载',
    groupingVersion: '1.0.0',
    namingVersion: '1.0.0',
    summary: '支持跨窗口拖入后自动分组；弹窗收敛为立即更新分组，开发者工作台独立访问。',
  },
  {
    version: '0.7.0',
    status: '开发版；源码已构建，待在 Chrome 加载',
    groupingVersion: '1.0.0',
    namingVersion: '1.0.0',
    summary: '修改记录页升级为产品工作台，分开展示操作、自动决策与版本更迭，并明确历史操作者未确认。',
  },
  {
    version: '0.6.0',
    status: '开发版；已在 Chrome 加载',
    groupingVersion: '1.0.0',
    namingVersion: '1.0.0',
    summary: '加入本机自动同步与恢复；纠错记录和自动决策分别备份。',
  },
];

export function describeEventOrigin(event) {
  const channel = {
    chrome: 'Chrome 中观察到',
    popup: '插件弹窗操作',
    browser: '浏览器记录',
  }[event.source] || '来源通道未知';
  return `${channel} · 操作者未确认`;
}
