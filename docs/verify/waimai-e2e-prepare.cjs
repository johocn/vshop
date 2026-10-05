// waimai E2E 造数（幂等，可重复执行）：店铺渠道 canteen-a/b + 履约配置 + 校区/楼栋/时段
// + waimai 渠道元数据 + 冒烟共享商品 + 两个冒烟顾客（下单者/骑手）。
// 用法: node waimai-e2e-prepare.cjs [shop-api-base，默认 https://e.joho.cn/shop-api]
const ADMIN_API = (process.argv[2] || 'https://e.joho.cn').replace(/\/$/, '').replace(/\/shop-api$/, '') + '/admin-api';

const CHANNELS = [
    { code: 'canteen-a', token: 'canteen-a-token', name: '冒烟食堂A' },
    { code: 'canteen-b', token: 'canteen-b-token', name: '冒烟食堂B' },
];
const CUSTOMERS = [
    { email: 'smoke-order@yourbao.cn', password: 'Wm@Smoke123', firstName: '冒烟', lastName: '下单' },
    { email: 'smoke-rider@yourbao.cn', password: 'Wm@Smoke123', firstName: '冒烟', lastName: '骑手' },
];
const PRODUCTS = [
    { slug: 'smoke-cola-chicken', name: '可乐鸡排饭', price: 1000 },
    { slug: 'smoke-spicy-noodle', name: '麻辣拌面', price: 1500 },
];

async function gql(url, query, variables, headers = {}) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ query, variables: variables || {} }),
    });
    const body = await res.json();
    if (body.errors?.length) throw new Error(body.errors.map(e => e.message).join(' | '));
    return { data: body.data, token: res.headers.get('vendure-auth-token') };
}

