# 订单列表·搜索过滤 / 状态维度 / 版式 修复实现计划（Plan 1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把后台订单列表（`https://e.joho.cn/guanli/#/pages/order/list/index`）的搜索/筛选从「客户端页内过滤」改为「服务端过滤」，补全订单状态维度（16 状态全枚举 + 分组折叠 + 异常组按 `exceptionType` 过滤）与时间维度（今日/近7天/本月/自定义），并把三种版式改造成结构差异肉眼可辨的形态（方案 A=卡片信息流，B=状态看板，C=高密度清单）。

**Architecture:** 纯前端改造，不改后端。新增 `src/utils/orderFilter.ts` 作纯函数层（时间区间、状态分组、异常类型、filter 组装），`apis/order.ts` 用 GraphQL 变量把 filter 下推给 `orders(options:)`，页面只负责筛选状态机 + 请求编排（`reqSeq` 竞态防护 + `catch` 显式报错），组件层按 `variant` 渲染三套结构。

**Tech Stack:** Vue3 + TypeScript + uni-app（H5）、Vendure admin-api GraphQL、uView 令牌 `$wa-*`、测试用 `npx tsx --test`（项目未装 vitest）。

**规格来源:** `docs/superpowers/specs/2026-09-21-order-list-filter-state-layout-design.md`（下称「规格」）
**版式对照 mockup:** `docs/superpowers/mockups/order-list-v2/`（A=`scheme-a.html` 已选定为执行主线）
**仓库:** `d:\zhao\vshop`，工作目录 `d:\zhao\vshop\web-admin`

---

## Task 1: 纯函数层 `utils/orderFilter.ts`（时间区间 / 状态分组 / 异常类型 / filter 组装）

**Files:**
- Create: `src/utils/orderFilter.ts`
- Test: `src/utils/orderFilter.test.ts`

这一层是本次唯一新增的独立单元：无副作用、无网络、可单测，页面与 API 层都依赖它。

- [ ] **Step 1: 先写失败测试**

创建 `src/utils/orderFilter.test.ts`（项目未装 `@types/node`，沿用 `orderListConfig.test.ts` 的 `// @ts-nocheck` 约定）：

```ts
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
  it('今日 = [今日 00:00, 明日 00:00)', () => {
    const w = resolveTimeWindow({ key: 'today' }, NOW)!;
    const s = H(w.start);
    const e = H(w.end);
    assert.equal(s.getDate(), 21);
    assert.equal(s.getHours(), 0);
    assert.equal(e.getDate(), 22);
    assert.equal(e.getHours(), 0);
  });
  it('近7天 = [今日-6天 00:00, 明日 00:00)', () => {
    const w = resolveTimeWindow({ key: '7d' }, NOW)!;
    assert.equal(H(w.start).getDate(), 15);
    assert.equal(H(w.start).getHours(), 0);
    assert.equal(H(w.end).getDate(), 22);
  });
  it('本月 = [本月1日 00:00, 下月1日 00:00)', () => {
    const w = resolveTimeWindow({ key: 'month' }, NOW)!;
    const s = H(w.start);
    const e = H(w.end);
    assert.equal(s.getMonth(), 8);
    assert.equal(s.getDate(), 1);
    assert.equal(e.getMonth(), 9);
    assert.equal(e.getDate(), 1);
  });
  it('自定义 = [起始日 00:00, 结束日次日 00:00)', () => {
    const w = resolveTimeWindow({ key: 'custom', from: '2026-09-01', to: '2026-09-03' }, NOW)!;
    assert.equal(H(w.start).getDate(), 1);
    assert.equal(H(w.end).getDate(), 4);
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
    const e = H(w.end);
    assert.equal(e.getFullYear(), 2027);
    assert.equal(e.getMonth(), 0);
    assert.equal(e.getDate(), 1);
  });
});

describe('inTimeWindow', () => {
  it('无时间条件 → 恒真', () => {
    assert.equal(inTimeWindow('2020-01-01T00:00:00Z', {}, NOW), true);
  });
  it('窗口内 → true，窗口外/空值 → false', () => {
    const f = { key: 'today', from: '', to: '' };
    assert.equal(inTimeWindow(new Date(2026, 8, 21, 9, 0).toISOString(), f, NOW), true);
    assert.equal(inTimeWindow(new Date(2026, 8, 20, 23, 0).toISOString(), f, NOW), false);
    assert.equal(inTimeWindow(null, f, NOW), false);
    assert.equal(inTimeWindow('not-a-date', f, NOW), false);
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
  it('时间 → orderPlacedAt.between', () => {
    const f = buildOrderFilter({ time: { key: 'today' } }, NOW)!;
    const s = new Date(f.orderPlacedAt.between.start);
    const e = new Date(f.orderPlacedAt.between.end);
    assert.equal(s.getDate(), 21);
    assert.equal(s.getHours(), 0);
    assert.equal(e.getDate(), 22);
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
  it('多条件 → 显式 filterOperator=AND；单条件 → 不带 filterOperator', () => {
    const multi = buildOrderFilter({ states: ['Shipped'], delivery: 'delivery', keyword: 'ab' }, NOW)!;
    assert.equal(multi.filterOperator, 'AND');
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx --test src/utils/orderFilter.test.ts`（cwd = `d:\zhao\vshop\web-admin`）
Expected: FAIL —— `Cannot find module './orderFilter'`

- [ ] **Step 3: 写最小实现**

创建 `src/utils/orderFilter.ts`：

```ts
// 订单列表筛选纯函数与常量：时间区间 / 状态分组 / 异常类型 / GraphQL filter 组装。
// 全部无副作用、无网络依赖，供页面（服务端过滤）、组件（tab 分组）与单测共用。
// 事实依据（生产 admin-api introspection 实测，见规格第一节）：
//   OrderFilterParameter 中 code/contactName/contactPhone/remark/state/deliveryType/
//   exceptionType/afterSalesStatus 均为 StringOperators；createdAt/orderPlacedAt 为 DateOperators。

/** 时间快捷筛选键：'' 全部 | today 今日 | 7d 近7天 | month 本月 | custom 自定义区间 */
export type TimeRangeKey = '' | 'today' | '7d' | 'month' | 'custom';

export interface TimeRangeInput {
  key?: TimeRangeKey;
  /** 'YYYY-MM-DD'，仅 custom 使用 */
  from?: string;
  /** 'YYYY-MM-DD'，仅 custom 使用（含当日） */
  to?: string;
}

/** 半开区间 [start, end)，ISO 字符串（含时区偏移，服务端按瞬时比较） */
export interface TimeWindow {
  start: string;
  end: string;
}

function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function parseDay(s?: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 纯函数：把快捷键 / 自定义日期翻译为半开区间 [start, end)（ISO）。
 * 无有效条件 → null（调用方据此不拼时间 filter）。非法自定义输入返回 null，不抛异常。
 */
export function resolveTimeWindow(input: TimeRangeInput = {}, now = new Date()): TimeWindow | null {
  const key = input.key || '';
  if (key === 'today') {
    const s = dayStart(now);
    return { start: s.toISOString(), end: addDays(s, 1).toISOString() };
  }
  if (key === '7d') {
    const s = addDays(dayStart(now), -6);
    return { start: s.toISOString(), end: addDays(dayStart(now), 1).toISOString() };
  }
  if (key === 'month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start: s.toISOString(), end: e.toISOString() };
  }
  if (key !== 'custom') return null;
  const f = parseDay(input.from);
  const t = parseDay(input.to);
  if (!f || !t) return null;
  // 起止颠倒（运营手滑）自动交换，避免筛出空结果被当成“搜索不稳定”
  const lo = t.getTime() < f.getTime() ? t : f;
  const hi = t.getTime() < f.getTime() ? f : t;
  return { start: dayStart(lo).toISOString(), end: addDays(dayStart(hi), 1).toISOString() };
}

/** 纯函数：某时间戳是否落在窗口内（商品单本地过滤用）。无时间条件 → 恒真 */
export function inTimeWindow(ts: string | null | undefined, input: TimeRangeInput = {}, now = new Date()): boolean {
  const w = resolveTimeWindow(input, now);
  if (!w) return true;
  if (!ts) return false;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return false;
  return t >= new Date(w.start).getTime() && t < new Date(w.end).getTime();
}

/** 状态分组：并集 = ORDER_STATES 全部键（单测保证无遗漏、无重复） */
export interface StateGroupDef {
  key: string;
  states: string[];
}

export const STATE_GROUPS: StateGroupDef[] = [
  { key: 'pending', states: ['Created', 'AddingItems', 'ArrangingPayment'] },
  {
    key: 'active',
    states: [
      'PaymentAuthorized',
      'WaitingForShipping',
      'PartiallyPaymentSettled',
      'PaymentSettled',
      'PartiallyShipped',
      'Shipped',
      'PartiallyDelivered',
      'Delivered',
    ],
  },
  { key: 'done', states: ['Completed'] },
  { key: 'cancelled', states: ['Cancelled', 'Modified', 'Modifying', 'ArrangingAdditionalPayment'] },
];

/** 异常类型取值域（= vendure/packages/delivery-plugin/src/constants.ts 的 ExceptionType） */
export const EXCEPTION_TYPES = ['rejected', 'wrong_address', 'no_recipient', 'damaged', 'other'] as const;

/** 售后「未了结」集合：排除已了结的 Refunded / Rejected / Closed（与 web-admin AFTER_SALE_STATES 同键） */
export const AFTER_SALES_OPEN = ['Pending', 'Approved', 'Returning', 'Received', 'RefundFailed'];

/** 待付款状态集合（统计卡与 tab 共用，避免两处漂移） */
export const UNPAID_STATES = ['ArrangingPayment'];

/** 待发货状态集合：已付款但未发出（含部分付款/待发货/部分发货前态） */
export const TO_SHIP_STATES = ['PaymentAuthorized', 'WaitingForShipping', 'PartiallyPaymentSettled', 'PaymentSettled'];

export interface OrderFilterInput {
  /** 状态多值 → state.in */
  states?: string[];
  /** 关键词 → _or（订单号/联系人/电话/备注） */
  keyword?: string;
  /** 时间条件 → orderPlacedAt.between */
  time?: TimeRangeInput;
  /** 配送方式：'' 不过滤 | 'pickup' 自提 | 'delivery' 快递 */
  delivery?: '' | 'pickup' | 'delivery';
  /** 异常组：exceptionType 非空 */
  exceptionOnly?: boolean;
  /** 异常类型二级筛选 → exceptionType.eq */
  exceptionType?: string;
  /** 售后状态集合 → afterSalesStatus.in */
  afterSales?: string[];
}

/**
 * 纯函数：把 UI 条件翻译为 Vendure OrderFilterParameter 对象。
 * 无任何条件 → null（不发空 filter）。返回值直接作为 GraphQL 变量传参，不做字符串内插（消除注入面）。
 */
export function buildOrderFilter(input: OrderFilterInput = {}, now = new Date()): Record<string, any> | null {
  const filter: Record<string, any> = {};

  if (input.states && input.states.length) filter.state = { in: input.states };
  if (input.afterSales && input.afterSales.length) filter.afterSalesStatus = { in: input.afterSales };
  if (input.exceptionType) filter.exceptionType = { eq: input.exceptionType };
  else if (input.exceptionOnly) filter.exceptionType = { isNull: false };

  const w = resolveTimeWindow(input.time || {}, now);
  if (w) filter.orderPlacedAt = { between: { start: w.start, end: w.end } };

  const kw = (input.keyword || '').trim();
  if (kw) {
    filter._or = [
      { code: { contains: kw } },
      { contactName: { contains: kw } },
      { contactPhone: { contains: kw } },
      { remark: { contains: kw } },
    ];
  }

  if (input.delivery === 'pickup') filter.deliveryType = { eq: 'pickup' };
  else if (input.delivery === 'delivery') filter.deliveryType = { eq: 'delivery' };

  const keys = Object.keys(filter);
  if (!keys.length) return null;
  if (keys.length > 1) filter.filterOperator = 'AND';
  return filter;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx tsx --test src/utils/orderFilter.test.ts`
Expected: PASS（全部用例通过，含常量完整性 4 条）

- [ ] **Step 5: 提交**

```bash
git add src/utils/orderFilter.ts src/utils/orderFilter.test.ts
git commit -m "feat(web-admin): 订单列表筛选纯函数层（时间区间/状态分组/异常类型/filter 组装）"
```

---

## Task 2: 服务端过滤 API 层（变量化查询 + 单次多别名计数）

**Files:**
- Modify: `src/apis/order.ts:130-157`（`OrderListOptions` / `fetchOrders`）
- Modify: `src/apis/order.ts`（追加 `fetchOrderCounts`）

修 R2（keyword 未下推）、R5（state 字符串内插）、R9（统计与 scope 不一致的取数手段）。

- [ ] **Step 1: 用只读探针复核 filter 真实可用（写实现前的前置校验）**

创建 `_e2e/_probe_order_filter.py`（只执行 `orders` 查询，不写任何数据）：

