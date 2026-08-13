import type { TemplateConfig } from './types';

const configs: Record<string, TemplateConfig> = {
    default: {
        name: '默认模板',
        theme: { primaryColor: '#ff6600', accentColor: '#fff3e6' },
        features: { distribution: true, recharge: true, groupBuy: true, flashSale: true, afterSales: true },
    },
    fresh: {
        name: '清新模板',
        theme: { primaryColor: '#07c160', accentColor: '#e6f7ee' },
        features: { distribution: false, recharge: true, groupBuy: true, flashSale: true, afterSales: true },
    },
};

export function getTemplateConfig(tenantCode: string): TemplateConfig {
    const tenantTemplates: Record<string, string> = {
        'shop-a': 'fresh',
    };
    const templateKey = tenantTemplates[tenantCode] || 'default';
    return configs[templateKey] || configs.default;
}

export { configs };