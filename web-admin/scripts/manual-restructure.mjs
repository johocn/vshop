// 手册重构：op 重编号 op-1..30（spec §3.2）、op-13/14/15 → cx-1..3、mp 一字不动、
// 新增 op-27/28/29/30 骨架章节、BOOKS 注册 cx。
// 用法：node scripts/manual-restructure.mjs（cwd = web-admin/）
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/static/manual/index.html';
const src = readFileSync(FILE, 'utf8');
const lines = src.split('\n');

// 目标顺序（spec §3.2，权威）：title → { id, book }；未列出的旧章节视为不存在
const RENUMBER = [
  ['这是一本什么手册', 'op-1', 'op'],
  ['认识多租户商城', 'op-2', 'op'],
  ['开通并绑定你的店铺', 'op-3', 'op'],
  ['登录管理后台', 'op-4', 'op'],
  ['店铺装修与主题', 'op-5', 'op'],
  ['商品管理', 'op-6', 'op'],
  ['价格与库存', 'op-7', 'op'],
  ['商品价格 · 库存 · 图片（含税率开关）', 'op-8', 'op'],
  ['订单与售后', 'op-9', 'op'],
  ['常见问题（FAQ）· 运营', 'op-10', 'op'],
  ['到店自提核销与收款', 'op-11', 'op'],
  ['收款台账（核销人即收款人）', 'op-12', 'op'],
  ['商户订单可见性（本店商品单）', 'op-13', 'op'],
  ['优惠券（多租户发行与使用）', 'op-14', 'op'],
  ['商品专属优惠券（绑定商品 + 凭码兑换）', 'op-15', 'op'], // 物理前移，与 op-14 相邻
  ['成员密码管理与角色授权', 'op-16', 'op'],
  ['房型模板库与酒店版式', 'op-17', 'op'],
  ['四流对账：批次 / 差异 / 重跑闭环', 'op-18', 'op'],
  ['详情页库存展示（虚拟库存 + 附近库存）', 'op-19', 'op'],
  ['微信分享兜底：标题 / 描述 / 主图', 'op-20', 'op'],
  ['首页「城市 · 配送」过滤与风格配置', 'op-21', 'op'],
  ['详情页配送口径切换 + 租户网点管理', 'op-22', 'op'],
  ['库存单据操作手册（库存管理方式 / 采购 / 移库 / 盘库 / 出库 / 流水）', 'op-23', 'op'],
  ['多仓拆分发货（预留单）', 'op-24', 'op'],
  ['订单列表多版式', 'op-25', 'op'],
  ['风格模板库管理', 'op-26', 'op'],
  ['nshop 结账页中国本地化（cn 版式）', 'cx-1', 'cx'],
  ['结算页逐箱结算：商户分账与地址字段', 'cx-2', 'cx'],
  ['订单确认页与售后：游客查询与联系客服增强', 'cx-3', 'cx'],
];