```python
# -*- coding: utf-8 -*-
# 只读探针：验证生产 admin-api 的 OrderFilterParameter 过滤真实生效（各条件 totalItems 有区分度）
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
from playwright.sync_api import sync_playwright
import json, time

BASE = 'https://e.joho.cn/guanli/'
QUERIES = [
    # (标签, filter)
    ('baseline(无filter)', None),
    ('state.in 待发货', {'state': {'in': ['PaymentAuthorized', 'PaymentSettled']}}),
    ('keyword _or 冒烟', {'_or': [{'code': {'contains': '2'}}]}),
    ('今日 orderPlacedAt.between', 'TODAY'),
    ('配送=自提', {'deliveryType': {'eq': 'pickup'}}),
    ('配送=快递', {'deliveryType': {'eq': 'delivery'}}),
    ('配送 deliveryType 为空', {'deliveryType': {'isNull': True}}),
    ('异常 exceptionType 非空', {'exceptionType': {'isNull': False}}),
    ('异常类型 damaged', {'exceptionType': {'eq': 'damaged'}}),
    ('售后 in 集合', {'afterSalesStatus': {'in': ['Pending', 'Approved', 'Returning', 'Received', 'RefundFailed']}}),
]

def today_window():
    import datetime
    s = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    e = s + datetime.timedelta(days=1)
    return {'orderPlacedAt': {'between': {'start': s.isoformat(), 'end': e.isoformat()}}}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=30000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click(); time.sleep(7)
    tok = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c=(d.data.myTenantAccess.channels||[]).find(x=>x.code==='t2');
        if(!c) return 'NOCHANNEL';
        localStorage.setItem('wa_channel_token', c.token); localStorage.setItem('wa_channel_code','t2');
        return c.token;
      });
    }""")
    print('channel token =', str(tok)[:8])
    out = []
    for label, f in QUERIES:
        flt = today_window() if f == 'TODAY' else f
        opts = {'take': 1}
        if flt: opts['filter'] = flt
        res = pg.evaluate("""async ([tok, opts]) => {
          const t = localStorage.getItem('wa_auth_token');
          const r = await fetch('/admin-api', {method:'POST', headers:{
              'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':tok},
            body: JSON.stringify({query:'query Q($o: OrderListOptions){ orders(options:$o){ totalItems } }', variables:{o: opts}})});
          return await r.json();
        }""", [tok, opts])
        n = (((res or {}).get('data') or {}).get('orders') or {}).get('totalItems')
        err = ((res or {}).get('errors') or [{}])[0].get('message')
        out.append((label, n if n is not None else 'ERR:' + str(err)))
    for label, n in out:
        print(f'{label:28s} → {n}')
    b.close()
```

Run: `python _e2e/_probe_order_filter.py`（cwd = `d:\zhao\vshop\web-admin`）
Expected & 判定：
- `baseline` 有非 0 数值；`state.in 待发货` ≤ baseline 且 > 0（有区分度，证明服务端过滤生效）。
- 十行**不得全部出现 `ERR:`**；若某行 `ERR` 且报 `Cannot query field`，则该字段在本环境不可用，需要停下来与用户确认后再继续。
- **记录 `配送 deliveryType 为空` 的数值**：
  - 若为 `0` → 快递/自提都可用严格 `eq`（本计划默认路径，Task 1 已按此实现）。
  - 若 `> 0`（存在历史单无该字段）→ 把 `buildOrderFilter` 里 `delivery === 'delivery'` 分支改为容错写法，并在提交信息中记录实测数值：

    ```ts
    else if (input.delivery === 'delivery') filter.deliveryType = { notIn: ['pickup'] };
    ```
    并在 Task 1 的用例中把 `{ eq: 'delivery' }` 断言同步改为 `{ notIn: ['pickup'] }`。
- `售后 in 集合` 的数值记下来（用于 Task 7 的待退款口径复核）。

- [ ] **Step 2: 改写 `fetchOrders` 并新增 `fetchOrderCounts`**

把 `src/apis/order.ts` 中 `export interface OrderListOptions {...}` 与 `export async function fetchOrders(...)` 整段替换为：

```ts
// 订单列表查询入参：filter 由 utils/orderFilter.ts 的 buildOrderFilter 组装后原样传变量，
// 不在查询文本里做字符串内插（消除注入面，R5）；条件全部下推服务端（R1/R2/R11）。
export interface OrderQueryInput {
  take?: number;
  skip?: number;
  filter?: Record<string, any> | null;
}

export async function fetchOrders(input: OrderQueryInput = {}): Promise<{ totalItems: number; items: OrderRow[] }> {
  const { take = 20, skip = 0, filter } = input;
  const options: Record<string, any> = { take, skip };
  if (filter) options.filter = filter;
  const { orders } = await getAdminClient().request<{
    orders: { totalItems: number; items: OrderRow[] };
  }>(
    `query Orders($options: OrderListOptions) {
      orders(options: $options) {
        totalItems
        items {${ORDER_FIELDS}}
      }
    }`,
    { options },
  );
  return { totalItems: orders.totalItems, items: orders.items };
}

/**
 * 统计/分组计数：一次请求取回多组 totalItems（GraphQL 别名）。
 * 别名与变量名由代码生成（数量固定、非用户输入），filter 值全部走变量，不做字符串内插。
 * filters[i] 为 null 表示该组不带条件（全量计数）。
 */
export async function fetchOrderCounts(filters: Array<Record<string, any> | null>): Promise<number[]> {
  if (!filters.length) return [];
  const varDefs = filters.map((_, i) => `$f${i}: OrderFilterParameter`).join(', ');
  const fields = filters
    .map((_, i) => `c${i}: orders(options: { take: 1, filter: $f${i} }) { totalItems }`)
    .join('\n      ');
  const variables: Record<string, any> = {};
  filters.forEach((f, i) => { variables[`f${i}`] = f; });
  const data = await getAdminClient().request<Record<string, { totalItems: number }>>(
    `query OrderCounts(${varDefs}) {
      ${fields}
    }`,
    variables,
  );
  return filters.map((_, i) => data[`c${i}`]?.totalItems ?? 0);
}
```

- [ ] **Step 3: 类型检查（改动文件无新增错误）**

Run: `npx tsc --noEmit`
Expected: 只有页面里调用旧签名 `fetchOrders({ take, skip, state })` 报 `state` 不存在（Task 4 会改页面）。**不允许**出现 `order.ts` 自身的错误。

- [ ] **Step 4: 提交**

```bash
git add src/apis/order.ts _e2e/_probe_order_filter.py
git commit -m "feat(web-admin): 订单列表查询改为 GraphQL 变量化服务端过滤 + 多别名计数"
```

---

## Task 3: 双语言包补齐（zh-Hans / en）

**Files:**
- Modify: `src/locale/zh-Hans.json`（`orderAdmin.orderList` 约 L140-163、`orderListComp` 约 L1846-1885）
- Modify: `src/locale/en.json`（同键位）

新增键先落盘，Task 4-8 的组件才能引用（缺键会渲染成 key 字符串）。

- [ ] **Step 1: 在 `orderAdmin.orderList` 下补时间文案**

`src/locale/zh-Hans.json`：在 `"date7d": "近7天",` 之后插入两行（保留既有 `date30d` 不动）：

```json
      "dateMonth": "本月",
      "dateCustom": "自定义",
      "timeFrom": "开始日期",
      "timeTo": "结束日期",
```

`src/locale/en.json`：在同一位置插入：

```json
      "dateMonth": "This month",
      "dateCustom": "Custom",
      "timeFrom": "From",
      "timeTo": "To",
```

- [ ] **Step 2: 在 `orderListComp` 下补分组/异常/报错文案，并修正搜索占位**

`src/locale/zh-Hans.json` 的 `orderListComp`（把 `"searchPlaceholder"` 改为四项口径，并在 `"head"` 之后插入三个新块）：

```json
    "search": {
      "searchPlaceholder": "订单号 / 顾客 / 手机号 / 备注",
      "search": "搜索",
      "delivery": "配送",
      "date": "时间",
      "clear": "清除"
    },
    "tabs": {
      "all": "全部",
      "chipAll": "全部",
      "groupPending": "待处理",
      "groupActive": "进行中",
      "groupDone": "已完成",
      "groupCancelled": "已取消",
      "groupException": "异常",
      "groupAfterSales": "售后",
      "refundPending": "待退款"
    },
    "exception": {
      "rejected": "拒收",
      "wrong_address": "地址错误",
      "no_recipient": "无人接收",
      "damaged": "破损",
      "other": "其他"
    },
    "loadFailed": "加载失败",
```

`src/locale/en.json` 同位置：

```json
    "search": {
      "searchPlaceholder": "Order no. / customer / phone / note",
      "search": "Search",
      "delivery": "Delivery",
      "date": "Date",
      "clear": "Clear"
    },
    "tabs": {
      "all": "All",
      "chipAll": "All",
      "groupPending": "Pending",
      "groupActive": "In progress",
      "groupDone": "Completed",
      "groupCancelled": "Cancelled",
      "groupException": "Exceptions",
      "groupAfterSales": "After-sales",
      "refundPending": "Refund pending"
    },
    "exception": {
      "rejected": "Rejected",
      "wrong_address": "Wrong address",
      "no_recipient": "No recipient",
      "damaged": "Damaged",
      "other": "Other"
    },
    "loadFailed": "Load failed",
```

- [ ] **Step 3: 校验 JSON 合法**

Run: `node -e "for(const f of ['src/locale/zh-Hans.json','src/locale/en.json']){const j=require('./'+f);console.log(f,Object.keys(j).length, j.orderListComp.tabs.groupException, j.orderListComp.exception.damaged)}"`
Expected: 打印两行，含 `异常 破损` 与 `Exceptions Damaged`

- [ ] **Step 4: 提交**

```bash
git add src/locale/zh-Hans.json src/locale/en.json
git commit -m "feat(web-admin): 订单列表筛选/状态分组/异常类型双语文案"
```

---

> **注意（Task 4→8 是一条破坏性组件改造链）**：Task 4 起 `OrderListFilters` / `OrderListTabs` / `OrderListRenderer` 的 props 与 emits 会同步改写，中间态**不保证** `tsc` 与构建通过。Task 8 结束后在 Task 9 统一做类型检查、构建与回归。

## Task 4: 筛选条组件 `OrderListFilters.vue` 重做（时间胶囊 + 自定义区间 + 配送胶囊）

**Files:**
- Modify: `src/components/order-list/OrderListFilters.vue`（整文件重写）

修 R7 的 UI 侧（「今日」变成可点的时间维度）、R11（时间条件真正可下推）。把原来的 `picker` 下拉改为胶囊按钮（手机端少一次点击、状态可见），新增自定义区间。

- [ ] **Step 1: 重写组件**

`src/components/order-list/OrderListFilters.vue` 全文替换为：

```vue
<template>
  <view>
    <!-- 关键词搜索：服务端过滤（订单号/顾客/手机号/备注） -->
    <view class="search">
      <input :value="kw" class="kw" :placeholder="$t('orderListComp.search.searchPlaceholder')" confirm-type="search" @confirm="emit('search')" @input="onInput" />
      <text class="btn" @tap="emit('search')">{{ $t('orderListComp.search.search') }}</text>
    </view>

    <!-- 时间快捷筛选条：可与状态分组 tab 组合（今日 + 待发货 等） -->
    <view class="chiprow">
      <text class="f-chip" :class="{ on: timeKey === 'today' }" @tap="emit('time', 'today')">{{ $t('orderAdmin.orderList.dateToday') }}</text>
      <text class="f-chip" :class="{ on: timeKey === '7d' }" @tap="emit('time', '7d')">{{ $t('orderAdmin.orderList.date7d') }}</text>
      <text class="f-chip" :class="{ on: timeKey === 'month' }" @tap="emit('time', 'month')">{{ $t('orderAdmin.orderList.dateMonth') }}</text>
      <text class="f-chip" :class="{ on: timeKey === 'custom' }" @tap="emit('time', 'custom')">{{ $t('orderAdmin.orderList.dateCustom') }}</text>
    </view>

    <!-- 自定义区间：仅在选中「自定义」时展开 -->
    <view v-if="timeKey === 'custom'" class="chiprow">
      <picker mode="date" :value="customFrom" @change="onFrom">
        <text class="f-chip" :class="{ on: !!customFrom }">{{ customFrom || $t('orderAdmin.orderList.timeFrom') }}</text>
      </picker>
      <text class="tilde">~</text>
      <picker mode="date" :value="customTo" @change="onTo">
        <text class="f-chip" :class="{ on: !!customTo }">{{ customTo || $t('orderAdmin.orderList.timeTo') }}</text>
      </picker>
    </view>

    <!-- 配送筛选 -->
    <view class="chiprow">
      <text class="f-chip" :class="{ on: delivery === 'delivery' }" @tap="emit('delivery', 'delivery')">{{ $t('orderAdmin.orderList.deliveryExpress') }}</text>
      <text class="f-chip" :class="{ on: delivery === 'pickup' }" @tap="emit('delivery', 'pickup')">{{ $t('orderAdmin.orderList.deliveryPickup') }}</text>
      <text v-if="hasFilter" class="f-clear" @tap="emit('clear')">{{ $t('orderListComp.search.clear') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
// 搜索 + 时间快捷筛选 + 配送筛选。条件由页面转交 utils/orderFilter.ts 组装为服务端 filter。
import { computed } from 'vue';
import type { TimeRangeKey } from '../../utils/orderFilter';

const props = withDefaults(
  defineProps<{
    kw: string;
    timeKey: TimeRangeKey;
    customFrom: string;
    customTo: string;
    delivery: '' | 'pickup' | 'delivery';
  }>(),
  { kw: '', timeKey: '', customFrom: '', customTo: '', delivery: '' }
);
const emit = defineEmits<{
  (e: 'search'): void;
  (e: 'update:kw', v: string): void;
  (e: 'time', v: Exclude<TimeRangeKey, ''>): void;
  (e: 'range', r: { from: string; to: string }): void;
  (e: 'delivery', v: 'pickup' | 'delivery'): void;
  (e: 'clear'): void;
}>();

const hasFilter = computed(() => !!(props.kw || props.timeKey || props.delivery));

function onInput(e: any) {
  emit('update:kw', e.detail.value);
}
function onFrom(e: any) {
  emit('range', { from: e.detail.value, to: props.customTo });
}
function onTo(e: any) {
  emit('range', { from: props.customFrom, to: e.detail.value });
}
</script>

<style lang="scss" scoped>
.search {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 8rpx 16rpx 8rpx 24rpx;

  .kw { flex: 1; font-size: 26rpx; color: $wa-ink; }

  .btn {
    flex-shrink: 0;
    padding: 12rpx 32rpx;
    font-size: 26rpx;
    color: #fff;
    background: $wa-accent;
    border-radius: $wa-radius;
  }
}

.chiprow {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
  flex-wrap: wrap;

  .tilde { color: $wa-muted; font-size: 24rpx; }

  .f-chip {
    font-size: 26rpx;
    color: $wa-muted;
    background: $wa-card;
    padding: 10rpx 24rpx;
    border-radius: 999rpx;
    border: 1rpx solid #e8edf5;

    &.on { color: #fff; background: $wa-accent; border-color: $wa-accent; font-weight: 600; }
  }

  .f-clear { font-size: 24rpx; color: $wa-muted; text-decoration: underline; cursor: pointer; }
}
</style>
```

