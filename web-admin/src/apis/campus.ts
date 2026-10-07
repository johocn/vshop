// 拾光达（校内配送）域 admin-api 调用：店铺配置列表 + upsert
// 后端：campus-delivery-plugin admin-api（campusStoreConfigs / campusUpdateStoreConfig，
// 权限 CampusConfig）。金额字段均为「分」，页面层用 utils/money 做分↔元转换。
import { getAdminClient } from './client';

export interface CampusStoreConfig {
  channelId: string;
  channelName: string;
  channelToken: string;
  routesEnabled: string[];
  deliveryMinutes: number | null;
  minOrderAmount: number | null;
  deliveryFee: number | null;
  storeAddress: string | null;
  storePhone: string | null;
  storeNotice: string | null;
  errandBaseFee: number | null;
  freeShippingThreshold: number | null;
  notifyTemplateAccepted: string | null;
  notifyTemplateRiderAssigned: string | null;
  notifyTemplateCookingDone: string | null;
  notifyTemplateDelivered: string | null;
  notifyTemplateExceptionHandled: string | null;
}

export interface CampusStoreConfigInput {
  routesEnabled: string[];
  deliveryMinutes?: number | null;
  minOrderAmount?: number | null;
  deliveryFee?: number | null;
  storeAddress?: string | null;
  storePhone?: string | null;
  storeNotice?: string | null;
  errandBaseFee?: number | null;
  freeShippingThreshold?: number | null;
  notifyTemplateAccepted?: string | null;
  notifyTemplateRiderAssigned?: string | null;
  notifyTemplateCookingDone?: string | null;
  notifyTemplateDelivered?: string | null;
  notifyTemplateExceptionHandled?: string | null;
}

const FIELDS =
  'channelId channelName channelToken routesEnabled deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice errandBaseFee freeShippingThreshold notifyTemplateAccepted notifyTemplateRiderAssigned notifyTemplateCookingDone notifyTemplateDelivered notifyTemplateExceptionHandled';

export async function campusStoreConfigs(): Promise<CampusStoreConfig[]> {
  const res = await getAdminClient().request<{ campusStoreConfigs: CampusStoreConfig[] }>(
    `query { campusStoreConfigs { ${FIELDS} } }`,
  );
  return res.campusStoreConfigs;
}

export async function campusUpdateStoreConfig(
  channelId: string,
  input: CampusStoreConfigInput,
): Promise<CampusStoreConfig> {
  const res = await getAdminClient().request<{ campusUpdateStoreConfig: CampusStoreConfig }>(
    `mutation ($channelId: ID!, $input: CampusStoreConfigInput!) {
      campusUpdateStoreConfig(channelId: $channelId, input: $input) { ${FIELDS} }
    }`,
    { channelId, input },
  );
  return res.campusUpdateStoreConfig;
}

export interface CampusEnsureProfileResult {
  profileId: string;
  profileName: string;
  linkedMethodCodes: string[];
  missingMethodCodes: string[];
  boundVariantCount: number;
}

/** R2/R4 档案冲突治本：get-or-create 渠道合并默认配送档案并补绑未绑档案变体（幂等） */
export async function campusEnsureDefaultShippingProfile(
  channelId: string,
): Promise<CampusEnsureProfileResult> {
  const res = await getAdminClient().request<{ campusEnsureDefaultShippingProfile: CampusEnsureProfileResult }>(
    `mutation ($channelId: ID!) {
      campusEnsureDefaultShippingProfile(channelId: $channelId) {
        profileId profileName linkedMethodCodes missingMethodCodes boundVariantCount
      }
    }`,
    { channelId },
  );
  return res.campusEnsureDefaultShippingProfile;
}

// ===== 商家接单工作台（CampusMerchant 权限，渠道隔离 = 商家角色绑定渠道）=====

export interface MerchantBoardLine {
  name: string;
  quantity: number;
  price: number;
}

export interface MerchantBoardOrder {
  id: string;
  code: string;
  createdAt: string;
  total: number;
  building: string;
  zone: string;
  slotText: string;
  route: string;
  riderName: string | null;
  lines: MerchantBoardLine[];
}

export interface CampusMerchantBoard {
  paused: boolean;
  merchantConfirmEnabled: boolean;
  pending: MerchantBoardOrder[];
  cooking: MerchantBoardOrder[];
  awaitingRider: MerchantBoardOrder[];
  delivering: MerchantBoardOrder[];
  scheduled: MerchantBoardOrder[]; // 预约单（plan 3.1）：已支付未放量，到点前 30min 自动进入待接单/大厅
  completedToday: number;
  completedTodayAmount: number;
}

const ORDER_FIELDS =
  'id code createdAt total building zone slotText route riderName lines { name quantity price }';

export async function campusMerchantBoard(): Promise<CampusMerchantBoard> {
  const res = await getAdminClient().request<{ campusMerchantBoard: CampusMerchantBoard }>(
    `query { campusMerchantBoard {
      paused merchantConfirmEnabled completedToday completedTodayAmount
      pending { ${ORDER_FIELDS} } cooking { ${ORDER_FIELDS} }
      awaitingRider { ${ORDER_FIELDS} } delivering { ${ORDER_FIELDS} }
      scheduled { ${ORDER_FIELDS} }
    } }`,
  );
  return res.campusMerchantBoard;
}

