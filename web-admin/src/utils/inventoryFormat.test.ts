// 项目未配置 vitest，使用 node:test + tsx 临时运行（npx tsx --test src/utils/inventoryFormat.test.ts）
// @ts-nocheck 项目未装 @types/node，node:test 类型不在 tsconfig types 环境内；运行由 tsx 保证
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bizTypeKey,
  bucketKey,
  dayKey,
  dirKey,
  fenToYuan,
  formatDateTime,
  moneyLabel,
  parseQtyInput,
  sortKey,
  suggestQty,
} from './inventoryFormat';

describe('fenToYuan', () => {
  it('分转元保留两位小数', () => {
    assert.equal(fenToYuan(1234), '12.34');
    assert.equal(fenToYuan(0), '0.00');
    assert.equal(fenToYuan(5), '0.05');
  });
  it('非法值回退 0.00', () => {
    assert.equal(fenToYuan(Number.NaN), '0.00');
    assert.equal(fenToYuan(undefined as any), '0.00');
  });
});

describe('moneyLabel', () => {
  it('合法分返回带符号金额', () => {
    assert.equal(moneyLabel(1999), '¥19.99');
    assert.equal(moneyLabel(0), '¥0.00');
  });
  it('null/负数/非法 → 占位「—」（列表里无成本价）', () => {
    assert.equal(moneyLabel(null), '—');
    assert.equal(moneyLabel(undefined), '—');
    assert.equal(moneyLabel(-1), '—');
  });
});

describe('suggestQty', () => {
  it('缺口为正时向上取整', () => {
    assert.equal(suggestQty(10, 3), 7);
    assert.equal(suggestQty(10, 10), 0);
    assert.equal(suggestQty(10, 20), 0);
  });
  it('安全库存含小数时向上取整', () => {
    assert.equal(suggestQty(10.2, 3), 8);
  });
  it('非法入参 → 0', () => {
    assert.equal(suggestQty(Number.NaN, 3), 0);
    assert.equal(suggestQty(10, Number.NaN), 0);
  });
});

describe('parseQtyInput', () => {
  it('非负整数原样返回（截断小数）', () => {
    assert.equal(parseQtyInput('12'), 12);
    assert.equal(parseQtyInput('12.9'), 12);
    assert.equal(parseQtyInput(7), 7);
    assert.equal(parseQtyInput(' 8 '), 8);
  });
  it('空/非法/负数 → fallback', () => {
    assert.equal(parseQtyInput(''), 0);
    assert.equal(parseQtyInput(null), 0);
    assert.equal(parseQtyInput('abc'), 0);
    assert.equal(parseQtyInput('-3'), 0);
    assert.equal(parseQtyInput('x', 5), 5);
  });
});

describe('bizTypeKey', () => {
  it('白名单命中', () => {
    assert.equal(bizTypeKey('order'), 'move.order');
    assert.equal(bizTypeKey('afterSales'), 'move.afterSales');
    assert.equal(bizTypeKey('purchase'), 'move.purchase');
    assert.equal(bizTypeKey('stockMove'), 'move.stockMove');
    assert.equal(bizTypeKey('stocktake'), 'move.stocktake');
    assert.equal(bizTypeKey('stockOut'), 'move.stockOut');
    assert.equal(bizTypeKey('stockIn'), 'move.stockIn');
    assert.equal(bizTypeKey('manual'), 'move.manual');
    assert.equal(bizTypeKey('mirror'), 'move.mirror');
  });
  it('未知/空 → 兜底 manual', () => {
    assert.equal(bizTypeKey('who-knows'), 'move.manual');
    assert.equal(bizTypeKey(null), 'move.manual');
  });
});

describe('dirKey', () => {
  it('只有 out 视为出库', () => {
    assert.equal(dirKey('out'), 'move.out');
    assert.equal(dirKey('in'), 'move.in');
    assert.equal(dirKey(null), 'move.in');
    assert.equal(dirKey('OUT'), 'move.in');
  });
});

describe('bucketKey / sortKey', () => {
  it('分桶白名单映射', () => {
    assert.equal(bucketKey('out'), 'bucket.out');
    assert.equal(bucketKey('low'), 'bucket.low');
    assert.equal(bucketKey('ok'), 'bucket.ok');
    assert.equal(bucketKey(''), 'bucket.all');
    assert.equal(bucketKey('bogus'), 'bucket.all');
  });
  it('排序白名单映射（非法回退 stockAsc）', () => {
    assert.equal(sortKey('stockDesc'), 'sort.stockDesc');
    assert.equal(sortKey('gapDesc'), 'sort.gapDesc');
    assert.equal(sortKey('valueDesc'), 'sort.valueDesc');
    assert.equal(sortKey('stockAsc'), 'sort.stockAsc');
    assert.equal(sortKey(null), 'sort.stockAsc');
    assert.equal(sortKey('bogus'), 'sort.stockAsc');
  });
});

describe('formatDateTime / dayKey', () => {
  it('本地时区格式化 MM-DD HH:mm', () => {
    const iso = new Date(2026, 8, 21, 9, 5).toISOString(); // 2026-09-21 09:05 本地
    assert.equal(formatDateTime(iso), '09-21 09:05');
    assert.equal(dayKey(iso), '2026-09-21');
  });
  it('空/非法 → 空串', () => {
    assert.equal(formatDateTime(null), '');
    assert.equal(formatDateTime('not-a-date'), '');
    assert.equal(dayKey(''), '');
    assert.equal(dayKey('not-a-date'), '');
  });
});