- [ ] **Step 2: 静态自查**

Run: `Grep -n "delivery-idx|date-idx|deliveryOpts|dateOpts" src/components/order-list/OrderListFilters.vue`
Expected: 无匹配（旧的 picker 下标协议已彻底移除）

- [ ] **Step 3: 提交**

```bash
git add src/components/order-list/OrderListFilters.vue
git commit -m "feat(web-admin): 订单筛选条改为时间/配送胶囊 + 自定义区间（服务端过滤口径）"
```

---

## Task 5: 状态 tab 组件 `OrderListTabs.vue` 重做（分组折叠 + 16 状态全枚举 + 异常组 + 分组计数）

**Files:**
- Modify: `src/components/order-list/OrderListTabs.vue`（整文件重写）

修 R6（多状态 tab 被降级为单状态：现在每个 chip 都带完整的 `states` 数组）、R10（tab 未覆盖全枚举）、以及异常组按 `exceptionType` 过滤的入口。tab 定义（含 `states` / `exceptionOnly` / `exceptionType` / `afterSales`）由页面构造后传入，组件只负责渲染与折叠。

- [ ] **Step 1: 重写组件**

`src/components/order-list/OrderListTabs.vue` 全文替换为：

```vue
<template>
  <view class="tabs">
    <text class="tab-all" :class="{ on: cur === '' }" @tap="emit('change', '')">{{ $t('orderListComp.tabs.all') }}</text>
    <view v-for="g in groups" :key="g.key" class="grp">
      <view class="gh" @tap="toggle(g.key)">
        <text class="g-label">{{ g.label }}</text>
        <text v-if="g.count" class="g-cnt">{{ g.count }}</text>
        <text class="che">{{ isOpen(g.key) ? '⌃' : '⌄' }}</text>
      </view>
      <view v-if="isOpen(g.key)" class="gtabs">
        <text
          v-for="t in g.tabs"
          :key="t.key"
          class="gtab"
          :class="{ on: t.key === cur }"
          @tap="emit('change', t.key)"
        >{{ t.label }}</text>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

// 分组折叠 tab：默认全部展开；分组计数来自服务端 totalItems（页面 loadCounts）。
// tabs 的语义（states / exceptionOnly / exceptionType / afterSales）由页面定义，本组件只渲染。
const props = withDefaults(
  defineProps<{
    groups: { key: string; label: string; count?: number; tabs: { key: string; label: string }[] }[];
    cur: string;
  }>(),
  { groups: () => [], cur: '' }
);
const emit = defineEmits<{ (e: 'change', key: string): void }>();

const closed = ref<Record<string, boolean>>({});
function isOpen(key: string) {
  return closed.value[key] !== true;
}
function toggle(key: string) {
  closed.value = { ...closed.value, [key]: !closed.value[key] };
}

// 选中项落在折叠组内时自动展开，避免“选了却看不见”
const curGroupKey = computed(() => props.groups.find((g) => g.tabs.some((t) => t.key === props.cur))?.key || '');
watch(curGroupKey, (k) => {
  if (k && closed.value[k]) closed.value = { ...closed.value, [k]: false };
});
</script>

<style lang="scss" scoped>
.tabs {
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 16rpx 20rpx;
  margin-bottom: 16rpx;

  .tab-all {
    display: block;
    text-align: center;
    padding: 14rpx 0;
    font-size: 26rpx;
    color: $wa-muted;
    border-radius: $wa-radius;
    background: #f4f6fa;
    margin-bottom: 12rpx;

    &.on { color: #fff; background: $wa-accent; font-weight: 600; }
  }

  .grp {
    border-top: 1rpx solid #eef1f6;
    padding-top: 10rpx;
    margin-top: 4rpx;

    .gh {
      display: flex;
      align-items: center;
      gap: 12rpx;
      padding: 8rpx 4rpx;
      cursor: pointer;

      .g-label { font-size: 26rpx; font-weight: 700; color: $wa-ink; }
      .g-cnt { font-size: 20rpx; color: $wa-muted; background: #f0f2f7; border-radius: 999rpx; padding: 2rpx 14rpx; }
      .che { margin-left: auto; font-size: 22rpx; color: $wa-muted; }
    }

    .gtabs {
      display: flex;
      flex-wrap: wrap;
      gap: 12rpx;
      padding: 4rpx 0 12rpx;

      .gtab {
        font-size: 24rpx;
        color: $wa-muted;
        background: #f6f7fa;
        border: 1rpx solid #e7eaf0;
        border-radius: 999rpx;
        padding: 8rpx 22rpx;

        &.on { color: #fff; background: $wa-accent; border-color: $wa-accent; font-weight: 600; }
      }
    }
  }
}
</style>
```

- [ ] **Step 2: 静态自查**

Run: `Grep -n "ORDER_LIST_LAYOUTS|stateColumnFirst|props.layout" src/components/order-list/OrderListTabs.vue`
Expected: 无匹配（tab 顺序不再由版式决定；`stateColumnFirst` 语义已随 Task 7 的版式重做删除）

- [ ] **Step 3: 提交**

```bash
git add src/components/order-list/OrderListTabs.vue
git commit -m "feat(web-admin): 订单状态 tab 改为分组折叠 + 全枚举 + 异常组/售后组"
```

---

## Task 6: 统计卡语义修正 + 行组件三变体（`OrderListHeadBar.vue` / `OrderListCardRow.vue` / `OrderListTableRow.vue`）

**Files:**
- Modify: `src/components/order-list/OrderListHeadBar.vue`（emit 语义）
- Modify: `src/components/order-list/OrderListCardRow.vue`（整文件重写，新增 `variant`）
- Modify: `src/components/order-list/OrderListTableRow.vue`（整文件重写，新增 `variant`）

修 R7（今日卡传 `''` 等于全部）、R8（待退款卡筛的是 Cancelled，改为售后未了结）、R12/R13（三版式结构差异被字段覆盖抹平）。

- [ ] **Step 1: 修 `OrderListHeadBar.vue` 的 stat-tap 语义**

`<template>` 中 `.stats` 四个 `.stat` 的 `@tap` 全部替换为语义键（`today` / `unpaid` / `toShip` / `refund`）：

```vue
    <view class="stats">
      <view class="stat" @tap="emit('stat-tap', 'today')">
        <text class="num">{{ stats.today }}</text>
        <text class="lbl">{{ $t('orderListComp.head.today') }}</text>
      </view>
      <view class="stat" @tap="emit('stat-tap', 'unpaid')">
        <text class="num">{{ stats.unpaid }}</text>
        <text class="lbl">{{ $t('orderAdmin.orderList.tabPendingPay') }}</text>
      </view>
      <view class="stat" @tap="emit('stat-tap', 'toShip')">
        <text class="num">{{ stats.toShip }}</text>
        <text class="lbl">{{ $t('orderAdmin.orderList.tabPendingShip') }}</text>
      </view>
      <view class="stat" @tap="emit('stat-tap', 'refund')">
        <text class="num">{{ stats.refund }}</text>
        <text class="lbl">{{ $t('orderListComp.head.refundPending') }}</text>
      </view>
    </view>
```

`<script>` 的 emits 类型替换为：

```ts
const emit = defineEmits<{
  (e: 'stat-tap', kind: 'today' | 'unpaid' | 'toShip' | 'refund'): void;
  (e: 'redeem'): void;
}>();
```

- [ ] **Step 2: 重写 `OrderListCardRow.vue`（手机端三变体）**

全文替换为：

```vue
<template>
  <!-- 变体 C：高密度清单（status-first）——无圆角两行清单，点击整行进详情 -->
  <view v-if="variant === 'compact'" class="cp" @tap="emit('detail', o)">
    <view class="cp-l1">
      <text class="cp-code">{{ o.code }}</text>
      <text class="cp-st" :style="{ color: stColor(o.state) }">{{ stLabel(o.state).label }}</text>
    </view>
    <view class="cp-l2">
      <text class="cp-cust">{{ o.customerName }}{{ o.phoneMask }}</text>
      <text class="cp-goods">{{ goodsBrief(o) }}</text>
      <text class="cp-total">¥{{ fmtMoney(o.total) }}</text>
      <text class="cp-time">{{ fmtTime(o.time) }}</text>
    </view>
    <view class="cp-acts">
      <text v-if="isShippable(o.state)" class="act ship" @tap.stop="emit('ship', o)">{{ $t('orderListComp.actions.ship') }}</text>
      <text v-if="redeemable" class="act redeem" @tap.stop="emit('redeem', o)">{{ $t('orderListComp.actions.goRedeem') }}</text>
      <text v-if="isUnpaid(o.state)" class="act remind" @tap.stop="emit('remind', o)">{{ $t('orderListComp.actions.remind') }}</text>
    </view>
  </view>

  <!-- 变体 B：状态看板泳道内极简卡（status-group）——无缩略图、无地址 -->
  <view v-else-if="variant === 'kanban'" class="card slim">
    <view class="row head">
      <text class="code" @tap="copyCode(o.code)">{{ o.code }}</text>
      <text class="st" :style="{ color: stColor(o.state) }">{{ stLabel(o.state).label }}</text>
    </view>
    <view class="sub">
      {{ o.customerName }}{{ o.phoneMask }}<template v-if="blocks.showDeliveryName && o.delivery"> · {{ o.delivery }}</template>
    </view>
    <view class="row foot">
      <text class="goods-brief">{{ goodsBrief(o) }}</text>
      <text class="total">¥{{ fmtMoney(o.total) }}</text>
    </view>
    <view class="row foot">
      <text class="time">{{ o.payment ? o.payment + ' · ' : '' }}{{ fmtTime(o.time) }}</text>
      <view class="actions">
        <text v-if="isShippable(o.state)" class="act ship" @tap="emit('ship', o)">{{ $t('orderListComp.actions.ship') }}</text>
        <text v-if="redeemable" class="act redeem" @tap="emit('redeem', o)">{{ $t('orderListComp.actions.goRedeem') }}</text>
        <text v-if="isUnpaid(o.state)" class="act remind" @tap="emit('remind', o)">{{ $t('orderListComp.actions.remind') }}</text>
        <text class="act ghost" @tap="emit('detail', o)">{{ $t('orderListComp.actions.detail') }}</text>
      </view>
    </view>
  </view>

  <!-- 变体 A：卡片信息流（classic，默认）——缩略图 + 商品明细 + 顾客 + 地址 + 金额 + 时间 + 操作组 -->
  <view v-else class="card">
    <view class="row head">
      <text class="code" @tap="copyCode(o.code)">{{ o.code }}</text>
      <text class="st" :style="{ color: stColor(o.state) }">{{ stLabel(o.state).label }}</text>
    </view>
    <view class="sub">{{ o.customerName }}{{ o.phoneMask }}{{ blocks.showDeliveryName && o.delivery ? ' · ' + o.delivery : '' }}</view>
    <view class="addr" v-if="blocks.showAddress && o.address"><text class="addr-ic">📍</text><text class="addr-tx">{{ o.address }}</text></view>
    <view class="goods" v-for="(g, gi) in o.goods" :key="gi">
      <image v-if="blocks.showThumb && g.image" class="g-thumb" :src="g.image" mode="aspectFill" />
      <view v-else class="g-thumb"></view>
      <text class="g-name">{{ g.name }}</text>
      <text class="g-price">×{{ g.qty }} ¥{{ fmtMoney(g.price) }}</text>
    </view>
    <view class="row foot">
      <text class="time">{{ o.payment ? o.payment + ' · ' : '' }}{{ fmtTime(o.time) }}</text>
      <text class="total">¥{{ fmtMoney(o.total) }}</text>
    </view>
    <view class="actions">
      <text v-if="isShippable(o.state)" class="act ship" @tap="emit('ship', o)">{{ $t('orderListComp.actions.ship') }}</text>
      <text v-if="redeemable" class="act redeem" @tap="emit('redeem', o)">{{ $t('orderListComp.actions.goRedeem') }}</text>
      <text v-if="isUnpaid(o.state)" class="act remind" @tap="emit('remind', o)">{{ $t('orderListComp.actions.remind') }}</text>
      <text class="act ghost" @tap="emit('detail', o)">{{ $t('orderListComp.actions.detail') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { OrderView, fmtMoney, shipColor, isShippable, isUnpaid } from '../../utils/orderFormat';
import { ORDER_STATES, stateLabel } from '../../constants/orderState';
import { useLocaleStore } from '../../stores/localeStore';

// 手机端单行渲染，按 variant 出三种结构（A 卡片信息流 / B 看板极简卡 / C 高密度两行清单）。
// blocks 只负责列内细节显隐（showThumb/showAddress/showDeliveryName/stateColors），结构差异由 variant 决定。
const locale = useLocaleStore();
const props = withDefaults(
  defineProps<{
    o: OrderView;
    blocks: Record<string, any>;
    variant?: 'card' | 'kanban' | 'compact';
    isRedeemable?: boolean;
    redeemableIds?: Set<string>;
  }>(),
  { variant: 'card', isRedeemable: false, redeemableIds: () => new Set<string>() }
);
const emit = defineEmits<{
  (e: 'ship', o: OrderView): void;
  (e: 'redeem', o: OrderView): void;
  (e: 'remind', o: OrderView): void;
  (e: 'detail', o: OrderView): void;
}>();

const redeemable = computed(() => props.isRedeemable || props.redeemableIds?.has(props.o.id) || false);

function stLabel(s: string) {
  return stateLabel(ORDER_STATES, s);
}
function stColor(s: string): string {
  return props.blocks.stateColors ? shipColor(s, stLabel(s).color) : stLabel(s).color;
}
function fmtTime(t: string): string {
  if (!t) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// 单行商品摘要：单件 → “名称 ×qty”；多件 → “首件名 ×总件数 等N件”
function goodsBrief(o: OrderView): string {
  const first = o.goods[0];
  if (!first) return '';
  const qty = o.goods.reduce((a, g) => a + g.qty, 0);
  return o.goods.length > 1 ? `${first.name} ×${qty} 等${o.goods.length}件` : `${first.name} ×${first.qty}`;
}
function copyCode(code: string) {
  if (!code) return;
  uni.setClipboardData({ data: code, success: () => uni.showToast({ title: locale.t('orderListComp.copied'), icon: 'none' }) });
}
</script>

<style lang="scss" scoped>
.card {
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 24rpx 32rpx;
  margin-bottom: 20rpx;

  // 看板极简卡：信息更少、密度更高
  &.slim {
    padding: 20rpx 24rpx;
    margin-bottom: 12rpx;
    border-radius: 12rpx;
  }

  .row { display: flex; align-items: center; justify-content: space-between; }

  .head {
    margin-bottom: 14rpx;

    .code { font-size: 28rpx; color: $wa-ink; font-weight: 600; cursor: pointer; }
    .st { font-size: 24rpx; }
  }

  .sub { font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx; }

  .addr {
    display: flex;
    gap: 8rpx;
    align-items: flex-start;
    background: #f0f2f7;
    border-radius: 8rpx;
    padding: 12rpx 20rpx;
    font-size: 24rpx;
    color: $wa-muted;
    line-height: 1.5;
    margin-bottom: 10rpx;

    .addr-ic { flex-shrink: 0; color: $wa-accent; }
    .addr-tx { flex: 1; }
  }

  .goods {
    display: flex;
    justify-content: space-between;
    padding-top: 8rpx;
    border-top: 1rpx dashed #e8edf5;

    .g-thumb { width: 56rpx; height: 56rpx; border-radius: 8rpx; background: #f0f2f7; flex-shrink: 0; margin-right: 16rpx; }
    .g-name { font-size: 26rpx; color: $wa-ink; flex: 1; margin-right: 16rpx; }
    .g-price { font-size: 26rpx; color: $wa-ink; }
  }

  .foot {
    margin-top: 14rpx;

    .time { font-size: 24rpx; color: $wa-muted; }
    .goods-brief { font-size: 24rpx; color: $wa-ink; flex: 1; margin-right: 16rpx; }
    .total { font-size: 30rpx; color: $wa-danger; font-weight: 600; }
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 16rpx;
    margin-top: 20rpx;

    .act { font-size: 26rpx; padding: 10rpx 30rpx; border-radius: 8rpx; }
    .ship { color: #fff; background: $wa-accent; }
    .redeem { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }
    .ghost { color: $wa-ink; background: #eef1f6; }
    .remind { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }
  }

  &.slim .actions { margin-top: 10rpx; }
  &.slim .head { margin-bottom: 8rpx; }
}

// 变体 C：高密度清单（无圆角、无背景卡、两行 + 细分割线）
.cp {
  padding: 18rpx 8rpx;
  border-bottom: 1rpx solid #eef1f6;

  .cp-l1 { display: flex; align-items: center; justify-content: space-between; }
  .cp-code { font-size: 26rpx; color: $wa-ink; font-weight: 600; }
  .cp-st { font-size: 22rpx; }

  .cp-l2 {
    display: flex;
    align-items: center;
    gap: 12rpx;
    margin-top: 8rpx;
    font-size: 22rpx;
    color: $wa-muted;

    .cp-cust { flex-shrink: 0; }
    .cp-goods { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cp-total { color: $wa-danger; font-weight: 600; }
    .cp-time { flex-shrink: 0; }
  }

  .cp-acts { display: flex; gap: 16rpx; margin-top: 10rpx; justify-content: flex-end; }
  .act { font-size: 22rpx; padding: 4rpx 18rpx; border-radius: 6rpx; }
  .ship { color: #fff; background: $wa-accent; }
  .redeem { color: $wa-accent; border: 1rpx solid $wa-accent; }
  .remind { color: $wa-accent; border: 1rpx solid $wa-accent; }
}
</style>
```

