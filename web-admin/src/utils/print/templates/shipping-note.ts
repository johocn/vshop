// 发货单模板：一单一页（A4），只打印已知字段，不伪造商品行明细
import { A4_PORTRAIT } from '../print.css.ts';
import { esc, fill, fmtTime, pageHtml, withLabels, type PrintLabels } from '../doc-common.ts';

export interface ShippingNoteOrder {
  code: string;
  customerName: string | null;
  phoneNumber: string | null;
  address: string;
  itemCount: number;
}

export interface ShippingNoteInput {
  batchCode: string;
  warehouseName: string;
  printedAt: Date;
  orders: ShippingNoteOrder[];
  labels?: Partial<PrintLabels>;
}

export function renderShippingNote(input: ShippingNoteInput): string {
  const L = withLabels(input.labels);
  const time = fmtTime(input.printedAt);

  const sheets = input.orders
    .map(
      (o) => `<div class="sheet">
<h2>${esc(L.shippingNote)}</h2>
<div class="meta">${esc(L.batchCode)}：${esc(input.batchCode)} ｜ ${esc(L.warehouse)}：${esc(input.warehouseName)} ｜ ${esc(L.printedAt)}：${esc(time)}</div>
<table>
<tr><th style="width:90px">${esc(L.orderCode)}</th><td style="width:170px">${esc(o.code)}</td><th style="width:70px">${esc(L.itemCount)}</th><td>${esc(fill('{q} {u}', { q: o.itemCount, u: L.itemUnit }))}</td></tr>
<tr><th>${esc(L.recipient)}</th><td>${esc(o.customerName)}</td><th>${esc(L.phone)}</th><td>${esc(o.phoneNumber)}</td></tr>
<tr><th>${esc(L.address)}</th><td colspan="3" style="height:52px">${esc(o.address)}</td></tr>
</table>
<div class="sign">${esc(L.signName)}：________________　　${esc(L.signDate)}：________________</div>
</div>`,
    )
    .join('');

  return pageHtml({
    title: `${L.shippingNote} ${input.batchCode}`,
    pageRule: A4_PORTRAIT,
    extraCss: `.sheet { page-break-after: always; padding-bottom: 8px; }
.sheet:last-child { page-break-after: auto; }
.sign { margin-top: 14px; font-size: 12px; line-height: 2; }`,
    body: sheets || `<div class="muted">${esc(L.shippingNote)}：—</div>`,
  });
}