async function main() {
    const log = (...a) => console.log('[prepare]', ...a);
    // S0 admin 登录
    const a = await gql(ADMIN_API, `mutation { login(username: "superadmin", password: "z123123") { ... on CurrentUser { id } } }`);
    const at = a.token;
    if (!at) throw new Error('admin login failed');
    const H = { Authorization: 'Bearer ' + at };

    // S0.1 复用已有 core Zone（defaultShippingZoneId/defaultTaxZoneId 必填）
    const zones = (await gql(ADMIN_API, `{ zones(options: { take: 5 }) { items { id name } } }`, null, H)).data.zones.items;
    if (!zones.length) throw new Error('no core zone found, create one first');
    const zoneId = zones[0].id;

    // S1 渠道幂等创建
    for (const c of CHANNELS) {
        const list = (await gql(ADMIN_API, `{ channels(options: { filter: { code: { eq: "${c.code}" } } }) { items { id code token } } }`, null, H)).data.channels.items;
        if (list.length) { log('channel exists:', c.code, list[0].id); continue; }
        const r = await gql(ADMIN_API, `mutation($input: CreateChannelInput!) { createChannel(input: $input) { ... on Channel { id code token } } }`, {
            input: {
                code: c.code, token: c.token,
                defaultLanguageCode: 'zh_Hans', defaultCurrencyCode: 'CNY',
                defaultShippingZoneId: zoneId, defaultTaxZoneId: zoneId,
                pricesIncludeTax: false,
            },
        }, H);
        log('channel created:', c.code, r.data.createChannel.id);
    }
    const chanIds = {};
    for (const c of CHANNELS) {
        const list = (await gql(ADMIN_API, `{ channels(options: { filter: { code: { eq: "${c.code}" } } }) { items { id token } } }`, null, H)).data.channels.items;
        chanIds[c.code] = { id: list[0].id, token: list[0].token };
    }

    // S2 冒烟顾客幂等创建（native 账号，供 shop-api login）
    const customerIds = {};
    for (const cu of CUSTOMERS) {
        const found = (await gql(ADMIN_API, `{ customers(options: { filter: { emailAddress: { eq: "${cu.email}" } } }) { items { id emailAddress } } }`, null, H)).data.customers.items;
        if (found.length) { customerIds[cu.email] = found[0].id; log('customer exists:', cu.email, found[0].id); continue; }
        const r = await gql(ADMIN_API, `mutation($input: CreateCustomerInput!, $pw: String) { createCustomer(input: $input, password: $pw) { ... on Customer { id emailAddress } } }`, { input: { firstName: cu.firstName, lastName: cu.lastName, emailAddress: cu.email }, pw: cu.password }, H);
        customerIds[cu.email] = r.data.createCustomer.id;
        log('customer created:', cu.email, r.data.createCustomer.id);
    }

    // S3 骑手批准
    await gql(ADMIN_API, `mutation($id: ID!) { campusSetRiderStatus(customerId: $id, status: "approved") { status } }`,
        { id: customerIds['smoke-rider@yourbao.cn'] }, H);
    log('rider approved:', customerIds['smoke-rider@yourbao.cn']);

    // S4 每店铺渠道：履约配置（惰性建）+ zone/building/slot + waimai 元数据（channel ctx 请求）
    const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
    for (const c of CHANNELS) {
        const CH = { ...H, 'vendure-token': chanIds[c.code].token };
        // 4.1 履约配置：campusUpdateConfig 惰性创建（getConfig 无则建）
        await gql(ADMIN_API, `mutation { campusUpdateConfig(input: { riderCommissionRate: 70, paused: false }) { ... on CampusFulfillmentConfig { id channelId } } }`, null, CH);
        // 4.2 校区 zone 幂等
        let zl = (await gql(ADMIN_API, `{ campusZones { id name fee } }`, null, CH)).data.campusZones;
        let zone = zl.find(z => z.name === '东区');
        if (!zone) zone = (await gql(ADMIN_API, `mutation { campusCreateZone(name: "东区", fee: 200) { ... on CampusZone { id name } } }`, null, CH)).data.campusCreateZone;
        // 4.3 楼栋幂等（全量列表按 zoneId+name 查重）
        let bl = (await gql(ADMIN_API, `{ campusBuildings { id name zoneId } }`, null, CH)).data.campusBuildings;
        const buildings = {};
        for (const bname of ['桂1栋', '桂2栋']) {
            let b = bl.find(x => x.name === bname && Number(x.zoneId) === Number(zone.id));
            if (!b) b = (await gql(ADMIN_API, `mutation($z: ID!) { campusCreateBuilding(name: "${bname}", zoneId: $z, detail: "冒烟测试楼栋") { ... on CampusBuilding { id name } } }`, { z: zone.id }, CH)).data.campusCreateBuilding;
            buildings[bname] = b.id;
        }
        // 4.4 明日两个时段幂等
        const slots = (await gql(ADMIN_API, `{ campusSlots { id slotDate startTime endTime } }`, null, CH)).data.campusSlots;
        const slotIds = [];
        for (const [s, e] of [['11:00', '11:30'], ['17:00', '17:30']]) {
            let slot = slots.find(x => x.slotDate === tomorrow && x.startTime === s && x.endTime === e);
            if (!slot) slot = (await gql(ADMIN_API, `mutation($s: String!, $st: String!, $et: String!, $z: ID) { campusCreateSlot(input: { slotDate: $s, startTime: $st, endTime: $et, zoneId: $z, capacity: 20 }) { id } }`,
                { s: tomorrow, st: s, et: e, z: zone.id }, CH)).data.campusCreateSlot;
            slotIds.push(slot.id);
        }
        // 4.5 waimai 渠道元数据
        await gql(ADMIN_API, `mutation($id: ID!) { updateChannel(input: { id: $id, customFields: { waimaiTags: "冒烟,测试", waimaiMonthlySales: 66, waimaiPromoText: "满20减4" } }) { ... on Channel { id } } }`,
            { id: chanIds[c.code].id }, CH);
        log('channel prepared:', c.code, 'zone=', zone.id, 'buildings=', JSON.stringify(buildings), 'slots=', slotIds.join(','));
    }

    // S4.6 渠道可见性：ShippingMethod/PaymentMethod 都是 ChannelAware，新建渠道不分配则 C 端 eligible 为空
    const sm = (await gql(ADMIN_API, `{ shippingMethods(options: { filter: { code: { eq: "campus-errand-smoke" } } }) { items { id code } } }`, null, H)).data.shippingMethods.items[0];
    const pm = (await gql(ADMIN_API, `{ paymentMethods { items { id code } } }`, null, H)).data.paymentMethods.items.find(m => m.code === 'cod-payment-template');
    if (!sm) log('WARN: ShippingMethod campus-errand-smoke 不存在（需在 admin 预建校园跑腿分区运费），C 端将无配送方式');
    if (!pm) log('WARN: PaymentMethod cod-payment-template 不存在，C 端将无支付方式');
    for (const c of CHANNELS) {
        const cid = chanIds[c.code].id;
        if (sm) await gql(ADMIN_API, `mutation($input: AssignShippingMethodsToChannelInput!) { assignShippingMethodsToChannel(input: $input) { __typename } }`,
            { input: { shippingMethodIds: [sm.id], channelId: cid } }, H);
        if (pm) await gql(ADMIN_API, `mutation($input: AssignPaymentMethodsToChannelInput!) { assignPaymentMethodsToChannel(input: $input) { __typename } }`,
            { input: { paymentMethodIds: [pm.id], channelId: cid } }, H);
    }
    log('channel assignments done (shipping=', sm?.id ?? 'none', ' payment=', pm?.id ?? 'none', ')');

    // S5 共享商品：默认渠道建，assign 双渠道（slug 全局唯一，两渠道共用同款）
    const variantIds = {};
    for (const p of PRODUCTS) {
        const found = (await gql(ADMIN_API, `{ products(options: { filter: { slug: { eq: "${p.slug}" } } }) { items { id slug variants { id price } } } }`, null, H)).data.products.items;
        let prod = found[0];
        if (!prod) {
            const r = await gql(ADMIN_API, `mutation($input: CreateProductInput!) { createProduct(input: $input) { ... on Product { id } } }`, {
                input: { translations: [{ languageCode: 'zh_Hans', name: p.name, slug: p.slug, description: '冒烟测试商品' }] },
            }, H);
            prod = (await gql(ADMIN_API, `{ products(options: { filter: { slug: { eq: "${p.slug}" } } }) { items { id slug variants { id price stockOnHand } } } }`, null, H)).data.products.items[0];
            // trackInventory=FALSE：Vendure 3.1+ 默认 MultiChannelStockLocationStrategy 按渠道分仓，
            // 库存挂在默认渠道 location 上，店铺渠道 ctx 下加购会 INSUFFICIENT_STOCK，冒烟商品直接关库存跟踪
            const pv = await gql(ADMIN_API, `mutation($input: [CreateProductVariantInput!]!) { createProductVariants(input: $input) { ... on ProductVariant { id price } } }`, {
                input: [{ productId: prod.id, sku: 'SKU-' + p.slug.toUpperCase(), price: p.price, stockOnHand: 100, trackInventory: 'FALSE', translations: [{ languageCode: 'zh_Hans', name: p.name }] }],
            }, H);
            prod.variants = pv.data.createProductVariants;
            log('product created:', p.slug, prod.id);
        } else {
            // 幂等补：历史 variant 可能 trackInventory=INHERIT 导致店铺渠道 ctx 下库存为 0
            for (const v of prod.variants) {
                await gql(ADMIN_API, `mutation($input: [UpdateProductVariantInput!]!) { updateProductVariants(input: $input) { ... on ProductVariant { id trackInventory } } }`,
                    { input: [{ id: v.id, stockOnHand: 100, trackInventory: 'FALSE' }] }, H);
            }
            log('product exists:', p.slug, prod.id);
        }
        const vids = prod.variants.map(v => v.id);
        for (const c of CHANNELS) {
            const cid = chanIds[c.code].id;
            await gql(ADMIN_API, `mutation($p: [ID!]!, $ch: ID!) { assignProductsToChannel(input: { productIds: $p, channelId: $ch }) { ... on Product { id } } }`, { p: [prod.id], ch: cid }, H);
            await gql(ADMIN_API, `mutation($v: [ID!]!, $ch: ID!) { assignProductVariantsToChannel(input: { productVariantIds: $v, channelId: $ch }) { ... on ProductVariant { id } } }`, { v: vids, ch: cid }, H);
            variantIds[c.code] = variantIds[c.code] || [];
            for (const v of prod.variants) variantIds[c.code].push({ id: v.id, price: v.price, slug: p.slug, name: p.name });
        }
    }

    log('DONE. channelIds=', JSON.stringify(chanIds), 'customerIds=', JSON.stringify(customerIds));
    log('variantIds=', JSON.stringify(variantIds));
}

main().catch(e => { console.error('[prepare][FATAL]', e.message); process.exit(1); });

