// 风格模板库 + 全局配置（四层风格体系后台配置）admin-api 客户端
import { getAdminClient, graphQlErrorMsg } from './client';

export interface ShopTemplate {
  id: string;
  name: string;
  app: 'nshop' | 'vshop';
  theme: Record<string, any> | null;
  pages: Record<string, any> | null;
  version: number;
  enabled: boolean;
  updatedAt: string;
}

export interface ShopGlobalConfig {
  id: string;
  app: 'nshop' | 'vshop';
  themeTokens: Record<string, any> | null;
  defaults: Record<string, any> | null;
}

const TPL_FIELDS = `id name app theme pages version enabled updatedAt`;

export const templateApi = {
  async list(app?: string): Promise<ShopTemplate[]> {
    const c = getAdminClient();
    try {
      const r = await c.request<{ shopTemplates: ShopTemplate[] }>(
        `query ($app: String) { shopTemplates(app: $app) { ${TPL_FIELDS} } }`,
        { app },
      );
      return r.shopTemplates ?? [];
    } catch (e: any) {
      throw new Error(graphQlErrorMsg(e, '模板列表获取失败'));
    }
  },
  async create(input: { name: string; app: string; theme?: any; pages?: any; enabled?: boolean }): Promise<ShopTemplate> {
    const c = getAdminClient();
    try {
      const r = await c.request<{ createShopTemplate: ShopTemplate }>(
        `mutation ($input: CreateShopTemplateInput!) { createShopTemplate(input: $input) { ${TPL_FIELDS} } }`,
        { input },
      );
      return r.createShopTemplate;
    } catch (e: any) {
      throw new Error(graphQlErrorMsg(e, '模板创建失败'));
    }
  },
  async update(id: string, input: { name?: string; theme?: any; pages?: any; enabled?: boolean }): Promise<ShopTemplate> {
    const c = getAdminClient();
    try {
      const r = await c.request<{ updateShopTemplate: ShopTemplate }>(
        `mutation ($input: UpdateShopTemplateInput!) { updateShopTemplate(input: $input) { ${TPL_FIELDS} } }`,
        { input: { id, ...input } },
      );
      return r.updateShopTemplate;
    } catch (e: any) {
      throw new Error(graphQlErrorMsg(e, '模板更新失败'));
    }
  },
  async remove(id: string): Promise<boolean> {
    const c = getAdminClient();
    try {
      const r = await c.request<{ deleteShopTemplate: boolean }>(
        `mutation ($id: ID!) { deleteShopTemplate(id: $id) }`,
        { id },
      );
      return r.deleteShopTemplate;
    } catch (e: any) {
      throw new Error(graphQlErrorMsg(e, '模板删除失败'));
    }
  },
  async copy(id: string): Promise<ShopTemplate> {
    const c = getAdminClient();
    try {
      const r = await c.request<{ copyShopTemplate: ShopTemplate }>(
        `mutation ($id: ID!) { copyShopTemplate(id: $id) { ${TPL_FIELDS} } }`,
        { id },
      );
      return r.copyShopTemplate;
    } catch (e: any) {
      throw new Error(graphQlErrorMsg(e, '模板复制失败'));
    }
  },
  async globalConfig(app: string): Promise<ShopGlobalConfig | null> {
    const c = getAdminClient();
    try {
      const r = await c.request<{ shopGlobalConfig: ShopGlobalConfig | null }>(
        `query ($app: String!) { shopGlobalConfig(app: $app) { id app themeTokens defaults } }`,
        { app },
      );
      return r.shopGlobalConfig ?? null;
    } catch (e: any) {
      throw new Error(graphQlErrorMsg(e, '全局配置获取失败'));
    }
  },
  async updateGlobalConfig(input: { app: string; themeTokens?: any; defaults?: any }): Promise<ShopGlobalConfig> {
    const c = getAdminClient();
    try {
      const r = await c.request<{ updateShopGlobalConfig: ShopGlobalConfig }>(
        `mutation ($input: UpdateShopGlobalConfigInput!) { updateShopGlobalConfig(input: $input) { id app themeTokens defaults } }`,
        { input },
      );
      return r.updateShopGlobalConfig;
    } catch (e: any) {
      throw new Error(graphQlErrorMsg(e, '全局配置保存失败'));
    }
  },
};
