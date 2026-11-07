/**
 * 展示层时间格式化（后台专用）。
 *
 * 口径：后台一律显示**北京时间（Asia/Shanghai，UTC+8）**，与浏览器所在时区无关。
 * 统一入口，禁止各页面再自行 `getHours()` / 截 ISO 字符串。
 *
 * 说明：
 * - 只做展示，不参与写库与筛选窗口计算（筛选口径见 utils/orderFilter.ts）。
 * - Asia/Shanghai 无夏令时，Intl 不支持时用固定 +8 兜底。
 */

export const PLATFORM_TIME_ZONE = 'Asia/Shanghai';

/** 表头/界面提示文案，避免裸时间 */
export const BEIJING_TZ_LABEL = '北京时间（UTC+8）';

export type TimePattern =
  | 'datetime' // 2026-11-07 20:13
  | 'datetime-s' // 2026-11-07 20:13:45
  | 'date' // 2026-11-07
  | 'mdhm' // 11-07 20:13
  | 'mdhms' // 11-07 20:13:45
  | 'md' // 11-07
  | 'hm' // 20:13
  | 'hms' // 20:13:45
  | 'ymd-compact' // 20261107
  | 'datetime-compact'; // 202611072013

export type TimeInput = string | number | Date | null | undefined;

interface BFields {
  y: string;
  mo: string;
  d: string;
  h: string;
  mi: string;
  s: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(): Intl.DateTimeFormat | null {
  const key = PLATFORM_TIME_ZONE;
  const hit = formatterCache.get(key);
  if (hit) return hit;
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: PLATFORM_TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(key, fmt);
    return fmt;
  } catch {
    return null;
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 固定 +8 兜底（Asia/Shanghai 无夏令时） */
function beijingFieldsFallback(instant: Date): BFields {
  const t = new Date(instant.getTime() + 8 * 3600_000);
  return {
    y: String(t.getUTCFullYear()),
    mo: pad2(t.getUTCMonth() + 1),
    d: pad2(t.getUTCDate()),
    h: pad2(t.getUTCHours()),
    mi: pad2(t.getUTCMinutes()),
    s: pad2(t.getUTCSeconds()),
  };
}

function beijingFields(instant: Date): BFields {
  const fmt = getFormatter();
  if (!fmt) return beijingFieldsFallback(instant);
  try {
    const parts = fmt.formatToParts(instant);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const y = pick('year');
    if (!y) return beijingFieldsFallback(instant);
    return {
      y,
      mo: pick('month'),
      d: pick('day'),
      h: pick('hour'),
      mi: pick('minute'),
      s: pick('second'),
    };
  } catch {
    return beijingFieldsFallback(instant);
  }
}

/** 无时区后缀的裸字符串（如 "2026-11-07 20:13"）按平台墙钟（北京时间）解释 */
const NAIVE_WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function toDate(input: TimeInput): Date | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'string') {
    const m = NAIVE_WALL_CLOCK.exec(input.trim());
    if (m) {
      const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
      const parsed = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+08:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function render(f: BFields, pattern: TimePattern): string {
  switch (pattern) {
    case 'datetime':
      return `${f.y}-${f.mo}-${f.d} ${f.h}:${f.mi}`;
    case 'datetime-s':
      return `${f.y}-${f.mo}-${f.d} ${f.h}:${f.mi}:${f.s}`;
    case 'date':
      return `${f.y}-${f.mo}-${f.d}`;
    case 'mdhm':
      return `${f.mo}-${f.d} ${f.h}:${f.mi}`;
    case 'mdhms':
      return `${f.mo}-${f.d} ${f.h}:${f.mi}:${f.s}`;
    case 'md':
      return `${f.mo}-${f.d}`;
    case 'hm':
      return `${f.h}:${f.mi}`;
    case 'hms':
      return `${f.h}:${f.mi}:${f.s}`;
    case 'ymd-compact':
      return `${f.y}${f.mo}${f.d}`;
    case 'datetime-compact':
      return `${f.y}${f.mo}${f.d}${f.h}${f.mi}`;
    default:
      return `${f.y}-${f.mo}-${f.d} ${f.h}:${f.mi}`;
  }
}

/** 纯日期字符串（YYYY-MM-DD）是"日历日"而非瞬时，按字面展示，不做时区换算 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateOnlyFields(input: TimeInput): BFields | null {
  if (typeof input !== 'string') return null;
  const m = DATE_ONLY.exec(input.trim());
  if (!m) return null;
  return { y: m[1], mo: m[2], d: m[3], h: '00', mi: '00', s: '00' };
}

/** 按北京时间格式化为指定形态；空值/非法值返回 '' */
export function fmtBeijing(input: TimeInput, pattern: TimePattern = 'datetime'): string {
  const dof = dateOnlyFields(input);
  if (dof) return render(dof, pattern);
  const d = toDate(input);
  if (!d) return '';
  return render(beijingFields(d), pattern);
}

/** 北京时间日历日 key：YYYY-MM-DD（用于按日分组/比较） */
export function beijingDayKey(input: TimeInput = new Date()): string {
  return fmtBeijing(input, 'date');
}

/** 导出文件名用时间戳：YYYYMMDDHHmm */
export function beijingStamp(input: TimeInput = new Date()): string {
  return fmtBeijing(input, 'datetime-compact');
}

/** 两个瞬时是否落在同一北京日历日 */
export function isSameBeijingDay(a: TimeInput, b: TimeInput): boolean {
  const ka = beijingDayKey(a);
  const kb = beijingDayKey(b);
  return !!ka && ka === kb;
}

/** 秒级时间戳（按真实瞬时比较，与展示无关；仅用于"同一天/相对时间"判断） */
export function toEpoch(input: TimeInput): number | null {
  const d = toDate(input);
  return d ? d.getTime() : null;
}
