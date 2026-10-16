import { describe, it, expect } from 'vitest';
import { resolveHomeLayout } from './merge-config';

describe('resolveHomeLayout（五级解析链）', () => {
  it('全空 → default（L0）', () => {
    expect(resolveHomeLayout(null, null, null)).toBe('default');
  });
  it('L1 defaults.home.layout 生效', () => {
    expect(resolveHomeLayout({ defaults: { home: { layout: 'fresh' } } } as any, null, null)).toBe('fresh');
  });
  it('L2 模板 pages.home.layout 覆盖 L1', () => {
    expect(resolveHomeLayout({ defaults: { home: { layout: 'fresh' } } } as any, { pages: { home: { layout: 'marketplace' } } } as any, null)).toBe('marketplace');
  });
  it('L3 displayTemplate 覆盖 L2', () => {
    expect(resolveHomeLayout(null, { pages: { home: { layout: 'fresh' } } } as any, { displayTemplate: 'marketplace' })).toBe('marketplace');
  });
  it('L3 空字符串视为未配置，不覆盖', () => {
    expect(resolveHomeLayout(null, { pages: { home: { layout: 'fresh' } } } as any, { displayTemplate: '' })).toBe('fresh');
  });
  it('未知 layout 值 → default', () => {
    expect(resolveHomeLayout(null, { pages: { home: { layout: 'usemall-typo' } } } as any, null)).toBe('default');
  });
  it('坏类型（数字/对象）→ default', () => {
    expect(resolveHomeLayout(null, { pages: { home: { layout: 123 } } } as any, null)).toBe('default');
  });
});
