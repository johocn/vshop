// 项目未配置 vitest，使用 node:test + tsx 运行（npx tsx --test src/utils/orderFilter.test.ts）
// @ts-nocheck 项目未装 @types/node，node:test 类型不在 tsconfig types 环境内；运行由 tsx 保证
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTimeWindow,
  inTimeWindow,
  buildOrderFilter,
  STATE_GROUPS,
  EXCEPTION_TYPES,
  AFTER_SALES_OPEN,
  TO_SHIP_STATES,
  UNPAID_STATES,
} from './orderFilter';
import { ORDER_STATES } from '../constants/orderState';

// 固定“现在”= 2026-09-21 15:30 本地时间，保证测试与运行机器时区无关（用本地构造器）
const NOW = new Date(2026, 8, 21, 15, 30, 0, 0);
const H = (iso: string) => new Date(iso);

describe('resolveTimeWindow', () => {
  it('空键 → null（不拼 filter）', () => {
    assert.equal(resolveTimeWindow({}, NOW), null);
    assert.equal(resolveTimeWindow({ key: '' }, NOW), null);
  });
  it('今日 = [今日 0 点字面, 次日 0 点字面]（本地日历字面挂 Z，非真实瞬时）', () => {
    const w = resolveTimeWindow({ key: 'today' }, NOW)!;
    // NOW=本地 2026-09-21 15:30 → 字面窗 [2026-09-21T00:00Z, 2026-09-22T00:00Z)
    // 若输出真实瞬时（东八区 16:00Z）则断言失败：列存本地字面，真实瞬时窗会整体偏 8h
    assert.equal(w.start, '2026-09-21T00:00:00.000Z');
    assert.equal(w.end, '2026-09-22T00:00:00.000Z');
  });
  it('近7天 = [今日-6天 0 点字面, 次日 0 点字面]', () => {
    const w = resolveTimeWindow({ key: '7d' }, NOW)!;
    assert.equal(w.start, '2026-09-15T00:00:00.000Z');
    assert.equal(w.end, '2026-09-22T00:00:00.000Z');
  });
  it('本月 = [本月 1 日 0 点字面, 次月 1 日 0 点字面]', () => {
    const w = resolveTimeWindow({ key: 'month' }, NOW)!;
    assert.equal(w.start, '2026-09-01T00:00:00.000Z');
    assert.equal(w.end, '2026-10-01T00:00:00.000Z');
  });
  it('自定义 = [起始日 0 点字面, 结束日次日 0 点字面]', () => {
    const w = resolveTimeWindow({ key: 'custom', from: '2026-09-01', to: '2026-09-03' }, NOW)!;
    assert.equal(w.start, '2026-09-01T00:00:00.000Z');
    assert.equal(w.end, '2026-09-04T00:00:00.000Z');
  });
  it('自定义起止颠倒 → 自动交换（不返回空结果）', () => {
    const w = resolveTimeWindow({ key: 'custom', from: '2026-09-03', to: '2026-09-01' }, NOW)!;
    assert.equal(H(w.start).getDate(), 1);
    assert.equal(H(w.end).getDate(), 4);
  });
  it('自定义非法/缺字段 → null', () => {
    assert.equal(resolveTimeWindow({ key: 'custom', from: '2026/09/01', to: '2026-09-03' }, NOW), null);
    assert.equal(resolveTimeWindow({ key: 'custom', from: '2026-09-01' }, NOW), null);
    assert.equal(resolveTimeWindow({ key: 'custom' }, NOW), null);
  });
  it('跨年本月边界正确', () => {
    const w = resolveTimeWindow({ key: 'month' }, new Date(2026, 11, 31, 8, 0))!;
    assert.equal(w.end, '2027-01-01T00:00:00.000Z');
  });
});

describe('inTimeWindow', () => {
  it('无时间条件 → 恒真', () => {
    assert.equal(inTimeWindow('2020-01-01T00:00:00Z', {}, NOW), true);
  });
  it('窗口内 → true，窗口外/空值 → false（本地日历语义，与运行机器时区无关）', () => {
    const f = { key: 'today', from: '', to: '' };
    assert.equal(inTimeWindow(new Date(2026, 8, 21, 9, 0).toISOString(), f, NOW), true);
    assert.equal(inTimeWindow(new Date(2026, 8, 20, 23, 0).toISOString(), f, NOW), false);
    assert.equal(inTimeWindow(null, f, NOW), false);
    assert.equal(inTimeWindow('not-a-date', f, NOW), false);
  });
  it('UTC 瞬时落在本地「今日」内 → true（窗口按本地日历还原，不按字面假瞬时比较）', () => {
    // 本地 09-21 00:00~24:00 的窗口；ts=09-20T17:00Z = 本地 09-21 01:00 → 属于今日
    const f = { key: 'today', from: '', to: '' };
    assert.equal(inTimeWindow('2026-09-20T17:00:00.000Z', f, NOW), true);
    // ts=09-21T15:00Z = 本地 09-21 23:00 → 属于今日
    assert.equal(inTimeWindow('2026-09-21T15:00:00.000Z', f, NOW), true);
    // ts=09-21T16:00Z = 本地 09-22 00:00 → 明日 → false
    assert.equal(inTimeWindow('2026-09-21T16:00:00.000Z', f, NOW), false);
  });
});

