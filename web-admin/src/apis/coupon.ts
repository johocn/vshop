// 优惠券发行管理 admin-api 调用（coupon-plugin，schema 已按插件 SDL 校准）
// 校准要点：
//   - Query  couponTemplates(options: {...}): { items: [CouponTemplate], totalItems }
//            couponTemplate(id: ID!) : CouponTemplate
//            customerCoupons(options) : { items, totalItems }
//   - Mutation createCouponTemplate(input: CreateCouponTemplateInput!)、
//            updateCouponTemplate(input: UpdateCouponTemplateInput!)、deleteCouponTemplate(id)、
//            grantCoupon(templateId, customerIds): [String!]、revokeCustomerCoupon(id)
//   - CouponTemplate.name/description 由后端 field resolver 按会话语言本地化为纯字符串输出；
//     创建/更新时 name/description 为 String!/String 标量，只能传纯字符串（当前仅提交 zh）。
//     （实体 name 虽为 LocalizedText，但 admin input schema 未开放多语言输入，en 投递需后端增强。）
//   - shopId 由后端从当前管理员店铺自动解析并做属店隔离，前端不传。
import { getAdminClient, graphQlErrorMsg } from './client';

export type CouponType = 'FIXED' | 'PERCENT' | 'FULL' | 'FREE_SHIPPING';
export type CouponScope = 'ALL' | 'CATEGORY' | 'SKU';
export type CouponUsageScene = 'ONLINE' | 'IN_STORE' | 'ALL';

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
  usageScene: CouponUsageScene;
  /** 分发渠道（逗号分隔：CENTRE,SALE,POINTS,CODE,PRODUCT,GRANT）；null=未显式配置（按老字段推导） */
  distributionChannels?: string | null;
  /** 出售价（分）；0=不可售 */
  salePrice: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CouponTemplateInput {
  name: string;
  description?: string;
  nameZh?: string;
  nameEn?: string;
  descZh?: string;
  descEn?: string;
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
  usageScene?: CouponUsageScene;
  /** 分发渠道（逗号分隔）；不传=不改/不配置 */
  distributionChannels?: string;
  /** 出售价（分）；0=不可售 */
  salePrice?: number;
}

const FIELDS = `id name nameZh nameEn description descZh descEn type discountValue minSpend startsAt endsAt totalCount claimedCount pointsPrice perUserLimit scope categoryId variantId enabled claimable claimCode validDays newCustomerOnly memberLevel shopId usageScene distributionChannels salePrice createdAt updatedAt`;

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
      `mutation CreateCouponTemplate($input: CreateCouponTemplateInput!) { createCouponTemplate(input: $input) { id } }`,
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
      `mutation UpdateCouponTemplate($input: UpdateCouponTemplateInput!) { updateCouponTemplate(input: $input) { id } }`,
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

/* ------------------------- 券使用明细（customerCoupons） ------------------------- */

export interface CustomerCouponRow {
  id: string;
  customerId: string;
  code: string;
  status: string;
  issuedBy: string;
  reservedOrderId?: string | null;
  usedOrderId?: string | null;
  issuedAt?: string | null;
  usedAt?: string | null;
  expiredAt?: string | null;
  customer?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    phoneNumber?: string | null;
  } | null;
}

export const COUPON_STATUS_LABELS: Record<string, string> = {
  UNUSED: '未使用',
  USED: '已核销',
  RETURNED: '已退回',
  EXPIRED: '已过期',
  INVALID: '已失效',
};
export const COUPON_ISSUED_BY_LABELS: Record<string, string> = {
  CENTRE: '领取',
  ADMIN: '定向发放',
  EXCHANGE: '兑换',
  SALE: '购买',
};

/** 某券模板的领取明细（分页；status 为空取全部） */
export async function fetchCustomerCoupons(
  templateId: string,
  skip: number,
  take: number,
  status?: string,
): Promise<{ items: CustomerCouponRow[]; totalItems: number }> {
  try {
    const { customerCoupons } = await getAdminClient().request<{
      customerCoupons: { items: CustomerCouponRow[]; totalItems: number };
    }>(
      `query CustomerCoupons($options: CustomerCouponListOptions) {
        customerCoupons(options: $options) {
          items { id customerId code status issuedBy usedOrderId issuedAt usedAt expiredAt customer { id firstName lastName phoneNumber } }
          totalItems
        }
      }`,
      {
        options: {
          filter: status
            ? { templateId: { eq: templateId }, status: { eq: status } }
            : { templateId: { eq: templateId } },
          sort: { issuedAt: 'DESC' },
          skip,
          take,
        },
      },
    );
    return { items: customerCoupons?.items ?? [], totalItems: customerCoupons?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询券明细失败'));
  }
}

/* ------------------------- 分发渠道 / 出售价（coupon-plugin 计划1/2） ------------------------- */

/** 渠道代号顺序与后端 ALL_COUPON_CHANNELS 一致 */
export const COUPON_CHANNEL_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'CENTRE', label: '领券中心' },
  { code: 'SALE', label: '券商城' },
  { code: 'POINTS', label: '积分商城' },
  { code: 'CODE', label: '兑换码' },
  { code: 'PRODUCT', label: '商品页领券' },
  { code: 'GRANT', label: '定向发放' },
];

