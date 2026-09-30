import { GraphQLClient } from 'graphql-request';
import { useTenantStore } from '../stores/tenant';
import { useAuthStore } from '../stores/auth';

const API_URL = (import.meta.env?.VITE_API_URL || 'http://localhost:3000') + '/shop-api';
const SESSION_TOKEN_KEY = 'vendure_session_token';
const AUTH_TOKEN_HEADER = 'vendure-auth-token';

/** 闸门兜底时长：initTenant 异常/网络卡死时，最多挂起这么久就放行，避免页面永久骨架屏 */
const TENANT_GATE_TIMEOUT_MS = 8000;

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
    return fetch(input, init).then((response) => {
        const token = response.headers.get(AUTH_TOKEN_HEADER);
        if (token) {
            setSessionToken(token);
        }
        return response;
    });
};

let clientInstance: GraphQLClient | null = null;
const inFlight = new Map<string, Promise<any>>();

/** Shop API 端点（上传等非 graphql-request 通道复用，避免各处重复拼接） */
export function getShopApiUrl(): string {
    return API_URL;
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
        setTimeout(fire, TENANT_GATE_TIMEOUT_MS);
    });
}

// 引导查询旁路深度：initTenant 内部解析渠道必须免闸门，否则与闸门互等死锁
let bypassDepth = 0;

/** 在宿主的整个 await 链内关闭闸门（引导查询专用） */
export async function withoutTenantGate<T>(fn: () => Promise<T>): Promise<T> {
    bypassDepth += 1;
    try {
        return await fn();
    } finally {
        bypassDepth -= 1;
    }
}

export interface ShopGraphQLClient {
    request<T = any>(query: any, variables?: any, ...rest: any[]): Promise<T>;
    setHeaders(headers: Record<string, string>): void;
}

/**
 * 带闸门的 client 包装。
 *
 * 闸门必须卡在「取 headers 之前」：getGraphQLClient() 是同步的，页面在 onMounted 里
 * 同步取 client、同步发起 request；graphql-request 的 headers 是 setHeaders() 那一刻
 * 被快照的 —— 若把闸门放到 customFetch 里，headers 早已是空 token，闸门形同虚设。
 */
class GatedClient implements ShopGraphQLClient {
    constructor(private inner: GraphQLClient) {}

    async request<T = any>(query: any, variables?: any, ...rest: any[]): Promise<T> {
        if (bypassDepth === 0) await waitTenantGate();
        this.inner.setHeaders(getShopApiHeaders());
        return (this.inner.request as any)(query, variables, ...rest);
    }

    setHeaders(headers: Record<string, string>) {
        this.inner.setHeaders(headers);
    }
}

export function getGraphQLClient(): ShopGraphQLClient {
    if (!clientInstance) {
        clientInstance = new GraphQLClient(API_URL, {
            fetch: customFetch as any,
            headers: {},
        });
    }
    return new GatedClient(clientInstance);
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
}