describe('buildOrderFilter', () => {
  it('无任何条件 → null（不发空 filter，避免 filterOperator 语义歧义）', () => {
    assert.equal(buildOrderFilter({}, NOW), null);
    assert.equal(buildOrderFilter({ keyword: '   ', states: [] }, NOW), null);
  });
  it('状态多值 → state.in', () => {
    const f = buildOrderFilter({ states: ['PaymentAuthorized', 'PaymentSettled'] }, NOW)!;
    assert.deepEqual(f.state, { in: ['PaymentAuthorized', 'PaymentSettled'] });
  });
  it('关键词 → _or（订单号/联系人/电话/备注）', () => {
    const f = buildOrderFilter({ keyword: ' 138 ' }, NOW)!;
    assert.deepEqual(f._or, [
      { code: { contains: '138' } },
      { contactName: { contains: '138' } },
      { contactPhone: { contains: '138' } },
      { remark: { contains: '138' } },
    ]);
  });
  it('时间 → createdAt.between（本地日历字面挂 Z；不用 orderPlacedAt：未下单的单该字段为 null）', () => {
    const f = buildOrderFilter({ time: { key: 'today' } }, NOW)!;
    assert.equal(f.orderPlacedAt, undefined);
    assert.equal(f.createdAt.between.start, '2026-09-21T00:00:00.000Z');
    assert.equal(f.createdAt.between.end, '2026-09-22T00:00:00.000Z');
  });
  it('配送 → deliveryType.eq', () => {
    assert.deepEqual(buildOrderFilter({ delivery: 'pickup' }, NOW)!.deliveryType, { eq: 'pickup' });
    assert.deepEqual(buildOrderFilter({ delivery: 'delivery' }, NOW)!.deliveryType, { eq: 'delivery' });
  });
  it('异常组 → exceptionType 非空；指定类型 → exceptionType.eq', () => {
    assert.deepEqual(buildOrderFilter({ exceptionOnly: true }, NOW)!.exceptionType, { isNull: false });
    assert.deepEqual(buildOrderFilter({ exceptionOnly: true, exceptionType: 'damaged' }, NOW)!.exceptionType, { eq: 'damaged' });
  });
  it('售后 → afterSalesStatus.in', () => {
    const f = buildOrderFilter({ afterSales: AFTER_SALES_OPEN }, NOW)!;
    assert.deepEqual(f.afterSalesStatus, { in: AFTER_SALES_OPEN });
  });
  it('多条件 → 各条件平铺在同一 filter 对象内（AND 由服务端默认提供，不写 filterOperator）', () => {
    const multi = buildOrderFilter({ states: ['Shipped'], delivery: 'delivery', keyword: 'ab' }, NOW)!;
    // filterOperator 属于 OrderListOptions（filter 的兄弟），写进 filter 会被 admin-api 拒绝
    assert.equal(multi.filterOperator, undefined);
    assert.deepEqual(Object.keys(multi).sort(), ['_or', 'deliveryType', 'state']);
    const single = buildOrderFilter({ states: ['Shipped'] }, NOW)!;
    assert.equal(single.filterOperator, undefined);
  });
});

describe('常量完整性', () => {
  it('STATE_GROUPS 覆盖 ORDER_STATES 全部 16 个键，且无重复', () => {
    const inGroups = STATE_GROUPS.flatMap((g) => g.states);
    assert.deepEqual([...inGroups].sort(), Object.keys(ORDER_STATES).sort());
    assert.equal(new Set(inGroups).size, inGroups.length);
  });
  it('异常类型 = delivery-plugin ExceptionType 五值', () => {
    assert.deepEqual([...EXCEPTION_TYPES], ['rejected', 'wrong_address', 'no_recipient', 'damaged', 'other']);
  });
  it('售后未了结集合排除已了结状态（Refunded/Rejected/Closed）', () => {
    for (const k of ['Refunded', 'Rejected', 'Closed']) assert.equal(AFTER_SALES_OPEN.includes(k), false);
    for (const k of ['Pending', 'Approved', 'Returning', 'Received', 'RefundFailed']) assert.equal(AFTER_SALES_OPEN.includes(k), true);
  });
  it('待付款/待发货集合为状态枚举子集', () => {
    for (const s of [...UNPAID_STATES, ...TO_SHIP_STATES]) assert.ok(ORDER_STATES[s], `${s} 不在 ORDER_STATES`);
  });
});
