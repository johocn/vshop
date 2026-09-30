import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getActiveChannelConfig, getAuthMethods, getSsoProviders, resolveChannelByDomain, resolveChannelByCode, listShopChannels, getShopTemplate, getShopGlobalConfig } from '../api/queries/channel';
import { withoutTenantGate } from '../api/client';
import { parseShopContent, ShopContent } from '../templates/shared/schema';
import { mergeThemeTokens, mergePageConfig, parseThemeTokensOverride, ThemeTokens } from '../utils/merge-config';

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
    const rawShopContent = ref<string | null>(null);
    const themeTokens = ref<ThemeTokens>({});
    const rawThemeOverride = ref<string | null>(null);
    const mergedShopContent = ref<ShopContent | null>(null);
    const shopName = ref('');
    const shopLogo = ref('');
    const shopIntro = ref('');
    const servicePhone = ref('');
    const shareImageUrl = ref('');

    const tenantName = computed(() => shopName.value || tenantCode.value);

    // 运行时租户表（后端公开查询 shopChannels）：店铺切换器的真实数据源。
    // 不再硬编码租户清单，新增/启用渠道后本前端无需改代码重新构建。
    const shopChannels = ref<Array<{ code: string; name: string; isOfficial: boolean; isDefault: boolean }>>([]);

    /** H5 域名解析：命中返回渠道 code（含 sessionStorage 缓存），否则 null */
    async function resolveTenantByDomain(): Promise<string | null> {
        // #ifdef H5
        try {
            const host = window.location.hostname;
            if (host && host !== 'localhost' && host !== '127.0.0.1') {
                const cacheKey = `domain_resolve_${host}`;
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        return JSON.parse(cached).code as string;
                    } catch {}
                }
                const res: any = await resolveChannelByDomain(host);
                const result = res?.resolveChannelByDomain;
                if (result) {
                    sessionStorage.setItem(cacheKey, JSON.stringify(result));
                    return result.code as string;
                }
            }
        } catch {}
        // #endif
        return null;
    }

    async function initTenant() {
        // 引导查询（解析渠道本身）必须绕过租户就绪闸门，否则与闸门互等死锁。
        await withoutTenantGate(async () => {
            // 租户来源优先级（用户确认）：?tenant= > localStorage > 域名 > 默认。
            // ⚠️ 域名解析必须排在后两位。e.joho.cn 绑定在默认渠道上，若域名优先且命中即 return，
            // `?tenant=` 会变成死代码 —— 分店永远退回默认店（原实现的缺陷）。
            const fromUrl = resolveTenantFromUrl();
            const stored = fromUrl ? null : (uni.getStorageSync('tenant_code') as string) || null;
            let code = fromUrl || stored || (await resolveTenantByDomain()) || 'default';

            tenantCode.value = code;
            // 传入了不存在的 code（如 ?tenant=nope）时回退平台默认店，
            // 避免停在占位态（店名显示 code、内容与默认店不一致）。
            if (!(await loadTenantDetails(code))) {
                code = 'default';
                tenantCode.value = code;
                await loadTenantDetails(code);
            }
            await loadShopChannels();
        });
    }

    /** 拉取可用店铺列表（失败静默：listTenants 会回退为「当前店铺」单项，UI 不空） */
    async function loadShopChannels() {
        try {
            const res: any = await listShopChannels();
            const list = res?.shopChannels;
            if (Array.isArray(list) && list.length) {
                shopChannels.value = list.map((t: any) => ({
                    code: t.code,
                    name: t.name || t.code,
                    isOfficial: !!t.isOfficial,
                    isDefault: !!t.isDefault,
                }));
            }
        } catch (e) {
            console.warn('[tenant] loadShopChannels failed', e);
        }
    }

    // Vendure 默认频道的 code 是 __default_channel__，C 端保留 'default' 别名并兜底映射
    /** @returns 是否解析成功（命中渠道）；false 时调用方可回退默认店 */
    async function loadTenantDetails(code: string): Promise<boolean> {
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
                shareImageUrl.value = cf.shareImageUrl || '';
                templateCode.value = cf.displayTemplate || 'default';
                rawShopContent.value = cf.shopContent || null;
                shopContent.value = parseShopContent(cf.shopContent);
                // L3 店铺覆盖令牌（channel customFields.themeTokensOverride）走 activeChannel 读取，
                // 不放在 resolveChannelByCode 的返回里（后端 ChannelResolveCustomFields 未暴露该字段）
                await loadChannelConfig();
                await loadTemplateConfig();
                uni.setStorageSync('tenant_code', data.code);
                return true;
            }
        } catch (e) {
            console.warn('[tenant] loadTenantDetails failed', code, e);
        }
        // 回退默认，保证页面不白屏。
        // token 留空（而不是占位串）：Vendure 收到空 vendure-token 会落到默认渠道，
        // 而未知 token 会让后续所有请求报 ChannelNotFound，导致无法再回退到默认店。
        token.value = '';
        templateCode.value = 'default';
        shopContent.value = null;
        rawShopContent.value = null;
        themeTokens.value = {};
        rawThemeOverride.value = null;
        mergedShopContent.value = null;
        shopName.value = '';
        shopLogo.value = '';
        shopIntro.value = '';
        servicePhone.value = '';
        shareImageUrl.value = '';
        return false;
    }

    // 模板库五级合并：L1 全局配置 → L2 风格模板 → L3 店铺覆盖（channel customFields）
    async function loadTemplateConfig() {
        try {
            const [tplRes, cfgRes] = await Promise.all([
                getShopTemplate('vshop'),
                getShopGlobalConfig('vshop'),
            ]);
            const template: any = tplRes?.shopTemplate ?? null;
            const globalConfig: any = cfgRes?.shopGlobalConfig ?? null;
            themeTokens.value = mergeThemeTokens(
                globalConfig,
                template,
                parseThemeTokensOverride(rawThemeOverride.value),
            );
            const merged = mergePageConfig(
                globalConfig,
                template,
                { shopContent: rawShopContent.value },
                'home',
            );
            const sections = merged?.sections;
            mergedShopContent.value =
                Array.isArray(sections) && sections.length
                    ? { version: 1, sections: sections as any[] }
                    : null;
        } catch (e) {
            console.warn('[tenant] loadTemplateConfig failed', e);
        }
    }

    async function switchTenant(code: string) {
        return await withoutTenantGate(async () => {
            tenantCode.value = code;
            await loadTenantDetails(code);
            return true;
        });
    }

    function listTenants(): Array<{ code: string; name: string; template: string }> {
        // 优先用运行时租户表（后端 shopChannels），拿不到时回退为「当前店铺」单项
        if (shopChannels.value.length) {
            return shopChannels.value.map((t) => ({
                code: t.code,
                name: t.name,
                template: templateCode.value,
            }));
        }
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
                rawThemeOverride.value = cf.themeTokensOverride || null;
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
        tenantReady, shopContent, rawShopContent, themeTokens, rawThemeOverride, mergedShopContent,
        shopName, shopLogo, shopIntro, servicePhone, shareImageUrl,
        initTenant, switchTenant, listTenants,
        setPaymentMethods, setShippingMethods, loadChannelConfig, loadAuthMethods, loadSsoProviders,
    };
});
