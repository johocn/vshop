import { describe, it, expect } from 'vitest';
import { localDateKey, buildWeek, type DayCell } from './week';

/** 本地时区构造日期（month 传 1-12） */
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const dates = (cells: DayCell[]) => cells.map(c => c.date);
const states = (cells: DayCell[]) => cells.map(c => c.state);

describe('localDateKey', () => {
    it('补零为 YYYY-MM-DD 本地日期', () => {
        expect(localDateKey(d(2025, 11, 5))).toBe('2025-11-05');
        expect(localDateKey(d(2025, 3, 9))).toBe('2025-03-09');
    });
});

describe('buildWeek 周一起点', () => {
    it('周三所在周从周一开始，weekday 1-7', () => {
        // 2025-11-05 是周三
        const cells = buildWeek(d(2025, 11, 5), new Set(), 0, false);
        expect(dates(cells)).toEqual([
            '2025-11-03', '2025-11-04', '2025-11-05', '2025-11-06', '2025-11-07', '2025-11-08', '2025-11-09',
        ]);
        expect(cells.map(c => c.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('周日所在周仍以本周一为起点', () => {
        // 2025-11-02 是周日
        const cells = buildWeek(d(2025, 11, 2), new Set(), 0, false);
        expect(cells[0].date).toBe('2025-10-27');
        expect(cells[6].date).toBe('2025-11-02');
    });
});

describe('buildWeek 跨月', () => {
    it('本周横跨 10 月与 11 月', () => {
        // 2025-11-01 是周六，本周一为 10-27
        const cells = buildWeek(d(2025, 11, 1), new Set(), 0, false);
        expect(dates(cells)).toEqual([
            '2025-10-27', '2025-10-28', '2025-10-29', '2025-10-30', '2025-10-31', '2025-11-01', '2025-11-02',
        ]);
    });
});

describe('buildWeek streak 推算', () => {
    it('streak=0 且无本地记录：过去与未来均 idle，今日为 today', () => {
        const cells = buildWeek(d(2025, 11, 5), new Set(), 0, false);
        expect(states(cells)).toEqual(['idle', 'idle', 'today', 'idle', 'idle', 'idle', 'idle']);
    });

    it('streak=1 已签今日：仅今日 done', () => {
        const cells = buildWeek(d(2025, 11, 5), new Set(), 1, true);
        expect(states(cells)).toEqual(['idle', 'idle', 'done', 'idle', 'idle', 'idle', 'idle']);
    });

    it('streak=1 未签今日：仅昨日 done，今日高亮 today', () => {
        const cells = buildWeek(d(2025, 11, 5), new Set(), 1, false);
        expect(states(cells)).toEqual(['idle', 'done', 'today', 'idle', 'idle', 'idle', 'idle']);
    });

    it('streak=3 未签今日：昨日往前 3 天 done', () => {
        // 2025-11-06 是周四，11-05/11-04/11-03 三天均落在本周
        const cells = buildWeek(d(2025, 11, 6), new Set(), 3, false);
        expect(states(cells)).toEqual(['done', 'done', 'done', 'today', 'idle', 'idle', 'idle']);
    });

    it('streak 推算落上周的日期被裁剪，不影响本周格', () => {
        // 2025-11-05 是周三，streak=3 推算含上周日 11-02，本周格内仅 11-03/11-04 done
        const cells = buildWeek(d(2025, 11, 5), new Set(), 3, false);
        expect(states(cells)).toEqual(['done', 'done', 'today', 'idle', 'idle', 'idle', 'idle']);
    });

    it('streak=7 已签今日且今日为周日：整周 done', () => {
        const cells = buildWeek(d(2025, 11, 2), new Set(), 7, true);
        expect(states(cells)).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'done']);
    });
});

describe('buildWeek 本地补记 ∪ 推算', () => {
    it('本地记录的过去日期标 done（与推算取并集）', () => {
        const cells = buildWeek(d(2025, 11, 5), new Set(['2025-11-03']), 0, false);
        expect(states(cells)).toEqual(['done', 'idle', 'today', 'idle', 'idle', 'idle', 'idle']);
    });

    it('未来日即使被本地记录污染也强制 idle', () => {
        const cells = buildWeek(d(2025, 11, 5), new Set(['2025-11-08']), 0, false);
        expect(cells[5].state).toBe('idle');
    });
});

describe('buildWeek 今日边界', () => {
    it('今日已签 → done（即使 streak 推算缺今日也特判）', () => {
        const cells = buildWeek(d(2025, 11, 5), new Set(), 0, true);
        expect(cells[2].state).toBe('done');
    });

    it('今日未签 → today 高亮（即使推算链覆盖今日也不标 done）', () => {
        // 异常数据防御：checkedInToday=false 但 streak 链理论上不含今日，此处确保今日仍为 today
        const cells = buildWeek(d(2025, 11, 5), new Set(['2025-11-05']), 0, false);
        expect(cells[2].state).toBe('today');
    });
});
