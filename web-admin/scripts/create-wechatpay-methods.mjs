// 分端分支付方案：一键生成三个微信支付 PaymentMethod 配置项
//   wechatpay               = 小程序 JSAPI（商户A，yourbao）
//   wechatpay-yourbao-h5    = yourbao 公众号 JSAPI（商户A）
//   wechatpay-youshop-jsapi = youshop 公众号 JSAPI（商户B）
//
// 凭证填写方式（二选一）：
//   1. 直接改下方 MERCHANT_A / MERCHANT_B 常量后重跑本脚本
//   2. 跑完留空壳，去 Vendure Admin「Settings → Payment Methods」界面补密钥
//
// 幂等：已存在的方法只更新（现有非空 args 不被空值覆盖），不重复创建。

const ADMIN_API = process.env.ADMIN_API || 'https://e.joho.cn/admin-api';
const ADMIN_USER = process.env.ADMIN_USER || 'superadmin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'z123123';

// ===== 商户凭证（按需填写；留空则仅创建壳子，稍后在 Admin UI 补） =====
const MERCHANT_A = {
    appId: process.env.MCH_A_APPID || '',            // yourbao 小程序 AppID（wx 开头）
    mchId: process.env.MCH_A_MCHID || '',            // 商户A 商户号
    apiKey: process.env.MCH_A_APIKEY || '',          // APIv3 密钥（32位）
    privateKey: process.env.MCH_A_PRIVKEY || '',     // apiclient_key.pem 全文
    publicKey: process.env.MCH_A_PUBKEY || '',       // 微信平台公钥 PEM 全文
    serialNo: process.env.MCH_A_SERIAL || '',        // 证书序列号
};

const MERCHANT_B = {
    appId: process.env.MCH_B_APPID || '',            // youshop 公众号 AppID
    mchId: process.env.MCH_B_MCHID || '',
    apiKey: process.env.MCH_B_APIKEY || '',
    privateKey: process.env.MCH_B_PRIVKEY || '',
    publicKey: process.env.MCH_B_PUBKEY || '',
    serialNo: process.env.MCH_B_SERIAL || '',
};

const NOTIFY_YOURBAO = 'https://www.yourbao.cn/shop-api/wechatpay/notify';
const NOTIFY_YOUSHOP = 'https://www.youshop.cn/shop-api/wechatpay/notify';

// name 会显示在结算页支付方式列表，保持「微信支付」用户观感
const METHODS = [
    {
        code: 'wechatpay',
        name: '微信支付',
        nameEn: 'WeChat Pay',
        description: '小程序 JSAPI（商户A）',
        notifyUrl: NOTIFY_YOURBAO,
        mch: MERCHANT_A,
    },
    {
        code: 'wechatpay-yourbao-h5',
        name: '微信支付',
        nameEn: 'WeChat Pay',
        description: 'yourbao 公众号 JSAPI（商户A）',
        notifyUrl: NOTIFY_YOURBAO,
        mch: MERCHANT_A,
    },
    {
        code: 'wechatpay-youshop-jsapi',
        name: '微信支付',
        nameEn: 'WeChat Pay',
        description: 'youshop 公众号 JSAPI（商户B）',
        notifyUrl: NOTIFY_YOUSHOP,
        mch: MERCHANT_B,
    },
];

const translationsOf = (m) => ([
    { languageCode: 'zh_Hans', name: m.name, description: m.description },
    { languageCode: 'en', name: m.nameEn, description: m.description },
]);

const ARG_ORDER = ['appId', 'mchId', 'publicKey', 'privateKey', 'apiKey', 'serialNo', 'tradeType', 'notifyUrl'];

async function gql(query, variables, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(ADMIN_API, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
    });
    const newToken = res.headers.get('vendure-auth-token');
    const json = await res.json();
    if (json.errors?.length) throw new Error(JSON.stringify(json.errors));
    return { data: json.data, newToken };
}

const loginQ = `mutation Login($u: String!, $p: String!) {
  login(username: $u, password: $p) {
    ... on CurrentUser { id identifier }
    ... on InvalidCredentialsError { errorCode message }
  }
}`;

const listQ = `query {
  paymentMethods(options: { take: 100 }) {
    items { id code name enabled handler { code args { name value } } }
  }
}`;

const createQ = `mutation CreatePM($input: CreatePaymentMethodInput!) {
  createPaymentMethod(input: $input) { id code name enabled }
}`;

const updateQ = `mutation UpdatePM($input: UpdatePaymentMethodInput!) {
  updatePaymentMethod(input: $input) { id code name enabled }
}`;

// 现有非空值保留，空配置不覆盖线上已有凭证
function mergeArgs(existingArgs, mch, notifyUrl) {
    const get = (name) => existingArgs?.find(a => a.name === name)?.value || '';
    const pick = (key, argName) => mch[key] || get(argName);
    const args = {
        appId: pick('appId', 'appId'),
        mchId: pick('mchId', 'mchId'),
        publicKey: pick('publicKey', 'publicKey'),
        privateKey: pick('privateKey', 'privateKey'),
        apiKey: pick('apiKey', 'apiKey'),
        serialNo: pick('serialNo', 'serialNo'),
        tradeType: get('tradeType') || 'JSAPI',
        notifyUrl: notifyUrl,
    };
    return ARG_ORDER.filter(k => args[k]).map(name => ({ name, value: args[name] }));
}

function maskArgs(args) {
    return args.map(a => {
        const sensitive = ['privateKey', 'apiKey', 'publicKey'];
        const v = sensitive.includes(a.name)
            ? (a.value ? `<len:${a.value.length}>` : '(空)')
            : a.value;
        return `${a.name}=${v}`;
    }).join(', ');
}

const { data: ld, newToken } = await gql(loginQ, { u: ADMIN_USER, p: ADMIN_PASS });
if (!newToken) {
    console.error('登录失败:', JSON.stringify(ld));
    process.exit(1);
}
console.log('登录成功:', ld.login.identifier);

const { data: pd } = await gql(listQ, {}, newToken);
const existing = pd.paymentMethods.items;
console.log(`现有 PaymentMethod ${existing.length} 个`);

for (const m of METHODS) {
    const found = existing.find(p => p.code === m.code);
    const handler = { code: 'wechatpay', arguments: mergeArgs(found?.handler?.args, m.mch, m.notifyUrl) };
    try {
        if (found) {
            const { data } = await gql(updateQ, {
                input: { id: found.id, translations: translationsOf(m), enabled: true, handler },
            }, newToken);
            console.log(`✏️  更新 ${m.code} (id=${data.updatePaymentMethod.id})`);
        } else {
            const { data } = await gql(createQ, {
                input: { code: m.code, translations: translationsOf(m), enabled: true, handler },
            }, newToken);
            console.log(`✅ 创建 ${m.code} (id=${data.createPaymentMethod.id})`);
        }
        console.log(`   handler=wechatpay [${maskArgs(handler.arguments)}]`);
    } catch (e) {
        console.error(`❌ ${m.code} 失败:`, e.message);
    }
}
console.log('\n完成。结算页将按端显示对应方法（小程序/yourbao H5/youshop H5）。');
