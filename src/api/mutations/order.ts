import { getGraphQLClient } from '../client';

/**
 * C 端确认收货：shop-api 由 logistics-plugin 提供 `confirmOrderReceipt(orderId)`，
 * 内部做归属校验并把 Delivered → Completed（幂等）。
 * 注意：不能用 core 的 `transitionOrderToState(state:"Delivered")` —— 该 mutation 无 orderId，
 * 只作用于当前 active order，会误改另一笔订单。
 */
export async function confirmOrderReceipt(orderId: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation ConfirmReceipt($orderId: String!) { confirmOrderReceipt(orderId: $orderId) }`,
        { orderId },
    );
}

/**
 * C 端取消订单：shop-api 由 cjk-plugin 提供 `cancelMyOrder(orderId)`，
 * 仅本人 + 未支付/未履约状态（Created/AddingItems/ArrangingPayment）可取消。
 */
export async function cancelMyOrder(orderId: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation CancelMyOrder($orderId: ID!) { cancelMyOrder(orderId: $orderId) { id code state } }`,
        { orderId },
    );
}
