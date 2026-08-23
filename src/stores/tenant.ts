import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getActiveChannelConfig, getAuthMethods, getSsoProviders, resolveChannelByDomain, resolveChannelByCode } from '../api/queries/channel';
import { parseShopContent, ShopContent } from '../templates/shared/schema';

interface SsoProviderInfo {
    name: string;
    providerKey: string;
    protocol: 'zhao-sso' | 'oauth2';
    baseUrl: string;
    authorizeUrl?: string | null;
    clientId: string;
    scopes: string[];
    channelCode?: string | null;
}

function resolveTenantFromUrl(): string | null {
    // #ifdef H5
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get('tenant');
    } catch {}
    // #endif
    return null;
}

export const useTenantStore = defineStore('tenant', () => {
    const token = ref('');
    const tenantCode = ref('default');
    const templateCode = ref('default');
    const paymentMethods = ref<any[]>([]);
    const shippingMethods = ref<any[]>([]);
    const employeePickupMode = ref<'disabled' | 'loose' | 'strict'>('disabled');
    const defaultLocation = ref<{ lat: number; lng: number } | null>(null);
    const authMethods = ref<string[]>([]);
    const wechatAppId = ref('');
    const ssoProviders = ref<SsoProviderInfo[]>([]);
    const tenantReady = ref(false);
    const shopContent = ref<ShopContent | null>(null);
    const shopName = ref('');
    const shopLogo = ref('');
    const shopIntro = ref('');
    const servicePhone = ref('');

    const tenantName = computed(() => shopName.value || tenantCode.value);

    async function initTenant() {
        // 1. 尝试域名解析（仅 H5）
        // #ifdef H5
        try {
            const host = window.location.hostname;
            if (host && host !== 'localhost' && host !== '127.0.0.1') {
                const cacheKey = `domain_resolve_${host}`;
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        const result = JSON.parse(cached);
                        tenantCode.value = result.code;
                        token.value = result.token;
                        uni.setStorageSync('tenant_code', result.code);
                        await loadTenantDetails(result.code);
                        return;
                    } catch {}
                }
                const res: any = await resolveChannelByDomain(host);
                if (res?.resolveChannelByDomain) {
                    const result = res.resolveChannelByDomain;
                    sessionStorage.setItem(cacheKey, JSON.stringify(result));
                    tenantCode.value = result.code;
                    token.value = result.token;
                    uni.setStorageSync('tenant_code', result.code);
                    await loadTenantDetails(result.code);
                    return;
                }
            }
        } catch {}
        // #endif

        // 2. ?tenant= URL 参数
        const fromUrl = resolveTenantFromUrl();
        if (fromUrl) {
            tenantCode.value = fromUrl;
            await loadTenantDetails(fromUrl);
            return;
        }

        // 3. localStorage 兜底
        const stored = uni.getStorageSync('tenant_code');
        if (stored) {
            tenantCode.value = stored;
            await loadTenantDetails(stored);
            return;
        }

        // 4. 默认
        tenantCode.value = 'default';
        await loadTenantDetails('default');
    }

    // Vendure 默认频道的 code 是 __default_channel__，C 端保留 'default' 别名并兜底映射
    async function loadTenantDetails(code: string) {
        try {
            let data: any = (await resolveChannelByCode(code))?.resolveChannelByCode;
            if (!data && code === 'default') {
                data = (await resolveChannelByCode('__default_channel__'))?.resolveChannelByCode;
            }
            if (data) {
                token.value = data.token;
                tenantCode.value = data.code;
                const cf = data.customFields || {};
                shopName.value = cf.shopName || '';
                shopLogo.value = cf.shopLogo || '';
                shopIntro.value = cf.shopIntro || '';
                servicePhone.value = cf.servicePhone || '';
                templateCode.value = cf.displayTemplate || 'default';
                shopContent.value = parseShopContent(cf.shopContent);
                uni.setStorageSync('tenant_code', data.code);
                return;
            }
        } catch (e) {
            console.warn('[tenant] loadTenantDetails failed', code, e);
        }
        // 回退默认，保证页面不白屏
        token.value = 'default-token';
        templateCode.value = 'default';
        shopContent.value = null;
        shopName.value = '';
        shopLogo.value = '';
        shopIntro.value = '';
        servicePhone.value = '';
    }

    async function switchTenant(code: string) {
        tenantCode.value = code;
        await loadTenantDetails(code);
        return true;
    }

    function listTenants(): Array<{ code: string; name: string; template: string }> {
        return [{ code: tenantCode.value, name: tenantName.value, template: templateCode.value }];
    }

    function setPaymentMethods(methods: any[]) { paymentMethods.value = methods; }
    function setShippingMethods(methods: any[]) { shippingMethods.value = methods; }

    async function loadChannelConfig() {
        try {
            const res: any = await getActiveChannelConfig();
            const cf = res?.activeChannel?.customFields;
            if (cf) {
                employeePickupMode.value = cf.employeePickupMode || 'disabled';
                defaultLocation.value = cf.defaultLocation || null;
            }
        } catch (e) {
            console.warn('[tenant] loadChannelConfig failed', e);
        }
    }

    async function loadAuthMethods() {
        try {
            const res: any = await getAuthMethods();
            const data = res?.authMethods || {};
            authMethods.value = data.methods || ['native'];
            wechatAppId.value = data.wechatAppId || '';
        } catch (e) {
            authMethods.value = ['native'];
            wechatAppId.value = '';
        }
    }

    async function loadSsoProviders() {
        try {
            const res: any = await getSsoProviders();
            ssoProviders.value = res?.ssoProviders || [];
        } catch (e) {
            ssoProviders.value = [];
        }
    }

    return {
        token, tenantCode, templateCode, tenantName, paymentMethods, shippingMethods,
        employeePickupMode, defaultLocation, authMethods, wechatAppId, ssoProviders,
        tenantReady, shopContent, shopName, shopLogo, shopIntro, servicePhone,
        initTenant, switchTenant, listTenants,
        setPaymentMethods, setShippingMethods, loadChannelConfig, loadAuthMethods, loadSsoProviders,
    };
});