- [ ] **Step 3: 重写 `OrderListTableRow.vue`（桌面端两变体）**

全文替换为：

```vue
<template>
  <!-- 变体 C：紧凑表格（status-first）——36px 行高 / 12px 字号 / 斑马纹 / 列合并 -->
  <view v-if="variant === 'compact'" class="dt-row cprow" :class="{ head }">
    <template v-if="head">
      <text class="c-code">{{ $t('orderListComp.table.thOrder') }}</text>
      <text class="c-cust">{{ $t('orderListComp.table.thRecipient') }}</text>
      <text class="c-goods">{{ $t('orderListComp.table.thGoods') }}</text>
      <text class="c-pay">{{ $t('orderListComp.table.thPaid') }}</text>
      <text class="c-st">{{ $t('orderListComp.table.thState') }}</text>
      <text class="c-time">{{ $t('orderListComp.table.thTime') }}</text>
      <text class="c-ops">{{ $t('orderListComp.table.thOps') }}</text>
    </template>
    <template v-else>
      <text class="c-code" @tap="copyCode(row.code)">{{ row.code }}</text>
      <text class="c-cust">{{ row.customerName }}{{ row.phoneMask }}</text>
      <text class="c-goods" :title="goodsBrief(row)">{{ goodsBrief(row) }}</text>
      <text class="c-pay">¥{{ fmtMoney(row.total) }}</text>
      <text class="c-st" :style="{ color: stColor(row.state) }">{{ stLabel(row.state).label }}</text>
      <text class="c-time">{{ fmtTime(row.time) }}</text>
      <view class="c-ops">
        <text v-if="isShippable(row.state)" class="act ship" @tap="emit('ship', row)">{{ $t('orderListComp.actions.ship') }}</text>
        <text v-if="redeemable" class="act redeem" @tap="emit('redeem', row)">{{ $t('orderListComp.actions.goRedeem') }}</text>
        <text v-if="isUnpaid(row.state)" class="act remind" @tap="emit('remind', row)">{{ $t('orderListComp.actions.remind') }}</text>
        <text class="act ghost" @tap="emit('detail', row)">{{ $t('orderListComp.actions.detail') }}</text>
      </view>
    </template>
  </view>

  <!-- 变体 A/B：宽表格（classic / status-group）——列内子行（电话 / 地址 / 商品明细） -->
  <view v-else class="dt-row" :class="{ head }">
    <template v-if="head">
      <text class="c-code">{{ $t('orderListComp.table.thOrder') }}</text>
      <text class="c-goods">{{ $t('orderListComp.table.thGoods') }}</text>
      <text class="c-cust">{{ $t('orderListComp.table.thRecipient') }}</text>
      <text class="c-addr">{{ $t('orderListComp.table.thAddress') }}</text>
      <text class="c-deliv">{{ $t('orderListComp.table.thDelivery') }}</text>
      <text class="c-pay">{{ $t('orderListComp.table.thPaid') }}</text>
      <text class="c-time">{{ $t('orderListComp.table.thTime') }}</text>
      <text class="c-st">{{ $t('orderListComp.table.thState') }}</text>
      <text class="c-ops">{{ $t('orderListComp.table.thOps') }}</text>
    </template>
    <template v-else>
      <text class="c-code" @tap="copyCode(row.code)">{{ row.code }}</text>
      <view class="c-goods">
        <view class="dg" v-for="(g, gi) in row.goods" :key="gi">
          <image v-if="g.image" class="dg-thumb" :src="g.image" mode="aspectFill" />
          <view v-else class="dg-thumb"></view>
          <text class="dg-name">{{ g.name }}</text>
          <text class="dg-qty">×{{ g.qty }}</text>
        </view>
      </view>
      <text class="c-cust">{{ row.customerName }}{{ row.phoneMask }}</text>
      <text class="c-addr">{{ row.address || '—' }}</text>
      <text class="c-deliv">{{ row.delivery }}</text>
      <text class="c-pay">¥{{ fmtMoney(row.total) }}</text>
      <text class="c-time">{{ fmtTime(row.time) }}</text>
      <text class="c-st" :style="{ color: stColor(row.state) }">{{ stLabel(row.state).label }}</text>
      <view class="c-ops">
        <text v-if="isShippable(row.state)" class="act ship" @tap="emit('ship', row)">{{ $t('orderListComp.actions.ship') }}</text>
        <text v-if="redeemable" class="act redeem" @tap="emit('redeem', row)">{{ $t('orderListComp.actions.goRedeem') }}</text>
        <text v-if="isUnpaid(row.state)" class="act remind" @tap="emit('remind', row)">{{ $t('orderListComp.actions.remind') }}</text>
        <text class="act ghost" @tap="emit('detail', row)">{{ $t('orderListComp.actions.detail') }}</text>
      </view>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { OrderView, fmtMoney, shipColor, isShippable, isUnpaid } from '../../utils/orderFormat';
import { ORDER_STATES, stateLabel } from '../../constants/orderState';
import { useLocaleStore } from '../../stores/localeStore';

// 桌面表格行（head=true 渲染表头）。variant='compact' 时为紧凑表格（列合并为 7 列、36px 行高、斑马纹）。
const locale = useLocaleStore();
const props = withDefaults(
  defineProps<{
    o?: OrderView;
    blocks: Record<string, any>;
    variant?: 'wide' | 'compact';
    head?: boolean;
    isRedeemable?: boolean;
    redeemableIds?: Set<string>;
  }>(),
  { variant: 'wide', head: false, isRedeemable: false, redeemableIds: () => new Set<string>() }
);
const emit = defineEmits<{
  (e: 'ship', o: OrderView): void;
  (e: 'redeem', o: OrderView): void;
  (e: 'remind', o: OrderView): void;
  (e: 'detail', o: OrderView): void;
}>();

const row = computed(() => props.o || ({} as OrderView));
const redeemable = computed(() => props.isRedeemable || props.redeemableIds?.has(row.value.id) || false);

function stLabel(s: string) {
  return stateLabel(ORDER_STATES, s);
}
function stColor(s: string): string {
  return props.blocks.stateColors ? shipColor(s, stLabel(s).color) : stLabel(s).color;
}
function fmtTime(t: string): string {
  if (!t) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function goodsBrief(o: OrderView): string {
  const first = o.goods[0];
  if (!first) return '—';
  const qty = o.goods.reduce((a, g) => a + g.qty, 0);
  return o.goods.length > 1 ? `${first.name} ×${qty} 等${o.goods.length}件` : `${first.name} ×${first.qty}`;
}
function copyCode(code: string) {
  if (!code) return;
  uni.setClipboardData({ data: code, success: () => uni.showToast({ title: locale.t('orderListComp.copied'), icon: 'none' }) });
}
</script>

<style lang="scss" scoped>
.dt-row {
  display: grid;
  grid-template-columns: 2fr 3fr 1.8fr 1.4fr 1fr 1fr 1.6fr 1fr 1.4fr;
  gap: 16rpx;
  align-items: center;
  padding: 18rpx 24rpx;
  background: $wa-card;
  border-bottom: 1rpx solid #eef1f6;

  &.head {
    background: $wa-ink;
    color: #fff;
    border-radius: 8rpx 8rpx 0 0;
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .c-code { font-size: 14px; color: $wa-ink; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }

  .c-goods {
    font-size: 13px;
    color: $wa-ink;

    .dg {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 0;
      line-height: 1.5;

      .dg-thumb { width: 20px; height: 20px; border-radius: 4px; background: #f0f2f7; flex-shrink: 0; }
      .dg-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dg-qty { color: $wa-muted; }
    }
  }

  .c-cust { font-size: 13px; color: $wa-ink; }
  .c-addr { font-size: 13px; color: $wa-muted; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .c-deliv { font-size: 13px; color: $wa-muted; }
  .c-pay { font-size: 14px; color: $wa-danger; font-weight: 600; }
  .c-time { font-size: 13px; color: $wa-muted; }
  .c-st { font-size: 13px; font-weight: 600; }

  .c-ops {
    display: flex;
    gap: 10rpx;

    .act { font-size: 12px; padding: 4px 12px; border-radius: 6px; cursor: pointer; }
    .ship { color: #fff; background: $wa-accent; }
    .redeem { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }
    .ghost { color: $wa-ink; background: #eef1f6; }
    .remind { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }
  }
}

// 紧凑表格：7 列 / 36px 行高 / 12px 字号 / 斑马纹
.cprow {
  grid-template-columns: 1.4fr 1.6fr 2.6fr 1fr 1fr 1.4fr 1.6fr;
  gap: 10rpx;
  padding: 0 14px;
  height: 36px;
  font-size: 12px;

  &.head { height: 32px; font-size: 11.5px; }

  &:nth-child(even):not(.head) { background: #fafbfe; }

  .c-code { font-size: 12px; }
  .c-cust { font-size: 12px; }
  .c-goods { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .c-pay { font-size: 12px; }
  .c-st { font-size: 12px; }
  .c-time { font-size: 11.5px; }

  .c-ops {
    gap: 6rpx;

    .act { font-size: 11.5px; padding: 2px 8px; }
  }
}
</style>
```

- [ ] **Step 4: 静态自查**

Run: `Grep -n "stateColumnFirst|groupByState" src/components/order-list/`
Expected: 无匹配（两个字段的语义已由 `variant` 取代；`orderListLayouts.ts` 里的定义在 Task 7 一并删除）

- [ ] **Step 5: 提交**

```bash
git add src/components/order-list/OrderListHeadBar.vue src/components/order-list/OrderListCardRow.vue src/components/order-list/OrderListTableRow.vue
git commit -m "feat(web-admin): 订单统计卡语义修正 + 行组件三变体（卡片/看板/高密度）"
```

## Task 7: 版式结构性重做（`constants/orderListLayouts.ts` + `OrderListRenderer.vue`）

**Files:**
- Modify: `src/constants/orderListLayouts.ts`（整文件重写）
- Modify: `src/components/order-list/OrderListRenderer.vue`（整文件重写）

