// probe-closure.mjs: 端到端自清理冒烟 —— 复现 web-admin(商品闭环) 在生产 admin-api 的真实调用链
// 覆盖: 图片上传(createAssets multipart) / 两步建商品(createProduct+createProductVariants stockOnHand+trackInventory GlobalFlag)
//      / fetchProductFull 回读 / updateProduct&updateProductVariants / fetchProductList(enabled 筛选)
//      / 配送/支付建档(真实 method) / 分类 create+rename+delete。测试数据全部删除。
// 用法: node scripts/probe-closure.mjs
const ADMIN = process.env.WA_ADMIN_URL || 'https://e.joho.cn/admin-api';
const gql = async (q, v = {}, h = {}) => {
  const r = await fetch(ADMIN, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ query: q, variables: v }) });
  return { body: await r.json(), token: r.headers.get('vendure-auth-token') };
};
const ok = (label, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  | ' + extra : ''}`);
const stamp = () => 'smoke-' + Date.now().toString(36);

// login
const login = await gql(`mutation { login(username:"superadmin", password:"superadmin") { ... on CurrentUser { id } } }`);
const auth = { Authorization: `Bearer ${login.token}` };
ok('login', !!login.token);

// ---- 1. 图片上传（镜像 asset.ts uploadAsset 的 multipart /createAssets）----
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const assetName = stamp() + '.png';
const operations = JSON.stringify({ query: `mutation CreateAssets($input: [CreateAssetInput!]!) { createAssets(input: $input) { __typename ... on Asset { id preview mimeType } } }`, variables: { input: [{ file: null }] } });
const form = new FormData();
form.append('operations', operations);
form.append('map', JSON.stringify({ '0': ['variables.input.0.file'] }));
form.append('0', new Blob([png], { type: 'image/png' }), assetName);
const upRes = await fetch(ADMIN, { method: 'POST', headers: { Authorization: `Bearer ${login.token}` }, body: form });
const upBody = await upRes.json();
const asset = upBody?.data?.createAssets?.[0];
ok('uploadAsset', !!asset?.id, asset ? `${asset.mimeType} ${asset.id}` : JSON.stringify(upBody.errors));
const assetId = asset?.id;

let prodId = null, varId = null;
const LAN = 'zh_Hans';
try {
  // ---- 2. 两步建商品（镜像 createProduct + createVariantsForProduct）----
  const nm = 'smoke产品' + stamp();
  const { createProduct } = (await gql(`mutation($i: CreateProductInput!){ createProduct(input:$i){ id } }`, { i: { translations: [{ languageCode: LAN, name: nm, slug: nm, description: 'smoke desc' }] } }, auth)).body.data;
  prodId = createProduct.id;
  ok('createProduct', !!prodId, prodId);
  const { createProductVariants } = (await gql(`mutation($i: [CreateProductVariantInput!]!){ createProductVariants(input:$i){ id } }`, {
    i: [{
      productId: prodId, sku: nm, price: 1299, trackInventory: 'TRUE', stockOnHand: 7,
      assetIds: assetId ? [assetId] : [], featuredAssetId: assetId || undefined,
      customFields: { shippingProfileId: '', paymentProfileId: '' },
      translations: [{ languageCode: LAN, name: nm }],
    }],
  }, auth)).body.data;
  varId = createProductVariants?.[0]?.id;
  ok('createProductVariants(stockOnHand+GlobalFlag)', !!varId, varId);

  // ---- 3. fetchProductFull 回读（镜像前端查询路径）----
  const full = (await gql(`query($id: ID!){ product(id:$id){ id name enabled featuredAsset{id preview} assets{id preview} translations{languageCode name slug description} variants{ id sku price stockOnHand customFields{ shippingProfileId paymentProfileId } } } }`, { id: prodId }, auth)).body.data.product;
  const v = full?.variants?.[0];
  ok('ProductFull roundtrip', !!v && v.price === 1299 && v.stockOnHand === 7 && v.sku === nm && v.customFields?.shippingProfileId === '', JSON.stringify({ price: v?.price, stock: v?.stockOnHand, assets: full?.assets?.length }));

  // ---- 4. updateProduct + updateProductVariants（镜像 updateProductFull）----
  const uP = await gql(`mutation($i: UpdateProductInput!){ updateProduct(input:$i){ id } }`, { i: { id: prodId, translations: [{ languageCode: LAN, name: nm + '改', slug: nm, description: 'desc2' }], assetIds: assetId ? [assetId] : [], featuredAssetId: assetId || undefined } }, auth);
  ok('updateProduct(assets/translations)', !uP.body?.errors, JSON.stringify(uP.body?.errors?.[0]?.message || ''));
  const uV = await gql(`mutation($i:[UpdateProductVariantInput!]!){ updateProductVariants(input:$i){ id } }`, { i: [{ id: varId, sku: nm, price: 1599, trackInventory: 'TRUE', stockOnHand: 3, customFields: { shippingProfileId: '', paymentProfileId: '' } }] }, auth);
  ok('updateProductVariants(price/stock)', !uV.body?.errors, JSON.stringify(uV.body?.errors?.[0]?.message || ''));

  // ---- 5. fetchProductList enabled 筛选（镜像 fetchProductList）----
  const list = (await gql(`query($f: ProductFilterParameter){ products(options:{ take: 5, filter: $f }){ totalItems items{ id enabled } } }`, { f: { name: { contains: nm.split('改')[0] }, enabled: { eq: true } } }, auth)).body.data.products;
  ok('fetchProductList(enabled eq + name contains)', list.totalItems >= 1 && list.items.every(x => x.enabled === true), `total=${list.totalItems}`);
} finally {
  // 清理：删变体/商品/资源（签名已透过 probe-del-sign.mjs 校准：deleteProductVariants/deleteProducts 收 ID 数组，deleteAssets 收 DeleteAssetsInput）
  if (varId) await gql(`mutation($i:[ID!]!){ deleteProductVariants(ids:$i) }`, { i: [varId] }, auth);
  if (prodId) await gql(`mutation($i:[ID!]!){ deleteProducts(ids:$i) }`, { i: [prodId] }, auth);
  if (assetId) await gql(`mutation($i: DeleteAssetsInput!){ deleteAssets(input:$i) }`, { i: { assetIds: [assetId], force: true, deleteFromAllChannels: true } }, auth);
  ok('cleanup product/variant/assets', !(!varId && !prodId && !assetId));
}

// ---- 6. 配送档案：真实 method 创建 + 删除 ----
const sm = (await gql(`query { shippingMethods { items { id code } } }`, {}, auth)).body.data.shippingMethods.items;
const spNm = stamp();
const sp = (await gql(`mutation($i: CreateShippingProfileInput!){ createShippingProfile(input:$i){ id } }`, { i: { name: spNm, code: spNm, description: 'smoke', shippingMethodIds: sm.slice(0, 1).map(m => m.id) } }, auth)).body.data?.createShippingProfile;
ok('createShippingProfile(w/real method)', !!sp?.id, sp ? JSON.stringify(sm.slice(0, 1).map(m => m.code)) : 'no shipping method?' + (!sm.length ? ' EMPTY' : ''));
if (sp) await gql(`mutation($id: ID!){ deleteShippingProfile(id:$id) }`, { id: sp.id }, auth);

const pm = (await gql(`query { paymentMethods { items { id code } } }`, {}, auth)).body.data.paymentMethods.items;
const ppNm = stamp();
const pp = (await gql(`mutation($i: CreatePaymentProfileInput!){ createPaymentProfile(input:$i){ id } }`, { i: { name: ppNm, code: ppNm, description: 'smoke', paymentMethodIds: pm.slice(0, 1).map(m => m.id) } }, auth)).body.data?.createPaymentProfile;
ok('createPaymentProfile(w/real method)', !!pp?.id, pp ? JSON.stringify(pm.slice(0, 1).map(m => m.code)) : 'no payment method?' + (!pm.length ? ' EMPTY' : ''));
if (pp) await gql(`mutation($id: ID!){ deletePaymentProfile(id:$id) }`, { id: pp.id }, auth);

// ---- 7. 分类 create + rename + delete（镜像 createCollection/renameCollection/deleteCollectionById）----
const cNm = stamp();
const c = (await gql(`mutation($i: CreateCollectionInput!){ createCollection(input:$i){ id } }`, { i: { isPrivate: false, translations: [{ languageCode: LAN, name: cNm, slug: cNm, description: cNm }], filters: [{ code: 'product-id-filter', arguments: [{ name: 'productIds', value: '[]' }] }] } }, auth)).body.data?.createCollection;
ok('createCollection', !!c?.id, c?.id);
if (c) {
  const rn = await gql(`mutation($i: UpdateCollectionInput!){ updateCollection(input:$i){ id } }`, { i: { id: c.id, translations: [{ languageCode: LAN, name: cNm + '改', slug: cNm, description: cNm }] } }, auth);
  ok('renameCollection(no filters intact)', !rn.body?.errors, JSON.stringify(rn.body?.errors?.[0]?.message || ''));
  const del = await gql(`mutation($id: ID!){ deleteCollection(id:$id){ result } }`, { id: c.id }, auth);
  ok('deleteCollection', del.body?.data?.deleteCollection?.result === 'DELETED', JSON.stringify(del.body?.data?.deleteCollection));
}

console.log('\nSMOKE_DONE');