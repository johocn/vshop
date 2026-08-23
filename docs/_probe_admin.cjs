const BASE = 'http://localhost:3000/admin-api';

async function gql(query, variables = {}, headers = {}, captureHeaders = false) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (captureHeaders) {
    return { json, token: res.headers.get('vendure-auth-token'), setCookie: res.headers.get('set-cookie') };
  }
  return json;
}

(async () => {
  // 1) login, capture token header + CurrentUser via fragments
  const { json: login, token, setCookie } = await gql(
    `mutation {
      login(username:"superadmin", password:"superadmin") {
        ... on CurrentUser { id identifier }
        ... on InvalidCredentialsError { errorCode message }
      }
    }`, {}, {}, true);
  console.log('LOGIN:', JSON.stringify(login, null, 2));
  console.log('AUTH-TOKEN-HDR:', token);
  console.log('SET-COOKIE:', setCookie);
  const t = token || (login?.data?.login?.sessionToken);
  if (!t) { console.log('NO TOKEN, abort'); return; }
  const auth = { Authorization: `Bearer ${t}` };

  // 2) me.channels
  const me = await gql(`query { me { id identifier channels { id code token } } }`, {}, auth);
  console.log('ME-CHANNELS:', JSON.stringify(me, null, 2));

  // 3) activeChannel without/with channel token header (KEY = vendure-token)
  const active = await gql(`query { activeChannel { id code token } }`, {}, auth);
  console.log('ACTIVE(no hdr):', JSON.stringify(active, null, 2));

  const chans = me?.data?.me?.channels || [];
  const second = chans[1];
  if (second) {
    const activeHdr = await gql(`query { activeChannel { id code token } }`, {}, { ...auth, 'vendure-token': second.token });
    console.log(`ACTIVE(vendure-token=${second.token}, expect=${second.code}):`, JSON.stringify(activeHdr, null, 2));

    // scoped product query under that channel
    const prod = await gql(`query { products(options:{take:3}) { totalItems items { id name } } }`, {}, { ...auth, 'vendure-token': second.token });
    console.log(`PRODUCTS(channel=${second.code}):`, JSON.stringify(prod, null, 2));
  }
})();