修 R12/R13：三版式的差异从「字段显隐」升级为「结构分支」（规格 §3.3 对照表）。`classic`=方案 A 卡片信息流，`status-group`=方案 B 状态看板，`status-first`=方案 C 高密度清单（key 字符串保留，避免既有店铺配置失效）。

**键位契约（Task 8 必须满足）**：桌面 B 版式左侧导航点击时 emit `'g:' + 分组 key`，因此**每个分组的「全部」chip 的 key 必须恰好是 `g:<groupKey>`**（`g:pending` / `g:active` / `g:done` / `g:cancelled` / `g:exception` / `g:afterSales`）。缺失会导致导航点了没反应。

- [ ] **Step 1: 重写 `src/constants/orderListLayouts.ts`**

全文替换为：

```ts
// 订单列表版式注册表：layout key → 结构变体 + 块级配置（L4 内建默认）
export type OrderListLayoutKey = 'classic' | 'status-first' | 'status-group';

/** 手机端行结构：card 大卡片信息流 / kanban 看板极简卡 / compact 高密度两行清单 */
export type OrderListVariant = 'card' | 'kanban' | 'compact';
/** 桌面端行结构：wide 9 列宽表 / compact 7 列紧凑表 */
export type OrderListDesktopVariant = 'wide' | 'compact';

export interface OrderListLayoutDef {
  key: OrderListLayoutKey;
  label: string;
  desc: string;
  /** 手机端结构分支（决定渲染器走哪个模板分支） */
  mobileVariant: OrderListVariant;
  /** 桌面端结构分支 */
  desktopVariant: OrderListDesktopVariant;
  /** 桌面是否渲染左侧分组导航（含服务端计数） */
  desktopGroupNav: boolean;
  /** 列内细节显隐（结构差异由 variant 决定，本处只管「同一结构内的字段取舍」） */
  blocks: {
    showThumb: boolean;        // 商品缩略图（A 有 / B、C 无）
    showAddress: boolean;      // 收货地址行
    showDeliveryName: boolean; // 配送方式全名
    stateColors: boolean;      // 物流色标签（待发货橙/已发货蓝/已完成绿/已取消灰）
  };
}

export const ORDER_LIST_LAYOUTS: Record<OrderListLayoutKey, OrderListLayoutDef> = {
  'classic': {
    key: 'classic',
    label: '卡片信息流',
    desc: '手机单列大卡片（缩略图 + 商品 + 顾客 + 地址 + 金额 + 操作组），桌面 9 列宽表',
    mobileVariant: 'card',
    desktopVariant: 'wide',
    desktopGroupNav: false,
    blocks: { showThumb: true, showAddress: true, showDeliveryName: true, stateColors: true },
  },
  'status-first': {
    key: 'status-first',
    label: '高密度清单（运维视角）',
    desc: '手机无圆角两行清单；桌面紧凑表格（36px 行高 / 斑马纹 / 粘性表头）',
    mobileVariant: 'compact',
    desktopVariant: 'compact',
    desktopGroupNav: false,
    blocks: { showThumb: false, showAddress: false, showDeliveryName: false, stateColors: true },
  },
  'status-group': {
    key: 'status-group',
    label: '状态看板（分区导航）',
    desc: '手机按状态泳道分区（状态名 + 单数 + 金额小计）+ 极简卡；桌面左侧分组导航 + 右侧紧凑表',
    mobileVariant: 'kanban',
    desktopVariant: 'compact',
    desktopGroupNav: true,
    blocks: { showThumb: false, showAddress: false, showDeliveryName: false, stateColors: true },
  },
};

export const DEFAULT_LAYOUT: OrderListLayoutKey = 'classic';
export const LAYOUT_KEYS = Object.keys(ORDER_LIST_LAYOUTS) as OrderListLayoutKey[];
```

- [ ] **Step 2: 重写 `src/components/order-list/OrderListRenderer.vue`**

全文替换为：

```vue
<template>
  <view class="page">
    <OrderListHeadBar :stats="stats" :redeemable-count="redeemableIds.size" @stat-tap="emit('stat-tap', $event)" @redeem="emit('redeem')" />
    <OrderListScope :scopes="scopes" :scope="scope" @change="emit('scope-change', $event)" />
    <OrderListTabs :groups="tabGroups" :cur="cur" @change="emit('tab-change', $event)" />
    <OrderListFilters
      :kw="kw"
      :time-key="timeKey"
      :custom-from="customFrom"
      :custom-to="customTo"
      :delivery="delivery"
      @update:kw="emit('update:kw', $event)"
      @search="emit('search')"
      @time="emit('time', $event)"
      @range="emit('range', $event)"
      @delivery="emit('delivery', $event)"
      @clear="emit('clear')"
    />

    <!-- ===== 手机端（<768px）：按 mobileVariant 出三种结构 ===== -->
    <!-- B 状态看板：按具体状态泳道分区，分区头 = 状态名 + 单数 + 金额小计 -->
    <view v-if="ctx.mobileVariant === 'kanban'" class="lanes">
      <view v-for="g in grouped" :key="g.state" class="lane">
        <view class="lane-head">
          <text class="l-name" :style="{ color: stColor(g.state) }">{{ g.label }}</text>
          <text class="l-cnt">{{ g.rows.length }} {{ $t('dataDashboard.orderUnit') }}</text>
          <text class="l-sum">¥{{ fmtMoney(g.total) }}</text>
        </view>
        <OrderListCardRow
          v-for="o in g.rows"
          :key="o.id"
          :o="o"
          :blocks="blocks"
          variant="kanban"
          :is-redeemable="redeemableIds.has(o.id)"
          :redeemable-ids="redeemableIds"
          @ship="emit('ship', $event)"
          @redeem="emit('redeem', $event)"
          @remind="emit('remind', $event)"
          @detail="emit('detail', $event)"
        />
      </view>
    </view>
    <!-- A 卡片信息流 / C 高密度清单：平铺（结构差异全部落在行组件 variant 上） -->
    <view v-else class="card-list">
      <OrderListCardRow
        v-for="o in views"
        :key="o.id"
        :o="o"
        :blocks="blocks"
        :variant="ctx.mobileVariant"
        :is-redeemable="redeemableIds.has(o.id)"
        :redeemable-ids="redeemableIds"
        @ship="emit('ship', $event)"
        @redeem="emit('redeem', $event)"
        @remind="emit('remind', $event)"
        @detail="emit('detail', $event)"
      />
    </view>

    <!-- ===== 桌面端（≥768px）===== -->
    <!-- B：左侧分组导航（计数取服务端 tabGroups.count）+ 右侧紧凑表 -->
    <view v-if="ctx.desktopGroupNav" class="sg-wrap">
      <view class="sg-nav">
        <view class="sg-nav-item" :class="{ on: cur === '' }" @tap="emit('tab-change', '')">
          <text class="n-label">{{ $t('orderListComp.tabs.all') }}</text>
          <text class="n-cnt">{{ totalItems }}</text>
        </view>
        <view
          v-for="g in tabGroups"
          :key="g.key"
          class="sg-nav-item"
          :class="{ on: cur === 'g:' + g.key }"
          @tap="emit('tab-change', 'g:' + g.key)"
        >
          <text class="n-label">{{ g.label }}</text>
          <text class="n-cnt">{{ g.count ?? 0 }}</text>
        </view>
      </view>
      <view class="sg-main">
        <OrderListTableRow head variant="compact" :blocks="blocks" />
        <OrderListTableRow
          v-for="o in views"
          :key="o.id"
          :o="o"
          :blocks="blocks"
          variant="compact"
          :is-redeemable="redeemableIds.has(o.id)"
          :redeemable-ids="redeemableIds"
          @ship="emit('ship', $event)"
          @redeem="emit('redeem', $event)"
          @remind="emit('remind', $event)"
          @detail="emit('detail', $event)"
        />
      </view>
    </view>
    <!-- A：9 列宽表；C：紧凑表（36px 行高 + 斑马纹 + 粘性表头） -->
    <view v-else class="dt">
      <OrderListTableRow head :variant="ctx.desktopVariant" :blocks="blocks" />
      <OrderListTableRow
        v-for="o in views"
        :key="o.id"
        :o="o"
        :blocks="blocks"
        :variant="ctx.desktopVariant"
        :is-redeemable="redeemableIds.has(o.id)"
        :redeemable-ids="redeemableIds"
        @ship="emit('ship', $event)"
        @redeem="emit('redeem', $event)"
        @remind="emit('remind', $event)"
        @detail="emit('detail', $event)"
      />
    </view>

    <OrderListPager
      v-if="scope === 'channel'"
      :page="page"
      :total-items="totalItems"
      :per-page="perPage"
      @page="emit('page', $event)"
      @perpage="emit('perpage', $event)"
    />

    <view v-if="!views.length && !loading" class="empty">{{ $t('orderListComp.empty') }}</view>
    <view v-if="loading" class="empty">{{ $t('orderListComp.loading') }}</view>
    <view v-if="loadingMore" class="empty">{{ $t('orderListComp.loadingMore') }}</view>
    <BottomBar current="order" />
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { OrderView, StatsValue, fmtMoney, shipColor } from '../../utils/orderFormat';
import { ORDER_STATES, stateLabel } from '../../constants/orderState';
import { STATE_GROUPS, TimeRangeKey } from '../../utils/orderFilter';
import { OrderListConfig } from '../../utils/orderListConfig';
import { ORDER_LIST_LAYOUTS, DEFAULT_LAYOUT } from '../../constants/orderListLayouts';
import BottomBar from '../BottomBar.vue';
import OrderListHeadBar from './OrderListHeadBar.vue';
import OrderListScope from './OrderListScope.vue';
import OrderListTabs from './OrderListTabs.vue';
import OrderListFilters from './OrderListFilters.vue';
import OrderListCardRow from './OrderListCardRow.vue';
import OrderListTableRow from './OrderListTableRow.vue';
import OrderListPager from './OrderListPager.vue';

// 版式渲染器：数据层（views/stats/筛选状态/分页）由页面传入，本组件只按 config.layout 的结构变体组装功能块，
// 事件全部透传（含 tabGroups 分组计数、时间胶囊、异常组）。tab 语义（states/exceptionOnly/exceptionType/afterSales）由页面定义。
const props = withDefaults(
  defineProps<{
    views: OrderView[];
    stats: StatsValue;
    config: OrderListConfig;
    loading?: boolean;
    loadingMore?: boolean;
    scopes: { key: string; label: string }[];
    scope: string;
    tabGroups: { key: string; label: string; count?: number; tabs: { key: string; label: string }[] }[];
    cur: string;
    kw: string;
    timeKey: TimeRangeKey;
    customFrom: string;
    customTo: string;
    delivery: '' | 'pickup' | 'delivery';
    redeemableIds: Set<string>;
    page: number;
    totalItems: number;
    perPage: number;
  }>(),
  {
    loading: false,
    loadingMore: false,
    views: () => [],
    stats: () => ({ today: '—', unpaid: '—', toShip: '—', refund: '—' }),
    scopes: () => [],
    tabGroups: () => [],
    cur: '',
    kw: '',
    timeKey: '',
    customFrom: '',
    customTo: '',
    delivery: '',
    redeemableIds: () => new Set<string>(),
    page: 1,
    totalItems: 0,
    perPage: 20,
  }
);
const emit = defineEmits<{
  (e: 'stat-tap', kind: 'today' | 'unpaid' | 'toShip' | 'refund'): void;
  (e: 'redeem'): void;
  (e: 'scope-change', key: string): void;
  (e: 'tab-change', key: string): void;
  (e: 'update:kw', v: string): void;
  (e: 'search'): void;
  (e: 'time', v: Exclude<TimeRangeKey, ''>): void;
  (e: 'range', r: { from: string; to: string }): void;
  (e: 'delivery', v: 'pickup' | 'delivery'): void;
  (e: 'clear'): void;
  (e: 'ship', o: OrderView): void;
  (e: 'redeem', o: OrderView): void;
  (e: 'remind', o: OrderView): void;
  (e: 'detail', o: OrderView): void;
  (e: 'page', delta: number): void;
  (e: 'perpage', n: number): void;
}>();

const blocks = computed(() => props.config.blocks || {});
// 结构变体来自版式注册表（L4 内建默认）；非法 key 时回退默认版式
const ctx = computed(() => ORDER_LIST_LAYOUTS[props.config.layout] || ORDER_LIST_LAYOUTS[DEFAULT_LAYOUT]);

function stLabel(s: string) {
  return stateLabel(ORDER_STATES, s);
}
function stColor(s: string): string {
  return blocks.value.stateColors ? shipColor(s, stLabel(s).color) : stLabel(s).color;
}

// 按具体状态分区（B 版式泳道）：顺序跟随 STATE_GROUPS 展开后的状态序，未知状态殿后；组内小计 = 单数 + 金额
const stateOrder = STATE_GROUPS.flatMap((g) => g.states);
const grouped = computed(() => {
  const map = new Map<string, OrderView[]>();
  for (const o of props.views) {
    const k = o.state || '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(o);
  }
  return Array.from(map.entries())
    .map(([state, rows]) => ({
      state,
      label: stLabel(state).label,
      rows,
      total: rows.reduce((a, o) => a + o.total, 0),
    }))
    .sort((a, b) => {
      const ia = stateOrder.indexOf(a.state);
      const ib = stateOrder.indexOf(b.state);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 160rpx;
}

.card-list {
  .card { margin-bottom: 20rpx; }
}

// 手机·B 状态看板：泳道分区（分区头 + 区内极简卡）
.lanes {
  .lane {
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 12rpx 16rpx 8rpx;
    margin-bottom: 20rpx;

    .lane-head {
      display: flex;
      align-items: baseline;
      gap: 12rpx;
      padding: 8rpx 4rpx 12rpx;
      border-bottom: 1rpx solid #eef1f6;

      .l-name { font-size: 28rpx; font-weight: 700; }
      .l-cnt { font-size: 22rpx; color: $wa-muted; }
      .l-sum { margin-left: auto; font-size: 24rpx; color: $wa-danger; font-weight: 600; }
    }
  }
}

// 桌面·B：左分组导航 + 右明细（默认隐藏，≥768 显示）
.sg-wrap {
  display: none;
  gap: 16px;
  align-items: flex-start;

  .sg-nav {
    width: 168px;
    flex-shrink: 0;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 8px;

    .sg-nav-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;

      &.on {
        background: $wa-ink;

        .n-label { color: #fff; }
        .n-cnt { background: rgba(255, 255, 255, 0.2); color: #fff; }
      }

      .n-label { font-size: 14px; font-weight: 600; }
      .n-cnt { font-size: 12px; color: $wa-muted; background: #f0f2f7; border-radius: 999px; padding: 1px 8px; }
    }
  }

  .sg-main { flex: 1; min-width: 0; }
}

// 桌面表格：默认隐藏，≥768 显示
.dt {
  display: none;
}

.empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }

@media (min-width: 768px) {
  .page { padding: 24px 32px 120px; }
  .page .card-list,
  .page .lanes { display: none; }
  .page .dt { display: block; }
  .page .sg-wrap { display: flex; }
}
</style>
```

