import { GraphQLClient } from 'graphql-request';
import { useTenantStore } from '../stores/tenant';
import { useAuthStore } from '../stores/auth';
import { i18n } from '../i18n';

const API_BASE = import.meta.env?.VITE_API_URL || 'http://localhost:3000';
const API_URL = API_BASE + '/shop-api';
const SESSION_TOKEN_KEY = 'vendure_session_token';
const AUTH_TOKEN_HEADER = 'vendure-auth-token';

/** 闸门兜底时长：initTenant 异常/网络卡死时，最多挂起这么久就放行，避免页面永久骨架屏 */
const TENANT_GATE_TIMEOUT_MS = 8000;

/** 普通查询/变更超时（10–15s 区间取上限，兼顾弱网与后台慢查询） */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
/** 下单/支付类请求超时（支付链路含三方跳转与回调，需更长窗口） */
export const PAYMENT_REQUEST_TIMEOUT_MS = 20000;

/** AbortSignal.timeout 在部分小程序/旧 WebView 不可用，此时返回 undefined 由调用方降级 */
export function requestTimeoutSignal(ms: number): AbortSignal | undefined {
    try {
        return typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function'
            ? AbortSignal.timeout(ms)
            : undefined;
    } catch {
        return undefined;
    }
}

function isTimeoutError(err: any): boolean {
    const name = err?.name;
    return name === 'TimeoutError' || name === 'AbortError';
}

// ─────────────────────────────────────────────────────────────
// 登录态失效统一分流
//
// shop-api 未登录/会话过期时 HTTP 仍为 200，错误码在 errors[].extensions.code
// （本 fork 无会话与权限不足均可能返回 FORBIDDEN）。处理策略与 web-admin client 一致：
// UNAUTHORIZED 直接判失效；FORBIDDEN 先用 me 探测，避免把「已登录但权限不足」误判为掉线。
// handlingUnauthenticated 作去重闸：并发请求同时失败时只跳一次登录页。
// ─────────────────────────────────────────────────────────────

/** 登录页路径；跳转后在此路径上不再重复触发，避免回跳循环 */
const LOGIN_PAGE_PATH = '/pages/login/index';
/** 去重闸抑制窗口：覆盖 reLaunch 完成与页面首屏请求 */
const UNAUTH_SUPPRESS_MS = 3000;
/** me 探测窗口：网络异常时不误杀会话 */
const SESSION_PROBE_TIMEOUT_MS = 8000;

let handlingUnauthenticated = false;
let probingSession = false;

/** 当前页面路径（H5 hash 路由优先，回退 getCurrentPages） */
function currentRoute(): string {
    // #ifdef H5
    try {
        const hash = window.location.hash || '';
        if (hash) return hash.replace(/^#/, '');
    } catch {}
    // #endif
    try {
        const pages = getCurrentPages();
        const cur: any = pages[pages.length - 1];
        if (cur?.route) {
            const query = cur?.options
                ? Object.keys(cur.options)
                      .map((k) => `${k}=${cur.options[k]}`)
                      .join('&')
                : '';
            return '/' + cur.route + (query ? '?' + query : '');
        }
    } catch {}
    return '';
}

function redirectToLogin() {
    const route = currentRoute();
    if (!route || route.startsWith(LOGIN_PAGE_PATH)) return;
    uni.reLaunch({ url: `${LOGIN_PAGE_PATH}?redirect=${encodeURIComponent(route)}` });
}

/** 会话确认失效：清 token + 登出 + 跳登录（只执行一次） */
function handleUnauthenticated() {
    if (handlingUnauthenticated) return;
    handlingUnauthenticated = true;
    setSessionToken('');
    try {
        useAuthStore().logout();
    } catch { /* store 尚未就绪时忽略，token 已清 */ }
    redirectToLogin();
    setTimeout(() => {
        handlingUnauthenticated = false;
    }, UNAUTH_SUPPRESS_MS);
}

/** FORBIDDEN 探测：me 仅需 Authenticated，有会话但权限不足时不会误杀 */
async function probeSessionThenLogout(): Promise<void> {
    if (probingSession || handlingUnauthenticated) return;
    probingSession = true;
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getShopApiHeaders() },
            body: JSON.stringify({ query: 'query { me { id } }' }),
            signal: requestTimeoutSignal(SESSION_PROBE_TIMEOUT_MS),
        });
        const body = await res.json();
        const code = body?.errors?.[0]?.extensions?.code;
        // 无效 token 下 me 可能返回 data.me=null（无 error）或 FORBIDDEN 两种形态
        if (!body?.data?.me || code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
            handleUnauthenticated();
        }
    } catch { /* 网络异常不误杀会话 */ } finally {
        probingSession = false;
    }
}

