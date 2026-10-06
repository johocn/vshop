// 清理生产中的临时受限测试账号：tenant_member 已删，补删孤儿 Administrator id=54
const ADMIN_API = 'https://e.joho.cn/admin-api';
const CHANNEL = 'cnx87ezvmjx8nn3bth6c';
const ADMIN_ID = '54';

async function gql(query, variables, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (CHANNEL) headers['vendure-token'] = CHANNEL;
  const res = await fetch(ADMIN_API, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const newToken = res.headers.get('vendure-auth-token');
  const json = await res.json();
  return { json, newToken };
}

const loginQ = `mutation Login($u: String!, $p: String!) {
  login(username: $u, password: $p) {
    ... on CurrentUser { id identifier }
    ... on InvalidCredentialsError { errorCode message }
  }
}`;

const { json: lj, newToken } = await gql(loginQ, { u: 'superadmin', p: 'z123123' });
console.log('login:', JSON.stringify(lj));
if (!newToken) {
  console.error('no auth token returned');
  process.exit(1);
}

const delQ = `mutation DelAdmin($id: ID!) { deleteAdministrator(id: $id) { result message } }`;
const { json: dj } = await gql(delQ, { id: ADMIN_ID }, newToken);
console.log('deleteAdministrator:', JSON.stringify(dj));