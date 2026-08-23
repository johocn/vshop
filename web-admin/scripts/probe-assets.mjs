import { readFileSync } from 'node:fs';
const ADMIN = process.env.WA_ADMIN_URL || 'http://localhost:3000/admin-api';
const TOKEN = process.env.WA_TOKEN || '';
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/probe-assets.mjs <图片路径>'); process.exit(1); }
const buf = readFileSync(file);
const query = `mutation CreateAssets($input: [CreateAssetInput!]!) {
  createAssets(input: $input) { __typename ... on Asset { id preview source mimeType } }
}`;
const operations = JSON.stringify({ query, variables: { input: [{ file: null }] } });
const form = new FormData();
form.append('operations', operations);
form.append('map', JSON.stringify({ '0': ['variables.input.0.file'] }));
form.append('0', new Blob([buf]), file.split(/[\\/]/).pop());
const headers = { };
if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
const res = await fetch(ADMIN, { method: 'POST', headers, body: form });
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
if (!body.errors && body.data?.createAssets?.[0]?.id) { console.log('PROBE_ASSETS_OK'); process.exit(0); }
console.log('PROBE_FAIL'); process.exit(1);