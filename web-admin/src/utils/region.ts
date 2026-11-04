/**
 * 中国行政区划数据层（省/市/区三级）
 *
 * 数据源：src/constants/china-regions.ts（离线数据，随构建打包，不请求任何第三方 CDN）。
 * 后端 `provinces`（Vendure region 表）目前只有 Country，故不依赖该接口；
 * cjk-plugin 的 `mapDistricts` 虽可用，但这里统一走前端确定性数据，避免网络/租户差异。
 *
 * - 省/市 code 统一为 6 位行政区划代码（adcode），区县 code 即数据源原值；
 * - 直辖市（北京/天津/上海/重庆）的市级节点显示为省份同名，避免表单里出现「市辖区」；
 * - 港澳台数据源未覆盖，仅补省级节点，允许只选到省（符合"允许只选到市或省"）。
 */
import { CHINA_REGIONS, type RawRegion } from '../constants/china-regions';

export interface RegionNode {
    /** 6 位行政区划代码 */
    code: string;
    name: string;
}

export type RegionLevel = 'province' | 'city' | 'district';

export interface RegionSelection {
    province: string;
    city: string;
    district: string;
    provinceCode: string;
    cityCode: string;
    districtCode: string;
}

const MUNICIPALITY_CODES = ['110000', '120000', '310000', '500000'];

const PROVINCES: RegionNode[] = CHINA_REGIONS.map((p: RawRegion) => ({ code: p.c, name: p.n }));

const CITIES_BY_PROVINCE: Record<string, RegionNode[]> = {};
const DISTRICTS_BY_CITY: Record<string, RegionNode[]> = {};

for (const p of CHINA_REGIONS) {
    const provinceCode = p.c;
    const cities: RegionNode[] = (p.ch || []).map((c) => {
        const districts = (c.ch || []).map((d) => ({ code: d.c, name: d.n }));
        DISTRICTS_BY_CITY[c.c] = districts;
        return { code: c.c, name: c.n };
    });
    CITIES_BY_PROVINCE[provinceCode] = cities;
}

PROVINCES.sort((a, b) => a.code.localeCompare(b.code));

/** 省级列表（34 个，含港澳台） */
export function getProvinces(): RegionNode[] {
    return PROVINCES.map((p) => ({ ...p }));
}

/** 按省（名称或 code）取市级列表；未知省返回空数组 */
export function getCities(province: string): RegionNode[] {
    const p = findProvince(province);
    if (!p) return [];
    return (CITIES_BY_PROVINCE[p.code] || []).map((c) => ({ ...c }));
}

/** 按市（code 或名称，需配合省名消歧）取区县列表 */
export function getDistricts(city: string, province?: string): RegionNode[] {
    const c = findCity(city, province);
    if (!c) return [];
    return (DISTRICTS_BY_CITY[c.code] || []).map((d) => ({ ...d }));
}

export function findProvince(nameOrCode: string): RegionNode | undefined {
    const v = (nameOrCode || '').trim();
    if (!v) return undefined;
    return PROVINCES.find((p) => p.code === v || p.name === v);
}

export function findCity(nameOrCode: string, province?: string): RegionNode | undefined {
    const v = (nameOrCode || '').trim();
    if (!v) return undefined;
    const p = province ? findProvince(province) : undefined;
    const pool = p ? (CITIES_BY_PROVINCE[p.code] || []) : Object.values(CITIES_BY_PROVINCE).flat();
    // 兼容旧数据（旧 picker 会把直辖市市级存成「市辖区」）
    if (v === '市辖区') return pool[0];
    return pool.find((c) => c.code === v || c.name === v);
}

export function findDistrict(nameOrCode: string, city?: string, province?: string): RegionNode | undefined {
    const v = (nameOrCode || '').trim();
    if (!v) return undefined;
    const c = city ? findCity(city, province) : undefined;
    const pool = c ? (DISTRICTS_BY_CITY[c.code] || []) : Object.values(DISTRICTS_BY_CITY).flat();
    return pool.find((d) => d.code === v || d.name === v);
}

/** 名称 → 三级 code（回填后提交给后端 cityCode 等字段用） */
export function resolveCodes(province: string, city: string, district: string): Pick<RegionSelection, 'provinceCode' | 'cityCode' | 'districtCode'> {
    const p = findProvince(province);
    const c = p ? findCity(city, p.name) : undefined;
    const d = c ? findDistrict(district, c.name, p?.name) : undefined;
    return { provinceCode: p?.code || '', cityCode: c?.code || '', districtCode: d?.code || '' };
}

function stripSep(s: string): string {
    return s.replace(/^[\s,，/、|]+/, '');
}

/**
 * 解析历史自由文本地址 → 省/市/区 + 剩余详细地址。
 * 匹配失败的部分原样保留在 detail，保证不丢历史数据。
 */
export function parseRegionText(text: string, level: RegionLevel = 'district'): RegionSelection & { detail: string } {
    const raw = (text || '').trim();
    const empty = { province: '', city: '', district: '', provinceCode: '', cityCode: '', districtCode: '', detail: raw };
    if (!raw) return empty;

    // 省级：优先最长匹配（如「内蒙古自治区」优于「内蒙古」）
    const province = [...PROVINCES]
        .sort((a, b) => b.name.length - a.name.length)
        .find((p) => raw.startsWith(p.name));
    if (!province) return empty;

    let rest = stripSep(raw.slice(province.name.length));
    let city = '';
    let cityCode = '';
    if (level !== 'province') {
        const cities = CITIES_BY_PROVINCE[province.code] || [];
        const hit = [...cities]
            .sort((a, b) => b.name.length - a.name.length)
            .find((c) => c.name !== province.name && rest.startsWith(c.name));
        if (hit) {
            city = hit.name;
            cityCode = hit.code;
            rest = stripSep(rest.slice(hit.name.length));
        } else if (MUNICIPALITY_CODES.includes(province.code)) {
            // 直辖市历史地址常写成「北京市海淀区…」，市级与省同名且被跳过，这里补回市级
            const muni = cities.find((c) => c.name === province.name);
            if (muni && (DISTRICTS_BY_CITY[muni.code] || []).some((d) => rest.startsWith(d.name))) {
                city = muni.name;
                cityCode = muni.code;
            }
        }
    }

    let district = '';
    let districtCode = '';
    if (level === 'district' && city) {
        const districts = DISTRICTS_BY_CITY[cityCode] || [];
        const hit = [...districts]
            .sort((a, b) => b.name.length - a.name.length)
            .find((d) => rest.startsWith(d.name));
        if (hit) {
            district = hit.name;
            districtCode = hit.code;
            rest = stripSep(rest.slice(hit.name.length));
        }
    }

    return {
        province: province.name,
        city,
        district,
        provinceCode: province.code,
        cityCode,
        districtCode,
        detail: rest,
    };
}

/** 省/市/区 + 详细地址 → 后端单一字符串地址字段 */
export function composeRegionText(sel: Pick<RegionSelection, 'province' | 'city' | 'district'>, detail: string): string {
    const prefix = [sel.province, sel.city, sel.district].filter(Boolean).join('');
    const tail = (detail || '').trim();
    return prefix + tail;
}

/** 逗号分隔的省份文本（配送范围等字段）→ 合法省名数组 */
export function parseProvinceList(text: string): string[] {
    return (text || '')
        .split(/[,，、;；\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => findProvince(s)?.name || s)
        .filter((s, i, arr) => arr.indexOf(s) === i);
}

export function composeProvinceList(names: string[]): string {
    return names.filter(Boolean).join(',');
}
