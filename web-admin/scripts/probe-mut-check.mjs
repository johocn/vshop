// 只读：确认闭环冒烟所需的写/删 mutation 是否存在
const ADMIN = process.env.WA_ADMIN_URL;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
if (!ADMIN || !ADMIN_USER || !ADMIN_PASS) { console.error('缺少环境变量：WA_ADMIN_URL / ADMIN_USER / ADMIN_PASS（不提供默认域名与凭据）'); process.exit(1); }
const gql = async (q, v = {}, h = {}) => {
  const r = await fetch(ADMIN, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ query: q, variables: v }) });
  return { body: await r.json(), token: r.headers.get('vendure-auth-token') };
};
const login = await gql(`mutation { login(username:"${ADMIN_USER}", password:"${ADMIN_PASS}") { ... on CurrentUser { id } } }`);
const auth = { Authorization: `Bearer ${login.token}` };
const q = await gql(`query { __schema { mutationType { fields { name } } } }`, {}, auth);
const fields = q.body?.data?.__schema?.mutationType?.fields?.map(f => f.name) || [];
const want = ['createProduct', 'createProductVariants', 'deleteProduct', 'deleteProducts', 'updateProduct', 'updateProductVariants', 'createAssets', 'deleteAssets', 'createCollection', 'updateCollection', 'deleteCollection', 'createShippingProfile', 'deleteShippingProfile', 'createPaymentProfile', 'deletePaymentProfile'];
console.log(want.map(n => `${n}: ${fields.includes(n) ? 'YES' : 'no'}`).join('\n'));