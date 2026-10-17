/**
 * 签到页本周七日格纯函数（供页面与单测复用，禁止引入 uni/vue 依赖）
 * 一周以周一为起点；后端仅有 streak（连续天数）无历史查询，
 * 已签格 = streak 推算 ∪ 本周本地补记（uni storage）。
 */
export interface DayCell {
    /** 本地日期 key：YYYY-MM-DD */
    date: string;
    /** 星期几：1=周一 … 7=周日 */
    weekday: number;
    /** done=已签；today=今日未签（高亮可签）；idle=未签/未来日 */
    state: 'done' | 'today' | 'idle';
}

/** 按本地日期分量加减天数（避开毫秒差值在夏令时/月末的坑） */
function shiftDay(base: Date, days: number): Date {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

/** 本地时区日期 key（用 getFullYear/getMonth/getDate，非 UTC，避免偏移一天） */
export function localDateKey(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 构建本周（周一~周日）七日格
 * @param now 当前时间
 * @param checkedSet 本地补记的已签日期 key 集合（'YYYY-MM-DD'）
 * @param streak 后端连续签到天数
 * @param checkedInToday 今日是否已签
 */
export function buildWeek(now: Date, checkedSet: Set<string>, streak: number, checkedInToday: boolean): DayCell[] {
    const todayKey = localDateKey(now);

    // 推算已签日期：今日已签 → 今天起往前 streak 天；今日未签 → 昨天起往前 streak 天
    const done = new Set<string>(checkedSet);
    const start = checkedInToday ? 0 : 1;
    for (let i = start; i < start + Math.max(0, streak); i++) {
        done.add(localDateKey(shiftDay(now, -i)));
    }

    // 本周一（getDay: 0=周日…6=周六 → 转为距周一的天数）
    const daysSinceMonday = (now.getDay() + 6) % 7;
    const monday = shiftDay(now, -daysSinceMonday);

    const cells: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
        const d = shiftDay(monday, i);
        const key = localDateKey(d);
        let state: DayCell['state'];
        if (key > todayKey) {
            state = 'idle'; // 未来日不可签
        } else if (key === todayKey) {
            state = checkedInToday ? 'done' : 'today'; // 今日特判
        } else {
            state = done.has(key) ? 'done' : 'idle';
        }
        cells.push({ date: key, weekday: i + 1, state });
    }
    return cells;
}
