const ADMIN = process.env.WA_ADMIN_URL || 'http://localhost:3000/admin-api';
const TOKEN = process.env.WA_TOKEN || '';
const query = `mutation CreateCollection($input: CreateCollectionInput!) {
  createCollection(input: $input) { id slug }
}`;
const body = JSON.stringify({
  query, variables: {
    input: {
      translations: [{ languageCode: 'en', name: 'ProbeCat' + Date.now(), slug: 'probe-cat-' + Date.now(), description: 'probe' }],
      // calibrated against Vendure schema: ConfigurableOperationInput uses `arguments` (not `args`),
      // code = product-id-filter, arg name = productIds
      filters: [{ code: 'product-id-filter', arguments: [{ name: 'productIds', value: '[]' }] }],
    },
  },
});
const headers = { 'Content-Type': 'application/json' };
if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
const res = await fetch(ADMIN, { method: 'POST', headers, body });
const j = await res.json();
console.log(JSON.stringify(j, null, 2));
console.log(j.errors ? 'PROBE_FAIL' : 'PROBE_COLLECTION_OK');