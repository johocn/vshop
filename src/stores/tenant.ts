import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getActiveChannelConfig, getAuthMethods, getSsoProviders } from '../api/queries/channel';
import { resolveChannelByDomain } from '../api/queries/channel';

// Tenant configuration registry
interface TenantConfig {
    token: string;
    template: string;
    name: string;
    features: { distribution: boolean; recharge: boolean; groupBuy: boolean; flashSale: boolean; afterSales: boolean };
    wechatMiniAppId?: string;
}

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

// token 必须与后端 populate 脚本设置的 Channel.token 一致
const TENANT_CONFIGS: Record<string, TenantConfig> = {
    default: {
        token: 'default-token',
        template: 'default',
        name: '默认商城',
        features: { distribution: true, recharge: true, groupBuy: true, flashSale: true, afterSales: true },
    },
    'shop-a': {
        token: 'shop-a-token',
        template: 'fresh',
        name: '生鲜优选',
        features: { distribution: true, recharge: true, groupBuy: true, flashSale: true, afterSales: true },
    },
};

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
    const token = ref(TENANT_CONFIGS.default.token);
    const tenantCode = ref('default');
    const templateCode = ref('default');
    const tenantName = ref(TENANT_CONFIGS.default.name);
    const paymentMethods = ref<any[]>([]);
    const shippingMethods = ref<any[]>([]);
    const employeePickupMode = ref<'disabled' | 'loose' | 'strict'>('disabled');
    const defaultLocation = ref<{ lat: number; lng: number } | null>(null);
    const authMethods = ref<string[]>([]);
    const wechatAppId = ref('');
    const ssoProviders = ref<SsoProviderInfo[]>([]);
    const tenantReady = ref(false);

    const currentConfig = computed(() => TENANT_CONFIGS[tenantCode.value] || TENANT_CONFIGS.default);

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
                    return;
                }
            }
        } catch {}
        // #endif

        // 2. 回退：?tenant= URL 参数
        const fromUrl = resolveTenantFromUrl();
        if (fromUrl && TENANT_CONFIGS[fromUrl]) {
            tenantCode.value = fromUrl;
            applyConfig();
            return;
        }

        // 3. 回退：localStorage
        const stored = uni.getStorageSync('tenant_code');
        if (stored && TENANT_CONFIGS[stored]) {
            tenantCode.value = stored;
            applyConfig();
            return;
        }

        // 4. 默认
        tenantCode.value = 'default';
        applyConfig();
    }

    function applyConfig() {
        const config = currentConfig.value;
        token.value = config.token;
        templateCode.value = config.template;
        tenantName.value = config.name;
        uni.setStorageSync('tenant_code', tenantCode.value);
    }

    function switchTenant(code: string) {
        if (!TENANT_CONFIGS[code]) return false;
        tenantCode.value = code;
        applyConfig();
        return true;
    }

    function listTenants(): Array<{ code: string; name: string; template: string }> {
        return Object.entries(TENANT_CONFIGS).map(([code, cfg]) => ({ code, name: cfg.name, template: cfg.template }));
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
        tenantReady, currentConfig, initTenant, switchTenant, listTenants,
        setPaymentMethods, setShippingMethods, loadChannelConfig, loadAuthMethods, loadSsoProviders,
    };
});
