// 包裹标签模板：100×150mm 热敏，一件一页；字号放大以便贴在包裹上快速辨认
import { THERMAL_100x150 } from '../print.css.ts';
import { esc, fmtTime, pageHtml, withLabels, type PrintLabels } from '../doc-common.ts';

export interface ParcelLabelInput {
  batchCode: string;
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

export function renderParcelLabel(input: ParcelLabelInput): string {
  const L = withLabels(input.labels);
  const time = fmtTime(input.printedAt);

  const labels = input.orders
    .map(
      (o) => `<div class="label">
<div class="lt">${esc(L.parcelLabel)}</div>
<div class="row"><span class="k">${esc(L.recipient)}</span><span class="v big">${esc(o.customerName)}</span></div>
<div class="row"><span class="k">${esc(L.phone)}</span><span class="v big">${esc(o.phoneNumber)}</span></div>
<div class="row"><span class="k">${esc(L.address)}</span><span class="v addr">${esc(o.address)}</span></div>
<div class="row"><span class="k">${esc(L.orderCode)}</span><span class="v mono">${esc(o.code)}</span></div>
<div class="row"><span class="k">${esc(L.batchCode)}</span><span class="v mono">${esc(input.batchCode)}</span></div>
<div class="row"><span class="k">${esc(L.itemCount)}</span><span class="v big">${o.itemCount}</span></div>
<div class="row"><span class="k">${esc(L.printedAt)}</span><span class="v">${esc(time)}</span></div>
</div>`,
    )
    .join('');

  return pageHtml({
    title: `${L.parcelLabel} ${input.batchCode}`,
    pageRule: THERMAL_100x150,
    extraCss: `body { font-size: 11px; }
.label { page-break-after: always; }
.label:last-child { page-break-after: auto; }
.lt { text-align: center; font-size: 14px; font-weight: 700; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
.row { display: flex; gap: 6px; padding: 3px 0; border-bottom: 1px dashed #999; }
.row .k { width: 62px; flex: none; color: #333; }
.row .v { flex: 1; }
.row .v.big { font-size: 16px; font-weight: 700; }
.row .v.mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
.row .v.addr { line-height: 1.5; }`,
    body: labels || `<div class="muted">${esc(L.parcelLabel)}：—</div>`,
  });
}