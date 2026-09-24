// src/utils/stocktake-grid.spec.ts
// 运行：node --test src/utils/stocktake-grid.spec.ts
// 注意：相对导入必须带显式 .ts 扩展名（node 原生类型剥离要求，见 R12）
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  binLabel, clampCounted, compareBin, diffSummary, filterLines, groupBinsByZone, isCounted,
  nextUncountedLine, parseScopeJson, scopeBadges, sortLines, taskProgress, waveProgress,
} from './stocktake-grid.ts';

const bins = [
  { zoneId: '1', zoneCode: 'A', zoneName: '常温区', binId: '11', binCode: 'A-02', rowNo: 1, levelNo: 2, skuCount: 0 },
  { zoneId: '1', zoneCode: 'A', zoneName: '常温区', binId: '10', binCode: 'A-01', rowNo: 1, levelNo: 1, skuCount: 3 },
  { zoneId: '2', zoneCode: 'B', zoneName: '冷藏区', binId: '20', binCode: 'B-01', rowNo: 1, levelNo: 1, skuCount: 1 },
];
const zones = [
  { id: '2', code: 'B', name: '冷藏区', sortOrder: 2 },
  { id: '1', code: 'A', name: '常温区', sortOrder: 1 },
];

const lineA = { id: '1', taskId: 't', waveId: 'w', variantId: '101', variantSku: 'SKU-A', variantName: '矿泉水', zoneId: '1', binId: '10', zoneCode: 'A', binCode: 'A-01', bookQty: 5, countedQty: null, isExtra: false };
const lineB = { ...lineA, id: '2', variantId: '102', variantSku: 'SKU-B', zoneCode: 'B', binCode: 'B-01', countedQty: 5 };
const lineC = { ...lineA, id: '3', variantId: '103', variantSku: 'SKU-C', zoneId: null, binId: null, zoneCode: null, binCode: null, bookQty: 0, countedQty: 2, isExtra: true };

describe('数量与已盘判定', () => {
  it('负数归 0、小数向下取整、非法值归 0', () => {
    assert.equal(clampCounted(-3), 0);
    assert.equal(clampCounted('7.9'), 7);
    assert.equal(clampCounted('abc'), 0);
    assert.equal(clampCounted(null), 0);
  });

  it('countedQty 为 null/undefined 算未盘，0 算已盘', () => {
    assert.equal(isCounted({ countedQty: null }), false);
    assert.equal(isCounted({ countedQty: undefined }), false);
    assert.equal(isCounted({ countedQty: 0 }), true);
  });
});

describe('库区 → 格子宫格（版式 B 主视图）', () => {
  it('库区按 sortOrder 排，格子按 rowNo/levelNo 排，空格子保留', () => {
    const g = groupBinsByZone(bins, zones);
    assert.deepEqual(g.map((z) => z.zoneCode), ['A', 'B']);
    assert.deepEqual(g[0].bins.map((b) => b.binCode), ['A-01', 'A-02']);
    assert.equal(g[0].bins[1].skuCount, 0);
  });

  it('库区摘要给出 SKU 合计与空格数', () => {
    const g = groupBinsByZone(bins, zones);
    assert.equal(g[0].skuTotal, 3);
    assert.equal(g[0].emptyBins, 1);
  });

  it('无库区元数据时退回行内快照的编码与名称', () => {
    const g = groupBinsByZone(bins, []);
    assert.equal(g.length, 2);
    assert.equal(g[0].zoneName, '常温区');
  });

  it('rowNo/levelNo 相同的空格子（zone 档）按编码排', () => {
    const rows = [
      { ...bins[1], binId: 'x', binCode: 'A-09', rowNo: 0, levelNo: 0 },
      { ...bins[1], binId: 'y', binCode: 'A-03', rowNo: 0, levelNo: 0 },
    ];
    assert.deepEqual([...rows].sort(compareBin).map((b) => b.binCode), ['A-03', 'A-09']);
  });
});

