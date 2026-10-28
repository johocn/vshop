/**
 * P4-4 前端埋点 + 错误上报（C 端）
 *
 * 设计约束：
 * - 上报失败绝不阻断业务：所有入口 try/catch 吞异常；
 * - 批量：内存队列 10 条或 5s 触发一次，页面切后台/卸载时尽力冲一次；
 * - 匿名可用：走 shop-api（campusTrackEvents / campusReportError），渠道头由 client 统一带；
 * - 错误限流：同一会话最多上报 10 条不同错误，避免崩溃循环刷屏（服务端再按 1 分钟去重）。
 */
import { getShopApiHeaders, getShopApiUrl } from '../api/client';

const SESSION_KEY = 'telemetry_session_id';
const MAX_QUEUE = 10;
const FLUSH_INTERVAL_MS = 5000;
const MAX_ERRORS_PER_SESSION = 10;

const TRACK_MUTATION = `mutation TrackEvents($input: CampusTrackEventBatchInput!) { campusTrackEvents(input: $input) }`;
const ERROR_MUTATION = `mutation ReportError($input: CampusErrorReportInput!) { campusReportError(input: $input) }`;

type Props = Record<string, any>;

interface QueuedEvent {
    eventName: string;
    page: string;
    sessionId: string;
    props?: string;
}

const queue: QueuedEvent[] = [];
let flushTimer: any = null;
let flushing = false;
let errorBudget = MAX_ERRORS_PER_SESSION;
let installed = false;

function sessionId(): string {
    try {
        let id = uni.getStorageSync(SESSION_KEY);
        if (!id) {
            id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
            uni.setStorageSync(SESSION_KEY, id);
        }
        return id;
    } catch {
        return 'anon';
    }
}

/** 当前页面路径（H5 与小程序通用） */
export function currentPagePath(): string {
    try {
        const pages: any[] = typeof getCurrentPages === 'function' ? (getCurrentPages() as any[]) : [];
        const cur = pages[pages.length - 1];
        const route = cur?.route || (uni as any)?.$page?.route || '';
        if (route) return `/${String(route).replace(/^\/+/, '')}`;
        // onLaunch 阶段页面栈还是空的，H5 用 location.hash 兜底，避免首条事件 page 为空
        if (typeof window !== 'undefined') {
            const hash = String(window.location?.hash || '');
            if (hash.startsWith('#/')) {
                const p = hash.slice(2).split('?')[0];
                if (p) return `/${p.replace(/^\/+/, '')}`;
            }
        }
        return '';
    } catch {
        return '';
    }
}

function headers(): Record<string, string> {
    const base = { 'Content-Type': 'application/json' };
    try {
        return { ...base, ...getShopApiHeaders() };
    } catch {
        return base;
    }
}

function schedule() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
    }, FLUSH_INTERVAL_MS);
}

/** 冲队列（尽力而为，失败丢弃，不重试以免雪崩） */
export function flush(): void {
    if (flushing || !queue.length) return;
    flushing = true;
    const batch = queue.splice(0, MAX_QUEUE);
    try {
        uni.request({
            url: getShopApiUrl(),
            method: 'POST',
            header: headers(),
            data: { query: TRACK_MUTATION, variables: { input: { events: batch } } },
            complete: () => {
                flushing = false;
                if (queue.length) schedule();
            },
        });
    } catch {
        flushing = false;
    }
}

/** 记录一个业务/页面事件（props 序列化为 JSON 字符串，服务端裁剪体积） */
export function track(eventName: string, props?: Props): void {
    try {
        if (!eventName) return;
        let payload: string | undefined;
        if (props && typeof props === 'object') {
            payload = JSON.stringify(props);
        }
        queue.push({ eventName, page: currentPagePath(), sessionId: sessionId(), props: payload });
        if (queue.length >= MAX_QUEUE) flush();
        else schedule();
    } catch {
        // 埋点失败不影响业务
    }
}

/** 页面访问埋点 */
export function pageView(path?: string): void {
    track('page_view', path ? { path } : undefined);
}

function normalizeError(err: any): { message: string; stack?: string } {
    if (err == null) return { message: 'unknown error' };
    if (typeof err === 'string') return { message: err };
    const message = String(err.message || err.reason?.message || err.name || 'unknown error').slice(0, 2000);
    const stack = err.stack ? String(err.stack).slice(0, 8000) : err.reason?.stack ? String(err.reason.stack).slice(0, 8000) : undefined;
    return { message, stack };
}

/** 上报错误（立即发送，不排队） */
export function reportError(err: any, extra?: Props): void {
    try {
        if (errorBudget <= 0) return;
        errorBudget -= 1;
        const { message, stack } = normalizeError(err);
        let url = '';
        try {
            url = typeof window !== 'undefined' ? String((window as any).location?.href || '').slice(0, 500) : '';
        } catch {
            url = '';
        }
        uni.request({
            url: getShopApiUrl(),
            method: 'POST',
            header: headers(),
            data: {
                query: ERROR_MUTATION,
                variables: {
                    input: {
                        source: 'c-end',
                        level: extra?.level === 'warn' ? 'warn' : 'error',
                        message,
                        stack,
                        page: currentPagePath(),
                        url,
                    },
                },
            },
        });
    } catch {
        // 错误上报失败静默
    }
}

/**
 * 安装全局埋点与错误捕获：App.onLaunch 调用一次。
 * 覆盖：首次页面访问、四个导航 API、H5 window 级错误 / Promise rejection、小程序 uni.onError。
 */
export function installTelemetry(): void {
    if (installed) return;
    installed = true;

    // 1) 全局未捕获异常
    if (typeof window !== 'undefined' && typeof (window as any).addEventListener === 'function') {
        (window as any).addEventListener('error', (e: any) => reportError(e?.error || e?.message));
        (window as any).addEventListener('unhandledrejection', (e: any) => reportError(e?.reason));
    }
    if (typeof (uni as any).onError === 'function') {
        (uni as any).onError((message: string, stack?: string) => reportError({ message, stack }));
    }

    // 2) 页面访问：导航完成后统一采一次（延迟让 getCurrentPages 反映目标页）
    for (const api of ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab', 'navigateBack'] as const) {
        try {
            uni.addInterceptor(api, {
                complete: () => setTimeout(() => pageView(), 60),
            });
        } catch {
            // 某些端不支持该拦截器
        }
    }
    pageView();
}

/** 仅供测试/诊断：读取当前队列长度 */
export function pendingCount(): number {
    return queue.length;
}
