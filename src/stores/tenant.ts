import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// Tenant configuration registry
interface TenantConfig {
    token: string;
    template: string;
    features: { distribution: boolean; recharge: boolean; groupBuy: boolean; flashSale: boolean; afterSales: boolean };
    wechatMiniAppId?: string;
}

const TENANT_CONFIGS: Record<string, TenantConfig> = {
    default: {
        token: 'default-channel',
        template: 'default',
        features: { distribution: true, recharge: true, groupBuy: true, flashSale: true, afterSales: true },
    },
};

export const useTenantStore = defineStore('tenant', () => {
    const token = ref('default-channel');
    const tenantCode = ref('default');
    const templateCode = ref('default');
    const paymentMethods = ref<any[]>([]);
    const shippingMethods = ref<any[]>([]);

    const currentConfig = computed(() => TENANT_CONFIGS[tenantCode.value] || TENANT_CONFIGS.default);

    function initTenant() {
        // Read tenant from URL params, mini-program scene, or storage
        const stored = uni.getStorageSync('tenant_code');
        if (stored && TENANT_CONFIGS[stored]) {
            tenantCode.value = stored;
        }
        const config = currentConfig.value;
        token.value = config.token;
        templateCode.value = config.template;
        uni.setStorageSync('tenant_code', tenantCode.value);
    }

    function switchTenant(code: string) {
        const config = TENANT_CONFIGS[code];
        if (!config) return;
        tenantCode.value = code;
        token.value = config.token;
        templateCode.value = config.template;
        uni.setStorageSync('tenant_code', code);
    }

    function setPaymentMethods(methods: any[]) { paymentMethods.value = methods; }
    function setShippingMethods(methods: any[]) { shippingMethods.value = methods; }

    return { token, tenantCode, templateCode, paymentMethods, shippingMethods, currentConfig, initTenant, switchTenant, setPaymentMethods, setShippingMethods };
});