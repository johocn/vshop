// waimai 全链路冒烟：点单→支付→抢单→接力交接→送达→分成入账→转单回大厅。
// 用法: node waimai-e2e-smoke.cjs [shop-api-base，默认 https://e.joho.cn/shop-api]
const SHOP_API = (process.argv[2] || 'https://e.joho.cn/shop-api').replace(/\/$/, '');
const ADMIN_API = SHOP_API.replace(/\/shop-api$/, '') + '/admin-api';
const DEFAULT_TOKEN = 'cnx87ezvmjx8nn3bth6c';
const CHANNEL_A_TOKEN = 'canteen-a-token';
const CHANNEL_B_TOKEN = 'canteen-b-token';
const ORDER_USER = { email: 'smoke-order@yourbao.cn', password: 'Wm@Smoke123' };
const RIDER_USER = { email: 'smoke-rider@yourbao.cn', password: 'Wm@Smoke123' };

const results = [];
function assert(step, cond, detail) {
    const ok = !!cond;
    results.push({ step, ok, detail: detail ?? '' });
    console.log(`${ok ? 'PASS' : 'FAIL'} [${step}]${detail ? ' ' + detail : ''}`);
    if (!ok) throw new Error(`SMOKE FAILED at ${step}${detail ? ': ' + detail : ''}`);
}

/** 响应必须是 JSON：HTML（网关错误页/301/SPA 回退/nginx 缺 location）给出含 URL+status+body 摘要的可诊断报错 */
async function jsonOrThrow(res, url) {
    const text = await res.text();
    const ct = res.headers.get('content-type') || '';
    const snippet = text.replace(/\s+/g, ' ').slice(0, 120);
    if (!ct.includes('json') && !/^\s*[[{]/.test(text)) {
        throw new Error(`非 JSON 响应 HTTP ${res.status}（${ct || '无 content-type'}）来自 ${url} —— 检查基址/网关/反代 location；body: ${snippet}`);
    }
    try { return JSON.parse(text); }
    catch { throw new Error(`JSON 解析失败 HTTP ${res.status} 来自 ${url}；body: ${snippet}`); }
}

async function gql(url, query, variables, headers = {}) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ query, variables: variables || {} }),
    });
    const body = await jsonOrThrow(res, url);
    if (body.errors?.length) throw new Error(`gql ${body.errors[0].message}`);
    return body.data;
}

/** native 登录，返回 session token */
async function nativeLogin(user) {
    const res = await fetch(SHOP_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'vendure-token': DEFAULT_TOKEN },
        body: JSON.stringify({
            query: `mutation { login(username: "${user.email}", password: "${user.password}") {
                ... on CurrentUser { id identifier }
                ... on InvalidCredentialsError { message }
                ... on NotVerifiedError { message }
            } }`,
        }),
    });
    const body = await jsonOrThrow(res, SHOP_API);
    const r = body.data?.login;
    if (!r || !r.identifier) throw new Error('native login failed: ' + JSON.stringify(r ?? body.errors));
    return res.headers.get('vendure-auth-token');
}

/** admin 登录，返回 session token（gql() 不返回响应头，admin 登录单独走 fetch） */
async function adminLogin() {
    const res = await fetch(ADMIN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `mutation { login(username: "superadmin", password: "z123123") { ... on CurrentUser { id } } }` }),
    });
    const body = await jsonOrThrow(res, ADMIN_API);
    if (!body.data?.login?.id) throw new Error('admin login failed: ' + JSON.stringify(body.errors ?? body.data));
    return res.headers.get('vendure-auth-token');
}

