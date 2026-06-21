import { getGraphQLClient } from '../client';
import { ORDER_FRAGMENT } from '../fragments';

export async function getActiveOrder() {
    const client = getGraphQLClient();
    const query = `${ORDER_FRAGMENT}
        query ActiveOrder { activeOrder { ...OrderDetail } }`;
    return client.request(query);
}

export async function getOrder(id: string) {
    const client = getGraphQLClient();
    const query = `${ORDER_FRAGMENT}
        query GetOrder($id: ID!) { order(id: $id) { ...OrderDetail } }`;
    return client.request(query, { id });
}

export async function getOrders(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `${ORDER_FRAGMENT}
        query GetOrders($options: OrderListOptions) { myOrders(options: $options) { items { ...OrderDetail } totalItems } }`;
    return client.request(query, { options: { take: 10, sort: { createdAt: 'DESC' }, ...options } });
}

export async function getOrderByCode(code: string) {
    const client = getGraphQLClient();
    const query = `${ORDER_FRAGMENT}
        query OrderByCode($code: String!) { orderByCode(code: $code) { ...OrderDetail } }`;
    return client.request(query, { code });
}

export async function getEligibleShippingMethods() {
    const client = getGraphQLClient();
    const query = `query { eligibleShippingMethods { id name code price priceWithTax description } }`;
    return client.request(query);
}