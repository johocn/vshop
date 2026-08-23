const ADMIN = 'https://e.joho.cn/admin-api';
const gql = async (q, v = {}, h = {}) => { const r = await fetch(ADMIN, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ query: q, variables: v }) }); return { b: await r.json(), t: r.headers.get('vendure-auth-token') }; };
const L = await gql(`mutation{login(username:"superadmin",password:"superadmin"){...on CurrentUser{id}}}`);
const H = { Authorization: 'Bearer ' + L.t };
const q = await gql(`query{ __schema{ mutationType{ fields{ name args{ name type{ kind name ofType{ name kind ofType{ kind name } } } } } } } }`, {}, H);
const fields = q.b?.data?.__schema?.mutationType?.fields || [];
for (const n of ['deleteProducts', 'deleteProductVariants', 'deleteAssets']) {
  const f = fields.find(x => x.name === n);
  const args = (f?.args || []).map(a => `${a.name}:${a.type.name || a.type.ofType?.name || a.type.kind}${a.type.ofType?.ofType?.name ? '<' + a.type.ofType.ofType.name + '>' : ''}`);
  console.log(`${n}(${args.join(', ')})`);
}
const da = await gql(`query{ __type(name:"DeleteAssetsInput"){ inputFields{ name type{ kind name } } } }`, {}, H);
console.log('DeleteAssetsInput{ ' + (da.b?.data?.__type?.inputFields || []).map(f => f.name + ':' + f.type.name).join(', ') + ' }');