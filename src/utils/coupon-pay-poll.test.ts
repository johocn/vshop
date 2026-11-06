import { describe, expect, it, vi } from 'vitest';
import { pollCouponSalePaid } from './coupon-pay-poll';

describe('pollCouponSalePaid', () => {
    it('一直 PENDING：超时返回 false（调用方不得当成功）', async () => {
        const fetchOrders = vi.fn(async () => ({ myCouponSaleOrders: [{ id: 'o1', status: 'PENDING' }] }));
        await expect(pollCouponSalePaid(fetchOrders, 'o1', { tries: 3, intervalMs: 0 })).resolves.toBe(false);
        expect(fetchOrders).toHaveBeenCalledTimes(3);
    });

    it('轮询中途变 PAID：返回 true', async () => {
        let calls = 0;
        const fetchOrders = vi.fn(async () => {
            calls++;
            return { myCouponSaleOrders: [{ id: 'o1', status: calls >= 2 ? 'PAID' : 'PENDING' }] };
        });
        await expect(pollCouponSalePaid(fetchOrders, 'o1', { tries: 5, intervalMs: 0 })).resolves.toBe(true);
        expect(calls).toBeLessThanOrEqual(5);
    });

    it('轮询异常：不抛出，最终返回 false', async () => {
        const fetchOrders = vi.fn(async () => {
            throw new Error('network');
        });
        await expect(pollCouponSalePaid(fetchOrders, 'o1', { tries: 2, intervalMs: 0 })).resolves.toBe(false);
    });

    it('只认目标出售单：其他单 PAID 不算', async () => {
        const fetchOrders = vi.fn(async () => ({ myCouponSaleOrders: [{ id: 'o2', status: 'PAID' }] }));
        await expect(pollCouponSalePaid(fetchOrders, 'o1', { tries: 2, intervalMs: 0 })).resolves.toBe(false);
    });
});