/** 从响应体识别登录态失效错误码（body 已被消费，调用方需传 clone） */
function inspectAuthErrors(body: any) {
    const codes: string[] = (body?.errors || []).map((e: any) => e?.extensions?.code);
    if (codes.includes('UNAUTHORIZED')) {
        handleUnauthenticated();
    } else if (codes.includes('FORBIDDEN')) {
        void probeSessionThenLogout();
    }
}

export function getSessionToken(): string {
    return uni.getStorageSync(SESSION_TOKEN_KEY) || '';
}

export function setSessionToken(token: string) {
    if (token) {
        uni.setStorageSync(SESSION_TOKEN_KEY, token);
    } else {
        uni.removeStorageSync(SESSION_TOKEN_KEY);
    }
}

// Capture session token from vendure-auth-token response header
const customFetch: typeof fetch = (input, init) => {
    // 调用方显式传入 signal（如支付 20s）优先；否则套用默认超时，避免请求永久挂起
    const signal = init?.signal ?? requestTimeoutSignal(DEFAULT_REQUEST_TIMEOUT_MS);
    return fetch(input, { ...init, signal })
        .then(async (response) => {
            const token = response.headers.get(AUTH_TOKEN_HEADER);
            if (token) {
                setSessionToken(token);
            }
            if (response.status === 401) {
                handleUnauthenticated();
                return response;
            }
            // Vendure 未认证时 HTTP 仍为 200：必须看 errors[].extensions.code
            try {
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    inspectAuthErrors(await response.clone().json());
                }
            } catch { /* 非 JSON / 空响应忽略 */ }
            return response;
        })
        .catch((err) => {
            if (isTimeoutError(err)) {
                throw new Error('请求超时，请检查网络后重试');
            }
            throw err;
        });
};

let clientInstance: GraphQLClient | null = null;
const inFlight = new Map<string, Promise<any>>();

/** Shop API 端点（上传等非 graphql-request 通道复用，避免各处重复拼接） */
export function getShopApiUrl(): string {
    return API_URL;
}

/** 后端 origin（发票 PDF 下载、支付跳转等非 /shop-api 路径复用） */
export function getApiBase(): string {
    return API_BASE;
}

/** 当前租户 + 会话的请求头（graphql-request 与 uni.uploadFile 共用） */
export function getShopApiHeaders(): Record<string, string> {
    const tenantStore = useTenantStore();
    const authStore = useAuthStore();
    const headers: Record<string, string> = {
        'vendure-token': tenantStore.token,
    };
    if (authStore.token) {
        headers['Authorization'] = 'Bearer ' + authStore.token;
    } else {
        const sessionToken = getSessionToken();
        if (sessionToken) {
            headers['Authorization'] = 'Bearer ' + sessionToken;
        }
    }
    return headers;
}

// ─────────────────────────────────────────────────────────────
// 租户就绪闸门
//
// 背景：App.vue 的 onLaunch 是 async，而 uni-app 不会等 onLaunch 结束才挂载页面。
// 入口页 onMounted 取数时 tenantStore.token 仍为 ''，而 Vendure 收到空 vendure-token
// 会静默落到默认渠道 —— 于是每个租户都看到了默认渠道的全部商品。
//
// 约定：闸门 = 「渠道 token 已就绪」，与 tenantReady（整体初始化完成）解耦，
// 这样 restoreSession() 走闸门时不会与「tenantReady 在 restoreSession 之后才置位」互等。
// ─────────────────────────────────────────────────────────────