export async function campusMerchantAcceptOrder(orderId: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusMerchantAcceptOrder: { ok: boolean } }>(
    `mutation ($orderId: ID!) { campusMerchantAcceptOrder(orderId: $orderId) { ok } }`,
    { orderId },
  );
  return res.campusMerchantAcceptOrder.ok;
}

export async function campusMerchantCookingDone(orderId: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusMerchantCookingDone: { ok: boolean } }>(
    `mutation ($orderId: ID!) { campusMerchantCookingDone(orderId: $orderId) { ok } }`,
    { orderId },
  );
  return res.campusMerchantCookingDone.ok;
}

export async function campusMerchantSetPaused(paused: boolean): Promise<boolean> {
  const res = await getAdminClient().request<{ campusMerchantSetPaused: { ok: boolean } }>(
    `mutation ($paused: Boolean!) { campusMerchantSetPaused(paused: $paused) { ok } }`,
    { paused },
  );
  return res.campusMerchantSetPaused.ok;
}

// ===== 调度操作台（CampusViewDispatch 权限，复用 dispatch-admin 既有 API）=====

export interface DispatchAlert {
  orderId: string;
  orderCode: string;
  type: string;
  detail: string;
}

export interface DispatchRider {
  customerId: string;
  realName: string;
  credit: number;
}

export interface DispatchOrder {
  id: string;
  code: string;
  createdAt: string;
  total: number;
  customFields: {
    hallStatus: string | null;
    hallEnteredAt: string | null;
    deliveryStatus: string | null;
    assignedAt: string | null;
    campusZone: string | null;
    buildingId: string | null;
    campusCause: string | null;
    exceptionType: string | null;
    exceptionNote: string | null;
    exceptionPhotos: string[] | null;
  };
}

/** 已处置完结的异常单留痕（plan 3.4） */
export interface HandedException {
  orderId: string;
  orderCode: string;
  exceptionType: string | null;
  action: string;
  compensation: number | null;
  couponTemplateId: string | null;
  note: string | null;
  handledAt: string | null;
  handledBy: string;
}

export interface CampusDispatchBoardData {
  paused: boolean;
  alerts: DispatchAlert[];
  hallOrders: DispatchOrder[];
  activeOrders: DispatchOrder[];
  ridersOnline: DispatchRider[];
  handledOrders: HandedException[];
}

const DISPATCH_ORDER_FIELDS = `id code createdAt total
  customFields { hallStatus hallEnteredAt deliveryStatus assignedAt campusZone buildingId campusCause exceptionType exceptionNote exceptionPhotos routeGroupId }`;

export async function campusDispatchBoard(): Promise<CampusDispatchBoardData> {
  const res = await getAdminClient().request<{ campusDispatchBoard: CampusDispatchBoardData }>(
    `query { campusDispatchBoard {
      paused alerts { orderId orderCode type detail }
      hallOrders { ${DISPATCH_ORDER_FIELDS} }
      activeOrders { ${DISPATCH_ORDER_FIELDS} }
      ridersOnline { customerId realName credit }
      handledOrders { orderId orderCode exceptionType action compensation couponTemplateId note handledAt handledBy }
    } }`,
  );
  return res.campusDispatchBoard;
}

export async function campusDispatchAssign(orderId: string, riderCustomerId: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusAssignOrder: { assigned: boolean } }>(
    `mutation ($orderId: ID!, $riderCustomerId: ID!) {
      campusAssignOrder(orderId: $orderId, riderCustomerId: $riderCustomerId) { assigned backToHall }
    }`,
    { orderId, riderCustomerId },
  );
  return res.campusAssignOrder.assigned;
}

export async function campusDispatchBackToHall(orderId: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusBackToHall: { backToHall: boolean } }>(
    `mutation ($orderId: ID!) { campusBackToHall(orderId: $orderId) { assigned backToHall } }`,
    { orderId },
  );
  return res.campusBackToHall.backToHall;
}

/** 异常处置（plan 3.4）：reassign 回大厅 / refund_diff 退差价（amount 分）/ coupon 发补偿券 / refund_all 全额退单 */
export async function campusHandleException(
  orderId: string,
  action: string,
  opts?: { amount?: number; couponTemplateId?: string; note?: string },
): Promise<{ ok: boolean; action: string }> {
  const res = await getAdminClient().request<{ campusHandleException: { ok: boolean; action: string } }>(
    `mutation ($orderId: ID!, $action: String!, $amount: Int, $couponTemplateId: ID, $note: String) {
      campusHandleException(orderId: $orderId, action: $action, amount: $amount, couponTemplateId: $couponTemplateId, note: $note) { ok action }
    }`,
    {
      orderId,
      action,
      amount: opts?.amount ?? null,
      couponTemplateId: opts?.couponTemplateId ?? null,
      note: opts?.note ?? null,
    },
  );
  return res.campusHandleException;
}
