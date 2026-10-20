// C-Lodop 商家小票打印（58mm 热敏）：
// C-Lodop 服务跑在商家电脑（http://localhost:8000 / 备用 18000），前端加载其 JS 后静默打印。
// 约束：商家电脑须安装并启动 C-Lodop 服务，且保持工作台页面开启；建议 Chrome/Edge（HTTPS 页面
// 加载 http://localhost 属浏览器豁免的混合内容，Safari 等可能拦截）。
// 本文件不含用户文案，打印小票上的文字全部由调用方传入 labels（i18n 在页面层）。

let loadPromise: Promise<any> | null = null;

/** 懒加载 C-Lodop：优先 8000，失败备用 18000；结果缓存，失败后置空允许下次重试（商家可能刚装好服务） */
export function loadLodop(): Promise<any> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const w = window as any;
    if (typeof w.getCLodop === 'function') {
      const existing = w.getCLodop();
      if (existing) {
        resolve(existing);
        return;
      }
    }
    const urls = [
      'http://localhost:8000/CLodopfuncs.js?priority=1',
      'http://localhost:18000/CLodopfuncs.js?priority=0',
    ];
    const tryNext = (queue: string[]) => {
      const url = queue[0];
      if (!url) {
        reject(new Error('CLODOP_NOT_FOUND'));
        return;
      }
      let settled = false;
      const script = document.createElement('script');
      script.src = url;
      const cleanup = () => {
        script.remove();
        clearTimeout(timer);
      };
      const advance = () => {
        if (settled) return;
        settled = true;
        cleanup();
        const lodop = typeof w.getCLodop === 'function' ? w.getCLodop() : null;
        if (lodop) resolve(lodop);
        else tryNext(queue.slice(1));
      };
      const timer = setTimeout(advance, 4000); // 端口在但响应慢/被防火墙吞 → 超时切下一个
      script.onload = advance;
      script.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        tryNext(queue.slice(1));
      };
      document.head.appendChild(script);
    };
    tryNext(urls);
  });
  loadPromise.catch(() => {
    loadPromise = null; // 失败不缓存，下次调用重试
  });
  return loadPromise;
}

export interface ReceiptLine {
  name: string;
  quantity: number;
  price: number; // 分（单价）
}

export interface ReceiptData {
  storeName: string;
  storePhone?: string | null;
  code: string;
  createdAt: string; // ISO；显示层 HH:mm 由调用方格式化传入 createdAtText
  createdAtText: string;
  zone: string;
  building: string;
  slotText?: string;
  route?: string;
  lines: ReceiptLine[];
  shipping: number; // 分
  total: number; // 分（含配送费，已扣优惠）
}

/** 小票文案（页面层按当前语言组装） */
export interface ReceiptLabels {
  orderNo: string;
  time: string;
  route: string;
  slot: string;
  deliveryFee: string;
  total: string;
  subtotal: string;
  thanks: string;
}

const money = (fen: number): string => (fen / 100).toFixed(2);

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 58mm 版式：窄幅单列、table 布局（C-Lodop 底层渲染引擎对 flex 支持不稳，避免使用） */
export function buildReceiptHtml(d: ReceiptData, labels: ReceiptLabels): string {
  const rows = d.lines
    .map(
      l => `<tr>
        <td class="name">${esc(l.name)}<span class="qty">×${l.quantity}</span></td>
        <td class="amt">${money(l.price * l.quantity)}</td>
      </tr>`,
    )
    .join('');
  const goods = d.lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const meta: string[] = [];
  if (d.route) meta.push(`<div>${esc(labels.route)}：${esc(d.route)}</div>`);
  if (d.zone || d.building) meta.push(`<div>${esc(d.zone)} ${esc(d.building)}</div>`);
  if (d.slotText) meta.push(`<div>${esc(labels.slot)}：${esc(d.slotText)}</div>`);
  return `<html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 200px; font: 12px/1.5 'Courier New', 'Microsoft YaHei', monospace; color: #000; }
    .store { font-size: 15px; font-weight: 700; text-align: center; padding: 4px 0; }
    .phone { text-align: center; font-size: 11px; padding-bottom: 6px; }
    .dash { border-top: 1px dashed #000; margin: 4px 0; }
    .meta { font-size: 12px; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 2px 0; }
    td.name { font-size: 12px; }
    td.name .qty { color: #000; margin-left: 6px; }
    td.amt { text-align: right; white-space: nowrap; width: 62px; }
    .sumrow { display: table; width: 100%; font-size: 12px; }
    .sumrow .k { display: table-cell; }
    .sumrow .v { display: table-cell; text-align: right; white-space: nowrap; }
    .total { font-size: 15px; font-weight: 700; }
    .thanks { text-align: center; padding-top: 6px; font-size: 11px; }
  </style></head><body>
    <div class="store">${esc(d.storeName)}</div>
    ${d.storePhone ? `<div class="phone">${esc(d.storePhone)}</div>` : ''}
    <div class="dash"></div>
    <div class="meta">
      <div>${esc(labels.orderNo)}：${esc(d.code)}</div>
      <div>${esc(labels.time)}：${esc(d.createdAtText)}</div>
      ${meta.join('')}
    </div>
    <div class="dash"></div>
    <table>${rows}</table>
    <div class="dash"></div>
    <div class="sumrow"><span class="k">${esc(labels.subtotal)}</span><span class="v">¥${money(goods)}</span></div>
    <div class="sumrow"><span class="k">${esc(labels.deliveryFee)}</span><span class="v">¥${money(d.shipping)}</span></div>
    <div class="sumrow total"><span class="k">${esc(labels.total)}</span><span class="v">¥${money(d.total)}</span></div>
    <div class="dash"></div>
    <div class="thanks">${esc(labels.thanks)}</div>
  </body></html>`;
}

/** 静默打印 58mm 小票（纸张宽度 580=58mm，orient=3 高度自适应；任务名=订单号便于水单去重） */
export async function printReceipt58(d: ReceiptData, labels: ReceiptLabels): Promise<void> {
  const LODOP = await loadLodop();
  LODOP.PRINT_INIT(`waimai-${d.code}`);
  LODOP.SET_PRINT_PAGESIZE(3, 580, 45, '');
  LODOP.ADD_PRINT_HTM('1mm', '1mm', '56mm', '100%', buildReceiptHtml(d, labels));
  LODOP.PRINT();
  LODOP.CLOSEPRINT?.();
}
