/** 秒杀活动归一化：只保留可展示的项，过滤已结束 / 无库存 / 缺 productId 的脏数据 */

export interface FlashActivityRaw {
    id: string;
    name?: string;
    startAt?: string;
    endAt?: string;
    flashPrice?: number;
    totalStock?: number;
    soldCount?: number;
    productId?: string;
    variantId?: string;
    status?: string;
}

export interface FlashItem {
    activityId: string;
    productId: string;
    variantId: string;
    name: string;
    flashPrice: number;
    soldCount: number;
    totalStock: number;
    endAt: string;
}

/**
 * @param raw     shop-api `activeFlashSaleActivities` 原始返回
 * @param nowMs   当前时间戳（注入便于测试/复用）
 */
export function normalizeFlashActivities(raw: FlashActivityRaw[] | null | undefined, nowMs: number): FlashItem[] {
    if (!Array.isArray(raw)) return [];
    const out: FlashItem[] = [];
    for (const a of raw) {
        if (!a || !a.id || !a.productId || !a.variantId) continue;
        if (a.status && a.status !== 'active') continue;
        const end = a.endAt ? Date.parse(a.endAt) : NaN;
        if (!Number.isFinite(end) || end <= nowMs) continue;
        const total = Number(a.totalStock ?? 0);
        const sold = Number(a.soldCount ?? 0);
        if (total > 0 && sold >= total) continue;
        out.push({
            activityId: String(a.id),
            productId: String(a.productId),
            variantId: String(a.variantId),
            name: a.name || '',
            flashPrice: Number(a.flashPrice ?? 0),
            soldCount: sold,
            totalStock: total,
            endAt: a.endAt as string,
        });
    }
    return out;
}

/** 楼层/整页只挂一个计时器：取所有项里最先结束的 endAt（毫秒）；无项返回 null */
export function earliestEndAt(items: FlashItem[]): number | null {
    let min: number | null = null;
    for (const it of items) {
        const t = Date.parse(it.endAt);
        if (!Number.isFinite(t)) continue;
        if (min === null || t < min) min = t;
    }
    return min;
}

/** 剩余毫秒 → `hh:mm:ss`；不足 0 返回 `00:00:00` */
export function formatCountdown(remainMs: number): string {
    const ms = Math.max(0, remainMs);
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** 已售百分比（0..100 整数）；totalStock<=0 时返回 0 */
export function soldPercent(item: FlashItem): number {
    if (!item.totalStock || item.totalStock <= 0) return 0;
    const p = Math.round((item.soldCount / item.totalStock) * 100);
    return Math.min(100, Math.max(0, p));
}

/** 购物车行状态判定：失效（已下架/变体缺失）优先于库存预警 */
export type CartLineState = 'invalid' | 'lowStock' | 'normal';

export function cartLineState(line: any): CartLineState {
    const v = line?.productVariant;
    if (!v || v.enabled === false) return 'invalid';
    const stock = Number(v.stockLevel);
    if (Number.isFinite(stock) && stock >= 0 && stock < Number(line?.quantity ?? 0)) return 'lowStock';
    return 'normal';
}

/** 库存预警文案：仅 lowStock 时返回，如「仅剩 2 件」 */
export function lowStockText(line: any): string {
    const stock = Number(line?.productVariant?.stockLevel);
    if (!Number.isFinite(stock) || stock < 0) return '';
    return `仅剩 ${stock} 件`;
}
