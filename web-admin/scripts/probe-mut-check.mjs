// 只读：确认闭环冒烟所需的写/删 mutation 是否存在
const ADMIN = process.env.WA_ADMIN_URL || 'https://e.joho.cn/admin-api';
const gql = async (q, v = {}, h = {}) => {
  const r = await fetch(ADMIN, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ query: q, variables: v }) });
  return { body: await r.json(), token: r.headers.get('vendure-auth-token') };
};
const login = await gql(`mutation { login(username:"superadmin", password:"superadmin") { ... on CurrentUser { id } } }`);
const auth = { Authorization: `Bearer ${login.token}` };
const q = await gql(`query { __schema { mutationType { fields { name } } } }`, {}, auth);
const fields = q.body?.data?.__schema?.mutationType?.fields?.map(f => f.name) || [];
const want = ['createProduct', 'createProductVariants', 'deleteProduct', 'deleteProducts', 'updateProduct', 'updateProductVariants', 'createAssets', 'deleteAssets', 'createCollection', 'updateCollection', 'deleteCollection', 'createShippingProfile', 'deleteShippingProfile', 'createPaymentProfile', 'deletePaymentProfile'];
console.log(want.map(n => `${n}: ${fields.includes(n) ? 'YES' : 'no'}`).join('\n'));