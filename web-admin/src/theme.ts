// 业务域主色 + 七档语义色（youshop 唯一视觉来源，2026-08-23）
// 对应设计文档：docs/superpowers/specs/2026-08-23-vshop-tenant-admin-design.md
export const D = {
  // 业务域
  d1: { main: '#ff6600', grad: '#ff8833' }, // 商品域
  d2: { main: '#e53935', grad: '#ff6659' }, // 交易域
  d3: { main: '#2563eb', grad: '#60a5fa' }, // 履约域
  d4: { main: '#7c3aed', grad: '#a78bfa' }, // 装修域
  d5: { main: '#0d9488', grad: '#14b8a6' }, // 分销域
  d6: { main: '#64748b', grad: '#94a3b8' }, // 系统域
  d7: { main: '#475569', grad: '#64748b' }, // 平台管理域（超管）
  // 语义色
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#e53935',
  disabled: '#9ca3af',
  info: '#2563eb',
};

// 三档标签档位样式（T1 填充 / T2 镂空 / T3 纯文字）
export function tierStyle(main: string, grad: string, tier: 1 | 2 | 3): Record<string, string> {
  if (tier === 1) return { background: `linear-gradient(135deg, ${main}, ${grad})`, color: '#ffffff' };
  if (tier === 2) return { border: `1.5rpx solid ${main}`, color: main };
  return { background: '#f5f5f5', color: '#666666' };
}