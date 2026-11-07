/**
 * 展示层时间格式化（C 端专用）。
 *
 * 两类口径，禁止混用：
 * 1) fmtUser  —— 用户视角，按**浏览器/设备时区**显示（Intl 显式指定 timeZone，不依赖裸字符串截断）
 * 2) fmtStore —— 门店视角，按**门店时区**显示（秒杀、营业时间、到店取货时段等"当地时间"语义）
 *
 * 只做展示，不参与写库与筛选。
 */

/** 门店时区（当前门店均在中国，默认 Asia/Shanghai） */
export const STORE_TIME_ZONE = 'Asia/Shanghai';

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

interface Fields {
  y: string;
  mo: string;
  d: string;
  h: string;
  mi: string;
  s: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const hit = formatterCache.get(timeZone);
  if (hit) return hit;
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, fmt);
    return fmt;
  } catch {
    return null;
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 设备时区（取不到时回落到 Asia/Shanghai） */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || STORE_TIME_ZONE;
  } catch {
    return STORE_TIME_ZONE;
  }
}

function localFields(instant: Date): Fields {
  return {
    y: String(instant.getFullYear()),
    mo: pad2(instant.getMonth() + 1),
    d: pad2(instant.getDate()),
    h: pad2(instant.getHours()),
    mi: pad2(instant.getMinutes()),
    s: pad2(instant.getSeconds()),
  };
}

/** 固定 +8 兜底（Asia/Shanghai 无夏令时） */
function fixedOffsetFields(instant: Date, offsetMinutes: number): Fields {
  const t = new Date(instant.getTime() + offsetMinutes * 60_000);
  return {
    y: String(t.getUTCFullYear()),
    mo: pad2(t.getUTCMonth() + 1),
    d: pad2(t.getUTCDate()),
    h: pad2(t.getUTCHours()),
    mi: pad2(t.getUTCMinutes()),
    s: pad2(t.getUTCSeconds()),
  };
}

function fieldsOf(instant: Date, timeZone?: string): Fields {
  if (!timeZone) return localFields(instant);
  const fmt = getFormatter(timeZone);
  if (!fmt) return timeZone === STORE_TIME_ZONE ? fixedOffsetFields(instant, 8 * 60) : localFields(instant);
  try {
    const parts = fmt.formatToParts(instant);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const y = pick('year');
    if (!y) return localFields(instant);
    return { y, mo: pick('month'), d: pick('day'), h: pick('hour'), mi: pick('minute'), s: pick('second') };
  } catch {
    return timeZone === STORE_TIME_ZONE ? fixedOffsetFields(instant, 8 * 60) : localFields(instant);
  }
}

/** 无时区后缀的裸字符串（如 "2026-11-07 20:13"）按门店墙钟（门店时区）解释，避免被当成设备本地时间二次偏移 */
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

function render(f: Fields, pattern: TimePattern): string {
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

function dateOnlyFields(input: TimeInput): Fields | null {
  if (typeof input !== 'string') return null;
  const m = DATE_ONLY.exec(input.trim());
  if (!m) return null;
  return { y: m[1], mo: m[2], d: m[3], h: '00', mi: '00', s: '00' };
}

/** 用户视角：按浏览器/设备时区显示 */
export function fmtUser(input: TimeInput, pattern: TimePattern = 'datetime'): string {
  const dof = dateOnlyFields(input);
  if (dof) return render(dof, pattern);
  const d = toDate(input);
  if (!d) return '';
  return render(fieldsOf(d, browserTimeZone()), pattern);
}

/** 门店视角：按门店时区显示（默认 Asia/Shanghai） */
export function fmtStore(
  input: TimeInput,
  pattern: TimePattern = 'datetime',
  timeZone: string = STORE_TIME_ZONE,
): string {
  const dof = dateOnlyFields(input);
  if (dof) return render(dof, pattern);
  const d = toDate(input);
  if (!d) return '';
  return render(fieldsOf(d, timeZone), pattern);
}

/** 用户时区日历日 key（YYYY-MM-DD），用于"今天/昨天"判断 */
export function userDayKey(input: TimeInput = new Date()): string {
  return fmtUser(input, 'date');
}

/** 门店时区日历日 key（YYYY-MM-DD） */
export function storeDayKey(input: TimeInput = new Date(), timeZone: string = STORE_TIME_ZONE): string {
  return fmtStore(input, 'date', timeZone);
}

export function toEpoch(input: TimeInput): number | null {
  const d = toDate(input);
  return d ? d.getTime() : null;
}
