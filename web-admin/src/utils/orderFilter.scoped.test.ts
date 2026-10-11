// npx tsx --test src/utils/orderFilter.scoped.test.ts
// @ts-nocheck
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildScopedFilter } from './orderFilter';

describe('buildScopedFilter', () => {
  it('空输入 → 空对象', () => {
    assert.deepEqual(buildScopedFilter({}), {});
  });
  it('states/delivery/afterSales 透传，时间解析为半开区间', () => {
    const out = buildScopedFilter({
      states: ['PaymentSettled'],
      delivery: 'pickup',
      afterSales: ['Pending'],
      time: { key: 'today' },
    }, new Date(2026, 9, 11, 12));
    assert.deepEqual(out.states, ['PaymentSettled']);
    assert.equal(out.deliveryType, 'pickup');
    assert.deepEqual(out.afterSales, ['Pending']);
    assert.ok(out.timeStart && out.timeEnd && out.timeStart < out.timeEnd);
  });
  it('exceptionOnly → exceptionType 置空 + exceptionOnly=true', () => {
    const out = buildScopedFilter({ exceptionOnly: true });
    assert.equal(out.exceptionOnly, true);
    assert.equal(out.exceptionType, undefined);
  });
  it('exceptionType 优先于 exceptionOnly', () => {
    const out = buildScopedFilter({ exceptionOnly: true, exceptionType: 'damaged' });
    assert.equal(out.exceptionType, 'damaged');
    assert.equal(out.exceptionOnly, undefined);
  });
});
