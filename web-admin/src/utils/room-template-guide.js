/**
 * 房型模板录入引导与列表过滤辅助（框架无关，供 web-admin 模板库页使用）。
 * 纯函数，无 uni/Vue/graphql 依赖，可被 node:test 直接测试。
 * @typedef {{code:string, name:string, enabled:boolean, sortOrder:number, basePriceCent:number, specs?:Record<string,any>, priceCalendar?:Array<Record<string,any>>, tags?:string[]}} RoomTemplateItem
 */

// ---------- ① 预设片段库 ----------
export const PRICE_SEGMENT_PRESETS = [
  { label: '平日 1.0', value: { type: 'weekday', rate: 1.0 } },
  { label: '周末 1.2', value: { type: 'weekend', rate: 1.2 } },
  { label: '国庆 1.8', value: { type: 'holiday', rate: 1.8, dates: ['2026-10-01', '2026-10-02', '2026-10-03'] } },
  { label: '春节 2.0', value: { type: 'holiday', rate: 2.0, dates: ['2026-02-17', '2026-02-23'] } },
  { label: '寒暑假 1.5', value: { type: 'custom', rate: 1.5, dates: ['2026-07-01', '2026-07-31'] } },
];
export const LONG_STAY_PRESETS = [
  { label: '连住3晚9折', value: { minNights: 3, rate: 0.9 } },
  { label: '连住5晚8折', value: { minNights: 5, rate: 0.8 } },
];
export const CANCEL_POLICY_PRESETS = [
  { label: '24h免费取消', value: { type: 'freeUntil', freeUntilHours: 24 } },
  { label: '48h免费取消', value: { type: 'freeUntil', freeUntilHours: 48 } },
  { label: '全程不可退', value: { type: 'nonRefundable' } },
];
export const VIEW_PRESETS = ['湖景', '江景', '城景', '海景', '山景', '园景', '夜景'];
export const BED_OPTIONS = [
  { label: '大床', value: 'king' }, { label: '双床', value: 'twin' }, { label: '单人床', value: 'single' },
  { label: '三床', value: 'triple' }, { label: '亲子床', value: 'family' },
];
export const BREAKFAST_OPTIONS = [
  { label: '含 2 份早餐', value: { breakfast: 'included', breakfastCount: 2 } },
  { label: '含 1 份早餐', value: { breakfast: 'included', breakfastCount: 1 } },
  { label: '不含早', value: { breakfast: 'notIncluded', breakfastCount: 0 } },
];
export const DEPOSIT_OPTIONS = [
  { label: '到店付', value: 'payAtHotel' }, { label: '预付', value: 'prepay' }, { label: '无需担保', value: 'none' },
];

// ---------- ② 引导生成纯函数 ----------
/** 把一段对象片段并入 JSON 数组字段（priceCalendar|longStayDiscount）。若目标字段非法返回 null。 */
export function appendSegmentToList(arr, segment, byKey = 'type') {
  if (!Array.isArray(arr)) arr = [];
  const exists = arr.some((x) => x && x[byKey] === segment[byKey]);
  const next = exists ? arr.map((x) => (x[byKey] === segment[byKey] ? { ...x, ...segment } : x)) : [...arr, { ...segment }];
  return JSON.stringify(next);
}

/** 把 {no,floor,view} 房间追加进 rooms 数组（覆盖房间号相同项）。floor 缺省取上一间同楼层或 6。 */
export function appendRoom(rooms, no, floor, view) {
  if (!Array.isArray(rooms)) rooms = [];
  const f = Number.isInteger(floor) && floor > 0 ? floor : (rooms.length ? rooms[rooms.length - 1].floor : 6);
  const next = [...rooms.filter((r) => r.no !== no), { no, floor: f, view: view || '' }];
  return JSON.stringify(next);
}

/** 覆盖 specs 某个键（床型/含早/面积等）。单值覆盖。 */
export function overrideSpecsKey(specs, key, value, merge = false) {
  const base = { ...(specs || {}) };
  if (merge && Array.isArray(base[key]) && Array.isArray(value)) {
    base[key] = Array.from(new Set([...base[key], ...value]));
  } else {
    base[key] = value;
  }
  return JSON.stringify(base);
}

/** 把 holiday/custom 日期区间 'MM-DD' 展开为指定年份的字符串数组 dates。 */
export function expandDateRange(segment, year) {
  const y = year || String(new Date().getFullYear());
  if (!segment.dates || segment.dates.length === 0) return { ...segment, dates: [] };
  const first = segment.dates[0];
  if (first && /^\d{4}-/.test(first)) return { ...segment }; // 已是完整日期
  const dates = segment.dates.map((d) => (d.length === 5 ? `${y}-${d}` : d));
  return { ...segment, dates };
}

// ---------- ③ 列表过滤纯函数 ----------
export const CATEGORY_MAP = [
  { key: 'standard', label: '标准', match: /^(standard|superior)/ },
  { key: 'executive', label: '行政套房', match: /^(executive|\w+-suite|presidential)/ },
  { key: 'deluxe', label: '豪华', match: /^(deluxe|business)/ },
  { key: 'family', label: '家庭', match: /^(triple|family-child|apartment)/ },
  { key: 'theme', label: '主题房', match: /^theme-/ },
];
export function categorize(code) {
  const found = CATEGORY_MAP.find((c) => c.match.test(code || ''));
  return found ? found.key : 'other';
}

export function filterRoomTemplates(list, { q = '', category = 'all', bed = 'all', enabled = 'all', sort = 'sortOrder', order = 'asc' } = {}) {
  const kw = q.trim().toLowerCase();
  let out = (list || []).filter((t) => {
    if (enabled !== 'all' && Boolean(t.enabled) !== (enabled === 'enabled')) return false;
    if (category !== 'all' && categorize(t.code) !== category) return false;
    if (bed !== 'all' && !bedMatch(t, bed)) return false;
    if (kw) {
      const text = [t.name, t.code, t.specs?.bedDesc, ...(t.specs?.tags || []), ...(t.specs?.amenities || [])]
        .filter(Boolean).join(' ').toLowerCase();
      if (!text.includes(kw)) return false;
    }
    return true;
  });
  const dir = order === 'desc' ? -1 : 1;
  out = out.sort((a, b) => {
    if (sort === 'price') return (a.basePriceCent - b.basePriceCent) * dir;
    if (sort === 'sortOrder') return (a.sortOrder - b.sortOrder) * dir;
    return (String(a.name || '').localeCompare(String(b.name || ''), 'zh')) * dir;
  });
  return out;
}

function bedMatch(t, bed) {
  const b = t.specs?.bedType;
  if (bed === 'king') return b === 'king' || b === 'suite';
  if (bed === 'twin') return b === 'twin';
  if (bed === 'triple') return b === 'triple';
  if (bed === 'family') return b === 'family';
  return true;
}

export function bedLabel(bedType) {
  const map = { king: '大床', twin: '双床', single: '单人床', triple: '三床', family: '亲子床', suite: '大床' };
  return map[bedType] || '—';
}
