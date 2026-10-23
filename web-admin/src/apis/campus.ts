// 拾光达（校内配送）域 admin-api 调用：店铺配置列表 + upsert
// 后端：campus-delivery-plugin admin-api（campusStoreConfigs / campusUpdateStoreConfig，
// 权限 CampusConfig）。金额字段均为「分」，页面层用 utils/money 做分↔元转换。
import { getAdminClient } from './client';

export interface CampusRouteCarrier {
  route: string;
  carrier: string; // R1: merchant|owned；R3: campus|owned|external
}

export interface CampusHandoverPoint {
  route: string; // R1 / R2
  name: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  /** 无收货坐标时的兜底默认点（每条路线仅一个） */
  isDefault: boolean;
}

export interface CampusProviderShopNo {
  provider: string; // dada | meituan
  shopNo: string;
}

export interface CampusStoreConfig {
  channelId: string;
  channelName: string;
  channelToken: string;
  routesEnabled: string[];
  routeFirstLeg: CampusRouteCarrier[];
  handoverPoints: CampusHandoverPoint[];
  providerShopNo: CampusProviderShopNo[];
  merchantAcceptMinutes: number;
  externalPushTimeoutMinutes: number;
  externalFallbackMinutes: number;
  storeLat: number | null;
  storeLng: number | null;
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
  notifyTemplateOrderPlaced: string | null;
  notifyTemplatePaymentPending: string | null;
  notifyTemplateCancelled: string | null;
  notifyTemplateAfterSales: string | null;
  h5BaseUrl: string | null;
  printMode: string; // 'off' | 'onPaid' | 'onAccepted'
  timeoutCompensationEnabled: boolean;
  timeoutGraceMinutes: number;
  timeoutCompensationCouponTemplateId: string | null;
  /** 动态计价配置 JSON 字符串（null=关闭） */
  dynamicPricing: string | null;
}

export interface CampusStoreConfigInput {
  routesEnabled: string[];
  routeFirstLeg?: CampusRouteCarrier[] | null;
  handoverPoints?: CampusHandoverPoint[] | null;
  providerShopNo?: CampusProviderShopNo[] | null;
  merchantAcceptMinutes?: number | null;
  externalPushTimeoutMinutes?: number | null;
  externalFallbackMinutes?: number | null;
  storeLat?: number | null;
  storeLng?: number | null;
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
  notifyTemplateOrderPlaced?: string | null;
  notifyTemplatePaymentPending?: string | null;
  notifyTemplateCancelled?: string | null;
  notifyTemplateAfterSales?: string | null;
  h5BaseUrl?: string | null;
  printMode?: string | null;
  timeoutCompensationEnabled?: boolean | null;
  timeoutGraceMinutes?: number | null;
  timeoutCompensationCouponTemplateId?: string | null;
  dynamicPricing?: string | null;
}

const FIELDS =
  'channelId channelName channelToken routesEnabled routeFirstLeg { route carrier } handoverPoints { route name address phone lat lng isDefault } providerShopNo { provider shopNo } merchantAcceptMinutes externalPushTimeoutMinutes externalFallbackMinutes storeLat storeLng deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice errandBaseFee freeShippingThreshold notifyTemplateAccepted notifyTemplateRiderAssigned notifyTemplateCookingDone notifyTemplateDelivered notifyTemplateExceptionHandled notifyTemplateOrderPlaced notifyTemplatePaymentPending notifyTemplateCancelled notifyTemplateAfterSales h5BaseUrl printMode timeoutCompensationEnabled timeoutGraceMinutes timeoutCompensationCouponTemplateId dynamicPricing';

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
  shipping: number;
  building: string;
  zone: string;
  slotText: string;
  route: string;
  riderName: string | null;
  note: string | null; // 顾客整单备注（工作台展示 + 小票打印）
  printedAt: string | null; // 小票最近打印时间（null=未打）
  provider: string | null; // 外部快递：dada | meituan
  thirdPartyNo: string | null; // 外部快递平台单号
  handoverCode: string | null; // 交接码（第一段送达交接点后生成，骑手取货核对）
  lines: MerchantBoardLine[];
}

export interface CampusMerchantBoard {
  paused: boolean;
  merchantConfirmEnabled: boolean;
  printMode: string; // 'off' | 'onPaid' | 'onAccepted'
  storeName: string;
  storePhone: string | null;
  pending: MerchantBoardOrder[];
  cooking: MerchantBoardOrder[];
  awaitingRider: MerchantBoardOrder[];
  delivering: MerchantBoardOrder[];
  pendingDispatch: MerchantBoardOrder[]; // 待运营推送外部快递（R2 / R3-外部）
  thirdParty: MerchantBoardOrder[]; // 外部快递配送中
  ownedPool: MerchantBoardOrder[]; // 待自营快递接单（R3）
  ownedDispatched: MerchantBoardOrder[]; // 自营快递配送中
  merchantDelivering: MerchantBoardOrder[]; // 商户送校园交接点（R1）
  scheduled: MerchantBoardOrder[]; // 预约单（plan 3.1）：已支付未放量，到点前 30min 自动进入待接单/大厅
  completedToday: number;
  completedTodayAmount: number;
}

