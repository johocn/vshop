// Probe: calibrate ShippingProfile / PaymentProfile schema against real admin-api
const ADMIN = process.env.WA_ADMIN_URL || 'http://localhost:3000/admin-api';
async function gql(q, vars = {}, headers = {}) {
  const res = await fetch(ADMIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const body = await res.json();
  return { body, token: res.headers.get('vendure-auth-token') };
}

// login
const login = await gql(`mutation { login(username:"superadmin", password:"superadmin") {
  ... on CurrentUser { id identifier } ... on InvalidCredentialsError { errorCode } } }`);
const token = login.token;
if (!token) throw new Error('no token');
const auth = { Authorization: `Bearer ${token}` };
console.log('login ok');

// query shipping profiles — probe available fields (calibrated: no createdAt/updatedAt/ownerChannelId;
// PickupLocation has no code -> only id)
const sp = await gql(`query {
  shippingProfiles(options: { take: 5 }) {
    totalItems
    items { id name code description isGlobal freeShippingThreshold
      shippingMethods { id code } pickupLocations { id } }
  }
}`, {}, auth);
console.log('shippingProfiles:', JSON.stringify(sp.body?.data?.shippingProfiles?.items ?? sp.body));
console.log('sp.errors:', sp.body?.errors ?? 'none');

// query payment profiles
const pp = await gql(`query {
  paymentProfiles(options: { take: 5 }) {
    totalItems
    items { id name code description isGlobal installmentOptions
      paymentMethods { id code } }
  }
}`, {}, auth);
console.log('paymentProfiles:', JSON.stringify(pp.body?.data?.paymentProfiles?.items ?? pp.body));
console.log('pp.errors:', pp.body?.errors ?? 'none');

// find a shipping method id for create probe (store-pickup/pickup-point if present)
const sm = await gql(`query { shippingMethods { totalItems items { id code } } }`, {}, auth);
const shippingMethods = sm.body?.data?.shippingMethods?.items || [];
console.log('shippingMethods:', shippingMethods.map(m => `${m.id}:${m.code}`).join(', '));

const pm = await gql(`query { paymentMethods { totalItems items { id code } } }`, {}, auth);
const paymentMethods = pm.body?.data?.paymentMethods?.items || [];
console.log('paymentMethods:', paymentMethods.map(m => `${m.id}:${m.code}`).join(', '));

const name = 'probe-sp-' + Date.now();
const code = 'probe-sp-' + Date.now();
const createSP = await gql(`mutation ($input: CreateShippingProfileInput!) {
  createShippingProfile(input: $input) { id name code isGlobal freeShippingThreshold }
}`, { input: {
  name, code, description: 'probe',
  shippingMethodIds: shippingMethods.slice(0, 1).map(m => m.id),
} }, auth);
let newSpId = null;
if (createSP.body?.data?.createShippingProfile) {
  newSpId = createSP.body.data.createShippingProfile.id;
  console.log('createShippingProfile ok id=', newSpId);
} else {
  console.log('createShippingProfile ERR:', JSON.stringify(createSP.body?.errors ?? createSP.body));
}

const pname = 'probe-pp-' + Date.now();
const createPP = await gql(`mutation ($input: CreatePaymentProfileInput!) {
  createPaymentProfile(input: $input) { id }
}`, { input: {
  name: pname, code: 'probe-pp-' + Date.now(), description: 'probe',
  paymentMethodIds: paymentMethods.slice(0, 1).map(m => m.id),
} }, auth);
let newPpId = null;
if (createPP.body?.data?.createPaymentProfile) {
  newPpId = createPP.body.data.createPaymentProfile.id;
  console.log('createPaymentProfile ok id=', newPpId);
} else {
  console.log('createPaymentProfile ERR:', JSON.stringify(createPP.body?.errors ?? createPP.body));
}

// try delete (assume Boolean!)
if (newSpId) {
  const del = await gql(`mutation ($id: ID!) { deleteShippingProfile(id: $id) }`, { id: newSpId }, auth);
  console.log('deleteShippingProfile ->', JSON.stringify(del.body?.data ?? del.body?.errors));
}
if (newPpId) {
  const del = await gql(`mutation ($id: ID!) { deletePaymentProfile(id: $id) }`, { id: newPpId }, auth);
  console.log('deletePaymentProfile ->', JSON.stringify(del.body?.data ?? del.body?.errors));
}

console.log(createSP.body?.errors ? 'PROBE_FAIL' : 'PROBE_PROFILE_OK');