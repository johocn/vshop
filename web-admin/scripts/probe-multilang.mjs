// probe-multilang.mjs：多语言写链路线上探针
// 默认对线上 admin-api / shop-api 执行；登录后定位 code==='t1' 的租户渠道。
//
// 用法（默认线上，ADD-de 模式）：
//   node scripts/probe-multilang.mjs
// 只读（记录原始状态，不写）：
//   READ_ONLY=1 node scripts/probe-multilang.mjs
// 指定写入的语言集合（用于还原）：
//   SET_CODES="zh_Hans,en" SET_DEFAULT=zh_Hans node scripts/probe-multilang.mjs
//
// 环境变量：
//   WA_ADMIN_URL (默认 https://e.joho.cn/admin-api)
//   WA_SHOP_URL  (默认 https://www.youshop.cn/shop-api)
//   ADMIN_USER / ADMIN_PASS (默认 superadmin / z123123)
//   SET_CODES / SET_DEFAULT：存在则按给定集合写入；否则在原始集合上追加 de
//   READ_ONLY=1：只读，不写
const ADMIN = process.env.WA_ADMIN_URL || 'https://e.joho.cn/admin-api';
const SHOP = process.env.WA_SHOP_URL || 'https://www.youshop.cn/shop-api';
const ADMIN_USER = process.env.ADMIN_USER || 'superadmin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'z123123';
const SET_CODES = process.env.SET_CODES;
const SET_DEFAULT = process.env.SET_DEFAULT;
const READ_ONLY = process.env.READ_ONLY === '1';
const RESTORE = process.env.RESTORE === '1';

function fail(msg) { console.error('PROBE_FAIL:', msg); process.exitCode = 1; }

async function gql(url, q, vars = {}, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const body = await res.json();
  const token = res.headers.get('vendure-auth-token');
  const cookie = res.headers.get('set-cookie');
  return { body, token, cookie };
}

// 1. 登录
const login = await gql(ADMIN, `mutation Login($u: String!, $p: String!) {
  login(username: $u, password: $p) {
    ... on CurrentUser { id identifier }
    ... on InvalidCredentialsError { errorCode message }
  }
}`, { u: ADMIN_USER, p: ADMIN_PASS });
const bearer = login.token || '';
if (!bearer) { fail('登录未取得 vendure-auth-token: ' + JSON.stringify(login.body)); process.exit(1); }
const auth = { Authorization: `Bearer ${bearer}` };
console.log('LOGIN ok identifier=', login.body?.data?.login?.identifier, 'tokenLen=', bearer.length);

// 2. 定位 t1 渠道
const access = await gql(ADMIN, `query MyTenantAccess($channelId: ID) {
  myTenantAccess(channelId: $channelId) {
    isSuperAdmin
    channels { id code token name tenantNo enabled }
  }
}`, { channelId: null }, auth);
let channels = access.body?.data?.myTenantAccess?.channels || [];
if (!channels.length) {
  // 兜底：me.channels
  const me = await gql(ADMIN, `query { me { channels { id code token } } }`, {}, auth);
  channels = me.body?.data?.me?.channels || [];
}
console.log('CHANNELS =', channels.map((c) => `${c.code}#${c.id}`).join(', '));
const t1 = channels.find((c) => c.code === 't1');
if (!t1) { fail('未找到 code===t1 渠道；channels=' + channels.map((c) => c.code).join(',')); process.exit(1); }
console.log('TENANT t1 id=', t1.id, 'token=', t1.token);

const readMulti = async (label) => {
  const r = await gql(ADMIN, `query TenantMultiLanguage($channelId: ID!) {
    tenantSettings(channelId: $channelId) { multiLanguage }
  }`, { channelId: t1.id }, auth);
  const ml = r.body?.data?.tenantSettings?.multiLanguage ?? null;
  console.log(`[${label}] multiLanguage =`, JSON.stringify(ml));
  if (r.body?.errors) console.log(`[${label}] errors =`, JSON.stringify(r.body.errors));
  return ml;
};

const readShop = async () => {
  const r = await gql(SHOP, `query { activeChannel { availableLanguageCodes defaultLanguageCode } }`,
    {}, { 'vendure-token': t1.token });
  const ch = r.body?.data?.activeChannel ?? null;
  console.log('[SHOP_CHANNEL] activeChannel =', JSON.stringify(ch));
  if (r.body?.errors) console.log('[SHOP_CHANNEL] errors =', JSON.stringify(r.body.errors));
  return ch;
};

// 3. BEFORE
const before = await readMulti('BEFORE');
const beforeCodes = before?.availableLanguageCodes || [];
const beforeDefault = before?.defaultLanguageCode || 'zh_Hans';

