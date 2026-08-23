// 复现 web-admin 配送档案页 onMounted 的三个并行请求
const ADMIN = 'https://e.joho.cn/admin-api';
async function gql(q, vars = {}, headers = {}) {
  const res = await fetch(ADMIN, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  return { body: await res.json(), token: res.headers.get('vendure-auth-token') };
}
const login = await gql(`mutation { login(username:"superadmin", password:"superadmin") { ... on CurrentUser { id identifier } } }`);
const auth = { Authorization: `Bearer ${login.token}` };
console.log('login token?', !!login.token);

const qProfiles = `query ShippingProfiles {
  shippingProfiles {
    items { id name code description isGlobal freeShippingThreshold isTenantDefault
      shippingMethods { id code }
      pickupLocations { id }
      methodConfigs { shippingMethodId mode options }
    }
    totalItems
  }
}`;
const r1 = await gql(qProfiles, {}, auth);
console.log('== shippingProfiles ==');
console.log(r1.body?.errors ? 'ERR ' + JSON.stringify(r1.body.errors) : 'OK items=' + r1.body.data.shippingProfiles.items.length);

const qPickups = `query PickupLocations { pickupLocations { items { id name type address phoneNumber businessHours } totalItems } }`;
const r2 = await gql(qPickups, {}, auth);
console.log('== pickupLocations ==');
console.log(r2.body?.errors ? 'ERR ' + JSON.stringify(r2.body.errors) : 'OK items=' + r2.body.data.pickupLocations.items.length);

const qMeth = `query { shippingMethods { items { id code } } }`;
const r3 = await gql(qMeth, {}, auth);
console.log('== shippingMethods ==');
console.log(r3.body?.errors ? 'ERR ' + JSON.stringify(r3.body.errors) : 'OK items=' + r3.body.data.shippingMethods.items.length + ' codes=' + r3.body.data.shippingMethods.items.map(m => m.code).join(','));