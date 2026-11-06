/** 券商城出售单（仅取轮询用到的字段） */
export interface CouponSaleOrderLike {
    id: string;
    status?: string;
}

/**
 * 微信回调异步结算：短轮询确认出售单已支付。
 * 超时 / 轮询异常均返回 false，调用方不得当作支付成功（避免假成功切卡包）。
 */
export async function pollCouponSalePaid(
    fetchOrders: () => Promise<{ myCouponSaleOrders?: CouponSaleOrderLike[] } | null | undefined>,
    saleOrderId: string,
    opts: { tries?: number; intervalMs?: number } = {},
): Promise<boolean> {
    const tries = Math.max(1, opts.tries ?? 5);
    const intervalMs = opts.intervalMs ?? 1200;
    for (let i = 0; i < tries; i++) {
        if (i > 0 && intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
        try {
            const res = await fetchOrders();
            const found = (res?.myCouponSaleOrders || []).find((o) => o.id === saleOrderId);
            if (found && found.status === 'PAID') return true;
        } catch {
            // 忽略轮询异常，继续重试
        }
    }
    return false;
}