// 解析章节块：起点行匹配 startRe，终点 = 其后首个以 `}` 或 `},` 结尾的行
const startRe = /^\{book:'[^']+', id:'[^']+', title:'.*?', html:`$/;
const endRe = /`\},?\s*$/;
const blocks = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\{book:'([^']+)', id:'([^']+)', title:'(.*?)', html:`$/);
  if (!m) continue;
  let j = i + 1;
  while (j < lines.length && !endRe.test(lines[j])) j++;
  blocks.push({ start: i, end: j, book: m[1], oldId: m[2], title: m[3] });
  i = j;
}
console.log(`解析到 ${blocks.length} 个章节块（op/mp/cx 混排）`);

const byTitle = new Set(RENUMBER.map(([t]) => t));
const meta = new Map(RENUMBER.map(([t, id, book]) => [t, { id, book }]));
const opBlocks = [], mpBlocks = [], cxBlocks = [];
for (const b of blocks) {
  if (byTitle.has(b.title)) {
    const { id, book } = meta.get(b.title);
    if (book === 'cx') cxBlocks.push({ ...b, id });
    else opBlocks.push({ ...b, id }); // 保持 RENUMBER 数组序
  } else {
    mpBlocks.push(b); // mp 章节原样（含相对顺序）
  }
}
if (opBlocks.length !== 26) throw new Error(`op 章节数异常: ${opBlocks.length}（期望 26）`);
if (mpBlocks.length !== 10) throw new Error(`mp 章节数异常: ${mpBlocks.length}（期望 10）`);
if (cxBlocks.length !== 3) throw new Error(`cx 章节数异常: ${cxBlocks.length}（期望 3）`);

// 4 个新骨架章节（追加到 op 组末尾）
const NEW_OP = [
`{book:'op', id:'op-27', title:'分销：关系与结算', html:\`
<p class="lead">分销功能把买家变成推广员：买家通过邀请码推广成交后，按关系链累计收益并可提现。你可以在「分销」菜单查看关系与佣金结算。</p>
<h3>1. 分销关系</h3>
<p>在「分销 → 分销关系」页签查看推广员列表：等级、上级、邀请码、累计收益 / 可提现 / 冻结金额，数据按当前租户隔离。</p>
<div class="note"><b>口径：</b>「可提现」为已结算可提余额，「冻结」为在途 / 未结算金额。</div>
<h3>2. 佣金结算</h3>
<p>在「分销 → 佣金结算」页签按周期查看佣金明细与结算状态，确认后发起提现 / 打款。</p>
<div class="shot-box"><img class="img" src="shots/op27_distribution.png" alt="分销-关系与结算"><div class="imgcap">图 D1 · 分销关系与结算</div></div>\`}`,
`{book:'op', id:'op-28', title:'图片库（媒体资源）', html:\`
<p class="lead">图片库是店铺的媒体资源中心：集中上传、管理与复用店铺图片，一次上传多处引用（Logo、分享图、自提点照片、商品图等）。</p>
<h3>1. 上传与管理</h3>
<p>打开「图片库」，点击上传选择本地图片；列表中可预览与删除，资源按当前租户隔离。</p>
<h3>2. 随处引用</h3>
<p>在店铺信息（Logo / 分享图）、自提点照片、商品图片等配置处，「从图片库选择」即可复用，无需重复上传。</p>
<div class="shot-box"><img class="img" src="shots/op28_media.png" alt="图片库-媒体资源"><div class="imgcap">图 M1 · 图片库</div></div>\`}`,
`{book:'op', id:'op-29', title:'数据看板（今日概览 / 7 日趋势 / 销量榜）', html:\`
<p class="lead">数据看板汇总店铺经营数据：今日订单 / 销售额（已支付口径）与库存预警，并提供近 7 日销售趋势与品类销量排行。</p>
<h3>1. 今日概览</h3>
<p>顶部三张卡片：今日订单数、今日销售额（gmv，已支付口径，不含未完成 / 取消单）、库存预警数（库存 ≤ 5）。</p>
<h3>2. 近 7 日趋势</h3>
<p>双线折线图展示近 7 日销售额（元，左轴）与订单数（单，右轴）。</p>
<h3>3. 销量 Top 榜</h3>
<p>近 7 日品类销量排行（GMV + 单数），辅助选品与备货。</p>
<div class="note"><b>权限：</b>数据看板需要 ViewDashboard 权限；若提示权限不足，请在「成员管理 → 角色」为当前角色勾选该权限。</div>
<div class="shot-box"><img class="img" src="shots/op29_dashboard.png" alt="数据看板-完整版"><div class="imgcap">图 K1 · 数据看板（批2 填充）</div></div>\`}`,
`{book:'op', id:'op-30', title:'POS 门店收银', html:\`
<p class="lead">门店收银面向线下当面收款场景：店员输入核销码 / 订单号查询订单，确认金额后选择收款方式完成收款，收款记录自动进入台账。</p>
<h3>1. 查询订单</h3>
<p>在「门店收银」输入核销码或订单号查询，展示订单号、顾客、应付金额与待交付商品。</p>
<h3>2. 确认收款</h3>
<p>选择收款方式（固定聚合码收款等）并确认收款；收款后订单状态与台账同步更新。</p>
<div class="note"><b>收款即台账：</b>POS 确认收款后，「收款台账」中出现对应记录，核销人即收款人，可直接导出对账。</div>
<div class="shot-box"><img class="img" src="shots/op30_pos.png" alt="POS-门店收银"><div class="imgcap">图 P1 · 门店收银</div></div>\`}`,
];

// 重建 CHAPTERS 数组：op → mp → cx（册内保持目标顺序）
const newBlocks = [
  ...opBlocks,
  ...NEW_OP.map((s) => ({ text: s, start: -1, end: -1 })),
  ...mpBlocks,
  ...cxBlocks,
];
// 把原块行替换为带新 id/book 的起止行；新块原样插入
function renderBlock(b) {
  if (b.text) return b.text;
  const raw = lines.slice(b.start, b.end + 1).join('\n');
  const m = meta.get(b.title);
  if (!m) return raw; // mp 章节原样
  // 只改起点行的 book 与 id（title 不变）
  return raw.replace(/^\{book:'[^']+', id:'[^']+', /, `{book:'${m.book}', id:'${b.id}', `);
}

const startIdx = lines.findIndex((l) => l.includes('var CHAPTERS = ['));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === '];');
if (startIdx < 0 || endIdx < 0) throw new Error('未找到 CHAPTERS 数组边界');

// 数组项间需逗号分隔：除最后一项外，若结尾行无逗号则补（原末项/新骨架均无逗号）
function ensureComma(t) {
  const last = t.split('\n').pop();
  if (/,;?\s*$/.test(last)) return t;
  return t + ',';
}
const rendered = newBlocks.map(renderBlock);
const joined = rendered.map((t, i) => (i < rendered.length - 1 ? ensureComma(t) : t));
const rebuilt = [
  ...lines.slice(0, startIdx + 1),
  ...joined,
  ...lines.slice(endIdx),
];

// BOOKS 增加 cx 分册（mp 条目后插入）
const booksIdx = rebuilt.findIndex((l) => l.includes("id:'mp'"));
const bookLines = rebuilt.slice(0, booksIdx + 2);
const restLines = rebuilt.slice(booksIdx + 2);
if (!bookLines.some((l) => l.includes("'cx'"))) {
  const cxEntry = `  cx: { id:'cx', title:'nshop 商城 C 端手册', short:'C端手册', icon:'📱',\n        desc:'nshop 商城买家视角：结账本地化、逐箱结算、订单确认与售后。' }`;
  // mp 条目以 `}` 结尾（无逗号），补逗号后插入 cx
  const last = bookLines.length - 1;
  if (/}\s*$/.test(bookLines[last]) && !/,/.test(bookLines[last])) bookLines[last] = bookLines[last].replace(/}\s*$/, '},');
  bookLines.push(cxEntry);
}
const out = [...bookLines, ...restLines].join('\n');

// 修正正文交叉引用：网点管理 旧 op-23 → 新 op-22
const fixed = out.replace('「网点管理」（op-23）', '「网点管理」（op-22）');

writeFileSync(FILE, fixed, 'utf8');
console.log('完成。校验：');
console.log('  op 章节 =', opBlocks.length + NEW_OP.length, '（26 + 4 新）');
console.log('  mp 章节 =', mpBlocks.length, '（不动）');
console.log('  cx 章节 =', cxBlocks.length);
