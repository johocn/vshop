const ADMIN = process.env.WA_ADMIN_URL;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
if (!ADMIN || !ADMIN_USER || !ADMIN_PASS) { console.error('缺少环境变量：WA_ADMIN_URL / ADMIN_USER / ADMIN_PASS（不提供默认域名与凭据）'); process.exit(1); }
async function gql(q, vars = {}, headers = {}) {
  const res = await fetch(ADMIN, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const body = await res.json();
  return { body, token: res.headers.get('vendure-auth-token') };
}
const login = await gql(`mutation { login(username:"${ADMIN_USER}", password:"${ADMIN_PASS}") { ... on CurrentUser { id identifier } } }`);
const auth = { Authorization: `Bearer ${login.token}` };

const s = await gql(`query { shippingMethods { items { id code translations { id languageCode name description } } } }`, {}, auth);
console.log('SHIP', JSON.stringify(s.body?.data?.shippingMethods?.items?.map(i => ({ code: i.code, tr: i.translations })), null, 1));

const p = await gql(`query { paymentMethods { items { id code enabled translations { id languageCode name description } } } }`, {}, auth);
console.log('PAY', JSON.stringify(p.body?.data?.paymentMethods?.items?.map(i => ({ code: i.code, enabled: i.enabled, tr: i.translations })), null, 1));