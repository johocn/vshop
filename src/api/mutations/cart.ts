import { getGraphQLClient } from '../client';
import { CART_FRAGMENT } from '../fragments';

export async function addItemToOrder(productVariantId: string, quantity: number) {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation AddToCart($productVariantId: ID!, $quantity: Int!) { addItemToOrder(productVariantId: $productVariantId, quantity: $quantity) { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { productVariantId, quantity });
}

export async function adjustOrderLine(orderLineId: string, quantity: number) {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation AdjustLine($orderLineId: ID!, $quantity: Int!) { adjustOrderLine(orderLineId: $orderLineId, quantity: $quantity) { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { orderLineId, quantity });
}

export async function removeOrderLine(orderLineId: string) {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation RemoveLine($orderLineId: ID!) { removeOrderLine(orderLineId: $orderLineId) { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { orderLineId });
}

export async function removeAllOrderLines() {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation RemoveAllLines { removeAllOrderLines { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation);
}

export async function applyCouponCode(couponCode: string) {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation ApplyCoupon($couponCode: String!) { applyCouponCode(couponCode: $couponCode) { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { couponCode });
}

export async function removeCouponCode(couponCode: string) {
    const client = getGraphQLClient();
    // removeCouponCode 返回 Order（非 union），不能使用 inline fragments
    const mutation = `${CART_FRAGMENT}
        mutation RemoveCoupon($couponCode: String!) { removeCouponCode(couponCode: $couponCode) { ...CartInfo } }`;
    return client.request(mutation, { couponCode });
}