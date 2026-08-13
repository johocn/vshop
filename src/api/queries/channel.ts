import { getGraphQLClient } from '../client';

export async function getActiveChannelConfig() {
    const client = getGraphQLClient();
    return client.request(`query {
        activeChannel {
            id code token
            customFields {
                employeePickupMode
                defaultLocation { lat lng }
            }
        }
    }`);
}

export async function getAuthMethods() {
    const client = getGraphQLClient();
    return client.request(`query {
        authMethods {
            methods
            wechatAppId
        }
    }`);
}

export async function getSsoProviders() {
    const client = getGraphQLClient();
    return client.request(`query {
        ssoProviders {
            name providerKey protocol baseUrl authorizeUrl clientId scopes channelCode
        }
    }`);
}

export async function resolveChannelByDomain(host: string) {
    const client = getGraphQLClient();
    return client.request(`query ResolveChannelByDomain($host: String!) {
        resolveChannelByDomain(host: $host) {
            token
            code
        }
    }`, { host });
}