async function main() {
    const log = (...a) => console.log('[smoke]', ...a);

    // S1 店铺列表
    const s1 = await gql(SHOP_API, `{ waimaiStoreList { channelId channelToken name promoText paused } }`, null, { 'vendure-token': DEFAULT_TOKEN });
    const stores = s1.waimaiStoreList ?? [];
    const withPromo = stores.filter(s => s.promoText);
    assert('S1', stores.length >= 2 && withPromo.length >= 2, `店铺数=${stores.length}, 含 promoText=${withPromo.length}（waimaiStoreList 已过滤默认渠道）`);

    // S2 下单者登录
    const orderToken = await nativeLogin(ORDER_USER);
    assert('S2', !!orderToken, `下单者 ${ORDER_USER.email} 登录成功`);
    const OH = { Authorization: 'Bearer ' + orderToken };

    // S3 店铺 A 加购（按冒烟 slug 取商品；先清残留 activeOrder 保证可重复执行）
    const AH = { ...OH, 'vendure-token': CHANNEL_A_TOKEN };
    const at = await adminLogin();
    // 起送价硬校验（二期）会拦小额冒烟单：临时调低 A/B 店起送价至 100 分，进程退出前还原原值
    const ADMH = { Authorization: 'Bearer ' + at };
    const cfgList = (await gql(ADMIN_API, `{ campusStoreConfigs { channelId channelToken routesEnabled deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice errandBaseFee } }`, null, ADMH)).campusStoreConfigs;
    const updCfg = (c, min) => gql(ADMIN_API, `mutation($ch: ID!, $input: CampusStoreConfigInput!) { campusUpdateStoreConfig(channelId: $ch, input: $input) { channelId minOrderAmount } }`,
        { ch: String(c.channelId), input: { routesEnabled: c.routesEnabled, deliveryMinutes: c.deliveryMinutes, minOrderAmount: min, deliveryFee: c.deliveryFee, storeAddress: c.storeAddress, storePhone: c.storePhone, storeNotice: c.storeNotice, errandBaseFee: c.errandBaseFee } }, ADMH);
    const smokeCfgs = cfgList.filter(c => [CHANNEL_A_TOKEN, CHANNEL_B_TOKEN].includes(c.channelToken));
    globalThis.__restoreCfg = async () => { for (const c of smokeCfgs) await updCfg(c, c.minOrderAmount); };
    for (const c of smokeCfgs) await updCfg(c, 100);
    log(`临时调低 A/B 店起送价→100分（原值 ${smokeCfgs.map(c => c.minOrderAmount).join('/')}），结束还原`);
    const pre = await gql(SHOP_API, `{ activeOrder { id state lines { id } } }`, null, AH);
    if (pre.activeOrder && pre.activeOrder.state !== 'AddingItems') {
        // 已锁定单（上轮支付过）：admin cancelOrder 释放，再回到空购物车
        await gql(ADMIN_API, `mutation($id: ID!) { cancelOrder(id: $id) { ... on Order { id state } ... on ErrorResult { errorCode message } } }`,
            { id: pre.activeOrder.id }, { Authorization: 'Bearer ' + at, 'vendure-token': CHANNEL_A_TOKEN });
    }
    for (const l of pre.activeOrder?.lines ?? []) {
        await gql(SHOP_API, `mutation($id: ID!) { removeOrderLine(orderLineId: $id) { ... on Order { id } ... on ErrorResult { errorCode message } } }`, { id: l.id }, AH);
    }
    const prod = await gql(SHOP_API, `{ products(options: { filter: { slug: { eq: "smoke-cola-chicken" } } }) { items { id name variants { id name priceWithTax } } } }`, null, AH);
    const item = prod.products.items[0]?.variants[0];
    assert('S3-pre', !!item?.id, `店铺A冒烟商品 variant=${item?.id} price=${item?.priceWithTax}`);
    const add = await gql(SHOP_API, `mutation($v: ID!, $q: Int!) { addItemToOrder(productVariantId: $v, quantity: $q) { ... on Order { id code total lines { quantity linePriceWithTax } } ... on ErrorResult { errorCode message } } }`,
        { v: item.id, q: 1 }, AH);
    if (add.addItemToOrder.errorCode) throw new Error(`addItemToOrder: ${add.addItemToOrder.errorCode} ${add.addItemToOrder.message}`);
    const ao = await gql(SHOP_API, `{ activeOrder { id code total state } }`, null, AH);
    const orderId = ao.activeOrder.id;
    const orderCode = ao.activeOrder.code;
    assert('S3', !!orderId && ao.activeOrder.total > 0, `加购下单 orderId=${orderId} code=${orderCode} total=${ao.activeOrder.total}`);

    // S4 设置配送目标（R3 直送 + 时段）
    const zones = (await gql(SHOP_API, `{ campusZones { id name } }`, null, AH)).campusZones;
    const buildings = (await gql(SHOP_API, `{ campusBuildings(zoneId: "${zones[0].id}") { id name } }`, null, AH)).campusBuildings;
    const slots = (await gql(SHOP_API, `{ campusShopSlots { id slotDate capacity lockedCount active } }`, null, AH)).campusShopSlots
        .filter(s => s.active && s.capacity > s.lockedCount);
    const slot = slots[0];
    const target = await gql(SHOP_API, `mutation($z: ID!, $b: ID!, $r: String, $s: Int) { campusSetDeliveryTarget(zoneId: $z, buildingId: $b, route: $r, slotId: $s) {
        id customFields { buildingId campusZone fulfillmentRoute deliverySlotId deliverySlotText } } }`,
        { z: zones[0].id, b: buildings[0].id, r: 'R3', s: Number(slot.id) }, AH);
    const cf = target.campusSetDeliveryTarget.customFields;
    assert('S4', cf.buildingId === String(buildings[0].id) && cf.campusZone === zones[0].name && cf.fulfillmentRoute === 'R3' && !!cf.deliverySlotId,
        `zone=${cf.campusZone} building=${cf.buildingId} route=${cf.fulfillmentRoute} slot=${cf.deliverySlotText}`);

    // S4b 设置 campus-errand 运费方式（fulfillmentRoute 写入后 calculator 才对该单出价）
    const elig = (await gql(SHOP_API, `{ eligibleShippingMethods { id name code price } }`, null, AH)).eligibleShippingMethods;
    const campusMethod = elig.find(m => m.code?.startsWith('campus-errand'));
    assert('S4b', !!campusMethod, `eligible=[${elig.map(m => m.code).join(',')}] 选中=${campusMethod?.code} 运费=${campusMethod?.price}`);
    await gql(SHOP_API, `mutation($ids: [ID!]!) { setOrderShippingMethod(shippingMethodId: $ids) { ... on Order { id shippingLines { priceWithTax } } ... on ErrorResult { errorCode message } } }`,
        { ids: [campusMethod.id] }, AH);

    // S5 模拟支付：admin 推 ArrangingPayment → shop addPaymentToOrder（COD 授权）→ admin 推 PaymentSettled
    const AHADMIN = { Authorization: 'Bearer ' + at, 'vendure-token': CHANNEL_A_TOKEN };
    const t1 = await gql(ADMIN_API, `mutation($id: ID!) { transitionOrderToState(id: $id, state: "ArrangingPayment") { ... on Order { id state } ... on OrderStateTransitionError { errorCode message } } }`, { id: orderId }, AHADMIN);
    if (t1.transitionOrderToState.errorCode) throw new Error(`transition ArrangingPayment: ${t1.transitionOrderToState.message}`);
    const payElig = (await gql(SHOP_API, `{ eligiblePaymentMethods { code isEligible } }`, null, AH)).eligiblePaymentMethods.filter(p => p.isEligible);
    assert('S5-a', payElig.length > 0, `eligible 支付方式=[${payElig.map(p => p.code).join(',')}]`);
    const payRes = await gql(SHOP_API, `mutation($m: String!) { addPaymentToOrder(input: { method: $m, metadata: {} }) { ... on Order { id state total } ... on ErrorResult { errorCode message } } }`, { m: payElig[0].code }, AH);
    if (payRes.addPaymentToOrder.errorCode) throw new Error(`addPaymentToOrder: ${payRes.addPaymentToOrder.errorCode} ${payRes.addPaymentToOrder.message}`);
    assert('S5-b', payRes.addPaymentToOrder.state === 'PaymentAuthorized', `支付后 state=${payRes.addPaymentToOrder.state} total=${payRes.addPaymentToOrder.total}`);
    // COD 授权不自动结算：admin settlePayment（core 在全额结算后自动把 order 推到 PaymentSettled）
    const pm = await gql(ADMIN_API, `query($id: ID!) { order(id: $id) { payments { id state } } }`, { id: orderId }, AHADMIN);
    const payId = (pm.order?.payments || []).find(p => p.state === 'Authorized')?.id;
    if (!payId) throw new Error('no Authorized payment found');
    const settled = await gql(ADMIN_API, `mutation($id: ID!) { settlePayment(id: $id) { ... on Payment { id state } ... on ErrorResult { errorCode message } } }`, { id: payId }, AHADMIN);
    if (settled.settlePayment.errorCode) throw new Error(`settlePayment: ${settled.settlePayment.errorCode} ${settled.settlePayment.message}`);
    const paidState = (await gql(SHOP_API, `{ order(id: "${orderId}") { state } }`, null, AH)).order.state;
    assert('S5-pre', paidState === 'PaymentSettled', `结算后 state=${paidState}`);
    const paid = await gql(SHOP_API, `{ order(id: "${orderId}") { state customFields { hallStatus hallEnteredAt } } }`, null, AH);
    const locked = (await gql(ADMIN_API, `{ campusSlots { id lockedCount } }`, null, AHADMIN)).campusSlots.find(s => s.id === slot.id);
    // F14 适配：订单在 scheduledFor 前 30min 才放量进厅（dispatch-job）；所选时段在窗口外时
    // hallStatus=scheduled 属预期，S6-S8 调度流（大厅/抢单/送达/转单）无从执行，降级跳过。
    // 时段窗口内重跑可覆盖全链路（如清晨首个时段）。提现链路由 waimai-withdraw-smoke.cjs 独立覆盖。
    const inWindow = paid.order.customFields.hallStatus === 'open';
    assert('S5', inWindow ? locked.lockedCount >= 1 : paid.order.customFields.hallStatus === 'scheduled',
        `hallStatus=${paid.order.customFields.hallStatus} slot lockedCount=${locked.lockedCount}`);
    if (!inWindow) {
        console.log(`[smoke] F14 适配：时段 ${cf.deliverySlotText} 在 30min 进厅窗口外，S6-S8 调度流跳过（窗口内重跑可全链路）`);
        console.log('E2E SMOKE PASS (partial S1-S5, 调度流因时段窗口跳过)');
        return;
    }

    // S6 骑手：登录→大厅含单→抢单→开始取货→送达
    const riderToken = await nativeLogin(RIDER_USER);
    const RH_A = { Authorization: 'Bearer ' + riderToken, 'vendure-token': CHANNEL_A_TOKEN };
    const hall = (await gql(SHOP_API, `{ campusHall { id code customFields { hallStatus } } }`, null, RH_A)).campusHall;
    assert('S6a', hall.some(o => o.id === orderId), `大厅单数=${hall.length} 含目标单=${hall.some(o => o.id === orderId)}`);
    await gql(SHOP_API, `mutation($id: ID!) { campusGrabOrder(orderId: $id) { id customFields { deliveryStatus } } }`, { id: orderId }, RH_A);
    // 骑手 token 查不到他人 order(id)，任务状态一律走骑手视角 campusMyTasks
    const grabTask = (await gql(SHOP_API, `{ campusMyTasks { id customFields { hallStatus deliveryStatus } } }`, null, RH_A)).campusMyTasks.find(o => o.id === orderId);
    assert('S6b', grabTask?.customFields.hallStatus === 'grabbed' && grabTask?.customFields.deliveryStatus === 'assigned', `grab 后 hallStatus=${grabTask?.customFields.hallStatus} deliveryStatus=${grabTask?.customFields.deliveryStatus}`);
    await gql(SHOP_API, `mutation($id: ID!) { campusStartTask(orderId: $id) { id } }`, { id: orderId }, RH_A);
    const startTask = (await gql(SHOP_API, `{ campusMyTasks { id customFields { deliveryStatus } } }`, null, RH_A)).campusMyTasks.find(o => o.id === orderId);
    assert('S6c', startTask?.customFields.deliveryStatus === 'in_progress', `start 后 deliveryStatus=${startTask?.customFields.deliveryStatus}`);
    await gql(SHOP_API, `mutation($id: ID!) { campusDeliverTask(orderId: $id, photos: ["/assets/smoke-verify.webp"], note: "冒烟送达") { id } }`, { id: orderId }, RH_A);
    const deliverTask = (await gql(SHOP_API, `{ campusMyTasks { id customFields { deliveryStatus riderEarning } state } }`, null, RH_A)).campusMyTasks.find(o => o.id === orderId);
    assert('S6d', deliverTask?.customFields.deliveryStatus === 'delivered', `deliver 后 deliveryStatus=${deliverTask?.customFields.deliveryStatus} earning=${deliverTask?.customFields.riderEarning}`);

    // S7 分成流水 + 学生侧骑手卡
    const earnings = (await gql(SHOP_API, `{ myRiderEarnings(skip: 0, take: 10) { id orderId amount tip status } }`, null, RH_A)).myRiderEarnings;
    const mine = earnings.find(e => String(e.orderId) === String(orderId));
    assert('S7a', !!mine && mine.status === 'credited', `流水 earning=${JSON.stringify(mine)}`);
    const riderCard = await gql(SHOP_API, `{ campusOrderRider(orderId: "${orderId}") { realName credit } }`, null, AH);
    assert('S7b', !!riderCard.campusOrderRider && riderCard.campusOrderRider.credit != null, `骑手卡=${JSON.stringify(riderCard.campusOrderRider)}`);

    // S8 转单链路：店铺 B 再下一单 → 骑手接单 → 未取货转单 → 回大厅
    const BH = { ...OH, 'vendure-token': CHANNEL_B_TOKEN };
    const preB = await gql(SHOP_API, `{ activeOrder { id state lines { id } } }`, null, BH);
    if (preB.activeOrder && preB.activeOrder.state !== 'AddingItems') {
        await gql(ADMIN_API, `mutation($id: ID!) { cancelOrder(id: $id) { ... on Order { id state } ... on ErrorResult { errorCode message } } }`,
            { id: preB.activeOrder.id }, { Authorization: 'Bearer ' + at, 'vendure-token': CHANNEL_B_TOKEN });
    }
    for (const l of preB.activeOrder?.lines ?? []) {
        await gql(SHOP_API, `mutation($id: ID!) { removeOrderLine(orderLineId: $id) { ... on Order { id } ... on ErrorResult { errorCode message } } }`, { id: l.id }, BH);
    }
    const prodB = await gql(SHOP_API, `{ products(options: { filter: { slug: { eq: "smoke-spicy-noodle" } } }) { items { id name variants { id } } } }`, null, BH);
    const addB = await gql(SHOP_API, `mutation($v: ID!, $q: Int!) { addItemToOrder(productVariantId: $v, quantity: $q) { ... on Order { id total } ... on ErrorResult { errorCode message } } }`,
        { v: prodB.products.items[0].variants[0].id, q: 1 }, BH);
    if (addB.addItemToOrder.errorCode) throw new Error(`addItemToOrder B: ${addB.addItemToOrder.errorCode} ${addB.addItemToOrder.message}`);
    const aoB = await gql(SHOP_API, `{ activeOrder { id code } }`, null, BH);
    const orderIdB = aoB.activeOrder.id;
    const zonesB = (await gql(SHOP_API, `{ campusZones { id name } }`, null, BH)).campusZones;
    const buildingsB = (await gql(SHOP_API, `{ campusBuildings(zoneId: "${zonesB[0].id}") { id name } }`, null, BH)).campusBuildings;
    await gql(SHOP_API, `mutation($z: ID!, $b: ID!, $r: String) { campusSetDeliveryTarget(zoneId: $z, buildingId: $b, route: $r) {
        id customFields { buildingId campusZone fulfillmentRoute } } }`,
        { z: zonesB[0].id, b: buildingsB[0].id, r: 'R3' }, BH);
    const eligB = (await gql(SHOP_API, `{ eligibleShippingMethods { id code } }`, null, BH)).eligibleShippingMethods;
    const campusMethodB = eligB.find(m => m.code?.startsWith('campus-errand'));
    assert('S8-pre', !!campusMethodB, `B店 eligible=[${eligB.map(m => m.code).join(',')}]`);
    await gql(SHOP_API, `mutation($ids: [ID!]!) { setOrderShippingMethod(shippingMethodId: $ids) { ... on Order { id } ... on ErrorResult { errorCode message } } }`,
        { ids: [campusMethodB.id] }, BH);
    const BHADMIN = { Authorization: 'Bearer ' + at, 'vendure-token': CHANNEL_B_TOKEN };
    const tB = await gql(ADMIN_API, `mutation($id: ID!) { transitionOrderToState(id: $id, state: "ArrangingPayment") { ... on Order { id state } ... on OrderStateTransitionError { errorCode message } } }`, { id: orderIdB }, BHADMIN);
    if (tB.transitionOrderToState.errorCode) throw new Error(`B transition ArrangingPayment: ${tB.transitionOrderToState.message}`);
    const payEligB = (await gql(SHOP_API, `{ eligiblePaymentMethods { code isEligible } }`, null, BH)).eligiblePaymentMethods.filter(p => p.isEligible);
    if (!payEligB.length) throw new Error('B 店无 eligible 支付方式');
    const payB = await gql(SHOP_API, `mutation($m: String!) { addPaymentToOrder(input: { method: $m, metadata: {} }) { ... on Order { id state } ... on ErrorResult { errorCode message } } }`, { m: payEligB[0].code }, BH);
    if (payB.addPaymentToOrder.errorCode) throw new Error(`B addPaymentToOrder: ${payB.addPaymentToOrder.errorCode} ${payB.addPaymentToOrder.message}`);
    const pmB = await gql(ADMIN_API, `query($id: ID!) { order(id: $id) { payments { id state } } }`, { id: orderIdB }, BHADMIN);
    const payIdB = (pmB.order?.payments || []).find(p => p.state === 'Authorized')?.id;
    if (!payIdB) throw new Error('B no Authorized payment found');
    const settledB = await gql(ADMIN_API, `mutation($id: ID!) { settlePayment(id: $id) { ... on Payment { id state } ... on ErrorResult { errorCode message } } }`, { id: payIdB }, BHADMIN);
    if (settledB.settlePayment.errorCode) throw new Error(`B settlePayment: ${settledB.settlePayment.errorCode} ${settledB.settlePayment.message}`);
    const RH_B = { Authorization: 'Bearer ' + riderToken, 'vendure-token': CHANNEL_B_TOKEN };
    const hallB = (await gql(SHOP_API, `{ campusHall { id } }`, null, RH_B)).campusHall;
    assert('S8a', hallB.some(o => o.id === orderIdB), `B店大厅含新单 orderId=${orderIdB}`);
    await gql(SHOP_API, `mutation($id: ID!) { campusGrabOrder(orderId: $id) { id } }`, { id: orderIdB }, RH_B);
    await gql(SHOP_API, `mutation($id: ID!) { campusTransferTask(orderId: $id, photos: [], note: "冒烟转单") { id } }`, { id: orderIdB }, RH_B);
    const myTasksB = (await gql(SHOP_API, `{ campusMyTasks { id } }`, null, RH_B)).campusMyTasks;
    const gone = !myTasksB.some(o => o.id === orderIdB);
    const hallB2 = (await gql(SHOP_API, `{ campusHall { id } }`, null, RH_B)).campusHall;
    assert('S8', gone && hallB2.some(o => o.id === orderIdB),
        `转单后任务列表已移除=${gone} 单回大厅=${hallB2.some(o => o.id === orderIdB)}`);

    console.log('E2E SMOKE PASS');
}

main()
    .catch(e => { console.error('[smoke][FATAL]', e.message); process.exitCode = 1; })
    .finally(async () => {
        if (globalThis.__restoreCfg) {
            try { await globalThis.__restoreCfg(); console.log('[smoke] 起送价配置已还原'); }
            catch (e) { console.error('[smoke][restore failed] 需人工还原 campusStoreConfigs.minOrderAmount:', e.message); }
        }
    });
