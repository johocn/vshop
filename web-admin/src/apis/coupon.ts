// 优惠券发行管理 admin-api 调用（coupon-plugin，schema 已按插件 SDL 校准）
// 校准要点：
//   - Query  couponTemplates(options: {...}): { items: [CouponTemplate], totalItems }
//            couponTemplate(id: ID!) : CouponTemplate
//            customerCoupons(options) : { items, totalItems }
//   - Mutation create/updateCouponTemplate(input: JSON)、deleteCouponTemplate(id)、
//            grantCoupon(templateId, customerIds): [String!]、revokeCustomerCoupon(id)
//   - CouponTemplate.name/description 由后端 field resolver 按会话语言本地化为纯字符串输出；
//     创建/更新时需传多语言对象 { zh_Hans, en }（input 是 JSON 标量，直接传对象即可）。
//   - shopId 由后端从当前管理员店铺自动解析并做属店隔离，前端不传。
import { getAdminClient, graphQlErrorMsg } from './client';

export type CouponType = 'FIXED' | 'PERCENT' | 'FULL' | 'FREE_SHIPPING';
export type CouponScope = 'ALL' | 'CATEGORY' | 'SKU';

export interface CouponTemplateItem {
  id: string;
  name: string;
  description: string | null;
  type: CouponType;
  discountValue: number;
  minSpend: number;
  startsAt?: string | null;
  endsAt?: string | null;
  totalCount: number;
  claimedCount: number;
  pointsPrice: number;
  perUserLimit: number;
  scope: string;
  categoryId?: string | null;
  variantId?: string | null;
  enabled: boolean;
  shopId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CouponTemplateInput {
  name: string;
  description?: string;
  type: CouponType;
  discountValue: number;
  minSpend?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  totalCount?: number;
  pointsPrice?: number;
  perUserLimit?: number;
  scope?: string;
  categoryId?: string | null;
  variantId?: string | null;
  enabled?: boolean;
}

const FIELDS = `id name description type discountValue minSpend startsAt endsAt totalCount claimedCount pointsPrice perUserLimit scope categoryId variantId enabled shopId createdAt updatedAt`;

const TYPE_LABEL: Record<CouponType, string> = {
  FIXED: '满减',
  PERCENT: '折扣',
  FULL: '直减',
  FREE_SHIPPING: '免邮',
};
export const couponTypeLabel = (t: string): string => TYPE_LABEL[t as CouponType] || t;

/** 分转元的显示格式化 */
export function fmtCNY(cents: number | null | undefined): string {
  if (cents == null) return '-';
  return (cents / 100).toFixed(0);
}

/** 组装多语言 name/description 提交对象 */
export function buildLocalized(zh: string, en: string): { zh_Hans: string; en: string } {
  return { zh_Hans: zh, en };
}

/** 从后端返回的本地化纯字符串回显到中文框（en 框无法从单值重建，保持独立编辑） */
export function plainName(zh: string): string {
  return zh || '';
}

export async function fetchCouponTemplates(options: { skip: number; take: number }): Promise<{ items: CouponTemplateItem[]; totalItems: number }> {
  const { couponTemplates } = await getAdminClient().request<{ couponTemplates: { items: CouponTemplateItem[]; totalItems: number } }>(
    `query CouponTemplates($options: CouponTemplateListOptions) {
      couponTemplates(options: $options) { items { ${FIELDS} } totalItems }
    }`,
    { options },
  );
  return { items: couponTemplates?.items ?? [], totalItems: couponTemplates?.totalItems ?? 0 };
}

export async function fetchCouponTemplate(id: string): Promise<CouponTemplateItem | null> {
  try {
    const { couponTemplate } = await getAdminClient().request<{ couponTemplate: CouponTemplateItem | null }>(
      `query CouponTemplate($id: ID!) { couponTemplate(id: $id) { ${FIELDS} } }`,
      { id },
    );
    return couponTemplate ?? null;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载券失败'));
  }
}

export async function createCouponTemplate(input: CouponTemplateInput): Promise<string> {
  try {
    const { createCouponTemplate } = await getAdminClient().request<{ createCouponTemplate: { id: string } }>(
      `mutation CreateCouponTemplate($input: JSON!) { createCouponTemplate(input: $input) { id } }`,
      { input },
    );
    return createCouponTemplate.id;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '创建券失败'));
  }
}

export async function updateCouponTemplate(input: CouponTemplateInput & { id: string }): Promise<string> {
  try {
    const { updateCouponTemplate } = await getAdminClient().request<{ updateCouponTemplate: { id: string } }>(
      `mutation UpdateCouponTemplate($input: JSON!) { updateCouponTemplate(input: $input) { id } }`,
      { input },
    );
    return updateCouponTemplate.id;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '保存券失败'));
  }
}

/** 启用/停用（专用 mutation 走 update） */
export async function setCouponTemplateEnabled(id: string, enabled: boolean): Promise<void> {
  await updateCouponTemplate({ id, enabled });
}

export async function deleteCouponTemplate(id: string): Promise<void> {
  try {
    await getAdminClient().request<{ deleteCouponTemplate: boolean }>(
      `mutation DeleteCouponTemplate($id: ID!) { deleteCouponTemplate(id: $id) }`,
      { id },
    );
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '删除券失败'));
  }
}