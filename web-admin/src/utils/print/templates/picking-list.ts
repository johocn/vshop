// 拣货单模板（规格 §13.6 / §13.9）：纯函数，入参已组装好的数据，返回完整 HTML 字符串
import { A4_PORTRAIT } from '../print.css.ts';
import { esc, fill, fmtTime, pageHtml, withLabels, type PrintLabels } from '../doc-common.ts';

export interface PickingListRow {
  sku: string;
  name: string;
  qty: number;
  orderCodes: string[];
  binCode: string | null;
  zoneCode: string | null;
  zoneName: string | null;
  pathIndex: number;
}

export interface PickingListInput {
  batchCode: string;
  warehouseName: string;
  printedAt: Date;
  /** 库位模式：off 不渲染库位列与分组；zone 只渲染库区；bin 渲染完整库位 */
  binMode: 'off' | 'zone' | 'bin';
  rows: PickingListRow[];
  labels?: Partial<PrintLabels>;
}

interface Group {
  key: string;
  title: string;
  rows: PickingListRow[];
}

export function renderPickingList(input: PickingListInput): string {
  const L = withLabels(input.labels);
  const showZone = input.binMode !== 'off';
  const showBin = input.binMode === 'bin';
  const rows = input.rows; // 后端已按 pathIndex 升序排好，前端不再重排

  function head(): string {
    return `<thead><tr>
<th style="width:28px">${esc(L.seq)}</th>
<th style="width:110px">${esc(L.sku)}</th>
<th>${esc(L.product)}</th>
<th style="width:48px">${esc(L.qty)}</th>
${showZone ? `<th style="width:90px">${esc(L.zone)}</th>` : ''}
${showBin ? `<th style="width:80px">${esc(L.bin)}</th>` : ''}
${showZone ? `<th style="width:120px">${esc(L.note)}</th>` : ''}
<th style="width:130px">${esc(L.orderCodes)}</th>
</tr></thead>`;
  }

  function row(r: PickingListRow, idx: number): string {
    const loose = !r.zoneCode && !r.zoneName && !r.binCode;
    return `<tr${loose && showZone ? ' class="flag"' : ''}>
<td>${idx}</td>
<td>${esc(r.sku)}</td>
<td>${esc(r.name)}</td>
<td>${r.qty}</td>
${showZone ? `<td>${esc(r.zoneName || r.zoneCode || '—')}</td>` : ''}
${showBin ? `<td>${esc(r.binCode || '—')}</td>` : ''}
${showZone ? `<td>${loose ? esc(L.needBind) : ''}</td>` : ''}
<td>${esc((r.orderCodes ?? []).join(','))}</td>
</tr>`;
  }

  /** 无库位绑定的行单独成组并置底（pathIndex 已是 9999，这里再兜一层顺序保护） */
  function buildGroups(): Group[] {
    if (!showZone) return [{ key: 'all', title: '', rows }];
    const out: Group[] = [];
    const byZone = new Map<string, Group>();
    const loose: PickingListRow[] = [];
    for (const r of rows) {
      if (!r.zoneCode && !r.zoneName && !r.binCode) {
        loose.push(r);
        continue;
      }
      const key = r.zoneCode || r.zoneName || '__unknown__';
      let g = byZone.get(key);
      if (!g) {
        const title = [r.zoneCode, r.zoneName].filter(Boolean).join(' · ') || key;
        g = { key, title, rows: [] };
        byZone.set(key, g);
        out.push(g);
      }
      g.rows.push(r);
    }
    if (loose.length) out.push({ key: '__none__', title: L.unassigned, rows: loose });
    return out;
  }

  let seq = 0;
  const body = buildGroups()
    .map((g) => {
      const trs = g.rows.map((r) => row(r, ++seq)).join('');
      const grpTitle = g.title ? `<div class="grp">${esc(g.title)}</div>` : '';
      return `${grpTitle}<table>${head()}<tbody>${trs}</tbody></table>`;
    })
    .join('');

  const totalQty = rows.reduce((s, r) => s + (r.qty || 0), 0);
  const head1 = `<h1>${esc(L.pickingList)}</h1>
<div class="meta">${esc(L.batchCode)}：${esc(input.batchCode)} ｜ ${esc(L.warehouse)}：${esc(input.warehouseName)}<br/>${esc(L.printedAt)}：${esc(fmtTime(input.printedAt))}</div>`;

  return pageHtml({
    title: `${L.pickingList} ${input.batchCode}`,
    pageRule: A4_PORTRAIT,
    body: `${head1}${body}<div class="foot">${esc(fill(L.totalRows, { n: rows.length }))} ｜ ${esc(fill(L.totalQty, { q: totalQty }))}</div>`,
  });
}