/** 逗号分隔渠道串 → 代号数组（去空白/未知值） */
export function parseChannels(raw?: string | null): string[] {
  if (!raw) return [];
  const valid = COUPON_CHANNEL_OPTIONS.map((c) => c.code);
  const out: string[] = [];
  for (const p of String(raw).split(',')) {
    const code = p.trim().toUpperCase();
    if (valid.includes(code) && !out.includes(code)) out.push(code);
  }
  return out;
}

/** 代号数组 → 逗号分隔串（按固定顺序归一） */
export function joinChannels(codes: string[]): string {
  const set = new Set(codes);
  return COUPON_CHANNEL_OPTIONS.filter((c) => set.has(c.code))
    .map((c) => c.code)
    .join(',');
}

/* ------------------------- 券包（CouponBundle） ------------------------- */

export interface CouponBundleItemRow {
  id: string;
  bundleId: string;
  templateId: string;
  quantity: number;
}

export interface CouponBundleRow {
  id: string;
  name: string;
  description?: string | null;
  salePrice: number;
  enabled: boolean;
  shopId?: string | null;
  channelId: string;
  items: CouponBundleItemRow[];
}

export interface CouponBundleInput {
  name: string;
  description?: string;
  salePrice: number;
  enabled?: boolean;
  items: Array<{ templateId: string; quantity: number }>;
}

const BUNDLE_FIELDS = `id name description salePrice enabled shopId channelId items { id bundleId templateId quantity }`;

export async function fetchCouponBundles(
  options: { skip: number; take: number },
): Promise<{ items: CouponBundleRow[]; totalItems: number }> {
  try {
    const { couponBundles } = await getAdminClient().request<{
      couponBundles: { items: CouponBundleRow[]; totalItems: number };
    }>(
      `query CouponBundles($options: CouponBundleListOptions) {
        couponBundles(options: $options) { items { ${BUNDLE_FIELDS} } totalItems }
      }`,
      { options },
    );
    return { items: couponBundles?.items ?? [], totalItems: couponBundles?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载券包失败'));
  }
}

export async function fetchCouponBundle(id: string): Promise<CouponBundleRow | null> {
  try {
    const { couponBundle } = await getAdminClient().request<{ couponBundle: CouponBundleRow | null }>(
      `query CouponBundle($id: ID!) { couponBundle(id: $id) { ${BUNDLE_FIELDS} } }`,
      { id },
    );
    return couponBundle ?? null;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载券包失败'));
  }
}

export async function createCouponBundle(input: CouponBundleInput): Promise<string> {
  try {
    const { createCouponBundle } = await getAdminClient().request<{ createCouponBundle: { id: string } }>(
      `mutation CreateCouponBundle($input: CouponBundleInput!) { createCouponBundle(input: $input) { id } }`,
      { input },
    );
    return createCouponBundle.id;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '创建券包失败'));
  }
}

export async function updateCouponBundle(id: string, input: CouponBundleInput): Promise<string> {
  try {
    const { updateCouponBundle } = await getAdminClient().request<{ updateCouponBundle: { id: string } }>(
      `mutation UpdateCouponBundle($id: ID!, $input: CouponBundleInput!) { updateCouponBundle(id: $id, input: $input) { id } }`,
      { id, input },
    );
    return updateCouponBundle.id;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '保存券包失败'));
  }
}

export async function deleteCouponBundle(id: string): Promise<boolean> {
  try {
    const { deleteCouponBundle } = await getAdminClient().request<{ deleteCouponBundle: boolean }>(
      `mutation DeleteCouponBundle($id: ID!) { deleteCouponBundle(id: $id) }`,
      { id },
    );
    return !!deleteCouponBundle;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '删除券包失败'));
  }
}

/* ------------------------- 出售单流水（CouponSaleOrder） ------------------------- */

