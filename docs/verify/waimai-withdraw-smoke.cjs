// waimai 骑手提现定向冒烟：申请→PENDING→防重拒绝→驳回退回→余额还原（不依赖配送时段，验证 F2/F3）。
// 用法: node waimai-withdraw-smoke.cjs [shop-api-base，默认 https://e.joho.cn/shop-api]
const SHOP_API = (process.argv[2] || 'https://e.joho.cn/shop-api').replace(/\/$/, '');
const ADMIN_API = SHOP_API.replace(/\/shop-api$/, '') + '/admin-api';
const DEFAULT_TOKEN = 'cnx87ezvmjx8nn3bth6c';
const RIDER_USER = { email: 'smoke-rider@yourbao.cn', password: 'Wm@Smoke123' };

function assert(step, cond, detail) {
    const ok = !!cond;
    console.log(`${ok ? 'PASS' : 'FAIL'} [${step}]${detail ? ' ' + detail : ''}`);
    if (!ok) throw new Error(`SMOKE FAILED at ${step}${detail ? ': ' + detail : ''}`);
}

async function gql(url, query, variables, headers = {}) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ query, variables: variables || {} }),
    });
    const body = await res.json();
    if (body.errors?.length) throw new Error(`gql ${body.errors[0].message}`);
    return body.data;
}

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
    const body = await res.json();
    const r = body.data?.login;
    if (!r || !r.identifier) throw new Error('native login failed: ' + JSON.stringify(r ?? body.errors));
    return res.headers.get('vendure-auth-token');
}

async function adminLogin() {
    const res = await fetch(ADMIN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `mutation { login(username: "superadmin", password: "z123123") { ... on CurrentUser { id } } }` }),
    });
    const body = await res.json();
    if (!body.data?.login?.id) throw new Error('admin login failed: ' + JSON.stringify(body.errors ?? body.data));
    return res.headers.get('vendure-auth-token');
}

async function main() {
    // W0 幂等清理：上次运行残留的 PENDING 申请先驳回退回，保证基线干净
    const token0 = await nativeLogin(RIDER_USER);
    const RH0 = { Authorization: 'Bearer ' + token0, 'vendure-token': DEFAULT_TOKEN };
    const atoken0 = await adminLogin();
    const AH0 = { Authorization: 'Bearer ' + atoken0 };
    const pending0 = await gql(SHOP_API, `{ riderWithdrawRequests(skip: 0, take: 20) { id status } }`, null, RH0)
        .then(d => d.riderWithdrawRequests.filter(r => r.status === 'PENDING'));
    for (const p of pending0) {
        await gql(ADMIN_API, `mutation($id: ID!) { rejectRiderWithdraw(id: $id, remark: "冒烟残留清理") { id status } }`, { id: p.id }, AH0);
        console.log(`[smoke] 已清理残留 PENDING id=${p.id}（驳回退回）`);
    }

    // W1 骑手登录
    const token = await nativeLogin(RIDER_USER);
    assert('W1', !!token, `骑手 ${RIDER_USER.email} 登录成功`);
    const RH = { Authorization: 'Bearer ' + token, 'vendure-token': DEFAULT_TOKEN };

    // W2 钱包基线
    const w0 = await gql(SHOP_API, `{ myRiderWallet { available frozen totalEarned } }`, null, RH).then(d => d.myRiderWallet);
    assert('W2', Number.isFinite(w0.available), `基线 available=${w0.available} frozen=${w0.frozen} earned=${w0.totalEarned}`);

    // W3 申请提现 ¥10 → PENDING + 冻结 1000 分
    const wd = await gql(SHOP_API,
        `mutation { riderWithdraw(amount: 1000, channel: "冒烟支付宝", account: "smoke@yourbao.cn") { id status amount } }`,
        null, RH);
    const req = wd.riderWithdraw;
    assert('W3', req?.status === 'PENDING' && req.amount === 1000, `申请 id=${req?.id} status=${req?.status} amount=${req?.amount}`);
    const w1 = await gql(SHOP_API, `{ myRiderWallet { available frozen totalEarned } }`, null, RH).then(d => d.myRiderWallet);
    assert('W3b', w1.frozen - w0.frozen === 1000 && w0.available - w1.available === 1000,
        `冻结后 available=${w1.available} frozen=${w1.frozen}（差值应为 1000）`);

    // W4 防重：再申请被拒（F2 串行化后防重检查仍在）
    let dupRejected = false;
    try {
        await gql(SHOP_API, `mutation { riderWithdraw(amount: 1000, channel: "冒烟支付宝", account: "smoke@yourbao.cn") { id } }`, null, RH);
    } catch (e) {
        dupRejected = String(e.message).includes('审核中的提现申请');
    }
    assert('W4', dupRejected, '已有 PENDING 时再次申请被拒');

    // W5 管理端驳回 → 退回冻结金额
    const atoken = await adminLogin();
    const AH = { Authorization: 'Bearer ' + atoken };
    const listed = await gql(ADMIN_API, `{ riderWithdrawals(status: "PENDING", skip: 0, take: 20) { id customerId amount status } }`, null, AH)
        .then(d => d.riderWithdrawals);
    const target = listed.find(r => r.id === req.id);
    assert('W5a', !!target && target.amount === 1000, `管理端可见 PENDING id=${target?.id} amount=${target?.amount}`);
    const rej = await gql(ADMIN_API, `mutation($id: ID!) { rejectRiderWithdraw(id: $id, remark: "定向冒烟驳回") { id status } }`, { id: req.id }, AH);
    assert('W5b', rej.rejectRiderWithdraw?.status === 'REJECTED', `驳回 status=${rej.rejectRiderWithdraw?.status}`);

    // W6 余额还原 + 记录终态
    const w2 = await gql(SHOP_API, `{ myRiderWallet { available frozen totalEarned } }`, null, RH).then(d => d.myRiderWallet);
    assert('W6a', w2.available === w0.available && w2.frozen === w0.frozen, `还原后 available=${w2.available} frozen=${w2.frozen}（应回基线）`);
    const hist = await gql(SHOP_API, `{ riderWithdrawRequests(skip: 0, take: 5) { id status } }`, null, RH)
        .then(d => d.riderWithdrawRequests);
    const mine = hist.find(r => r.id === req.id);
    assert('W6b', mine?.status === 'REJECTED', `申请记录终态=${mine?.status}`);

    console.log('[smoke] 提现定向冒烟全部通过（含 F2 事务串行化路径 + F3 原子认领驳回路径）');
}

main().catch(e => {
    console.error('[smoke][FATAL]', e.message);
    process.exit(1);
});
