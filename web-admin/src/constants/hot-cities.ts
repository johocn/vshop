/** 热门城市：内置城市库 + 归一化/校验（与 C 端 CitySelector 消费形态对齐） */
export interface HotCity {
  name: string;
  adcode?: string;
  lat?: number;
  lng?: number;
}

/** 热门城市数量上限（与弹层徽标一致） */
export const HOT_CITY_LIMIT = 20;

/** 内置常用城市库（高德区划码 + 政府驻地近似坐标），快速添加时坐标自动带出 */
export const HOT_CITY_LIBRARY: HotCity[] = [
  { name: '北京市', adcode: '110000', lat: 39.9042, lng: 116.4074 },
  { name: '上海市', adcode: '310000', lat: 31.2304, lng: 121.4737 },
  { name: '广州市', adcode: '440100', lat: 23.1291, lng: 113.2644 },
  { name: '深圳市', adcode: '440300', lat: 22.5431, lng: 114.0579 },
  { name: '杭州市', adcode: '330100', lat: 30.2741, lng: 120.1551 },
  { name: '成都市', adcode: '510100', lat: 30.5728, lng: 104.0668 },
  { name: '武汉市', adcode: '420100', lat: 30.5928, lng: 114.3055 },
  { name: '长沙市', adcode: '430100', lat: 28.2282, lng: 112.9388 },
  { name: '西安市', adcode: '610100', lat: 34.3416, lng: 108.9398 },
  { name: '南京市', adcode: '320100', lat: 32.0603, lng: 118.7969 },
  { name: '重庆市', adcode: '500000', lat: 29.563, lng: 106.5516 },
  { name: '天津市', adcode: '120000', lat: 39.3434, lng: 117.3616 },
  { name: '苏州市', adcode: '320500', lat: 31.2989, lng: 120.5853 },
  { name: '青岛市', adcode: '370200', lat: 36.0671, lng: 120.3826 },
  { name: '郑州市', adcode: '410100', lat: 34.7466, lng: 113.6254 },
  { name: '昆明市', adcode: '530100', lat: 24.8801, lng: 102.8329 },
  { name: '厦门市', adcode: '350200', lat: 24.4798, lng: 118.0894 },
  { name: '大连市', adcode: '210200', lat: 38.914, lng: 121.6147 },
  { name: '宁波市', adcode: '330200', lat: 29.8683, lng: 121.544 },
  { name: '合肥市', adcode: '340100', lat: 31.8206, lng: 117.2272 },
  { name: '福州市', adcode: '350100', lat: 26.0745, lng: 119.2965 },
  { name: '济南市', adcode: '370100', lat: 36.6512, lng: 117.1201 },
  { name: '沈阳市', adcode: '210100', lat: 41.8057, lng: 123.4315 },
  { name: '哈尔滨市', adcode: '230100', lat: 45.8038, lng: 126.535 },
];

/** 把服务端 defaults.hotCities 里的单项归一化：name 非空才保留，坐标必须是有限数字 */
export function normalizeHotCity(raw: unknown): HotCity | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  if (!name) return null;
  const out: HotCity = { name };
  if (typeof c.adcode === 'string' && c.adcode) out.adcode = c.adcode;
  if (typeof c.lat === 'number' && Number.isFinite(c.lat)) out.lat = c.lat;
  if (typeof c.lng === 'number' && Number.isFinite(c.lng)) out.lng = c.lng;
  return out;
}

/** 归一化整表（坏项丢弃而非整表拒绝，与 C 端逐项回退口径一致） */
export function normalizeHotCities(raw: unknown): HotCity[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeHotCity).filter((c): c is HotCity => c !== null);
}

/**
 * 坐标输入校验：返回错误码（拼 i18n key `hotCityErr_`），null = 通过。
 * 允许留空（不设坐标）；填了必须是有限数字且在范围内。
 */
export function coordError(lat: unknown, lng: unknown): 'lat' | 'lng' | null {
  const check = (v: unknown, min: number, max: number): boolean => {
    if (v === '' || v === null || v === undefined) return true;
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max;
  };
  if (!check(lat, -90, 90)) return 'lat';
  if (!check(lng, -180, 180)) return 'lng';
  return null;
}
