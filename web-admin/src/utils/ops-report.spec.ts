// src/utils/ops-report.spec.ts
// 运行：node --test src/utils/ops-report.spec.ts
// 注意：相对导入必须带显式 .ts 扩展名（node 原生类型剥离要求，见 stocktake-grid.spec.ts 同款约定）
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildOpsWindow, countBatches, countStocktakeTasks, inWindow, sumShippedItems,
  varianceRate, varianceTrend, ymd,
} from './ops-report.ts';

const NOW = new Date('2026-09-25T15:30:00');

function batch(state: string, createdAt: string) {
  return { state, createdAt } as any;
}

function task(state: string, createdAt: string) {
  return { state, createdAt } as any;
}

function diff(expectedTotal: number, diffCount: number) {
  return { expectedTotal, diffCount } as any;
}

describe('时间窗口', () => {
  it('近 7 天窗口 = [今天-6 00:00, 明天 00:00)', () => {
    const w = buildOpsWindow(7, NOW);
    assert.equal(ymd(w.start), '2026-09-19');
    assert.equal(ymd(w.end), '2026-09-26');
    assert.equal(w.start.getHours(), 0);
    assert.equal(w.days, 7);
  });

  it('近 30 天窗口 = [今天-29 00:00, 明天 00:00)', () => {
    const w = buildOpsWindow(30, NOW);
    assert.equal(ymd(w.start), '2026-08-27');
    assert.equal(w.days, 30);
  });

  it('inWindow 左闭右开，空值与非法值一律不算在窗口内', () => {
    const w = buildOpsWindow(7, NOW);
    assert.equal(inWindow('2026-09-19T00:00:00', w), true);
    assert.equal(inWindow('2026-09-25T23:59:59', w), true);
    assert.equal(inWindow('2026-09-26T00:00:00', w), false);
    assert.equal(inWindow('2026-09-18T23:59:59', w), false);
    assert.equal(inWindow(null, w), false);
    assert.equal(inWindow('not-a-date', w), false);
  });
});

describe('拣货单数', () => {
  it('只计 SHIPPED/HANDOVER/REVIEWED，且按 createdAt 归期', () => {
    const w = buildOpsWindow(7, NOW);
    const rows = [
      batch('SHIPPED', '2026-09-20T09:00:00'),
      batch('HANDOVER', '2026-09-25T09:00:00'),
      batch('REVIEWED', '2026-09-19T00:00:00'),
      batch('PRINTED', '2026-09-24T09:00:00'),
      batch('EXCEPTION', '2026-09-24T09:00:00'),
      batch('CANCELLED', '2026-09-24T09:00:00'),
      batch('SHIPPED', '2026-09-18T09:00:00'),
    ];
    assert.equal(countBatches(rows, w), 3);
  });
});

describe('发货件数', () => {
  it('totalQuantity 为 null/undefined 按 0 计，不抛错', () => {
    assert.equal(sumShippedItems([{ totalQuantity: 3 }, { totalQuantity: null }, {}, { totalQuantity: 5 }]), 8);
  });
});

describe('盘库次数', () => {
  it('只计 SUBMITTED/POSTED，DRAFT/OPEN/COUNTING/CANCELLED 不计', () => {
    const w = buildOpsWindow(7, NOW);
    const rows = [
      task('SUBMITTED', '2026-09-24T09:00:00'),
      task('POSTED', '2026-09-19T00:00:00'),
      task('DRAFT', '2026-09-24T09:00:00'),
      task('OPEN', '2026-09-24T09:00:00'),
      task('COUNTING', '2026-09-24T09:00:00'),
      task('CANCELLED', '2026-09-24T09:00:00'),
      task('POSTED', '2026-09-18T09:00:00'),
    ];
    assert.equal(countStocktakeTasks(rows, w), 2);
  });
});

describe('盘点差异率', () => {
  it('Σ|差异件数| ÷ Σ盘点总件数，两位小数字符串', () => {
    const r = varianceRate([diff(100, 3), diff(50, -2)]);
    assert.equal(r.expected, 150);
    assert.equal(r.diff, 5);
    assert.equal(r.rate, '3.33');
  });

  it('分母为 0 → 0.00（不做除零）', () => {
    assert.equal(varianceRate([diff(0, 4)]).rate, '0.00');
    assert.equal(varianceRate([]).rate, '0.00');
  });

  it('缺字段的差异体按 0 计，不抛错', () => {
    assert.equal(varianceRate([{} as any]).rate, '0.00');
  });
});

describe('差异趋势', () => {
  it('窗口内每一天都有一行（无数据日为 0），按 createdAt 归期', () => {
    const w = buildOpsWindow(7, NOW);
    const rows = varianceTrend(
      [
        { createdAt: '2026-09-20T10:00:00', diff: diff(40, 2) },
        { createdAt: '2026-09-20T18:00:00', diff: diff(10, -1) },
        { createdAt: '2026-09-25T10:00:00', diff: diff(20, 0) },
      ],
      w,
    );
    assert.equal(rows.length, 7);
    assert.deepEqual(rows[0], { day: '2026-09-19', expected: 0, diff: 0 });
    assert.deepEqual(rows[1], { day: '2026-09-20', expected: 50, diff: 3 });
    assert.deepEqual(rows[6], { day: '2026-09-25', expected: 20, diff: 0 });
  });

  it('窗口外的任务不进任何一格', () => {
    const w = buildOpsWindow(7, NOW);
    const rows = varianceTrend([{ createdAt: '2026-09-18T10:00:00', diff: diff(40, 2) }], w);
    assert.equal(rows.reduce((s, r) => s + r.diff, 0), 0);
  });
});

// 注（D46）：「作业员明细」的聚合与类型口径原在此有 3 条单测（`groupByOperator` / `opsCountableDocs`），
// 现已整体下沉到后端 `stockDocOperatorStats`（SQL GROUP BY + 排除 STOCKTAKE），纯函数被删除，
// 故单测改为 e2e 覆盖：`_e2e/_verify_d46_ops_counter_window.py`（窗口上限两态）
// 与 `_e2e/_verify_d43_ops_counter_scope.py`（STOCKTAKE 排除口径）。