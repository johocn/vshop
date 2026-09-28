const BASE = process.env.WA_API || 'http://localhost:3000/admin-api';
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
if (!ADMIN_USER || !ADMIN_PASS) { console.error('缺少环境变量：ADMIN_USER / ADMIN_PASS'); process.exit(1); }
async function gql(q, vars = {}, headers = {}) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const body = await res.json();
  return { body, token: res.headers.get('vendure-auth-token') };
}

const login = await gql(`mutation { login(username:"${ADMIN_USER}", password:"${ADMIN_PASS}") {
  ... on CurrentUser { id identifier } ... on InvalidCredentialsError { errorCode } } }`);
const token = login.token;
console.log('login ok, token len=', token ? token.length : 0);
if (!token) throw new Error('no token');
const me = await gql(`query { me { channels { id code token } } }`, {}, { Authorization: `Bearer ${token}` });
const codes = me.body?.data?.me?.channels?.map((c) => c.code);
console.log('channels=', codes);
if (!codes?.includes('shop-a')) throw new Error('expect shop-a channel');
const prod = await gql(`query { products { totalItems } }`, {}, {
  Authorization: `Bearer ${token}`,
  'vendure-token': 'shop-a-token',
});
console.log('shop-a products=', prod.body?.data?.products?.totalItems);