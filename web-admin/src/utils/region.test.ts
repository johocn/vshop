import { describe, expect, it } from 'vitest';
import {
    composeProvinceList,
    composeRegionText,
    findCity,
    getCities,
    getDistricts,
    getProvinces,
    parseProvinceList,
    parseRegionText,
    resolveCodes,
} from './region';

describe('region 数据层', () => {
    it('省级覆盖全国（含港澳台）', () => {
        const list = getProvinces();
        expect(list.length).toBeGreaterThanOrEqual(34);
        expect(list.some((p) => p.name === '广东省' && p.code === '440000')).toBe(true);
        expect(list.some((p) => p.name === '香港特别行政区' && p.code === '810000')).toBe(true);
    });

    it('省 → 市 → 区三级数据与 adcode', () => {
        expect(getCities('广东省').some((c) => c.name === '深圳市' && c.code === '440300')).toBe(true);
        expect(getDistricts('深圳市', '广东省').some((d) => d.name === '南山区' && d.code === '440305')).toBe(true);
        expect(getDistricts('440300').length).toBeGreaterThan(5);
    });

    it('直辖市市级显示省份同名，并兼容旧数据「市辖区」', () => {
        expect(getCities('北京市')[0]).toEqual({ code: '110100', name: '北京市' });
        expect(findCity('市辖区', '北京市')?.code).toBe('110100');
    });

    it('名称 → code 回填', () => {
        expect(resolveCodes('广东省', '深圳市', '南山区')).toEqual({
            provinceCode: '440000',
            cityCode: '440300',
            districtCode: '440305',
        });
        expect(resolveCodes('', '', '')).toEqual({ provinceCode: '', cityCode: '', districtCode: '' });
    });

    it('历史自由文本解析：完全匹配', () => {
        const r = parseRegionText('广东省深圳市南山区科技园路1号');
        expect(r.province).toBe('广东省');
        expect(r.city).toBe('深圳市');
        expect(r.district).toBe('南山区');
        expect(r.detail).toBe('科技园路1号');
    });

    it('历史自由文本解析：直辖市 / 只到市 / 无法匹配不丢原文', () => {
        const bj = parseRegionText('北京市海淀区中关村大街1号');
        expect(bj.province).toBe('北京市');
        expect(bj.city).toBe('北京市');
        expect(bj.district).toBe('海淀区');
        expect(bj.detail).toBe('中关村大街1号');

        const cityOnly = parseRegionText('广东省深圳市南山区', 'city');
        expect(cityOnly.city).toBe('深圳市');
        expect(cityOnly.district).toBe('');
        expect(cityOnly.detail).toBe('南山区');

        const legacy = parseRegionText('某某园区 A 栋 101');
        expect(legacy.province).toBe('');
        expect(legacy.detail).toBe('某某园区 A 栋 101');
    });

    it('拼接与省份列表解析（配送范围兼容自由文本）', () => {
        expect(composeRegionText({ province: '广东省', city: '深圳市', district: '南山区' }, '科技园路1号')).toBe(
            '广东省深圳市南山区科技园路1号',
        );
        // 直辖市省、市同名，拼接只保留一次
        expect(composeRegionText({ province: '北京市', city: '北京市', district: '东城区' }, '甲1号')).toBe('北京市东城区甲1号');
        expect(parseProvinceList('广东省,广西壮族自治区 偏远地区')).toEqual(['广东省', '广西壮族自治区', '偏远地区']);
        expect(composeProvinceList(['广东省', '偏远地区'])).toBe('广东省,偏远地区');
    });

    it('直辖市地址保存后回填（拼接闭环 + 兼容重复省份旧格式）', () => {
        const text = composeRegionText({ province: '北京市', city: '北京市', district: '东城区' }, '甲1号');
        const r = parseRegionText(text);
        expect(r.province).toBe('北京市');
        expect(r.city).toBe('北京市');
        expect(r.district).toBe('东城区');
        expect(r.detail).toBe('甲1号');
        expect(r.cityCode).toBe('110100');
        expect(r.districtCode).toBe('110101');

        const legacy = parseRegionText('北京市北京市东城区甲1号');
        expect(legacy.province).toBe('北京市');
        expect(legacy.city).toBe('北京市');
        expect(legacy.district).toBe('东城区');
        expect(legacy.detail).toBe('甲1号');
    });
});