let gateOpen = false;
const gateWaiters: Array<() => void> = [];

/** 由 App.onLaunch 在 initTenant() 完成后调用；只开一次，可重复调用 */
export function openTenantGate() {
    if (gateOpen) return;
    gateOpen = true;
    gateWaiters.splice(0).forEach((fire) => fire());
}

/** 业务请求闸门：token 未就绪时挂起，≤8s 兜底放行（避免骨架屏永久卡死） */
export function waitTenantGate(): Promise<void> {
    if (gateOpen) return Promise.resolve();
    return new Promise<void>((resolve) => {
        let done = false;
        const fire = () => {
            if (done) return;
            done = true;
            const i = gateWaiters.indexOf(fire);
            if (i >= 0) gateWaiters.splice(i, 1);
            resolve();
        };
        gateWaiters.push(fire);
        setTimeout(() => {
            fire();
            // 超时放行意味着请求将带着空 vendure-token 落到默认渠道：
            // 必须明确提示，不能静默让用户看到默认店铺的商品与价格。
            try {
                uni.showToast({
                    title: i18n.global.t('common.tenantTimeout'),
                    icon: 'none',
                    duration: 3000,
                });
            } catch { /* 非 UI 环境忽略 */ }
        }, TENANT_GATE_TIMEOUT_MS);
    });
}

// 引导查询旁路：initTenant 内部解析渠道时必须免闸门，否则与闸门互等死锁。
//
// ⚠️ 这里**不能**用「全局 bypass 开关 / 深度计数」实现：入口页恰好是在 initTenant
// 进行期间挂载的，任何以「时间窗口」为界的旁路都会把入口页的请求一并放过去。
// 改为按**请求来源**区分 —— 引导查询走独立的免闸门 client 实例。
let bootstrapInstance: GraphQLClient | null = null;

export interface ShopGraphQLClient {
    request<T = any>(query: any, variables?: any, ...rest: any[]): Promise<T>;
    setHeaders(headers: Record<string, string>): void;
}

function createInnerClient(): GraphQLClient {
    return new GraphQLClient(API_URL, {
        fetch: customFetch as any,
        headers: {},
    });
}

/**
 * 带闸门的 client 包装。
 *
 * 闸门必须卡在「取 headers 之前」：getGraphQLClient() 是同步的，页面在 onMounted 里
 * 同步取 client、同步发起 request；graphql-request 的 headers 是 setHeaders() 那一刻
 * 被快照的 —— 若把闸门放到 customFetch 里，headers 早已是空 token，闸门形同虚设。
 */
class ShopClient implements ShopGraphQLClient {
    constructor(private inner: GraphQLClient, private gated: boolean) {}

    async request<T = any>(query: any, variables?: any, ...rest: any[]): Promise<T> {
        if (this.gated) await waitTenantGate();
        this.inner.setHeaders(getShopApiHeaders());
        try {
            return await (this.inner.request as any)(query, variables, ...rest);
        } catch (e: any) {
            // graphql-request 抛出的 ClientError 自带 response.errors；这是最可靠的分流点
            // （不依赖 fetch 层对响应体 clone/json 的兼容性）。
            inspectAuthErrors(e?.response);
            throw e;
        }
    }

    setHeaders(headers: Record<string, string>) {
        this.inner.setHeaders(headers);
    }
}

/** 业务请求入口：租户 token 未就绪前一律挂起 */
export function getGraphQLClient(): ShopGraphQLClient {
    if (!clientInstance) clientInstance = createInnerClient();
    return new ShopClient(clientInstance, true);
}

/** 引导查询入口（免闸门）：仅限解析渠道本身，见上方说明 */
export function getBootstrapClient(): ShopGraphQLClient {
    if (!bootstrapInstance) bootstrapInstance = createInnerClient();
    return new ShopClient(bootstrapInstance, false);
}

/** Deduplicate identical in-flight requests */
export function deduped<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (inFlight.has(key)) return inFlight.get(key) as Promise<T>;
    const promise = fn().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
}

/** Reset client (e.g. after tenant switch) */
export function resetClient() {
    clientInstance = null;
    bootstrapInstance = null;
}
