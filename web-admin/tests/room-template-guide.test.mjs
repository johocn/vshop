import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendSegmentToList, appendRoom, overrideSpecsKey, expandDateRange,
  categorize, filterRoomTemplates, PRICE_SEGMENT_PRESETS, BED_OPTIONS,
} from '../src/utils/room-template-guide.js';

const sample = [
  { code: 'deluxe-suite', name: '豪华套房', enabled: true, sortOrder: 10, basePriceCent: 118800, specs: { bedType: 'suite', bedDesc: '大床 2.0m', tags: ['客厅', '泡浴'] } },
  { code: 'theme-game', name: '电竞主题房', enabled: true, sortOrder: 20, basePriceCent: 49800, specs: { bedType: 'twin', bedDesc: '电竞双床', tags: ['电竞', '高配'] } },
  { code: 'standard-king', name: '标准大床房', enabled: false, sortOrder: 5, basePriceCent: 28800, specs: { bedType: 'king', bedDesc: '大床 1.8m', tags: ['安静'] } },
];

test('appendSegmentToList 相同 type 覆盖、新 segment 追加', () => {
  const out = JSON.parse(appendSegmentToList([{ type: 'weekday', rate: 1.0 }], { type: 'weekday', rate: 1.2 }));
  assert.equal(out.length, 1);
  assert.equal(out[0].rate, 1.2);
  const out2 = JSON.parse(appendSegmentToList(out, { type: 'weekend', rate: 1.2 }));
  assert.equal(out2.length, 2);
});

test('appendRoom 房间号去重重排、floor 缺省取上一间', () => {
  const arr = [{ no: '601', floor: 6, view: '湖景' }];
  const out = JSON.parse(appendRoom(arr, '602', null, '湖景'));
  assert.equal(out.length, 2);
  assert.equal(out[1].floor, 6); // 缺省继承
  const out2 = JSON.parse(appendRoom(out, '601', 7, '城景'));
  assert.equal(out2.length, 2);
  assert.equal(out2.find((r) => r.no === '601').floor, 7);
});

test('overrideSpecsKey 单值覆盖 + 数组合并去重', () => {
  assert.equal(JSON.parse(overrideSpecsKey({ tags: ['湖景'] }, 'tags', ['湖景', '江景'], true)).tags.join(','), '湖景,江景');
  assert.equal(JSON.parse(overrideSpecsKey({ bedType: 'king' }, 'bedType', 'twin')).bedType, 'twin');
});

test('expandDateRange 5位补全年份，4位保持', () => {
  const out = expandDateRange({ type: 'custom', dates: ['07-01', '07-31'] }, 2026);
  assert.deepEqual(out.dates, ['2026-07-01', '2026-07-31']);
  const keep = expandDateRange({ type: 'holiday', dates: ['2026-10-01'] }, 2026);
  assert.deepEqual(keep.dates, ['2026-10-01']);
});

test('categorize code 分类', () => {
  assert.equal(categorize('deluxe-suite'), 'executive');
  assert.equal(categorize('theme-game'), 'theme');
  assert.equal(categorize('some-custom'), 'other');
});

test('filterRoomTemplates 关键词 + 分类 + 床型 + 启用 + 排序', () => {
  assert.equal(filterRoomTemplates(sample, { q: '电竞' }).length, 1);
  assert.equal(filterRoomTemplates(sample, { category: 'executive' }).length, 1);
  assert.equal(filterRoomTemplates(sample, { bed: 'twin' }).length, 1);
  assert.equal(filterRoomTemplates(sample, { enabled: 'enabled' }).length, 2);
  const priceAsc = filterRoomTemplates(sample, { sort: 'price', order: 'asc' });
  assert.equal(priceAsc[0].code, 'standard-king');
  const priceDesc = filterRoomTemplates(sample, { sort: 'price', order: 'desc' });
  assert.equal(priceDesc[0].code, 'deluxe-suite');
});

test('预设片段非空且结构合法', () => {
  assert.ok(PRICE_SEGMENT_PRESETS.length >= 5);
  assert.ok(BED_OPTIONS.length >= 3);
});