if (READ_ONLY) {
  console.log('READ_ONLY 模式：不写入。');
  await readShop();
  console.log('PROBE_READ_ONLY_OK');
  process.exit(0);
}

// 还原模式：把 t1 精确还原为原始状态。
//   ① updateTenantMultiLanguage 写回原生语言（availableLanguageCodes=['zh_Hans']）
//   ② 以 t1 token 调 myUpdateChannelCustomFields 把 multiLanguageConfig 置 null（清自定义字段）
//   ③ 回读 tenantSettings.multiLanguage（期望 null）与 shop-api activeChannel（期望 ['zh_Hans']）
if (RESTORE) {
  const r1 = await gql(ADMIN, `mutation UpdateTenantMultiLanguage($input: TenantSectionPatchInput!) {
    updateTenantMultiLanguage(input: $input) { multiLanguage }
  }`, { input: { channelId: t1.id, patch: { availableLanguageCodes: ['zh_Hans'], defaultLanguageCode: 'zh_Hans' } } }, auth);
  if (r1.body?.errors) { fail('还原①失败: ' + JSON.stringify(r1.body.errors)); process.exit(1); }
  console.log('RESTORE① updateTenantMultiLanguage =', JSON.stringify(r1.body?.data?.updateTenantMultiLanguage?.multiLanguage));

  const r2 = await gql(ADMIN, `mutation MyUpdateChannelCustomFields($input: JSON!) {
    myUpdateChannelCustomFields(input: $input)
  }`, { input: { multiLanguageConfig: null } }, { ...auth, 'vendure-token': t1.token });
  if (r2.body?.errors) { fail('还原②失败: ' + JSON.stringify(r2.body.errors)); process.exit(1); }
  console.log('RESTORE② myUpdateChannelCustomFields ok');

  const back = await readMulti('RESTORE_AFTER');
  const shopBack = await readShop();
  const rp = [];
  if (back !== null) rp.push('tenantSettings.multiLanguage 期望 null 实得 ' + JSON.stringify(back));
  const sbCodes = (shopBack?.availableLanguageCodes || []).slice().sort().join(',');
  if (sbCodes !== 'zh_Hans') rp.push('shop activeChannel 期望 ["zh_Hans"] 实得 ' + JSON.stringify(shopBack));
  if (rp.length) { fail(rp.join(' | ')); process.exit(1); }
  console.log('RESTORE_OK');
  process.exit(0);
}

// 4. 计算目标集合
let targetCodes;
let targetDefault;
if (SET_CODES) {
  targetCodes = SET_CODES.split(',').map((s) => s.trim()).filter(Boolean);
  targetDefault = SET_DEFAULT || beforeDefault;
  console.log('MODE set-codes');
} else {
  targetCodes = [...beforeCodes];
  if (!targetCodes.includes('de')) targetCodes.push('de');
  targetDefault = beforeDefault;
  console.log('MODE add-de');
}
console.log('WRITE target availableLanguageCodes =', JSON.stringify(targetCodes), 'default =', targetDefault);

const w = await gql(ADMIN, `mutation UpdateTenantMultiLanguage($input: TenantSectionPatchInput!) {
  updateTenantMultiLanguage(input: $input) { multiLanguage }
}`, { input: { channelId: t1.id, patch: { availableLanguageCodes: targetCodes, defaultLanguageCode: targetDefault } } }, auth);
if (w.body?.errors) { fail('写入失败: ' + JSON.stringify(w.body.errors)); process.exit(1); }
console.log('WRITE result =', JSON.stringify(w.body?.data?.updateTenantMultiLanguage?.multiLanguage));

// 5. AFTER
const after = await readMulti('AFTER');
const afterCodes = after?.availableLanguageCodes || [];

// 6. SHOP_CHANNEL
const shopCh = await readShop();

// 7. 断言
const problems = [];
if (SET_CODES) {
  const want = JSON.stringify(targetCodes.slice().sort());
  const got = JSON.stringify(afterCodes.slice().sort());
  if (want !== got) problems.push(`AFTER 语言集合不符 期望 ${want} 实得 ${got}`);
  if ((shopCh?.availableLanguageCodes || []).sort().join(',') !== targetCodes.slice().sort().join(',')) {
    problems.push('SHOP_CHANNEL availableLanguageCodes 与目标不符');
  }
} else {
  if (!afterCodes.includes('de')) problems.push('AFTER 未包含 de');
  if (!(shopCh?.availableLanguageCodes || []).includes('de')) problems.push('SHOP_CHANNEL 未包含 de');
}
if (problems.length) { fail(problems.join(' | ')); process.exit(1); }
console.log('PROBE_OK');
