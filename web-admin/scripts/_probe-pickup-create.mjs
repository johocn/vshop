// 冒烟：自提点新增 + 电话/经纬度字段全长
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

// 1) 尝试创建一个带电话/经纬度/营业时间的自提点（探测运行时是否接受字段）
const mCreate = `mutation C($input: CreatePickupLocationInput!) {
  createPickupLocation(input: $input) { id name type address phoneNumber businessHours coordinates }
}`;
const r = await gql(mCreate, {
  input: { name: '__probe_pickup_tmp__', type: 'store', address: '探针地址',
    phoneNumber: '010-88886666', businessHours: '09:00-21:00', coordinates: { lat: 39.9, lng: 116.4 } },
}, auth);
console.log('== create (probe, will delete) ==');
console.log(r.body?.errors ? 'ERR ' + JSON.stringify(r.body.errors) : 'OK id=' + r.body.data.createPickupLocation.id);

// 2) 查询列表，确认 coordinates 是否随记录返回
const qList = `query { pickupLocations { items { id name type address phoneNumber businessHours coordinates } totalItems } }`;
const r2 = await gql(qList, {}, auth);
console.log('== pickupLocations list ==');
if (r2.body?.errors) {
  console.log('ERR ' + JSON.stringify(r2.body.errors));
} else {
  const items = r2.body.data.pickupLocations.items;
  console.log('OK items=' + items.length);
  for (const it of items) {
    console.log(`  - ${it.name} | type=${it.type} | phone=${it.phoneNumber ?? '∅'} | coords=${JSON.stringify(it.coordinates ?? null)}`);
  }
}

// 3) 自清理：删除探针自提点
if (r.body?.data?.createPickupLocation?.id) {
  const d = await gql(`mutation D($id: ID!) { deletePickupLocation(id: $id) }`, { id: r.body.data.createPickupLocation.id }, auth);
  console.log('== cleanup delete ==', d.body?.errors ? 'ERR ' + JSON.stringify(d.body.errors) : 'OK');
}