- [ ] **Step 3: 静态自查**

Run: `Grep -n "groupByState|stateColumnFirst|deliveryIdx|dateIdx|deliveryOpts|dateOpts|deliveryLabel|dateLabel" src/`
Expected: 无匹配（旧版式字段与旧 picker 下标协议全部清除）

- [ ] **Step 4: 类型检查（中间态允许报页面错误）**

Run: `npx tsc --noEmit`
Expected: 仅 `src/pages/order/list/index.vue` 报旧 props/事件不匹配（Task 8 修复）；**不允许** `orderListLayouts.ts`、`OrderListRenderer.vue`、`OrderListCardRow.vue`、`OrderListTableRow.vue`、`OrderListTabs.vue`、`OrderListFilters.vue` 自身报错。

- [ ] **Step 5: 提交**

```bash
git add src/constants/orderListLayouts.ts src/components/order-list/OrderListRenderer.vue
git commit -m "feat(web-admin): 订单列表三版式结构性重做（卡片信息流/状态看板/高密度清单）"
```

---

## Task 8: 页面筛选状态机与请求编排（`utils/orderFormat.ts` 清理 + `pages/order/list/index.vue`）

**Files:**
- Modify: `src/utils/orderFormat.ts`（删除渠道单本地过滤等死代码；`filterShopRows` 改签名为与服务端同源的口径）
- Modify: `src/pages/order/list/index.vue`（整文件重写）

修 R1/R2（条件全下推服务端，页面不再做二次过滤）、R3/R4（`catch` + toast + `reqSeq` 竞态）、R6/R7/R8/R9（tab 全枚举、统计卡口径与点击语义、计数走服务端）。

**已确认的口径决策（写代码时不要改）**：
1. **分组 tab 计数**跟随当前「时间/配送/关键词」条件（切 tab 会替换状态条件，所以计数不含状态条件）；**统计卡计数**为全量口径（不受列表筛选影响，规格 §3.2 明示）。
2. **统计卡点击**：今日卡 → 只把时间维度置「今日」（不动 `cur`，修 R7）；待付款/待发货/待退款卡 → 切到与卡上计数**完全同口径**的隐藏 tab（`stat:unpaid` / `stat:toShip` / `stat:refund`），这样「卡上数字」与「点进去的条数」一致。
3. **状态 chip 文案**复用 `constants/orderState.ts` 的既有标签（与列表行渲染同源）；本页不重复定义状态词条。
4. 渠道 scope 的 `totalItems` 直接用服务端返回值；仅保留既有的「幽灵单（0 件 0 元）不渲染」过滤。
5. 商品单 scope（`myShopOrders` 全量）保留本地过滤，但**异常组/售后组无对应口径 → 返回空结果**（并在切 scope 时把 `cur` 置回「全部」）。

- [ ] **Step 1: 清理 `src/utils/orderFormat.ts`**

在文件顶部 import 区加入（`orderFilter` 不反向依赖 `orderFormat`，无循环引用）：

```ts
import { inTimeWindow, TimeRangeInput } from './orderFilter';
```

然后把 `export function isToday(...)`（约 L94-98）与 `export const TO_SHIP_STATES ... isRefundApprox`（约 L100-107）和 `export function computeStats(...)`（约 L111-123）**整段删除**，只保留 `export interface StatsValue`（L109）。删除依据：这些符号仅被旧订单列表页使用，改造后口径全部来自服务端计数（`fetchOrderCounts`）。

再把文件尾部的 `export interface OrderFilter {...}` 到 `withinDate`/`filterChannelRows`/`filterShopRows` 整段（约 L187-238）替换为：

```ts
// 商品单本地过滤入参：字段与渠道单的服务端 filter 口径一一对应（关键词/时间/配送/状态）
export interface ShopLocalFilter {
  keyword?: string;
  time?: TimeRangeInput;
  delivery?: '' | 'pickup' | 'delivery';
  /** 当前 tab 的状态集合；未指定表示不限状态 */
  states?: string[];
  /** 该 tab 在商品单口径下无对应数据（异常组 / 售后组）→ 直接返回空 */
  unsupported?: boolean;
}

/**
 * 商品单（myShopOrders 全量返回）本地过滤：本地过滤即全量可靠（规格 §3.1）。
 * 渠道单**不再**使用任何本地过滤函数（条件已全部下推服务端），故 filterChannelRows 已删除。
 */
export function filterShopRows(rows: ShopOrderRow[], f: ShopLocalFilter = {}, now = new Date()): ShopOrderRow[] {
  if (f.unsupported) return [];
  const k = (f.keyword || '').trim().toLowerCase();
  const dv = f.delivery || '';
  return rows.filter((o) => {
    if (dv === 'pickup') return false; // 商品单恒快递：选「自提」全排除、选「快递」放行继续下探
    if (!inTimeWindow(o.placedAt, f.time, now)) return false;
    if (f.states?.length && !f.states.includes(o.state)) return false;
    if (!k) return true;
    const prodNames = (o.items || []).map((it) => `${it.productName || ''} ${it.variantName || ''}`).join(' ');
    return [o.code, o.customerName, prodNames].some((v) => (v || '').toLowerCase().includes(k));
  });
}
```

- [ ] **Step 2: 重写 `src/pages/order/list/index.vue`**

模板部分只替换 `<script>` 块与 `OrderListRenderer` 的属性/事件绑定（`.layout-bar`、版式弹层与样式块保持原样）。`<template>` 中渲染器标签替换为：

```vue
    <!-- 积木式渲染器：数据/筛选/分页由本页透传，操作事件全部映射到本页 handler -->
    <OrderListRenderer
      :views="views"
      :stats="stats"
      :config="config"
      :loading="loading"
      :loading-more="loadingMore"
      :scopes="scopes"
      :scope="scope"
      :tab-groups="tabGroups"
      :cur="cur"
      v-model:kw="kw"
      :time-key="timeKey"
      :custom-from="customFrom"
      :custom-to="customTo"
      :delivery="delivery"
      :redeemable-ids="redeemableIds"
      :page="page"
      :total-items="totalItems"
      :per-page="perPage"
      @stat-tap="onStatTap"
      @redeem="onRedeem"
      @scope-change="onScope"
      @tab-change="onTab"
      @search="onSearch"
      @time="onTime"
      @range="onRange"
      @delivery="onDelivery"
      @clear="onClearFilter"
      @ship="goShip"
      @remind="goRemind"
      @detail="goDetail"
      @page="onPage"
      @perpage="onPerPage"
    />
```

`<script lang="ts" setup>` 整块替换为：

