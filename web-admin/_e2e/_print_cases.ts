// 打印单据「合成 fixture」产出器（打印版式像素级一致性门禁用；规格 §7.5 / §10.5）
//
// 用法（cwd = web-admin）：
//   node _e2e/_print_cases.ts --manifest   → 四 case 的冻结数据清单（JSON，门禁据此取期望值 + 进指纹）
//   node _e2e/_print_cases.ts <case>       → 该 case 的完整 HTML（stdout）
//   case ∈ picking-a4 | shipping-a4 | parcel-thermal | batch-a4l
//
// 为什么不在 Python 门禁里拼 HTML：四个单据模板是 TS 纯函数（src/utils/print/templates/*.ts，
// 见偏差 26），在门禁里复刻一遍等于制造第二份真相。本文件只负责「喂冻结数据」，
// 渲染 / 截图 / 切片 / 比对全部交给 _verify_print_baseline.py。
//
// 冻结约定（改动即需重录基线，门禁会因指纹不符而 SKIP 并提示）：
//   打印时间固定 2026-09-25 10:00、批次号固定 PB20260925-001、仓库固定「固定样例仓」，
//   地址 / 电话 / 商品名全部为固定样例串（不含真实客户数据）。

import { renderBatchOverview } from '../src/utils/print/templates/batch-overview.ts';
import { renderParcelLabel } from '../src/utils/print/templates/parcel-label.ts';
import { renderPickingList } from '../src/utils/print/templates/picking-list.ts';
import { renderShippingNote } from '../src/utils/print/templates/shipping-note.ts';

const PRINT_AT = new Date('2026-09-25T10:00:00');
const BATCH_CODE = 'PB20260925-001';
const WAREHOUSE = '固定样例仓';

// ---------------- 拣货单 fixture：3 个库区（12/10/12 行）+ 1 个未归位组（6 行）= 40 行，强制跨页 ----------------
const ZONES = [
  { code: 'A', name: '常温存储区', rows: 12 },
  { code: 'B', name: '冷藏区', rows: 10 },
  { code: 'C', name: '冷冻区', rows: 12 },
];
const LOOSE_ROWS = 6;
const UNASSIGNED = '未归位';

function pickingRows() {
  const out = [];
  let seq = 0;
  for (const z of ZONES) {
    for (let i = 1; i <= z.rows; i++) {
      seq += 1;
      out.push({
        sku: 'FX-SKU-' + String(seq).padStart(4, '0'),
        name: '固定样例商品 ' + String(seq).padStart(4, '0'),
        qty: 1 + (seq % 5),
        orderCodes: ['SO-20260925-' + String(wise(seq)).padStart(3, '0')],
        binCode: z.code + '-' + String(1 + ((i - 1) % 4)).padStart(2, '0') + '-' + String(1 + ((i - 1) % 6)).padStart(2, '0'),
        zoneCode: z.code,
        zoneName: z.name,
        pathIndex: seq,
      });
    }
  }
  for (let i = 1; i <= LOOSE_ROWS; i++) {
    seq += 1;
    out.push({
      sku: 'FX-SKU-' + String(seq).padStart(4, '0'),
      name: '固定样例商品 ' + String(seq).padStart(4, '0'),
      qty: 1 + (seq % 5),
      orderCodes: ['SO-20260925-' + String(wise(seq)).padStart(3, '0')],
      binCode: null,
      zoneCode: null,
      zoneName: null,
      pathIndex: 9999,
    });
  }
  return out;
}

/** 订单号在 1..8 之间循环（固定映射，不随机） */
function wise(n) {
  return 1 + ((n - 1) % 8);
}

// ---------------- 发货单 / 包裹标签 fixture：3 单（地址含「小区」串，便于核对是否被截） ----------------
const NAMES = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十'];
const AREAS = [
  '浙江省杭州市西湖区文三路 1 号 阳光小区 1 幢 101 室',
  '浙江省杭州市拱墅区莫干山路 2 号 锦华苑 2 幢 202 室',
  '浙江省杭州市余杭区文一西路 3 号 云栖名筑 3 幢 303 室',
  '浙江省杭州市滨江区江南大道 4 号 星光国际 4 幢 404 室',
  '浙江省杭州市萧山区市心中路 5 号 金城花园 5 幢 505 室',
  '浙江省杭州市上城区解放路 6 号 湖滨公寓 6 幢 606 室',
];

function makeOrders(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      code: 'SO-20260925-' + String(i).padStart(3, '0'),
      customerName: NAMES[(i - 1) % NAMES.length],
      phoneNumber: '1380000' + String(1000 + i).slice(-4),
      address: AREAS[(i - 1) % AREAS.length],
      itemCount: 1 + (i % 7),
    });
  }
  return out;
}

const SMALL_ORDERS = makeOrders(3);
const BIG_ORDERS = makeOrders(40);

// ---------------- case → HTML ----------------
const BUILD: Record<string, () => string> = {
  'picking-a4': () =>
    renderPickingList({ batchCode: BATCH_CODE, warehouseName: WAREHOUSE, printedAt: PRINT_AT, binMode: 'bin', rows: pickingRows() }),
  'shipping-a4': () =>
    renderShippingNote({ batchCode: BATCH_CODE, warehouseName: WAREHOUSE, printedAt: PRINT_AT, orders: SMALL_ORDERS }),
  'parcel-thermal': () =>
    renderParcelLabel({ batchCode: BATCH_CODE, warehouseName: WAREHOUSE, printedAt: PRINT_AT, orders: SMALL_ORDERS }),
  'batch-a4l': () =>
    renderBatchOverview({ batchCode: BATCH_CODE, batchState: 'PENDING', warehouseName: WAREHOUSE, printedAt: PRINT_AT, orders: BIG_ORDERS }),
};

// ---------------- manifest（门禁的期望值来源；同一份冻结数据，不做二次推导） ----------------
function manifest() {
  const rows = pickingRows();
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const flagRows = rows.filter((r) => !r.zoneCode && !r.zoneName && !r.binCode).length;
  return {
    print_at: '2026-09-25 10:00',
    batch_code: BATCH_CODE,
    warehouse: WAREHOUSE,
    cases: {
      'picking-a4': {
        family: 'picking', page: 'A4_PORTRAIT', bin_mode: 'bin',
        rows: rows.length, groups: ZONES.length + 1, group_titles: ZONES.map((z) => z.code + ' · ' + z.name).concat([UNASSIGNED]),
        flag_rows: flagRows, cols: 8, total_qty: totalQty,
      },
      'shipping-a4': { family: 'shipping', page: 'A4_PORTRAIT', orders: SMALL_ORDERS.length },
      'parcel-thermal': { family: 'parcel', page: 'THERMAL_100x150', orders: SMALL_ORDERS.length },
      'batch-a4l': {
        family: 'batch', page: 'A4_LANDSCAPE', orders: BIG_ORDERS.length, cols: 6,
        total_items: BIG_ORDERS.reduce((s, o) => s + o.itemCount, 0),
      },
    },
  };
}

const arg = process.argv[2] || '';
if (arg === '--manifest') {
  console.log(JSON.stringify(manifest(), null, 2));
} else if (BUILD[arg]) {
  process.stdout.write(BUILD[arg]());
} else {
  console.error('usage: node _e2e/_print_cases.ts {--manifest|<case>}；case=' + Object.keys(BUILD).join('|'));
  process.exit(2);
}