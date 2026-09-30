// 引导查询（解析渠道本身 / 店铺装修模板）走**免闸门** client：
// 它们必须在租户就绪之前就能发出（initTenant 全靠它们），否则会与租户闸门互等死锁。
// 其余查询（authMethods / ssoProviders）走带闸门的业务 client。
import { getBootstrapClient, getGraphQLClient } from '../client';

export async function getActiveChannelConfig() {
    const client = getBootstrapClient();
    return client.request(`query {
        activeChannel {
            id code token
            customFields {
                employeePickupMode
                defaultLocation { lat lng }
                themeTokensOverride
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
    const client = getBootstrapClient();
    return client.request(`query ResolveChannelByDomain($host: String!) {
        resolveChannelByDomain(host: $host) {
            token
            code
        }
    }`, { host });
}

export async function resolveChannelByCode(code: string) {
    const client = getBootstrapClient();
    return client.request(`query ResolveChannelByCode($code: String!) {
        resolveChannelByCode(code: $code) {
            token
            code
            customFields {
                shopName
                shopLogo
                shopIntro
                servicePhone
                shopContent
                displayTemplate
                themeId
                shareImageUrl
            }
        }
    }`, { code });
}

/** 全部「可用店铺」（已停用渠道不返回）：店铺切换器的公开数据源 */
export async function listShopChannels() {
    const client = getBootstrapClient();
    return client.request(`query {
        shopChannels {
            code
            token
            name
            isOfficial
            isDefault
        }
    }`);
}

export async function getShopTemplate(app: string) {
    const client = getBootstrapClient();
    return client.request(`query GetShopTemplate($app: String!) {
        shopTemplate(app: $app) {
            id
            name
            app
            theme
            pages
            version
            enabled
            updatedAt
        }
    }`, { app });
}

export async function getShopGlobalConfig(app: string) {
    const client = getBootstrapClient();
    return client.request(`query GetShopGlobalConfig($app: String!) {
        shopGlobalConfig(app: $app) {
            id
            app
            themeTokens
            defaults
        }
    }`, { app });
}
