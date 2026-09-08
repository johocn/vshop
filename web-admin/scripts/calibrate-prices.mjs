// 存量价格校准脚本（修复「录入=净价」口径）
// 背景：历史数据经 web-admin 保存时，Vendure 把录入价当作含税价处理，净价被 ÷1.13
// （录入 200 → net=176.99 / withTax=200）。校准把净价修正回「录入价(=withTax)」：
//   updateProductVariants price 输入 = withTax × (1 + 税率/100)  →  net = withTax
// 修复后：关闭税率的渠道 C 端显示 net=录入价；开启税率的渠道显示 录入价×(1+税率)。
//
// 用法：
//   node scripts/calibrate-prices.mjs                # dry-run：全渠道报告，不写库
//   node scripts/calibrate-prices.mjs --channel t2   # dry-run：仅 t2 渠道
//   node scripts/calibrate-prices.mjs --set 58:20000 --channel t2 --apply
//        # 显式把 t2 渠道变体 58 的目标净价设为 20000 分(200元) 并写库
// 幂等：scripts/.price-calibration.json 记录已校准 variantId->校准后 net，二次运行自动跳过。
//
// 注意：历史数据无法从 (net, withTax) 静态区分「含税录入」与「净价录入」（数学等价），
// 自动模式只按「录入价=withTax」推定并 dry-run 报告；请按渠道人工确认后 --apply，
// 或用 --set 显式指定目标净价（如商品 60 用户录入 200 元 → --set 58:20000）。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '.price-calibration.json');

const API = process.env.ADMIN_API || 'https://e.joho.cn/admin-api';
const USER = process.env.ADMIN_USER || 'superadmin';
const PASS = process.env.ADMIN_PASS || 'z123123';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
// 安全阀：--apply 只写显式 --set 的变体；要连按「withTax 推定」的全量一起写，须再加 --all
const APPLY_ALL = args.includes('--all');

// 支持 --channel t2 / --channel=t2 与 --set 58:20000 / --set=58:20000 两种写法
function valueOf(flag) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1] && !args[i + 1].startsWith('--')) out.push(args[i + 1]);
    else if (args[i].startsWith(flag + '=')) out.push(args[i].split('=')[1]);
  }
  return out;
}
const channels = valueOf('--channel');
// 显式目标净价：--set <variantId>:<netCents>（可多个，跨渠道生效）
const sets = new Map(
  valueOf('--set')
    .map((s) => {
      const [vid, net] = s.split(':');
      return [String(vid).trim(), Number(net)];
    })
    .filter(([, n]) => Number.isFinite(n) && n > 0),
);

async function gql(q, vars = {}, headers = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

async function main() {
  // 登录
  const loginRes = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation { login(username:"${USER}", password:"${PASS}") { ... on CurrentUser { channels { code token } } } }`,
    }),
  });
  const login = await loginRes.json();
  const token = loginRes.headers.get('vendure-auth-token');
  const chans = login?.data?.login?.channels || [];
  if (!token) throw new Error('登录失败：' + JSON.stringify(login?.errors?.[0]?.message ?? '无 token'));

  // 税率
  const def = chans[0];
  const taxData = await gql(
    `query { taxRates { items { value enabled } } }`,
    {},
    { Authorization: `Bearer ${token}`, 'vendure-token': def.token },
  );
  const rate = (taxData?.taxRates?.items || []).find((r) => r.enabled)?.value ?? 0;
  const factor = 1 + rate / 100;
  console.log(`税率: ${rate}%  factor=${factor}  mode=${APPLY ? 'APPLY(写库)' : 'dry-run(仅报告)'}`);
  if (channels.length) console.log(`渠道过滤: ${channels.join(', ')}`);

  // state
  const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
  const stateDirty = { ...state };

  const PRODUCTS_Q = `query($take:Int,$skip:Int){ products(options:{take:$take,skip:$skip}){ totalItems items {
    id name
    variants { id sku price priceWithTax customFields { costPrice listPrice } }
  } } }`;

  let totalChanged = 0;
  let totalSkipped = 0;
  let totalWritten = 0;

  for (const ch of chans) {
    if (channels.length && !channels.includes(ch.code)) continue;
    const au = { Authorization: `Bearer ${token}`, 'vendure-token': ch.token };
    let skip = 0;
    const rows = [];
    for (;;) {
      const data = await gql(PRODUCTS_Q, { take: 100, skip }, au);
      const { items, totalItems } = data.products;
      for (const p of items) {
        for (const v of p.variants || []) {
          const net = v.price;
          const gross = v.priceWithTax;
          if (!net || !gross || net === gross) continue; // 无价/税率为0不动
          // 目标净价：--set 显式指定优先；否则按「录入价=withTax」推定（仅作建议）
          const targetNet = sets.has(String(v.id)) ? sets.get(String(v.id)) : gross;
          const newInput = Math.round(targetNet * factor);
          const wasCalibrated = state[v.id] === targetNet;
          rows.push({
            ch: ch.code,
            product: p.name,
            vid: v.id,
            sku: v.sku || '',
            net,
            gross,
            targetNet,
            newInput,
            cost: v.customFields?.costPrice ?? '-',
            list: v.customFields?.listPrice ?? '-',
            skip: wasCalibrated,
            explicit: sets.has(String(v.id)),
          });
        }
      }
      skip += items.length;
      if (skip >= totalItems) break;
    }

    for (const r of rows) {
      console.log(
        `[${r.ch}] ${r.product} | var=${r.vid} sku=${r.sku || '-'} | ` +
          `net=${r.net} withTax=${r.gross} → 目标 net=${r.targetNet} (写入price=${r.newInput})` +
          `${r.explicit ? ' [显式指定]' : ' [按withTax推定]'} | ` +
          `成本=${r.cost} 划线=${r.list}${r.skip ? ' [已校准跳过]' : ''}`,
      );
      if (r.skip) { totalSkipped++; continue; }
      const willWrite = APPLY && (r.explicit || APPLY_ALL);
      if (willWrite) {
        await gql(
          `mutation($input:[UpdateProductVariantInput!]!){ updateProductVariants(input:$input){ id } }`,
          { input: [{ id: r.vid, price: r.newInput }] },
          au,
        );
        stateDirty[r.vid] = r.targetNet;
        totalWritten++;
      }
      totalChanged++;
    }
  }

  if (APPLY && totalWritten) {
    writeFileSync(STATE_FILE, JSON.stringify(stateDirty, null, 2));
    console.log(`state 已写入 ${STATE_FILE}（记录 ${Object.keys(stateDirty).length} 个变体）`);
  }

  console.log(`\n统计: 报告 ${totalChanged} 个变体, 实际写库 ${totalWritten} 个, 幂等跳过 ${totalSkipped} 个`);
  console.log('提示: 历史数据无法区分含税/净价录入口径, dry-run 请按渠道人工确认后再 --apply;');
  console.log('      web-admin 保存产生的数据均为含税录入（net=录入/1.13）, 校准后 net=录入价。');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