export interface CouponSaleOrderRow {
  id: string;
  customerId: string;
  payMode: string;
  templateId?: string | null;
  bundleId?: string | null;
  orderId?: string | null;
  amount: number;
  status: string;
  paymentMethod?: string | null;
  externalRef?: string | null;
  paidAt?: string | null;
  refundedAt?: string | null;
  createdAt: string;
}

export const SALE_STATUS_LABELS: Record<string, string> = {
  PENDING: '待支付',
  PAID: '已支付',
  CANCELLED: '已取消',
  REFUNDED: '已退款',
};

export const SALE_PAY_MODE_LABELS: Record<string, string> = {
  WECHAT: '微信支付',
  BALANCE: '余额支付',
  ORDER_SURCHARGE: '加价购',
};

const SALE_ORDER_FIELDS = `id customerId payMode templateId bundleId orderId amount status paymentMethod externalRef paidAt refundedAt createdAt`;

export async function fetchCouponSaleOrders(options: {
  skip: number;
  take: number;
  status?: string;
}): Promise<{ items: CouponSaleOrderRow[]; totalItems: number }> {
  try {
    const { couponSaleOrders } = await getAdminClient().request<{
      couponSaleOrders: { items: CouponSaleOrderRow[]; totalItems: number };
    }>(
      `query CouponSaleOrders($options: CouponSaleOrderListOptions) {
        couponSaleOrders(options: $options) { items { ${SALE_ORDER_FIELDS} } totalItems }
      }`,
      { options: { skip: options.skip, take: options.take, status: options.status || undefined } },
    );
    return { items: couponSaleOrders?.items ?? [], totalItems: couponSaleOrders?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载出售单失败'));
  }
}

export async function refundCouponSaleOrder(id: string, reason?: string): Promise<CouponSaleOrderRow> {
  try {
    const { refundCouponSaleOrder } = await getAdminClient().request<{ refundCouponSaleOrder: CouponSaleOrderRow }>(
      `mutation RefundCouponSaleOrder($id: ID!, $reason: String) {
        refundCouponSaleOrder(id: $id, reason: $reason) { ${SALE_ORDER_FIELDS} }
      }`,
      { id, reason: reason || undefined },
    );
    return refundCouponSaleOrder;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '退款失败'));
  }
}

/* ------------------------- 批量绑品（绑定商品到券模板） ------------------------- */

export interface CouponBoundProductRow {
  id: string;
  productId: string;
  variantIds: string[] | null;
  couponTemplateId: string;
  enabled: boolean;
}

/** 券模板已绑定的商品列表 */
export async function fetchCouponBoundProducts(templateId: string): Promise<CouponBoundProductRow[]> {
  try {
    const { couponBoundProducts } = await getAdminClient().request<{ couponBoundProducts: CouponBoundProductRow[] }>(
      `query CouponBoundProducts($templateId: ID!) {
        couponBoundProducts(templateId: $templateId) { id productId variantIds couponTemplateId enabled }
      }`,
      { templateId },
    );
    return couponBoundProducts ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载已绑商品失败'));
  }
}

/**
 * 批量绑定商品到券模板（商品级；variantIds 对全部 productIds 统一生效，
 * 故本页不传 variantIds = 全规格适用）。返回新建的绑定数。
 */
export async function bindProductsToCoupon(
  templateId: string,
  productIds: string[],
  variantIds?: string[],
): Promise<number> {
  try {
    const { bindProductsToCoupon } = await getAdminClient().request<{ bindProductsToCoupon: number }>(
      `mutation BindProductsToCoupon($templateId: ID!, $productIds: [ID!]!, $variantIds: [ID!]) {
        bindProductsToCoupon(templateId: $templateId, productIds: $productIds, variantIds: $variantIds)
      }`,
      { templateId, productIds, variantIds: variantIds?.length ? variantIds : undefined },
    );
    return bindProductsToCoupon;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '批量绑定商品失败'));
  }
}

/** 解绑：按商品维度移除该券模板下该商品的绑定（后端按 productId 删除） */
export async function unbindProductFromCoupon(templateId: string, productId: string): Promise<boolean> {
  try {
    const { unbindProductFromCoupon } = await getAdminClient().request<{ unbindProductFromCoupon: boolean }>(
      `mutation UnbindProductFromCoupon($templateId: ID!, $productId: ID!) {
        unbindProductFromCoupon(templateId: $templateId, productId: $productId)
      }`,
      { templateId, productId },
    );
    return !!unbindProductFromCoupon;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '解绑商品失败'));
  }
}