describe('进度计算', () => {
  it('盘次进度：已盘/应盘四舍五入；应盘 0 项视为 100%', () => {
    assert.deepEqual(waveProgress({ expectedCount: 10, countedCount: 3, state: 'COUNTING' }), { counted: 3, expected: 10, percent: 30, done: false });
    assert.equal(waveProgress({ expectedCount: 10, countedCount: 10, state: 'COUNTING' }).done, true);
    assert.equal(waveProgress({ expectedCount: 0, countedCount: 0, state: 'SUBMITTED' }).percent, 100);
    assert.equal(waveProgress({ expectedCount: 4, countedCount: 4, state: 'SUBMITTED' }).done, true);
  });

  it('任务进度：COUNTED/POSTED 视为完成，应盘 0 项为 100%', () => {
    assert.equal(taskProgress({ expectedTotal: 8, countedTotal: 2, waveCount: 3, submittedWaveCount: 1, state: 'COUNTING' }).percent, 25);
    assert.equal(taskProgress({ expectedTotal: 0, countedTotal: 0, waveCount: 1, submittedWaveCount: 1, state: 'COUNTED' }).percent, 100);
    assert.equal(taskProgress({ expectedTotal: 8, countedTotal: 8, waveCount: 3, submittedWaveCount: 3, state: 'COUNTED' }).done, true);
    assert.equal(taskProgress({ expectedTotal: 8, countedTotal: 0, waveCount: 3, submittedWaveCount: 0, state: 'OPEN' }).done, false);
  });
});

describe('应盘行排序与筛选', () => {
  it('未盘行优先，其次按库区码 → 库位码 → SKU；未归位（无库区码）排最后', () => {
    assert.deepEqual(sortLines([lineB, lineC, lineA]).map((l) => l.id), ['1', '2', '3']);
  });

  it('筛选：未盘 / 已盘 / 盘盈 / 差异四类，多条件为「与」', () => {
    assert.deepEqual(filterLines([lineA, lineB, lineC], { onlyUncounted: true }).map((l) => l.id), ['1']);
    assert.deepEqual(filterLines([lineA, lineB, lineC], { onlyCounted: true }).map((l) => l.id), ['2', '3']);
    assert.deepEqual(filterLines([lineA, lineB, lineC], { onlyExtra: true }).map((l) => l.id), ['3']);
    assert.deepEqual(filterLines([lineA, lineB, lineC], { onlyDiff: true }).map((l) => l.id), ['3']);
    assert.deepEqual(filterLines([lineA, lineB, lineC], { onlyCounted: true, onlyUncounted: true }), []);
  });
});

describe('圈范围与差异摘要', () => {
  it('scopeJson 容错解析：坏 JSON / null 一律退回默认，缺 includeZeroBook 按 true', () => {
    assert.deepEqual(parseScopeJson(null), { zones: [], categoryIds: [], variantIds: [], includeZeroBook: true });
    assert.deepEqual(parseScopeJson('not-json'), { zones: [], categoryIds: [], variantIds: [], includeZeroBook: true });
    assert.deepEqual(parseScopeJson('{"zones":[1,"2"],"includeZeroBook":false}'), { zones: [1, 2], categoryIds: [], variantIds: [], includeZeroBook: false });
    assert.equal(parseScopeJson('{}').includeZeroBook, true);
  });

  it('圈范围徽标：空范围给 ALL，有范围给「维度:数量」', () => {
    assert.deepEqual(scopeBadges(parseScopeJson(null)), ['ALL']);
    assert.deepEqual(scopeBadges({ zones: [1, 2], categoryIds: [], variantIds: [], includeZeroBook: true }), ['Z:2']);
  });

  it('差异摘要：有未盘项或账面变动 → needConfirm', () => {
    assert.equal(diffSummary({ expectedTotal: 10, countedTotal: 7, uncountedCount: 3, extraCount: 0, diffCount: 0, recheck: false }).needConfirm, true);
    assert.equal(diffSummary({ expectedTotal: 10, countedTotal: 10, uncountedCount: 0, extraCount: 0, diffCount: 0, recheck: true }).needConfirm, true);
    assert.equal(diffSummary({ expectedTotal: 10, countedTotal: 10, uncountedCount: 0, extraCount: 1, diffCount: 1, recheck: false }).needConfirm, false);
  });

  it('格子标签：bin 档给库位码，zone 档给库区码，都缺给占位符', () => {
    assert.equal(binLabel({ zoneCode: 'A', binCode: 'A-01' }, true), 'A-01');
    assert.equal(binLabel({ zoneCode: 'A', binCode: 'A-01' }, false), 'A');
    assert.equal(binLabel({ zoneCode: null, binCode: null }, true), '—');
  });
});

describe('单件专注（版式 C）的下一件', () => {
  it('从当前件之后循环找未盘；全盘完返回 null；当前件为空时取第一件未盘', () => {
    const rows = [lineA, lineB, lineC];
    assert.equal(nextUncountedLine(rows, '2')?.id, '1');
    assert.equal(nextUncountedLine(rows, null)?.id, '1');
    assert.equal(nextUncountedLine([lineB, lineC], '2'), null);
  });
});