const ORDER_FIELDS =
  'id code createdAt total shipping building zone slotText route riderName printedAt provider thirdPartyNo handoverCode lines { name quantity price }';

export async function campusMerchantBoard(): Promise<CampusMerchantBoard> {
  const res = await getAdminClient().request<{ campusMerchantBoard: CampusMerchantBoard }>(
    `query { campusMerchantBoard {
      paused merchantConfirmEnabled printMode storeName storePhone completedToday completedTodayAmount
      pending { ${ORDER_FIELDS} } cooking { ${ORDER_FIELDS} }
      awaitingRider { ${ORDER_FIELDS} } delivering { ${ORDER_FIELDS} }
      pendingDispatch { ${ORDER_FIELDS} } thirdParty { ${ORDER_FIELDS} }
      ownedPool { ${ORDER_FIELDS} } ownedDispatched { ${ORDER_FIELDS} }
      merchantDelivering { ${ORDER_FIELDS} }
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

/** 小票打印回执：打印成功后回写 waimaiPrintedAt（防重打 + 补打依据） */
export async function campusMerchantMarkPrinted(orderId: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusMerchantMarkPrinted: { ok: boolean } }>(
    `mutation ($orderId: ID!) { campusMerchantMarkPrinted(orderId: $orderId) { ok } }`,
    { orderId },
  );
  return res.campusMerchantMarkPrinted.ok;
}

/** 推送外部快递：provider = dada | meituan（运营中心/商家在派单时选择） */
export async function campusMerchantDispatchExternal(
  orderId: string,
  provider: 'dada' | 'meituan',
): Promise<{ ok: boolean; provider: string | null; thirdPartyNo: string | null; already: boolean | null }> {
  const res = await getAdminClient().request<{ campusMerchantDispatchExternal: any }>(
    `mutation ($orderId: ID!, $provider: String!) {
      campusMerchantDispatchExternal(orderId: $orderId, provider: $provider) { ok provider thirdPartyNo already }
    }`,
    { orderId, provider },
  );
  return res.campusMerchantDispatchExternal;
}

/** 取消外部快递（改推另一家前先取消） */
export async function campusMerchantCancelExternal(orderId: string, reason?: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusMerchantCancelExternal: { ok: boolean } }>(
    `mutation ($orderId: ID!, $reason: String) {
      campusMerchantCancelExternal(orderId: $orderId, reason: $reason) { ok }
    }`,
    { orderId, reason: reason ?? null },
  );
  return res.campusMerchantCancelExternal.ok;
}

/** 自营快递接单（R1 商户超时转自营 / R3 自营池） */
export async function campusMerchantAcceptOwned(orderId: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusMerchantAcceptOwned: { ok: boolean } }>(
    `mutation ($orderId: ID!) { campusMerchantAcceptOwned(orderId: $orderId) { ok } }`,
    { orderId },
  );
  return res.campusMerchantAcceptOwned.ok;
}

/** R1：商户把餐送到校园交接点（之后传信者接力） */
export async function campusMerchantMarkHandoverArrived(orderId: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusMerchantMarkHandoverArrived: { ok: boolean } }>(
    `mutation ($orderId: ID!) { campusMerchantMarkHandoverArrived(orderId: $orderId) { ok } }`,
    { orderId },
  );
  return res.campusMerchantMarkHandoverArrived.ok;
}

/** 自营快递送达：R1/R2 到交接点，R3 到学生 */
export async function campusMerchantMarkOwnedArrived(orderId: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusMerchantMarkOwnedArrived: { ok: boolean } }>(
    `mutation ($orderId: ID!) { campusMerchantMarkOwnedArrived(orderId: $orderId) { ok } }`,
    { orderId },
  );
  return res.campusMerchantMarkOwnedArrived.ok;
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

// ===== 配送数据看板（CampusViewDispatch 权限，跨店铺聚合）=====

export interface CampusDeliveryStats {
  range: string;
  windowStart: string;
  kpis: {
    totalOrders: number;
    onTimeRate: number;
    avgDeliveryMinutes: number;
    timeoutCompensated: number;
  };
  dailyTrend: Array<{ date: string; orders: number; onTimeRate: number }>;
  stages: Array<{ key: string; label: string; avgMinutes: number }>;
  attribution: { merchant: number; rider: number; platform: number };
  storeComparison: Array<{ channelId: string; channelName: string; orders: number; onTimeRate: number }>;
}

export async function campusDeliveryStats(range: string): Promise<CampusDeliveryStats> {
  const res = await getAdminClient().request<{ campusDeliveryStats: CampusDeliveryStats }>(
    `query ($range: String) { campusDeliveryStats(range: $range) {
      range windowStart
      kpis { totalOrders onTimeRate avgDeliveryMinutes timeoutCompensated }
      dailyTrend { date orders onTimeRate }
      stages { key label avgMinutes }
      attribution { merchant rider platform }
      storeComparison { channelId channelName orders onTimeRate }
    } }`,
    { range },
  );
  return res.campusDeliveryStats;
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

// ===== 楼栋坐标维护（CampusConfig 权限，渠道隔离）=====

export interface CampusZone {
  id: string;
  name: string;
  fee: number;
}

export interface CampusBuilding {
  id: string;
  name: string;
  detail: string | null;
  lat: number | null;
  lng: number | null;
  zoneId: string;
}

export interface CampusBuildingPatch {
  name?: string;
  detail?: string | null;
  lat?: number | null;
  lng?: number | null;
}

const BUILDING_FIELDS = 'id name detail lat lng zoneId';

export async function campusZones(): Promise<CampusZone[]> {
  const res = await getAdminClient().request<{ campusZones: CampusZone[] }>(
    `query { campusZones { id name fee } }`,
  );
  return res.campusZones;
}

export async function campusBuildings(zoneId?: string): Promise<CampusBuilding[]> {
  const res = await getAdminClient().request<{ campusBuildings: CampusBuilding[] }>(
    `query ($zoneId: ID) { campusBuildings(zoneId: $zoneId) { ${BUILDING_FIELDS} } }`,
    { zoneId: zoneId ?? null },
  );
  return res.campusBuildings;
}

export async function campusUpdateBuilding(id: string, input: CampusBuildingPatch): Promise<CampusBuilding> {
  const res = await getAdminClient().request<{ campusUpdateBuilding: CampusBuilding }>(
    `mutation ($id: ID!, $input: CampusBuildingPatchInput!) {
      campusUpdateBuilding(id: $id, input: $input) { ${BUILDING_FIELDS} }
    }`,
    { id, input },
  );
  return res.campusUpdateBuilding;
}

export async function campusCreateBuilding(
  name: string,
  zoneId: string,
  detail?: string | null,
  lat?: number | null,
  lng?: number | null,
): Promise<CampusBuilding> {
  const res = await getAdminClient().request<{ campusCreateBuilding: CampusBuilding }>(
    `mutation ($name: String!, $zoneId: ID!, $detail: String, $lat: Float, $lng: Float) {
      campusCreateBuilding(name: $name, zoneId: $zoneId, detail: $detail, lat: $lat, lng: $lng) { ${BUILDING_FIELDS} }
    }`,
    { name, zoneId, detail: detail ?? null, lat: lat ?? null, lng: lng ?? null },
  );
  return res.campusCreateBuilding;
}

// ===== 改址台账（CampusConfig 权限，渠道隔离）=====

export interface CampusAddressChangeRow {
  id: string;
  orderId: string;
  orderCode: string;
  customerId: string | null;
  fromZone: string;
  fromBuilding: string;
  fromDetail: string | null;
  toZone: string;
  toBuilding: string;
  toDetail: string | null;
  /** 分 */
  oldFee: number;
  /** 分 */
  newFee: number;
  /** 分：正=待收，负=待退 */
  diff: number;
  /** pending | settled */
  status: string;
  settledAt: string | null;
  /** refund | collect | waive */
  settleAction: string | null;
  /** customer=顾客自助 | admin=运营代改 */
  source: string | null;
  /** 代改原因（运营代改必填） */
  reason: string | null;
  /** 发起人 userId */
  changedBy: string | null;
  createdAt: string;
}

export interface CampusAddressChangeStats {
  total: number;
  pendingCount: number;
  /** 待收差额合计（分，正数） */
  pendingCollect: number;
  /** 待退差额合计（分，正数） */
  pendingRefund: number;
}

const ADDRESS_CHANGE_FIELDS =
  'id orderId orderCode customerId fromZone fromBuilding fromDetail toZone toBuilding toDetail oldFee newFee diff status settledAt settleAction source reason changedBy createdAt';

export async function campusAddressChanges(
  status?: string | null,
  skip?: number,
  take?: number,
): Promise<CampusAddressChangeRow[]> {
  const res = await getAdminClient().request<{ campusAddressChanges: CampusAddressChangeRow[] }>(
    `query ($status: String, $skip: Int, $take: Int) {
      campusAddressChanges(status: $status, skip: $skip, take: $take) { ${ADDRESS_CHANGE_FIELDS} }
    }`,
    { status: status ?? null, skip: skip ?? null, take: take ?? null },
  );
  return res.campusAddressChanges;
}

export async function campusAddressChangeStats(): Promise<CampusAddressChangeStats> {
  const res = await getAdminClient().request<{ campusAddressChangeStats: CampusAddressChangeStats }>(
    `query { campusAddressChangeStats { total pendingCount pendingCollect pendingRefund } }`,
  );
  return res.campusAddressChangeStats;
}

/** action: refund（已退）| collect（已收）| waive（免收）| pending（撤销结清） */
export async function campusSettleAddressChange(
  id: string,
  action: string,
): Promise<CampusAddressChangeRow> {
  const res = await getAdminClient().request<{ campusSettleAddressChange: CampusAddressChangeRow }>(
    `mutation ($id: ID!, $action: String!) {
      campusSettleAddressChange(id: $id, action: $action) { ${ADDRESS_CHANGE_FIELDS} }
    }`,
    { id, action },
  );
  return res.campusSettleAddressChange;
}

// ===== 运营代客改址 + 改址试算（CampusConfig 权限）=====

export interface CampusAddressChangeQuote {
  /** 分：订单当前运费 */
  oldFee: number;
  /** 分：改址后运费 */
  newFee: number;
  /** 分：正=需补收，负=需退款 */
  diff: number;
  zoneId: string;
  zoneName: string;
  buildings: Array<{ id: string; name: string }>;
}

/** 改址差额试算（不落台账、不改订单） */
export async function campusAdminQuoteAddressChange(
  orderId: string,
  zoneId: string,
): Promise<CampusAddressChangeQuote> {
  const res = await getAdminClient().request<{ campusAdminQuoteAddressChange: CampusAddressChangeQuote }>(
    `query ($orderId: ID!, $zoneId: ID!) {
      campusAdminQuoteAddressChange(orderId: $orderId, zoneId: $zoneId) {
        oldFee newFee diff zoneId zoneName buildings { id name }
      }
    }`,
    { orderId, zoneId },
  );
  return res.campusAdminQuoteAddressChange;
}

export interface CampusAddressChangeResult {
  diff: number;
  oldFee: number;
  newFee: number;
  fromZone: string;
  toZone: string;
  recordId: string;
}

/** 运营代客改址：取货后也可代改，必须填写原因 */
export async function campusAdminChangeDeliveryAddress(
  orderId: string,
  zoneId: string,
  buildingId: string,
  detail: string | null,
  reason: string,
): Promise<CampusAddressChangeResult> {
  const res = await getAdminClient().request<{ campusAdminChangeDeliveryAddress: CampusAddressChangeResult }>(
    `mutation ($orderId: ID!, $zoneId: ID!, $buildingId: ID!, $detail: String, $reason: String!) {
      campusAdminChangeDeliveryAddress(orderId: $orderId, zoneId: $zoneId, buildingId: $buildingId, detail: $detail, reason: $reason) {
        diff oldFee newFee fromZone toZone recordId
      }
    }`,
    { orderId, zoneId, buildingId, detail: detail || null, reason },
  );
  return res.campusAdminChangeDeliveryAddress;
}

// ===== 动态计价试算预览（CampusConfig 权限）=====

export interface CampusPricingBreakdownItem {
  key: string; // peak | supply | multiplier
  label: string;
  /** 分 */
  fee: number;
}

export interface CampusDynamicPricingZoneQuote {
  zoneId: string;
  zoneName: string;
  /** 分 */
  baseFee: number;
  /** 分 */
  price: number;
  /** 分 */
  addFee: number;
  breakdown: CampusPricingBreakdownItem[];
}

export interface CampusDynamicPricingPreview {
  at: string;
  enabled: boolean;
  /** 大厅待抢单量 */
  backlog: number;
  onlineRiders: number;
  manualMultiplier: number;
  /** 分 */
  maxAddFee: number;
  supply: { backlogThreshold: number; riderThreshold: number | null; addFee: number } | null;
  peakWindows: Array<{ label: string | null; start: string; end: string; addFee: number }>;
  zones: CampusDynamicPricingZoneQuote[];
}

export async function campusDynamicPricingPreview(): Promise<CampusDynamicPricingPreview> {
  const res = await getAdminClient().request<{ campusDynamicPricingPreview: CampusDynamicPricingPreview }>(
    `query { campusDynamicPricingPreview {
      at enabled backlog onlineRiders manualMultiplier maxAddFee
      supply { backlogThreshold riderThreshold addFee }
      peakWindows { label start end addFee }
      zones { zoneId zoneName baseFee price addFee breakdown { key label fee } }
    } }`,
  );
  return res.campusDynamicPricingPreview;
}
