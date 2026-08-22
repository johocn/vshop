// Task 3 schema 校准脚本：对 admin-api 实测每个查询/变更的真实字段名
// 用法: node scripts/schema-check.mjs
const BASE = process.env.WA_API || 'http://localhost:3000/admin-api';

async function gql(q, vars = {}, headers = {}) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const body = await res.json();
  return { body, token: res.headers.get('vendure-auth-token') };
}

function show(label, body) {
  if (body?.errors) {
    console.log(`[${label}] ERRORS:`);
    for (const e of body.errors) console.log('   -', e.message);
  } else {
    console.log(`[${label}] OK:`, JSON.stringify(body?.data).slice(0, 400));
  }
}

// 1. login
const login = await gql(`mutation { login(username:"superadmin", password:"superadmin") {
  ... on CurrentUser { id identifier }
  ... on InvalidCredentialsError { errorCode message }
} }`);
const token = login.token;
if (!token) throw new Error('login failed: ' + JSON.stringify(login.body));
console.log('[login] ok, token len=', token.length);
const auth = { Authorization: `Bearer ${token}` };

// 2. me.channels
show('me.channels', (await gql(`query { me { channels { id code token } } }`, {}, auth)).body);

// 3. products 列表字段
show('products(id/name/enabled/slug)', (await gql(`query { products(options:{take:2}) { totalItems items { id name enabled slug } } }`, {}, auth)).body);
show('products(translations)', (await gql(`query { products(options:{take:1}) { totalItems items { id translations { languageCode name slug } enabled } } }`, {}, auth)).body);

// 4. Product 类型 introspection
show('__type Product fields', (await gql(`query { __type(name:"Product") { fields { name } } }`, {}, auth)).body);

// 5. updateProduct
show('updateProduct(id:1,enabled)', (await gql(`mutation { updateProduct(input:{id:"1", enabled:true}) { id enabled } }`, {}, auth)).body);

// 6. collections
show('collections', (await gql(`query { collections(options:{take:2}) { totalItems items { id name } } }`, {}, auth)).body);

// 7. orders 列表字段
show('orders(id/code/state/totalWithTax)', (await gql(`query { orders(options:{take:2}) { totalItems items { id code state totalWithTax } } }`, {}, auth)).body);

// 8. 发货相关 introspection
show('__type Mutation fulfillOrder', (await gql(`query { __type(name:"Mutation") { fields { name } } }`, {}, auth)).body);
show('__type FulfillOrderInput', (await gql(`query { __type(name:"FulfillOrderInput") { inputFields { name type { name kind ofType { name } } } } }`, {}, auth)).body);
show('__type AddFulfillmentToOrderInput', (await gql(`query { __type(name:"AddFulfillmentToOrderInput") { inputFields { name type { name kind ofType { name } } } } }`, {}, auth)).body);
show('__type FulfillmentLineInput', (await gql(`query { __type(name:"FulfillmentLineInput") { inputFields { name type { name kind ofType { name } } } } }`, {}, auth)).body);

// 9. activeChannel customFields
show('activeChannel(customFields)', (await gql(`query { activeChannel { id code customFields } }`, {}, auth)).body);
show('__type Channel customFields', (await gql(`query { __type(name:"Channel") { fields { name } } }`, {}, auth)).body);

// 10. updateChannel
show('updateChannel(id:1)', (await gql(`mutation { updateChannel(input:{id:"1"}) { id code } }`, {}, auth)).body);

// 11. 订单详情（order 单查，用于 shipOrder 的 lines 结构）
show('order(id:1) lines', (await gql(`query { order(id:"1") { id code state lines { id productVariantId quantity } } }`, {}, auth)).body);

// 12. 商品详情 product
show('product(id:1)', (await gql(`query { product(id:"1") { id name enabled slug } }`, {}, auth)).body);

console.log('\n=== schema-check done ===');
