import { getGraphQLClient } from '../client';

const ADDRESS_FRAGMENT = `
    fragment AddressInfo on Address {
        id fullName company streetLine1 streetLine2 city province postalCode
        phoneNumber defaultShippingAddress defaultBillingAddress
        country { id name code }
    }
`;

export async function createCustomerAddress(input: any) {
    const client = getGraphQLClient();
    const mutation = `${ADDRESS_FRAGMENT}
        mutation CreateAddress($input: CreateAddressInput!) {
            createCustomerAddress(input: $input) { ...AddressInfo }
        }`;
    return client.request(mutation, { input });
}

export async function updateCustomerAddress(input: any) {
    const client = getGraphQLClient();
    const mutation = `${ADDRESS_FRAGMENT}
        mutation UpdateAddress($input: UpdateAddressInput!) {
            updateCustomerAddress(input: $input) { ...AddressInfo }
        }`;
    return client.request(mutation, { input });
}

export async function deleteCustomerAddress(id: string) {
    const client = getGraphQLClient();
    return client.request(`mutation DeleteAddress($id: ID!) { deleteCustomerAddress(id: $id) { success } }`, { id });
}
