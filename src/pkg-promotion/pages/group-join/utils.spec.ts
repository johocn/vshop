import { describe, expect, it } from 'vitest';
import { formatRemaining } from './utils';

describe('formatRemaining', () => {
    it('毫秒 → HH:MM:SS 补零', () => {
        expect(formatRemaining(0)).toBe('00:00:00');
        expect(formatRemaining(1000)).toBe('00:00:01');
        expect(formatRemaining(61000)).toBe('00:01:01');
        expect(formatRemaining(3661000)).toBe('01:01:01');
        expect(formatRemaining(45296000)).toBe('12:34:56');
    });
    it('不足一秒向下取整', () => {
        expect(formatRemaining(1999)).toBe('00:00:01');
        expect(formatRemaining(999)).toBe('00:00:00');
    });
    it('负数归 0', () => {
        expect(formatRemaining(-1)).toBe('00:00:00');
        expect(formatRemaining(-3600000)).toBe('00:00:00');
    });
    it('非法输入归 0', () => {
        expect(formatRemaining(Number.NaN)).toBe('00:00:00');
        expect(formatRemaining(Number.POSITIVE_INFINITY)).toBe('00:00:00');
    });
    it('超过 99 小时不截断', () => {
        expect(formatRemaining(100 * 3600 * 1000)).toBe('100:00:00');
    });
});