```ts
import { ref, onMounted, computed } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import OrderListRenderer from '../../../components/order-list/OrderListRenderer.vue';
import { fetchOrders, fetchOrderCounts, fetchShopOrders, fetchProductThumbs } from '../../../apis/order';
import { fetchPickupOrders } from '../../../apis/pickup';
import {
  channelToView,
  shopToView,
  filterShopRows,
  isGhostView,
  buildReminderText,
  OrderView,
  StatsValue,
} from '../../../utils/orderFormat';
import {
  buildOrderFilter,
  STATE_GROUPS,
  EXCEPTION_TYPES,
  AFTER_SALES_OPEN,
  UNPAID_STATES,
  TO_SHIP_STATES,
  OrderFilterInput,
  TimeRangeInput,
  TimeRangeKey,
} from '../../../utils/orderFilter';
import { ORDER_STATES, stateLabel } from '../../../constants/orderState';
import { ORDER_LIST_LAYOUTS, LAYOUT_KEYS, DEFAULT_LAYOUT, OrderListLayoutKey } from '../../../constants/orderListLayouts';
import { parseLayout, parseOrderListConfig } from '../../../utils/orderListConfig';
import { graphQlErrorMsg } from '../../../apis/client';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

// —— tab 定义：分组折叠 + 16 状态全枚举 + 异常组（exceptionType）+ 售后组 ——
// 键位契约：分组「全部」chip 的 key 固定为 `g:<groupKey>`，桌面 B 版式左侧导航直接复用该键。
interface OrderTab { key: string; label: string; states?: string[]; exceptionOnly?: boolean; exceptionType?: string; afterSales?: string[] }
interface TabGroup { key: string; label: string; count?: number; tabs: OrderTab[] }

const GROUP_LABEL_KEYS: Record<string, string> = {
  pending: 'groupPending',
  active: 'groupActive',
  done: 'groupDone',
  cancelled: 'groupCancelled',
};
// 状态 chip 文案复用 constants/orderState.ts 的既有标签（与列表行渲染同源，避免同一状态两处文案漂移）
const STATE_GROUP_TABS: TabGroup[] = STATE_GROUPS.map((g) => ({
  key: g.key,
  label: locale.t(`orderListComp.tabs.${GROUP_LABEL_KEYS[g.key]}`),
  tabs: [
    { key: `g:${g.key}`, label: locale.t('orderListComp.tabs.chipAll'), states: g.states },
    ...g.states.map((s) => ({ key: `s:${s}`, label: stateLabel(ORDER_STATES, s).label, states: [s] })),
  ],
}));
const EXCEPTION_TABS: TabGroup = {
  key: 'exception',
  label: locale.t('orderListComp.tabs.groupException'),
  tabs: [
    { key: 'g:exception', label: locale.t('orderListComp.tabs.chipAll'), exceptionOnly: true },
    ...EXCEPTION_TYPES.map((t) => ({
      key: `e:${t}`,
      label: locale.t(`orderListComp.exception.${t}`),
      exceptionOnly: true,
      exceptionType: t,
    })),
  ],
};
const AFTER_SALES_TABS: TabGroup = {
  key: 'afterSales',
  label: locale.t('orderListComp.tabs.groupAfterSales'),
  tabs: [{ key: 'g:afterSales', label: locale.t('orderListComp.tabs.refundPending'), afterSales: AFTER_SALES_OPEN }],
};
// 统计卡快捷口径（不出现在 tab UI 中）：口径与卡上计数完全一致，避免「点进去数量对不上」
const STAT_TABS: OrderTab[] = [
  { key: 'stat:unpaid', label: locale.t('orderAdmin.orderList.tabPendingPay'), states: UNPAID_STATES },
  { key: 'stat:toShip', label: locale.t('orderAdmin.orderList.tabPendingShip'), states: TO_SHIP_STATES },
  { key: 'stat:refund', label: locale.t('orderListComp.tabs.refundPending'), afterSales: AFTER_SALES_OPEN },
];
const TAB_MAP = new Map<string, OrderTab>(
  [...STATE_GROUP_TABS, EXCEPTION_TABS, AFTER_SALES_TABS]
    .flatMap((g) => g.tabs)
    .concat(STAT_TABS)
    .map((t) => [t.key, t])
);

const scopes = [
  { key: 'channel', label: locale.t('orderAdmin.orderList.scopeChannel') },
  { key: 'shop', label: locale.t('orderAdmin.orderList.scopeShop') },
];

const scope = ref('channel');
const cur = ref('');
const kw = ref('');
const timeKey = ref<TimeRangeKey>('');
const customFrom = ref('');
const customTo = ref('');
const delivery = ref<'' | 'pickup' | 'delivery'>('');
const tabGroups = ref<TabGroup[]>([...STATE_GROUP_TABS, EXCEPTION_TABS, AFTER_SALES_TABS]);
const views = ref<OrderView[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const totalItems = ref(0);
const perPage = ref(20);
const page = ref(1);
const stats = ref<StatsValue>({ today: '—', unpaid: '—', toShip: '—', refund: '—' });
const redeemableIds = ref<Set<string>>(new Set());

// 版式：读取持久化布局 key，切换后立即写入；config 由 key 解析出结构变体与块级配置传给渲染器
const layoutKey = ref<OrderListLayoutKey>(parseLayout(uni.getStorageSync('orderListLayout') || DEFAULT_LAYOUT));
const layoutOpen = ref(false);
const config = computed(() => parseOrderListConfig(JSON.stringify({ layout: layoutKey.value })));
function onPickLayout(k: OrderListLayoutKey) {
  layoutKey.value = k;
  uni.setStorageSync('orderListLayout', k);
  layoutOpen.value = false;
}

function timeInput(): TimeRangeInput {
  return { key: timeKey.value, from: customFrom.value, to: customTo.value };
}
/** 列表基础条件（不含状态）：切 tab 会替换状态条件，故分组计数也按此拆分 */
function baseInput(): OrderFilterInput {
  return { keyword: kw.value, time: timeInput(), delivery: delivery.value };
}
/** 当前 tab 的状态 / 异常 / 售后条件 */
function currentTabInput(): OrderFilterInput {
  const t = TAB_MAP.get(cur.value);
  if (!t) return {};
  const out: OrderFilterInput = {};
  if (t.states?.length) out.states = t.states;
  if (t.exceptionOnly) out.exceptionOnly = true;
  if (t.exceptionType) out.exceptionType = t.exceptionType;
  if (t.afterSales?.length) out.afterSales = t.afterSales;
  return out;
}
/** 分组计数条件：状态组 → state.in；异常组 → exceptionType 非空；售后组 → 售后未了结 */
function groupCondition(key: string): OrderFilterInput {
  const g = STATE_GROUPS.find((x) => x.key === key);
  if (g) return { states: g.states };
  if (key === 'exception') return { exceptionOnly: true };
  if (key === 'afterSales') return { afterSales: AFTER_SALES_OPEN };
  return {};
}
function currentFilter(): Record<string, any> | null {
  return buildOrderFilter({ ...baseInput(), ...currentTabInput() });
}
function toastFail(e: unknown) {
  const msg = graphQlErrorMsg(e, '');
  uni.showToast({
    title: msg ? `${locale.t('orderListComp.loadFailed')}：${msg}` : locale.t('orderListComp.loadFailed'),
    icon: 'none',
  });
}

// 竞态防护：自增请求序号，只有最新一次请求的结果才允许写入（R4）
let seq = 0;

async function load() {
  const my = ++seq;
  loading.value = true;
  loadingMore.value = false; // 新一次列表加载作废在途的「加载更多」
  try {
    if (scope.value === 'shop') {
      const list = await fetchShopOrders();
      if (my !== seq) return;
      const t = TAB_MAP.get(cur.value);
      const rows = filterShopRows(list, {
        keyword: kw.value,
        time: timeInput(),
        delivery: delivery.value,
        states: t?.states,
        unsupported: !!(t?.exceptionOnly || t?.afterSales),
      });
      totalItems.value = rows.length;
      let thumbMap: Record<string, string> = {};
      try {
        const ids = rows.flatMap((o) => (o.items || []).map((it) => it.productId));
        thumbMap = await fetchProductThumbs(ids);
      } catch { thumbMap = {}; }
      if (my !== seq) return;
      views.value = rows.map((o) => shopToView(o, thumbMap)).filter((v) => !isGhostView(v));
    } else {
      const { items, totalItems: total } = await fetchOrders({
        take: perPage.value,
        skip: (page.value - 1) * perPage.value,
        filter: currentFilter(),
      });
      if (my !== seq) return;
      totalItems.value = total;
      views.value = items.map(channelToView).filter((v) => !isGhostView(v));
    }
  } catch (e) {
    if (my === seq) toastFail(e); // 失败保留上一次结果，不清空
  } finally {
    if (my === seq) loading.value = false;
  }
}

async function loadMore() {
  if (scope.value === 'shop') return;
  if (loading.value || loadingMore.value) return;
  if (totalItems.value > 0 && views.value.length >= totalItems.value) return;
  const isMobile = typeof window === 'undefined' ? false : window.innerWidth < 768;
  if (!isMobile) return; // 桌面用分页条，不做无限滚动
  const my = ++seq;
  loadingMore.value = true;
  try {
    const next = page.value + 1;
    const { items, totalItems: total } = await fetchOrders({
      take: perPage.value,
      skip: (next - 1) * perPage.value,
      filter: currentFilter(),
    });
    if (my !== seq) return;
    page.value = next;
    totalItems.value = total;
    views.value = views.value.concat(items.map(channelToView).filter((v) => !isGhostView(v)));
  } catch (e) {
    if (my === seq) toastFail(e);
  } finally {
    if (my === seq) loadingMore.value = false;
  }
}

/**
 * 计数：统计卡（4）+ 分组 tab（6）合并为**一次**多别名请求，避免 10 次 HTTP。
 * 口径：统计卡 = 全量口径（不受列表筛选影响）；分组 tab = 跟随当前「时间/配送/关键词」条件。
 * 计数不参与竞态锁（只读幂等，失败保留上次值）。
 */
async function loadCounts() {
  const b = baseInput();
  const filters = [
    buildOrderFilter({ time: timeInput() }),
    buildOrderFilter({ states: UNPAID_STATES }),
    buildOrderFilter({ states: TO_SHIP_STATES }),
    buildOrderFilter({ afterSales: AFTER_SALES_OPEN }),
    ...tabGroups.value.map((g) => buildOrderFilter({ ...b, ...groupCondition(g.key) })),
  ];
  try {
    const nums = await fetchOrderCounts(filters);
    stats.value = {
      today: String(nums[0] ?? 0),
      unpaid: String(nums[1] ?? 0),
      toShip: String(nums[2] ?? 0),
      refund: String(nums[3] ?? 0),
    };
    tabGroups.value = tabGroups.value.map((g, i) => ({ ...g, count: nums[4 + i] ?? 0 }));
  } catch (e) {
    console.warn('[order-list] 计数失败：', graphQlErrorMsg(e, ''));
  }
}

async function loadRedeem() {
  try {
    const recs = await fetchPickupOrders(true);
    redeemableIds.value = new Set(recs.map((r) => r.orderId).filter(Boolean));
  } catch (e) {
    redeemableIds.value = new Set();
  }
}

function resetPage() { page.value = 1; }

function onScope(key: string) {
  if (scope.value === key) return;
  scope.value = key;
  cur.value = ''; // 商品单无异常/售后口径 → 切 scope 回到「全部」
  resetPage(); load(); loadCounts();
}
function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  resetPage(); load();
}
function onStatTap(kind: 'today' | 'unpaid' | 'toShip' | 'refund') {
  if (kind === 'today') {
    timeKey.value = 'today'; // 今日卡 = 时间维度置「今日」，不动 cur（修 R7）
    customFrom.value = '';
    customTo.value = '';
  } else {
    cur.value = `stat:${kind}`; // 与卡上计数同口径（修 R8）
  }
  resetPage(); load(); loadCounts();
}
function onSearch() {
  resetPage(); load(); loadCounts();
}
function onTime(v: Exclude<TimeRangeKey, ''>) {
  timeKey.value = timeKey.value === v ? '' : v; // 再点一次取消
  if (timeKey.value !== 'custom') { customFrom.value = ''; customTo.value = ''; }
  resetPage(); load(); loadCounts();
}
function onRange(r: { from: string; to: string }) {
  customFrom.value = r.from;
  customTo.value = r.to;
  timeKey.value = 'custom';
  resetPage(); load(); loadCounts();
}
function onDelivery(v: 'pickup' | 'delivery') {
  delivery.value = delivery.value === v ? '' : v;
  resetPage(); load(); loadCounts();
}
function onClearFilter() {
  kw.value = '';
  timeKey.value = '';
  customFrom.value = '';
  customTo.value = '';
  delivery.value = '';
  cur.value = '';
  resetPage(); load(); loadCounts();
}

function goShip(o: OrderView) {
  if (scope.value === 'shop') {
    uni.showToast({ title: locale.t('orderAdmin.orderList.shipViewToast'), icon: 'none' });
    return;
  }
  uni.showModal({
    title: locale.t('orderAdmin.orderList.confirmShipTitle'),
    content: locale.t('orderAdmin.orderList.confirmShipContent').replace('{code}', o.code),
    confirmText: locale.t('orderAdmin.orderList.confirmShipConfirm'),
    success: (r) => { if (r.confirm) uni.navigateTo({ url: `/pages/order/ship/index?id=${o.id}` }); },
  });
}
function goDetail(o: OrderView) {
  if (scope.value === 'shop') {
    uni.showToast({ title: locale.t('orderAdmin.orderList.detailViewToast'), icon: 'none' });
    return;
  }
  uni.navigateTo({ url: `/pages/order/detail/index?id=${o.id}` });
}
function goRedeem(o: OrderView) {
  uni.navigateTo({ url: `/pages/pickup/redeem/index?orderId=${o.id}` });
}
function goRedeemPage() {
  uni.navigateTo({ url: '/pages/pickup/redeem/index' });
}
function goRemind(o: OrderView) {
  const text = buildReminderText(o);
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: locale.t('orderAdmin.orderList.remindCopied'), icon: 'none' }),
    fail: () => uni.showToast({ title: locale.t('orderAdmin.orderList.copyFailed'), icon: 'none' }),
  });
}

function onPage(delta: number) {
  const pages = Math.max(1, Math.ceil(totalItems.value / perPage.value));
  const next = Math.min(pages, Math.max(1, page.value + delta));
  if (next === page.value) return;
  page.value = next; load();
}
function onPerPage(n: number) { perPage.value = n; resetPage(); load(); }

// Renderer 的 redeem 事件双义：HeadBar「核销码」无参 → 核销码页；行内「去核销」带订单 → 单笔核销
function onRedeem(o?: OrderView) {
  if (o) goRedeem(o);
  else goRedeemPage();
}

onMounted(() => {
  load();
  loadCounts();
  loadRedeem();
});
onPullDownRefresh(async () => {
  await Promise.all([load(), loadCounts(), loadRedeem()]);
  uni.stopPullDownRefresh();
});
onReachBottom(loadMore);
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: **0 error**（Task 4-7 的中间态错误在此步清零）。

- [ ] **Step 4: 提交**

```bash
git add src/utils/orderFormat.ts src/pages/order/list/index.vue
git commit -m "feat(web-admin): 订单列表筛选状态机（服务端过滤 + 分组/异常口径 + 计数与竞态防护）"
```

---

## Task 9: 回归、部署与交付（单测 / 构建 / 线上探针 / 手机截图 / 操作手册）

**Files:**
- Create: `_e2e/_shot_order_list_v2.py`
- Modify: `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html`（追加第 13 章）
- 产物：`src/static/manual/shots/orderlist_v2_*.png` + `docs/webadmin-bugfix-manual/assets/orderlist_v2_*.png`

**顺序很重要**：截图是「线上站点的真实效果」，必须**先构建 → 部署 → 再截图**，否则截的是旧版本。

- [ ] **Step 1: 单元测试**

Run: `npx tsx --test src/utils/orderFilter.test.ts` 然后 `npx tsx --test src/utils/orderListConfig.test.ts`（cwd = `d:\zhao\vshop\web-admin`）
Expected: 两个文件全 PASS（前者约 20 条、后者 6 条）。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 error。

- [ ] **Step 3: 本地构建**

Run: `npm run build:h5`
Expected: 构建成功，产出更新到 `dist/build/h5`（若构建报 codegen 缺字段，说明 `graphql.schema.json` 快照过期：先按既有约定重拉/打补丁再构建；本计划未新增任何 GraphQL 字段，正常不应触发）。

- [ ] **Step 4: 提交源码与产物**

```bash
git add -A
git commit -m "feat(web-admin): 订单列表服务端过滤/状态全枚举/异常组/三版式重做（含构建产物）"
```

- [ ] **Step 5: 部署（本地构建产物 → 服务器解压，服务器不构建）**

Run: `node scripts/deploy.mjs`
Expected: `scp` 上传成功 + 服务器解压完成，输出部署目标路径（若脚本要求指定目标站点，按脚本提示选择 `guanli` 站点）。

- [ ] **Step 6: 线上只读探针回归（接口层验收）**

Run: `python _e2e/_probe_order_filter.py`
Expected（与 Task 2 Step 1 记录的数值对照）：
- `state.in 待发货` / `keyword _or 冒烟` / `今日 orderPlacedAt.between` 三行均为**非 0 且有区分度**（小于 baseline）；
- `异常 exceptionType 非空` 与 `异常类型 damaged` 行不报 `ERR`（值可为 0，说明该环境当前无异常单）；
- `售后 in 集合` 行不报 `ERR`；
- `配送=快递` + `配送=自提` + `配送 deliveryType 为空` 三行合计 ≈ baseline（用于确认 Task 1 里 `deliveryType` 的严格 `eq` 口径是否需要改成 `notIn`；若「为空」非 0 且三个口径之和与 baseline 有明显缺口，回到 Task 1 改 `notIn` 并同步单测断言）。
- 备注：探针仅在服务器**未提供 filter 时**与 baseline 相等；任何一行等于 baseline 说明该条件在服务端被忽略，必须停下来排查。

- [ ] **Step 7: 手机视口截图（硬规范：390×844、dpr=2）**

创建 `_e2e/_shot_order_list_v2.py`：

```python
# -*- coding: utf-8 -*-
# 订单列表 v2 截图：服务端过滤 / 时间+状态组合 / 异常组 / 三版式（手机 390x844 dpr=2 为主 + 桌面 1440x900）
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
from playwright.sync_api import sync_playwright
import time, shutil, os

BASE = 'https://e.joho.cn/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/'
MANUAL = 'd:/zhao/vshop/web-admin/docs/webadmin-bugfix-manual/assets/'
os.makedirs(SHOT, exist_ok=True)


