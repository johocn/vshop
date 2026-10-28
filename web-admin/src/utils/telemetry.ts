/**
 * P4-4 前端埋点 + 错误上报（商家后台）
 *
 * 与 C 端同机制，差异：
 * - source 固定 admin；
 * - 只带渠道头 vendure-token，不附带后台会话 JWT（shop-api 不认 admin JWT，带了会被判 UNAUTHORIZED）；
 * - 队列 10 条 / 5s 批量，失败静默丢弃，绝不阻断后台业务。
 */
import { getChannelToken } from '../apis/session';

const MAX_QUEUE = 10;
const FLUSH_INTERVAL_MS = 5000;
const MAX_ERRORS_PER_SESSION = 10;

const TRACK_MUTATION = `mutation TrackEvents($input: CampusTrackEventBatchInput!) { campusTrackEvents(input: $input) }`;
const ERROR_MUTATION = `mutation ReportError($input: CampusErrorReportInput!) { campusReportError(input: $input) }`;

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

export function shopApiUrl(): string {
    const base = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base || origin}/shop-api`;
}

function headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
        const ch = getChannelToken();
        if (ch) h['vendure-token'] = ch;
    } catch {
        /* 渠道未就绪时仍可上报，落到默认渠道 */
    }
    return h;
}

function sessionId(): string {
    try {
        let id = uni.getStorageSync('admin_telemetry_session_id');
        if (!id) {
            id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
            uni.setStorageSync('admin_telemetry_session_id', id);
        }
        return id;
    } catch {
        return 'anon';
    }
}

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

function schedule() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
    }, FLUSH_INTERVAL_MS);
}

export function flush(): void {
    if (flushing || !queue.length) return;
    flushing = true;
    const batch = queue.splice(0, MAX_QUEUE);
    try {
        uni.request({
            url: shopApiUrl(),
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

export function track(eventName: string, props?: Record<string, any>): void {
    try {
        if (!eventName) return;
        queue.push({
            eventName,
            page: currentPagePath(),
            sessionId: sessionId(),
            props: props && typeof props === 'object' ? JSON.stringify(props) : undefined,
        });
        if (queue.length >= MAX_QUEUE) flush();
        else schedule();
    } catch {
        /* 埋点失败不影响业务 */
    }
}

export function pageView(path?: string): void {
    track('page_view', path ? { path } : undefined);
}

export function reportError(err: any, extra?: Record<string, any>): void {
    try {
        if (errorBudget <= 0) return;
        errorBudget -= 1;
        const message = String(err?.message || err?.reason?.message || err || 'unknown error').slice(0, 2000);
        const stack = err?.stack ? String(err.stack).slice(0, 8000) : undefined;
        let url = '';
        try {
            url = typeof window !== 'undefined' ? String(window.location?.href || '').slice(0, 500) : '';
        } catch {
            url = '';
        }
        uni.request({
            url: shopApiUrl(),
            method: 'POST',
            header: headers(),
            data: {
                query: ERROR_MUTATION,
                variables: {
                    input: {
                        source: 'admin',
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
        /* 静默 */
    }
}

/** 全局安装：App.onLaunch 调用一次。 */
export function installTelemetry(): void {
    if (installed) return;
    installed = true;

    if (typeof window !== 'undefined' && typeof (window as any).addEventListener === 'function') {
        (window as any).addEventListener('error', (e: any) => reportError(e?.error || e?.message));
        (window as any).addEventListener('unhandledrejection', (e: any) => reportError(e?.reason));
    }

    for (const api of ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab', 'navigateBack'] as const) {
        try {
            uni.addInterceptor(api, { complete: () => setTimeout(() => pageView(), 60) });
        } catch {
            /* 端不支持则跳过 */
        }
    }
    pageView();
}
