// 打印模板单测（计划原文用 vitest，但 web-admin 未装 vitest，改用 Node 内置 node:test —— 见偏差 26）
// 运行：node --test src/utils/print/templates/templates.spec.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderBatchOverview } from './batch-overview.ts';
import { renderParcelLabel } from './parcel-label.ts';
import { renderPickingList } from './picking-list.ts';
import { renderShippingNote } from './shipping-note.ts';

const rows = [
  { sku: 'SKU-A1', name: '矿泉水', qty: 4, orderCodes: ['SO-1'], binCode: 'A-01-03', zoneCode: 'A', zoneName: '常温存储区', pathIndex: 1 },
  { sku: 'SKU-C', name: '无库位商品', qty: 1, orderCodes: ['SO-3'], binCode: null, zoneCode: null, zoneName: null, pathIndex: 9999 },
];
const base = { batchCode: 'PB20260922-001', warehouseName: '杭州仓', printedAt: new Date('2026-09-22T15:40:00') };

const orders = [
  { code: 'SO-1', customerName: '张三', phoneNumber: '13800000001', address: '浙江省杭州市西湖区文三路 1 号', itemCount: 3 },
  { code: 'SO-2', customerName: '<script>李四</script>', phoneNumber: '13800000002', address: '浙江省杭州市拱墅区莫干山路 2 号', itemCount: 1 },
];

describe('拣货单模板', () => {
  it('bin 档渲染库位编码与库区分组', () => {
    const html = renderPickingList({ ...base, binMode: 'bin', rows });
    assert.ok(html.includes('A-01-03'));
    assert.ok(html.includes('常温存储区'));
  });

  it('zone 档不渲染库位编码，只到库区', () => {
    const html = renderPickingList({ ...base, binMode: 'zone', rows });
    assert.ok(!html.includes('A-01-03'));
    assert.ok(html.includes('常温存储区'));
  });

  it('off 档不渲染库位列与库区分组', () => {
    const html = renderPickingList({ ...base, binMode: 'off', rows });
    assert.ok(!html.includes('A-01-03'));
    assert.ok(!html.includes('常温存储区'));
  });

  it('无库位的行标黄并带归位提示', () => {
    const html = renderPickingList({ ...base, binMode: 'bin', rows });
    assert.ok(html.includes('需先入库归位'));
    assert.ok(html.includes('class="flag"'));
  });

  it('行序沿用 pathIndex（后端已排好，前端不重排）且无库位行置底', () => {
    const html = renderPickingList({ ...base, binMode: 'bin', rows });
    assert.ok(html.indexOf('SKU-A1') < html.indexOf('SKU-C'));
  });

  it('合计行统计行数与件数', () => {
    const html = renderPickingList({ ...base, binMode: 'off', rows });
    assert.ok(html.includes('共 2 行'));
    assert.ok(html.includes('合计 5 件'));
  });

  it('动态文本被 HTML 转义（商品名注入不生效）', () => {
    const html = renderPickingList({
      ...base,
      binMode: 'off',
      rows: [{ sku: 'SKU-X', name: '<img onerror=1>', qty: 1, orderCodes: ['SO-9'], binCode: null, zoneCode: null, zoneName: null, pathIndex: 1 }],
    });
    assert.ok(!html.includes('<img onerror'));
    assert.ok(html.includes('&lt;img onerror=1&gt;'));
  });

  it('可传入本地化文案覆盖默认中文', () => {
    const html = renderPickingList({ ...base, binMode: 'off', rows, labels: { pickingList: 'Picking List', totalRows: '{n} rows', totalQty: 'Total {q}' } });
    assert.ok(html.includes('Picking List'));
    assert.ok(html.includes('2 rows'));
  });
});

describe('发货单 / 包裹标签 / 批次总览', () => {
  it('发货单一单一页且含地址与签收栏', () => {
    const html = renderShippingNote({ ...base, orders });
    assert.ok(html.includes('浙江省杭州市西湖区文三路 1 号'));
    assert.ok(html.includes('签收人签字'));
    assert.equal((html.match(/class="sheet"/g) ?? []).length, orders.length);
  });

  it('包裹标签用 100×150 热敏尺寸', () => {
    const html = renderParcelLabel({ ...base, orders });
    assert.ok(html.includes('100mm 150mm'));
    assert.ok(html.includes('13800000001'));
  });

  it('批次总览用 A4 横向并统计合计', () => {
    const html = renderBatchOverview({ ...base, batchState: 'PENDING', orders });
    assert.ok(html.includes('A4 landscape'));
    assert.ok(html.includes('合计 4 件'));
  });

  it('客户名中的标签被转义（不破坏单据结构）', () => {
    const html = renderShippingNote({ ...base, orders });
    assert.ok(html.includes('&lt;script&gt;'));
  });
});