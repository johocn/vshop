// 批次总览模板：A4 横向一张表，用于交接/复核批次内全部订单
import { A4_LANDSCAPE } from '../print.css.ts';
import { esc, fill, fmtTime, pageHtml, withLabels, type PrintLabels } from '../doc-common.ts';

export interface BatchOverviewInput {
  batchCode: string;
  batchState: string;
  warehouseName: string;
  printedAt: Date;
  orders: Array<{
    code: string;
    customerName: string | null;
    phoneNumber: string | null;
    address: string;
    itemCount: number;
  }>;
  labels?: Partial<PrintLabels>;
}

export function renderBatchOverview(input: BatchOverviewInput): string {
  const L = withLabels(input.labels);
  const orders = input.orders;
  const totalItems = orders.reduce((s, o) => s + (o.itemCount || 0), 0);

  const trs = orders
    .map(
      (o, i) => `<tr>
<td style="width:36px">${i + 1}</td>
<td style="width:130px">${esc(o.code)}</td>
<td style="width:110px">${esc(o.customerName)}</td>
<td style="width:130px">${esc(o.phoneNumber)}</td>
<td>${esc(o.address)}</td>
<td style="width:60px">${o.itemCount}</td>
</tr>`,
    )
    .join('');

  return pageHtml({
    title: `${L.batchOverview} ${input.batchCode}`,
    pageRule: A4_LANDSCAPE,
    body: `<h1>${esc(L.batchOverview)}</h1>
<div class="meta">${esc(L.batchCode)}：${esc(input.batchCode)} ｜ ${esc(L.warehouse)}：${esc(input.warehouseName)} ｜ ${esc(L.printedAt)}：${esc(fmtTime(input.printedAt))}</div>
<table>
<thead><tr>
<th>${esc(L.seq)}</th>
<th>${esc(L.orderCode)}</th>
<th>${esc(L.recipient)}</th>
<th>${esc(L.phone)}</th>
<th>${esc(L.address)}</th>
<th>${esc(L.itemCount)}</th>
</tr></thead>
<tbody>${trs}</tbody>
</table>
<div class="foot">${esc(fill(L.totalRows, { n: orders.length }))} ｜ ${esc(fill(L.totalQty, { q: totalItems }))}</div>`,
  });
}