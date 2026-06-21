// Tenant configuration types and utilities
export interface TenantConfig {
    token: string;
    template: string;
    features: {
        distribution: boolean;
        recharge: boolean;
        groupBuy: boolean;
        flashSale: boolean;
        afterSales: boolean;
    };
    wechatMiniAppId?: string;
}

export function getTenantFromScene(scene?: string): string {
    if (!scene) return 'default';
    // WeChat mini-program scene parameter
    const params = decodeURIComponent(scene);
    const match = params.match(/tenant=([^&]+)/);
    return match ? match[1] : 'default';
}

export function getTenantFromUrl(url: string): string {
    try {
        const u = new URL(url);
        return u.searchParams.get('tenant') || u.hostname.split('.')[0] || 'default';
    } catch {
        return 'default';
    }
}