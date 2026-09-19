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
  nameZh?: string | null;
  nameEn?: string | null;
  description: string | null;
  descZh?: string | null;
  descEn?: string | null;
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
  claimable: boolean;
  claimCode?: string | null;
  validDays?: number | null;
  newCustomerOnly: boolean;
  memberLevel?: string | null;
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
  claimable?: boolean;
  claimCode?: string | null;
  validDays?: number | null;
  newCustomerOnly?: boolean;
  memberLevel?: string | null;
}

const FIELDS = `id name nameZh nameEn description descZh descEn type discountValue minSpend startsAt endsAt totalCount claimedCount pointsPrice perUserLimit scope categoryId variantId enabled claimable claimCode validDays newCustomerOnly memberLevel shopId createdAt updatedAt`;

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

/* ------------------------- 定向发券（coupon-plugin 后台） ------------------------- */

export interface IssueCustomer {
  id: string;
  emailAddress: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
}
export interface IssueResult {
  customerId: string;
  ok: boolean;
  code?: string | null;
  reason?: string | null;
}

/** 当前渠道客户搜索（按 姓名/手机号/邮箱 模糊匹配） */
export async function searchChannelCustomers(query: string, take = 20, skip = 0): Promise<{ items: IssueCustomer[]; totalItems: number }> {
  try {
    const r = await getAdminClient().request<{ couponChannelCustomers: { items: IssueCustomer[]; totalItems: number } }>(
      `query ($query: String, $take: Int, $skip: Int) {
          couponChannelCustomers(query: $query, take: $take, skip: $skip) {
            items { id emailAddress firstName lastName phoneNumber } totalItems
          }
      }`,
      { query: query || null, take, skip },
    );
    return r.couponChannelCustomers;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '搜索客户失败'));
  }
}

/** 批量定向发券（支持站内消息通知） */
export async function grantCouponIssue(templateId: string, customerIds: string[], notify: boolean): Promise<IssueResult[]> {
  try {
    const r = await getAdminClient().request<{ grantCouponIssue: IssueResult[] }>(
      `mutation ($templateId: ID!, $customerIds: [ID!]!, $notify: Boolean!) {
          grantCouponIssue(templateId: $templateId, customerIds: $customerIds, notify: $notify) {
            customerId ok code reason
          }
      }`,
      { templateId, customerIds, notify },
    );
    return r.grantCouponIssue;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '发券失败'));
  }
}

/* ------------------------- 商品专属券（商品-券绑定，coupon-plugin 后台） ------------------------- */

/** 绑定项内嵌套模板的摘要字段（name 为后端按会话语言本地化后的纯字符串） */
const BINDING_TEMPLATE_FIELDS = `id name type discountValue minSpend scope enabled claimable claimCode`;

export interface ProductCouponBindingTemplate {
  id: string;
  name: string;
  type: CouponType;
  discountValue: number;
  minSpend: number;
  scope?: string;
  enabled?: boolean;
  claimable?: boolean;
  claimCode?: string | null;
}

export interface ProductCouponBindingItem {
  id: string;
  productId: string;
  variantIds: string[] | null;
  couponTemplateId: string;
  enabled: boolean;
  displayOrder: number;
  badgeText?: string | null;
  promoTitle?: string | null;
  remark?: string | null;
  template: ProductCouponBindingTemplate | null;
}

/** 创建入参：variantIds 不传即 null（全规格适用） */
export interface CreateProductCouponBindingInput {
  productId: string;
  variantIds?: string[] | null;
  couponTemplateId: string;
  enabled?: boolean;
  displayOrder?: number;
  badgeText?: string;
  promoTitle?: string;
  remark?: string;
}

/** 更新入参：只传需要变更的字段即可局部更新（如仅 id + enabled） */
export interface UpdateProductCouponBindingInput {
  id: string;
  variantIds?: string[] | null;
  enabled?: boolean;
  displayOrder?: number;
  badgeText?: string;
  promoTitle?: string;
  remark?: string;
}

export async function fetchProductCouponBindings(productId: string): Promise<ProductCouponBindingItem[]> {
  try {
    const { productCouponBindings } = await getAdminClient().request<{ productCouponBindings: ProductCouponBindingItem[] }>(
      `query ProductCouponBindings($productId: ID!) {
        productCouponBindings(productId: $productId) {
          id productId variantIds couponTemplateId enabled displayOrder badgeText promoTitle remark
          template { ${BINDING_TEMPLATE_FIELDS} }
        }
      }`,
      { productId },
    );
    return productCouponBindings ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载商品专属券失败'));
  }
}

export async function createProductCouponBinding(input: CreateProductCouponBindingInput): Promise<string> {
  try {
    const { createProductCouponBinding } = await getAdminClient().request<{ createProductCouponBinding: { id: string } }>(
      `mutation CreateProductCouponBinding($input: CreateProductCouponBindingInput!) {
        createProductCouponBinding(input: $input) { id }
      }`,
      { input },
    );
    return createProductCouponBinding.id;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '添加商品专属券失败'));
  }
}

export async function updateProductCouponBinding(input: UpdateProductCouponBindingInput): Promise<string> {
  try {
    const { updateProductCouponBinding } = await getAdminClient().request<{ updateProductCouponBinding: { id: string } }>(
      `mutation UpdateProductCouponBinding($input: UpdateProductCouponBindingInput!) {
        updateProductCouponBinding(input: $input) { id }
      }`,
      { input },
    );
    return updateProductCouponBinding.id;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '更新商品专属券失败'));
  }
}

export async function deleteProductCouponBinding(id: string): Promise<void> {
  try {
    await getAdminClient().request<{ deleteProductCouponBinding: boolean }>(
      `mutation DeleteProductCouponBinding($id: ID!) { deleteProductCouponBinding(id: $id) }`,
      { id },
    );
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '删除商品专属券失败'));
  }
}