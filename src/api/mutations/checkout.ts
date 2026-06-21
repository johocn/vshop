import { getGraphQLClient } from '../client';
import { ORDER_FRAGMENT } from '../fragments';

export async function setOrderShippingAddress(input: any) {
    const client = getGraphQLClient();
    const mutation = `${ORDER_FRAGMENT}
        mutation SetAddr($input: CreateAddressInput!) { setOrderShippingAddress(input: $input) { ... on Order { ...OrderDetail } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { input });
}

export async function setOrderShippingMethod(shippingMethodId: string[]) {
    const client = getGraphQLClient();
    const mutation = `${ORDER_FRAGMENT}
        mutation SetShip($shippingMethodId: [ID!]!) { setOrderShippingMethod(shippingMethodId: $shippingMethodId) { ... on Order { ...OrderDetail } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { shippingMethodId });
}

export async function transitionOrderToState(state: string) {
    const client = getGraphQLClient();
    return client.request(`${ORDER_FRAGMENT}
        mutation Transition($state: String!) { transitionOrderToState(state: $state) { ... on Order { ...OrderDetail } ... on ErrorResult { errorCode message } } }`, { state });
}

export async function addPaymentToOrder(method: string, metadata?: Record<string, any>) {
    const client = getGraphQLClient();
    return client.request(`${ORDER_FRAGMENT}
        mutation Pay($input: PaymentInput!) { addPaymentToOrder(input: $input) { ... on Order { ...OrderDetail } ... on ErrorResult { errorCode message } } }`, { input: { method, metadata: metadata || {} } });
}

export async function setCustomerForOrder(input: any) {
    const client = getGraphQLClient();
    return client.request(`${ORDER_FRAGMENT}
        mutation SetCustomer($input: CreateCustomerInput!) { setCustomerForOrder(input: $input) { ... on Order { ...OrderDetail } ... on ErrorResult { errorCode message } } }`, { input });
}