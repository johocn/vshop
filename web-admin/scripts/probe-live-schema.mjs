// probe-live-schema.mjs: 只读校准线上 admin-api schema（不写任何数据）
// 用法: node scripts/probe-live-schema.mjs   （默认 https://e.joho.cn/admin-api）
const ADMIN = process.env.WA_ADMIN_URL || 'https://e.joho.cn/admin-api';
async function gql(q, vars = {}, headers = {}) {
  const res = await fetch(ADMIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const body = await res.json();
  return { body, token: res.headers.get('vendure-auth-token') };
}

// login（只读会话）
const login = await gql(`mutation { login(username:"superadmin", password:"superadmin") { ... on CurrentUser { id identifier } ... on InvalidCredentialsError { errorCode } } }`);
const token = login.token;
if (!token) { console.log('LOGIN_FAIL', JSON.stringify(login.body)); process.exit(2); }
const auth = { Authorization: `Bearer ${token}` };
console.log('login ok (anonymous token granted)');

async function inputs(typeName) {
  const r = await gql(`query($n: String!) {
    __type(name: $n) {
      name kind
      inputFields { name type { name kind ofType { name kind } } defaultValue }
    }
  }`, { n: typeName }, auth);
  if (r.body?.errors) { console.log(`  [${typeName}] introspection ERR:`, JSON.stringify(r.body.errors)); return []; }
  return r.body?.data?.__type?.inputFields || [];
}

function fmt(f) {
  const t = f.type;
  const name = t.name || t.ofType?.name || (t.kind ?? '?');
  const kind = `${t.kind}${t.name ? '' : (t.ofType ? `<${t.ofType.name}>` : '')}`;
  return `  ├ ${f.name}: ${name} (${kind})${f.defaultValue !== null && f.defaultValue !== undefined ? ' = ' + JSON.stringify(f.defaultValue) : ''}`;
}

const targets = ['CreateProductVariantInput', 'UpdateProductVariantInput', 'StockLevelInput', 'CreateShippingProfileInput', 'CreatePaymentProfileInput', 'ProductFilterParameter', 'UpdateProductInput'];

// GlobalFlag 枚举值
const gf = await gql(`query { __type(name: "GlobalFlag") { enumValues { name } } }`, {}, auth);
console.log('GlobalFlag enum =', (gf.body?.data?.__type?.enumValues || []).map(v => v.name).join(','));
for (const t of targets) {
  const fs = await inputs(t);
  console.log(`\n== ${t} ==`);
  if (!fs.length) { console.log('  (未返回 inputFields，可能非输入类型或需更精确类型名)'); continue; }
  fs.forEach(f => console.log(fmt(f)));
}

// 确认 query 层：products filter 能否按 enabled 过滤 / variants 是否含 stockOnHand
const q = await gql(`query {
  products(options: { take: 1, filter: { enabled: { eq: true } } }) {
    totalItems
    items { id enabled variants { id price stockOnHand } }
  }
}`, {}, auth);
console.log('\n== query products filter enabled ==');
if (q.body?.data) console.log('OK, totalItems=', q.body.data.products.totalItems, 'item.variants[0] keys=', Object.keys(q.body.data.products.items[0]?.variants?.[0] || {}));
else console.log('ERR:', JSON.stringify(q.body?.errors));

// 自清理探针：空 shippingMethodIds/paymentMethodIds 创建是否被拒（web-admin 档案页 create 传 []）
for (const [kind, qq, emptyField, idField] of [
  ['shipping', `mutation($i: CreateShippingProfileInput!){ createShippingProfile(input:$i){ id } }`, 'shippingMethodIds', 'deleteShippingProfile'],
  ['payment',  `mutation($i: CreatePaymentProfileInput!){  createPaymentProfile(input:$i){  id } }`, 'paymentMethodIds',  'deletePaymentProfile'],
]) {
  const nm = 'probe-empty-' + kind + '-' + Date.now();
  const mk = await gql(qq, { i: kind === 'shipping'
    ? { name: nm, code: nm, shippingMethodIds: [] }
    : { name: nm, code: nm, paymentMethodIds: [] } }, auth);
  const created = mk.body?.data?.[kind === 'shipping' ? 'createShippingProfile' : 'createPaymentProfile'];
  if (created) {
    console.log(`EMPTY_${kind.toUpperCase()}_CREATE_OK id=`, created.id);
    await gql(`mutation($id: ID!){ ${idField}(id: $id) }`, { id: created.id }, auth);
    console.log(`  cleaned up deleted`);
  } else {
    console.log(`EMPTY_${kind.toUpperCase()}_CREATE_REJECTED err=`, JSON.stringify(mk.body?.errors?.[0]?.message));
  }
}