import { describe, expect, it } from 'vitest';
import { fenToYuan, yuanToFen } from './money';

describe('fenToYuan', () => {
  it('分转元并去尾零', () => {
    expect(fenToYuan(1250)).toBe('12.5');
    expect(fenToYuan(1200)).toBe('12');
    expect(fenToYuan(1005)).toBe('10.05');
    expect(fenToYuan(1)).toBe('0.01');
  });
  it('0 与 null', () => {
    expect(fenToYuan(0)).toBe('0');
    expect(fenToYuan(null)).toBe('');
    expect(fenToYuan(undefined)).toBe('');
  });
});

describe('yuanToFen', () => {
  it('元转分（最多两位小数）', () => {
    expect(yuanToFen('12.5')).toBe(1250);
    expect(yuanToFen('12')).toBe(1200);
    expect(yuanToFen('0.1')).toBe(10);
    expect(yuanToFen('0')).toBe(0);
  });
  it('非法输入返回 null（空/非数字/负数/超两位小数）', () => {
    expect(yuanToFen('')).toBeNull();
    expect(yuanToFen('abc')).toBeNull();
    expect(yuanToFen('-1')).toBeNull();
    expect(yuanToFen('12.555')).toBeNull();
    expect(yuanToFen('  ')).toBeNull();
  });
});
