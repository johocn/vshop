// src/utils/ops-report.spec.ts
// 运行：node --test src/utils/ops-report.spec.ts
// 注意：相对导入必须带显式 .ts 扩展名（node 原生类型剥离要求，见 stocktake-grid.spec.ts 同款约定）
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildOpsWindow, sumShippedItems, varianceRate, ymd } from './ops-report.ts';

const NOW = new Date('2026-09-25T15:30:00');

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
});

describe('发货件数', () => {
  it('totalQuantity 为 null/undefined 按 0 计，不抛错', () => {
    assert.equal(sumShippedItems([{ totalQuantity: 3 }, { totalQuantity: null }, {}, { totalQuantity: 5 }]), 8);
  });
});

describe('盘点差异率', () => {
  it('Σ|差异件数| ÷ Σ盘点总件数，两位小数字符串', () => {
    assert.equal(varianceRate(150, 5), '3.33');
    assert.equal(varianceRate(3, 1), '33.33');
  });

  it('分母为 0 → 0.00（不做除零）', () => {
    assert.equal(varianceRate(0, 4), '0.00');
    assert.equal(varianceRate(0, 0), '0.00');
  });
});

// 注（D48）：「拣货单数」「盘库次数」的窗口判定与「盘点差异趋势」的按日聚合已整体下沉到后端
// （`pickBatchShippedCount` / `stocktakeKpi`，见 apis/picking.ts、apis/stocktake.ts），
// 原在此的 countBatches / countStocktakeTasks / varianceTrend / inWindow 单测随之删除，
// 改由 e2e 覆盖：`_e2e/_verify_d48_dashboard_kpi_window.py`（窗口上限两态 + 三 KPI 一致性）。
