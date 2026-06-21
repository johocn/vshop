export interface TemplateConfig {
    name: string;
    theme: {
        primaryColor: string;
        accentColor: string;
    };
    features: {
        distribution: boolean;
        recharge: boolean;
        groupBuy: boolean;
        flashSale: boolean;
        afterSales: boolean;
    };
}