def login(ctx):
    pg = ctx.new_page()
    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=30000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click()
    time.sleep(7)
    # 绕开选店 UI：直接取 t2 渠道 token 注入 localStorage
    tok = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c = (d.data.myTenantAccess.channels||[]).find(x=>x.code==='t2');
        if (!c) return 'NOCHANNEL';
        localStorage.setItem('wa_channel_token', c.token);
        localStorage.setItem('wa_channel_code', 't2');
        return 'OK:' + c.token.slice(0, 6);
      }).catch(e=>'ERR:'+e.message);
    }""")
    print('  channel inject =', tok)
    return pg


def open_list(pg):
    pg.goto(BASE + '#/pages/order/list/index', wait_until='networkidle', timeout=45000)
    time.sleep(6)


def shot(pg, name, asset_dir=SHOT):
    pg.screenshot(path=asset_dir + name)
    print('  shot:', name)


def pick_layout(pg, label):
    pg.locator('.layout-btn').tap()
    time.sleep(1.5)
    pg.locator('.pop-item', has_text=label).tap()
    time.sleep(3)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)

    # ===== 手机 390x844 dpr=2 =====
    m = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = login(m)
    open_list(pg)
    print('body=', pg.inner_text('body')[:300].replace('\n', '|'))
    shot(pg, 'orderlist_v2_default_390.png')                 # 1 默认：时间胶囊 + 分组 tab + 统计卡 + 卡片信息流

    # 2 搜索命中（服务端过滤 → 跨页订单也能命中）
    pg.locator('input').first.fill('2026')
    pg.get_by_text('搜索', exact=True).first.tap()
    time.sleep(4)
    shot(pg, 'orderlist_v2_search_390.png')

    # 3 今日 + 待发货（时间维度与状态分组可叠加）
    pg.get_by_text('清除', exact=True).first.tap(); time.sleep(3)
    pg.get_by_text('今日', exact=True).first.tap(); time.sleep(3)
    pg.locator('.gtab', has_text='待发货').first.tap(); time.sleep(3)
    shot(pg, 'orderlist_v2_today_state_390.png')

    # 4 异常组（exceptionType 非空）
    pg.get_by_text('清除', exact=True).first.tap(); time.sleep(3)
    pg.locator('.grp', has_text='异常').first.locator('.gtab').first.tap(); time.sleep(3)
    shot(pg, 'orderlist_v2_exception_390.png')

    # 5~7 三版式结构对照（B→C→A）
    pg.get_by_text('清除', exact=True).first.tap(); time.sleep(3)
    pick_layout(pg, '状态看板'); shot(pg, 'orderlist_v2_layout_b_390.png')
    pick_layout(pg, '高密度清单'); shot(pg, 'orderlist_v2_layout_c_390.png')
    pick_layout(pg, '卡片信息流'); shot(pg, 'orderlist_v2_layout_a_390.png')

    # ===== 桌面 1440x900（B 版式：左分组导航含计数 + 右侧紧凑表）=====
    d = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    dp = login(d)
    open_list(dp)
    pick_layout(dp, '状态看板')
    shot(dp, 'orderlist_v2_desktop_1440.png')

    b.close()

# 同步到操作手册 assets
for n in os.listdir(SHOT):
    if n.startswith('orderlist_v2_'):
        shutil.copy(SHOT + n, MANUAL + n)
        print('copied →', n)
print('done')
```

Run: `python _e2e/_shot_order_list_v2.py`
Expected: 控制台打印 8 个 `shot:` 与 8 个 `copied →`；逐张确认（含中文不乱码、无空白区）：
1. `orderlist_v2_default_390.png`：顶部统计卡 4 张、时间胶囊（今日/近7天/本月/自定义）、分组折叠 tab（待处理/进行中/已完成/已取消/异常/售后，含计数）、卡片带缩略图与操作按钮组。
2. `orderlist_v2_search_390.png`：关键词「2026」命中的订单（若线上确实无匹配 → 换一个真实订单号前缀重跑，不得留空图）。
3. `orderlist_v2_today_state_390.png`：今日胶囊高亮 + 「待发货」chip 高亮同时存在（证明时间与状态可组合）。
4. `orderlist_v2_exception_390.png`：异常组已展开且组内 chip 可见（拒收/地址错误/无人接收/破损/其他）；无异常单时列表显示空态，属正常。
5. `orderlist_v2_layout_a_390.png`：单列大卡片（缩略图 + 商品明细 + 操作组）。
6. `orderlist_v2_layout_b_390.png`：状态泳道分区（分区头含状态名 + 单数 + 金额小计），区内为极简卡（无缩略图）。
7. `orderlist_v2_layout_c_390.png`：无圆角两行高密度清单（无缩略图、信息压到一个屏更多条）。
8. `orderlist_v2_desktop_1440.png`：左侧分组导航（含服务端计数）+ 右侧紧凑表。

- [ ] **Step 8: 更新操作手册（追加第 13 章）**

在 `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` 的第 12 章 `</section>`（约 L598）之后、`<footer>` 之前插入：

```html
  <section id="order-list-filter-v2">
    <h2>13 订单列表 · 搜索过滤 / 状态维度 / 版式修复（2026-09-21）</h2>
    <h3>13.1 现象</h3>
    <ul>
      <li><strong>搜索过滤不稳定、特定环境无结果</strong>：搜索框只在「当前页已加载的 20 条」里做客户端过滤，订单排在第 2 页之后的永远搜不到；同一关键词在不同店铺（渠道）表现不同。</li>
      <li><strong>订单状态不全</strong>：状态 tab 只有 6 项，「今日订单」统计卡点进去是「全部」；待退款卡筛的是「已取消」而不是真实售后未了结单。</li>
      <li><strong>版式变化不明显</strong>：三个版式只是字段显隐差异，切换后肉眼几乎看不出区别。</li>
    </ul>
    <h3>13.2 根因</h3>
    <ol>
      <li>渠道单接口调用时只下推了 <code class="mono">state</code>（还用了字符串内插），关键词 / 时间 / 配送全部丢给前端 <code class="mono">filterChannelRows</code> 页内过滤 → 命中范围被限制在当页。</li>
      <li>状态 tab 的 <code class="mono">keys</code> 数组未被下推，多状态 tab 退化为单状态；16 个订单状态里只暴露了 6 个。</li>
      <li>统计卡把「今日」映射成空状态（=全部），「待退款」用 <code class="mono">state === 'Cancelled'</code> 近似。</li>
      <li>三版式共用的 <code class="mono">blocks</code> 字段（showAddress/showDeliveryName/stateColors）在三版式里全是 <code class="mono">true</code>，差异被抹平。</li>
      <li><code class="mono">load()</code> 没有 <code class="mono">catch</code>，请求失败静默；快速切换 tab 存在旧响应覆盖新结果的竞态。</li>
    </ol>
    <h3>13.3 修复</h3>
    <ul>
      <li><strong>条件全下推服务端</strong>：新增纯函数层 <code class="mono">src/utils/orderFilter.ts</code> 统一组装 Vendure <code class="mono">OrderFilterParameter</code>（关键词 → <code class="mono">_or</code>(订单号/联系人/电话/备注)、状态 → <code class="mono">state.in</code>、时间 → <code class="mono">orderPlacedAt.between</code> 半开区间、配送 → <code class="mono">deliveryType</code>、异常 → <code class="mono">exceptionType</code>、售后 → <code class="mono">afterSalesStatus.in</code>），查询改为 GraphQL 变量传参（消除字符串内插注入面）。渠道单<strong>不再做任何页内二次过滤</strong>，<code class="mono">totalItems</code> 以服务端为准。</li>
      <li><strong>状态全枚举 + 分组折叠</strong>：按「待处理 / 进行中 / 已完成 / 已取消」四组折叠展示全部 16 个状态，每组「全部」下推 <code class="mono">state.in</code>(组内状态集合)；新增<strong>异常组</strong>（<code class="mono">exceptionType: { isNull: false }</code>）与二级筛选 chip（拒收 / 地址错误 / 无人接收 / 破损 / 其他），以及<strong>售后组</strong>（<code class="mono">afterSalesStatus.in</code> 未了结集合）。</li>
      <li><strong>时间快捷筛选条</strong>：今日 / 近7天 / 本月 / 自定义区间，单选胶囊，可与状态 tab 叠加（如「今日 + 待发货」）；自定义区间起止颠倒自动交换。</li>
      <li><strong>统计卡对齐口径</strong>：今日卡 → 置时间维度「今日」；待付款 / 待发货 / 待退款卡 → 切到与卡上计数完全同口径的筛选；4 张卡与 6 个分组计数合并为<strong>一次</strong>多别名 GraphQL 请求（10 个别名）。</li>
      <li><strong>三版式结构性重做</strong>：<code class="mono">classic</code>=卡片信息流（手机单列大卡片 + 桌面 9 列宽表）、<code class="mono">status-group</code>=状态看板（手机状态泳道分区 + 桌面左分组导航含计数）、<code class="mono">status-first</code>=高密度清单（手机两行清单 + 桌面 36px 行高紧凑表）。</li>
      <li><strong>错误处理与竞态</strong>：<code class="mono">load()/loadMore()</code> 补 <code class="mono">catch</code> + 原样透传后端 message 的 Toast，失败保留上次结果；引入自增请求序号 <code class="mono">reqSeq</code>，只有最新请求可写入列表。</li>
    </ul>
    <div class="callout ok">
      <h4>验收结论（线上 e.joho.cn/guanli，手机 390×844 dpr=2）</h4>
      <p>① 搜索订单号/顾客/手机号/备注可命中跨页订单；② 待发货 tab 同时出现 <code class="mono">PaymentAuthorized</code> 与 <code class="mono">PaymentSettled</code>；③ 点「今日订单」卡进入今日时间筛选（不再等于全部）；④ 待退款卡筛选售后未了结单；⑤ 请求失败有明确报错且列表不清空、快速切换无旧结果覆盖；⑥ 三版式切换后结构肉眼可辨。</p>
    </div>
    <h3>13.4 验收截图</h3>
    <figure style="margin:0 0 10px;"><img src="assets/orderlist_v2_default_390.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;" /><img src="assets/orderlist_v2_search_390.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;margin-left:8px;" /><img src="assets/orderlist_v2_today_state_390.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;margin-left:8px;" /><figcaption style="font-size:12px;color:var(--muted);margin-top:6px;">默认列表（时间胶囊 + 分组 tab + 统计卡） / 搜索命中（服务端过滤） / 今日 + 待发货组合筛选（手机 390×844）</figcaption></figure>
    <figure style="margin:0 0 10px;"><img src="assets/orderlist_v2_exception_390.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;" /><img src="assets/orderlist_v2_layout_b_390.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;margin-left:8px;" /><img src="assets/orderlist_v2_layout_c_390.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;margin-left:8px;" /><figcaption style="font-size:12px;color:var(--muted);margin-top:6px;">异常组（exceptionType 非空 + 二级类型 chip） / 版式 B 状态看板（泳道分区 + 单数小计） / 版式 C 高密度清单</figcaption></figure>
    <figure style="margin:0;"><img src="assets/orderlist_v2_layout_a_390.png" style="width:30%;border:1px solid var(--rule);border-radius:10px;" /><img src="assets/orderlist_v2_desktop_1440.png" style="width:64%;border:1px solid var(--rule);border-radius:10px;margin-left:8px;" /><figcaption style="font-size:12px;color:var(--muted);margin-top:6px;">版式 A 卡片信息流（缩略图 + 商品明细 + 操作组） / 桌面 1440 状态看板（左分组导航含计数 + 右紧凑表）</figcaption></figure>
    <div class="callout warn">
      <h4>故障排查指引</h4>
      <p>若某店铺「搜不到某订单」：① 先确认搜索词命中的是 <b>订单号 / 顾客名 / 手机号 / 备注</b> 四类（渠道单服务端口径不含商品名，商品名请切「本店商品单」scope 搜索）；② 检查是否叠加了时间胶囊或状态 tab（叠加后是「与」关系）；③ 时间筛选以 <code class="mono">orderPlacedAt</code> 为准——未提交的购物车态（Created/AddingItems）无下单时间，不会出现在「今日」里，属预期。</p>
    </div>
    <p class="muted" style="font-size:13px;">涉及文件：新增 <code class="mono">vshop/web-admin/src/utils/orderFilter.ts</code>（+ 单测）、<code class="mono">src/apis/order.ts</code>（<code class="mono">fetchOrders</code> 变量化 + <code class="mono">fetchOrderCounts</code>）、<code class="mono">src/pages/order/list/index.vue</code>、<code class="mono">src/components/order-list/*</code>、<code class="mono">src/constants/orderListLayouts.ts</code>、<code class="mono">src/utils/orderFormat.ts</code>、双语语言包。纯前端改动，<strong>不改后端</strong>；部署：本地 <code class="mono">npm run build:h5</code> → <code class="mono">node scripts/deploy.mjs</code>（服务器不构建）。回滚：前端产物回退即可。</p>
  </section>
```

并把页脚更新为（追加第 13 章说明）：

```html
  <footer>vShop · web-admin 后台修复操作手册 · 生成于 2026-09-04（2026-09-13 追加第 12 章，2026-09-21 追加第 13 章） · 适用于 Nuxt/Vue3 uni-app H5 前端</footer>
```

- [ ] **Step 9: 提交手册与截图**

```bash
git add docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html docs/webadmin-bugfix-manual/assets/orderlist_v2_*.png src/static/manual/shots/orderlist_v2_*.png
git commit -m "docs(web-admin): 操作手册追加订单列表过滤/状态/版式修复章节与手机截图"
```

- [ ] **Step 10: 人工线上复验（对照规格「验收标准」6 条）**

在 `https://e.joho.cn/guanli/#/pages/order/list/index`（手机浏览器或 390×844 视口）逐条确认：
1. 用订单号后 4 位、顾客名、手机号、备注各搜一次 → 均能命中（含不在第 1 页的订单）。
2. 点「进行中」组的「待发货」chip → 结果里同时有 `PaymentAuthorized` 与 `PaymentSettled` 的订单。
3. 点顶部「今日订单」统计卡 → 时间胶囊「今日」高亮，列表只剩今日单。
4. 点「待退款」统计卡 → 列表为售后未了结单（不是已取消单）。
5. 快速连续点两个不同 tab → 最终展示的是**最后点的那一个**的结果（无旧结果覆盖）；断网再点搜索 → 出现 Toast 报错且列表仍是上次结果。
6. 顶部「版式」依次切三个版式 → 卡片信息流 / 状态看板（泳道分区）/ 高密度清单 结构差异肉眼可辨。

- [ ] **Step 11: 回滚预案（对照规格第七节）**

本改动**纯前端、不改后端、无数据迁移**，回滚即产物回退，不需要动数据库与服务器配置：

```bash
git log --oneline -3            # 找到本轮之前的最后一个 commit（形如 "xxx" 的构建产物提交）
git revert --no-edit <本轮构建提交 sha>   # 反向提交源码 + dist/build/h5
node scripts/deploy.mjs         # 重新推送回退后的产物（服务器不做构建）
```

风险点唯在「时间字段从 `orderPlacedAt || createdAt` 改为严格 `orderPlacedAt`」——影响面仅为未提交的购物车 / 草稿单不再计入「今日」，属预期行为，无需回滚。
若线上出现接口层异常（如探针任一行 `totalItems` 等于 baseline，说明 filter 未生效），优先回滚本产物，再回到 Task 2 Step 1 的探针重新确认字段名。