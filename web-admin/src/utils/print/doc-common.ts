// 打印单据共用渲染工具（计划外新增的共享模块，见偏差 26）
// 目的：四个模板（拣货单/发货单/包裹标签/批次总览）共用的转义、时间格式化、文档外壳与文案默认值集中一处，
// 全部为**纯函数**（不依赖 DOM / uni / 网络），可在 Node 下直接单测。

/** HTML 转义：所有动态文本（商品名、地址、客户名）都必须过这里，避免 < > 破坏单据结构 */
export function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ESC_MAP[c] ?? c);
}
const ESC_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** 本地时间（单据上的打印时间用本地时区，不用 UTC），格式 YYYY-MM-DD HH:mm */
export function fmtTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 单据文案默认值（中文）。调用方可传入本地化 labels 覆盖，模板内不读 i18n（保持纯函数） */
export interface PrintLabels {
  pickingList: string;
  shippingNote: string;
  parcelLabel: string;
  batchOverview: string;
  batchCode: string;
  warehouse: string;
  printedAt: string;
  seq: string;
  sku: string;
  product: string;
  qty: string;
  zone: string;
  bin: string;
  note: string;
  orderCodes: string;
  unassigned: string;
  needBind: string;
  totalRows: string;
  totalQty: string;
  recipient: string;
  phone: string;
  address: string;
  orderCode: string;
  itemCount: string;
  itemUnit: string;
  signName: string;
  signDate: string;
}

export const DEFAULT_LABELS: PrintLabels = {
  pickingList: '拣货单',
  shippingNote: '发货单',
  parcelLabel: '包裹标签',
  batchOverview: '批次总览',
  batchCode: '批次号',
  warehouse: '仓库',
  printedAt: '打印时间',
  seq: '#',
  sku: 'SKU',
  product: '商品',
  qty: '数量',
  zone: '库区',
  bin: '库位',
  note: '备注',
  orderCodes: '订单号',
  unassigned: '未归位',
  needBind: '需先入库归位再拣',
  totalRows: '共 {n} 行',
  totalQty: '合计 {q} 件',
  recipient: '收件人',
  phone: '电话',
  address: '收货地址',
  orderCode: '订单号',
  itemCount: '件数',
  itemUnit: '件',
  signName: '签收人签字',
  signDate: '签收日期',
};

/** 用调用方传入的 labels 覆盖默认值（缺字段逐项回退默认，不出现 undefined 文案） */
export function withLabels(override?: Partial<PrintLabels> | null): PrintLabels {
  return { ...DEFAULT_LABELS, ...(override ?? {}) };
}

/** 占位符替换（`{n}` 这类）；缺值替换为空串而不是留下花括号 */
export function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] === undefined ? '' : String(vars[k])));
}

/**
 * 包一层完整 HTML 文档：`@page` 规则 + 通用打印样式。
 * 样式取向：黑白友好（灰度底 + 实线边框）、`thead` 跨页重复、行不被分页切断。
 */
export function pageHtml(opts: {
  title: string;
  pageRule: string;
  body: string;
  extraCss?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${esc(opts.title)}</title>
<style>
${opts.pageRule}
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #000; font-size: 12px; }
h1 { font-size: 18px; margin: 0 0 6px; }
h2 { font-size: 14px; margin: 0 0 6px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; vertical-align: top; word-break: break-all; }
th { background: #e8e8e8; font-weight: 600; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
.meta { margin: 0 0 8px; line-height: 1.7; }
.grp { margin: 10px 0 3px; font-size: 13px; font-weight: 700; background: #ddd; padding: 3px 6px; }
.flag { background: #ffe9a8; font-weight: 700; }
.muted { color: #444; }
.foot { margin-top: 12px; font-size: 11px; color: #333; }
${opts.extraCss ?? ''}
</style>
</head>
<body>
${opts.body}
</body>
</html>`;
}