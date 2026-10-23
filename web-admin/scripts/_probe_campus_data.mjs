const ADMIN = 'https://e.joho.cn/admin-api';

async function gql(query, token, channel) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (channel) headers['vendure-token'] = channel;
  const r = await fetch(ADMIN, { method: 'POST', headers, body: JSON.stringify({ query }) });
  return r.json();
}

const login = await gql(`mutation{login(username:"superadmin",password:"z123123"){... on CurrentUser{id identifier}}}`);
console.log('login', JSON.stringify(login.data || login.errors));

// 用 fetch 拿 set-cookie 里的 token 头：vendure 返回 vendure-auth-token 响应头
const r = await fetch(ADMIN, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `mutation{login(username:"superadmin",password:"z123123"){... on CurrentUser{id}}}` }),
});
const authToken = r.headers.get('vendure-auth-token');
console.log('auth header token?', !!authToken);

const channels = await gql(`{channels{items{id code token}}}` , authToken);
console.log('channels', JSON.stringify(channels.data?.channels?.items || channels.errors));

for (const c of channels.data?.channels?.items || []) {
  const z = await gql(`{campusZones{id name fee} campusBuildings{id name zoneId}}`, authToken, c.token);
  console.log(c.code, c.token, JSON.stringify(z.data || z.errors).slice(0, 200));
}

const orders = await gql(`{orders(options:{take:10,sort:{createdAt:DESC}}){items{id code customFields{buildingId campusZone fulfillmentRoute}}}}`, authToken);
console.log('orders', JSON.stringify(orders.data?.orders?.items || orders.errors).slice(0, 600));

const ac = await gql(`{campusAddressChanges{id orderId diff status settleAction createdAt}}`, authToken);
console.log('addrChanges', JSON.stringify(ac.data?.campusAddressChanges || ac.errors).slice(0, 600));
