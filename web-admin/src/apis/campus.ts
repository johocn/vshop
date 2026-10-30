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
  thirdPartyBaseFee: number | null;
  freeShippingThreshold: number | null;
  /** 配送费阶梯 JSON：[{minAmount:分, fee:分}]（null=不启用） */
  deliveryFeeTiers: string | null;
  notifyTemplateAccepted: string | null;
  notifyTemplateRiderAssigned: string | null;
  notifyTemplateCookingDone: string | null;
  notifyTemplateDelivered: string | null;
  notifyTemplateExceptionHandled: string | null;
  notifyTemplateOrderPlaced: string | null;
  notifyTemplatePaymentPending: string | null;
  notifyTemplateCancelled: string | null;
  notifyTemplateAfterSales: string | null;
  notifyTemplateAddressChanged: string | null;
  h5BaseUrl: string | null;
  printMode: string; // 'off' | 'onPaid' | 'onAccepted'
  /** 打印通道（P1-4）：local=本地 C-Lodop / feie=飞鹅 / yilianyun=易联云 */
  printProvider: string;
  printAccount: string | null;
  printDeviceSn: string | null;
  printDeviceKey: string | null;
  printCopies: number;
  timeoutCompensationEnabled: boolean;
  timeoutGraceMinutes: number;
  timeoutCompensationWindowHours: number;
  timeoutCompensationCouponTemplateId: string | null;
  /** 动态计价配置 JSON 字符串（null=关闭） */
  dynamicPricing: string | null;
  privacyNumberEnabled: boolean;
  privacyNumberProvider: string;
  privacyNumberTtlMinutes: number;
  privacyNumberPrefix: string | null;
  foodLicenseNo: string | null;
  foodLicenseImage: string | null;
  foodLicenseExpiry: string | null;
  foodSafetyGrade: string | null;
  foodSafetyCommitmentImage: string | null;
  kitchenLiveUrl: string | null;
  kitchenLiveEnabled: boolean;
  packingFeeEnabled: boolean;
  packingFeeMode: string;
  packingFeeAmount: number;
  packingFeeCap: number | null;
  packingFeeLabel: string | null;
  /** 小程序上架配置（P2-1） */
  mpAppId: string | null;
  mpCategory: string | null;
  mpVersion: string | null;
  mpListingStatus: string; // draft | inReview | online | rejected | offline
  mpPrivacyUrl: string | null;
  mpReviewNote: string | null;
  /** 上架前检查是否齐全（AppID/类目/版本/隐私指引/客服电话/食品许可证） */
  mpReady: boolean;
  /** 上架前检查缺项 key：appId / category / version / privacyUrl / contactPhone / licenseNo */
  mpMissing: string[];
  /** 语音/拍照搜索服务商（P2-2）：mock / none */
  voiceSearchProvider: string;
  imageSearchProvider: string;
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
  thirdPartyBaseFee?: number | null;
  freeShippingThreshold?: number | null;
  /** 配送费阶梯 JSON：[{minAmount:分, fee:分}]；null 关闭 */
  deliveryFeeTiers?: string | null;
  notifyTemplateAccepted?: string | null;
  notifyTemplateRiderAssigned?: string | null;
  notifyTemplateCookingDone?: string | null;
  notifyTemplateDelivered?: string | null;
  notifyTemplateExceptionHandled?: string | null;
  notifyTemplateOrderPlaced?: string | null;
  notifyTemplatePaymentPending?: string | null;
  notifyTemplateCancelled?: string | null;
  notifyTemplateAfterSales?: string | null;
  notifyTemplateAddressChanged?: string | null;
  h5BaseUrl?: string | null;
  printMode?: string | null;
  printProvider?: string | null;
  printAccount?: string | null;
  printDeviceSn?: string | null;
  printDeviceKey?: string | null;
  printCopies?: number | null;
  timeoutCompensationEnabled?: boolean | null;
  timeoutGraceMinutes?: number | null;
  timeoutCompensationWindowHours?: number | null;
  timeoutCompensationCouponTemplateId?: string | null;
  dynamicPricing?: string | null;
  privacyNumberEnabled?: boolean | null;
  privacyNumberProvider?: string | null;
  privacyNumberTtlMinutes?: number | null;
  privacyNumberPrefix?: string | null;
  foodLicenseNo?: string | null;
  foodLicenseImage?: string | null;
  foodLicenseExpiry?: string | null;
  foodSafetyGrade?: string | null;
  foodSafetyCommitmentImage?: string | null;
  kitchenLiveUrl?: string | null;
  kitchenLiveEnabled?: boolean | null;
  packingFeeEnabled?: boolean | null;
  packingFeeMode?: string | null;
  packingFeeAmount?: number | null;
  packingFeeCap?: number | null;
  packingFeeLabel?: string | null;
  mpAppId?: string | null;
  mpCategory?: string | null;
  mpVersion?: string | null;
  mpListingStatus?: string | null;
  mpPrivacyUrl?: string | null;
  mpReviewNote?: string | null;
  voiceSearchProvider?: string | null;
  imageSearchProvider?: string | null;
}

const FIELDS =
  'channelId channelName channelToken routesEnabled routeFirstLeg { route carrier } handoverPoints { route name address phone lat lng isDefault } providerShopNo { provider shopNo } merchantAcceptMinutes externalPushTimeoutMinutes externalFallbackMinutes storeLat storeLng deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice errandBaseFee thirdPartyBaseFee freeShippingThreshold deliveryFeeTiers notifyTemplateAccepted notifyTemplateRiderAssigned notifyTemplateCookingDone notifyTemplateDelivered notifyTemplateExceptionHandled notifyTemplateOrderPlaced notifyTemplatePaymentPending notifyTemplateCancelled notifyTemplateAfterSales notifyTemplateAddressChanged h5BaseUrl printMode printProvider printAccount printDeviceSn printDeviceKey printCopies timeoutCompensationEnabled timeoutGraceMinutes timeoutCompensationWindowHours timeoutCompensationCouponTemplateId dynamicPricing privacyNumberEnabled privacyNumberProvider privacyNumberTtlMinutes privacyNumberPrefix foodLicenseNo foodLicenseImage foodLicenseExpiry foodSafetyGrade foodSafetyCommitmentImage kitchenLiveUrl kitchenLiveEnabled packingFeeEnabled packingFeeMode packingFeeAmount packingFeeCap packingFeeLabel mpAppId mpCategory mpVersion mpListingStatus mpPrivacyUrl mpReviewNote mpReady mpMissing voiceSearchProvider imageSearchProvider';

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
  customerPhone: string | null; // 顾客手机号（脱敏，号码保护同口径）；工作台检索/联系用
  /** 顾客催单待处理（§78）：顾客催过且商家未「已知晓」 */
  urged: boolean;
  /** 顾客最近一次催单时间（null=从未催单） */
  urgedAt: string | null;
  lines: MerchantBoardLine[];
}

/** 营业时间自动切换（自动开门 / 自动打烊）：服务端按 UTC+8 计算 */
export interface CampusBusinessTransition {
  action: 'open' | 'close'; // open=到点自动开门，close=到点自动打烊
  at: string; // 切换时刻 HH:mm
  inMinutes: number; // 距切换分钟数（>=1）
  today: boolean; // false=明天
}

export interface CampusMerchantBoard {
  paused: boolean;
  /** 营业时段内且未临时休息（自动开关门生效依据） */
  openNow: boolean;
  /** 本店营业时间（空=全天营业） */
  businessHours: string | null;
  /** 下一次自动开门/打烊（null=全天营业） */
  nextTransition: CampusBusinessTransition | null;
  merchantConfirmEnabled: boolean;
  printMode: string; // 'off' | 'onPaid' | 'onAccepted'
  /** 打印通道（P1-4）：local / feie / yilianyun */
  printProvider: string;
  /** 云通道账号/设备/密钥是否已配齐 */
  cloudPrintConfigured: boolean;
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
  /** 今日休业（§70 营业日历），true 时 C 端「今日休业」且禁止下单 */
  closedToday: boolean;
  /** 今日休业备注（空=无备注或未休业） */
  closureNote: string | null;
  /** 未出餐订单数（§71）：待接单 + 备餐中 */
  unfinishedOrders: number;
  /** 待处理顾客催单数（§78） */
  urgedCount: number;
}

/** 商家自助经营：门店资料（营业时间/公告/电话/营业状态） */
export interface MerchantStoreProfile {
  storeName: string;
  businessHours: string | null;
  storeNotice: string | null;
  storePhone: string | null;
  paused: boolean;
  openNow: boolean; // 营业时段内、未临时休息且今日不在休业日历（服务端按 UTC+8 判定）
  /** 今日休业（§70 营业日历）：C 端展示「今日休业」并禁止下单 */
  closedToday: boolean;
  /** 今日休业备注（如「国庆假期」），null=无备注或未休业 */
  closureNote: string | null;
  /** 已登记的休业日期（升序，已过期的不返回） */
  closureDates: Array<{ date: string; note: string | null }>;
  /** 下一次自动开门/打烊（null=全天营业），供经营设置页倒计时与打烊前提醒 */
  nextTransition: CampusBusinessTransition | null;
  /** 未出餐订单数（§71）：待接单 + 备餐中 */
  unfinishedOrders: number;
}

/** 经营数据分桶（分）：营业额=已送达订单实付；取消=全额退款口径 */
export interface MerchantRevenueBucket {
  orders: number;
  gross: number;
  avgTicket: number;
  cancelled: number;
  cancelledAmount: number;
}

export interface MerchantRevenueDay {
  date: string; // MM-DD
  orders: number;
  gross: number;
  cancelled: number;
  cancelledAmount: number;
}

export interface MerchantRevenue {
  today: MerchantRevenueBucket;
  last7: MerchantRevenueBucket;
  days: MerchantRevenueDay[];
  /** P3-2 导出用：近 30 日（含今日）逐日明细 */
  days30: MerchantRevenueDay[];
}

const ORDER_FIELDS =
  'id code createdAt total shipping building zone slotText route riderName printedAt provider thirdPartyNo handoverCode customerPhone urged urgedAt lines { name quantity price }';

export async function campusMerchantBoard(): Promise<CampusMerchantBoard> {
  const res = await getAdminClient().request<{ campusMerchantBoard: CampusMerchantBoard }>(
    `query { campusMerchantBoard {
      paused openNow businessHours nextTransition { action at inMinutes today }
      merchantConfirmEnabled printMode printProvider cloudPrintConfigured storeName storePhone completedToday completedTodayAmount
      closedToday closureNote unfinishedOrders
      urgedCount
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

/** 已完成订单明细（§75 对账）：金额单位与工作台一致，退款已单独列示 */
export interface MerchantCompletedOrder {
  id: string;
  code: string;
  /** 送达时间（对账归时点；历史脏数据可能为 null） */
  deliveredAt: string | null;
  createdAt: string;
  total: number;
  refundAmount: number;
  /** 剩余可退金额（分，§76）：已支付 − 已退；0 = 不可退 */
  refundable: number;
  netAmount: number;
  building: string;
  zone: string;
  route: string;
  riderName: string | null;
  /** 顾客手机号（脱敏） */
  customerPhone: string | null;
  /** 商品摘要：宫保鸡丁×1、米饭×2 */
  lineText: string;
  note: string | null;
}

/** 已完成订单列表 + 区间汇总（汇总不受分页影响） */
export interface MerchantCompletedOrders {
  items: MerchantCompletedOrder[];
  total: number;
  totalAmount: number;
  refundAmount: number;
  netAmount: number;
  avgTicket: number;
  start: string;
  end: string;
}

/** 今日/区间已完成订单明细（§75）：from/to 为空=今日 0 点（UTC+8）至当前 */
export async function campusMerchantCompletedOrders(
  params: { from?: string; to?: string; take?: number; skip?: number } = {},
): Promise<MerchantCompletedOrders> {
  const res = await getAdminClient().request<{ campusMerchantCompletedOrders: MerchantCompletedOrders }>(
    `query ($from: String, $to: String, $take: Int, $skip: Int) {
      campusMerchantCompletedOrders(from: $from, to: $to, take: $take, skip: $skip) {
        items { id code deliveredAt createdAt total refundAmount refundable netAmount building zone route riderName customerPhone lineText note }
        total totalAmount refundAmount netAmount avgTicket start end
      }
    }`,
    params,
  );
  return res.campusMerchantCompletedOrders;
}

/** 商家发起退款回执（§76）：金额单位分 */
export interface CampusMerchantRefundResult {
  ok: boolean;
  /** 本次退款金额（分） */
  amount: number;
  /** 该单累计已退（分） */
  refundedTotal: number;
  /** 处理后剩余可退（分） */
  refundable: number;
}

/** 商家发起退款（§76）：已送达订单整单/部分退款，amount 为分，必须填原因 */
export async function campusMerchantRefundOrder(
  orderId: string,
  amount: number,
  reason: string,
): Promise<CampusMerchantRefundResult> {
  const res = await getAdminClient().request<{ campusMerchantRefundOrder: CampusMerchantRefundResult }>(
    `mutation ($orderId: ID!, $amount: Int!, $reason: String!) {
      campusMerchantRefundOrder(orderId: $orderId, amount: $amount, reason: $reason) {
        ok amount refundedTotal refundable
      }
    }`,
    { orderId, amount, reason },
  );
  return res.campusMerchantRefundOrder;
}

/** 退款记录行（§77 台账）：一笔退款单一行，金额单位分 */
export interface MerchantRefundRow {
  id: string;
  orderId: string;
  code: string;
  amount: number;
  /** 退款单状态：Pending/Settled/Failed 等 */
  state: string;
  /** 退款原因（后端已去掉「merchant refund (单号):」留痕前缀） */
  reason: string;
  /** merchant=商家发起 / platform=平台处置 */
  source: string;
  createdAt: string;
  building: string;
  zone: string;
}

/** 退款台账 + 区间汇总（§77，汇总不受分页影响） */
export interface MerchantRefundList {
  items: MerchantRefundRow[];
  /** 区间退款笔数（排除 Failed） */
  count: number;
  /** 区间退款总额（分，排除 Failed） */
  amount: number;
  failedCount: number;
  failedAmount: number;
  /** 区间退款单总数（含失败，用于分页） */
  total: number;
  start: string;
  end: string;
}

/** 退款记录台账（§77）：from/to 为空=今日 0 点（UTC+8）至当前 */
export async function campusMerchantRefunds(
  params: { from?: string; to?: string; take?: number; skip?: number } = {},
): Promise<MerchantRefundList> {
  const res = await getAdminClient().request<{ campusMerchantRefunds: MerchantRefundList }>(
    `query ($from: String, $to: String, $take: Int, $skip: Int) {
      campusMerchantRefunds(from: $from, to: $to, take: $take, skip: $skip) {
        items { id orderId code amount state reason source createdAt building zone }
        count amount failedCount failedAmount total start end
      }
    }`,
    params,
  );
  return res.campusMerchantRefunds;
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

/** 批量操作失败明细（§73）：失败单跳过、不影响已成功单 */
export interface CampusMerchantBatchFailure {
  orderId: string;
  message: string;
}

/** 批量操作结果：ok=成功单数；failed=失败单明细（逐单回报） */
export interface CampusMerchantBatchResult {
  ok: number;
  failed: CampusMerchantBatchFailure[];
}

const BATCH_FIELDS = 'ok failed { orderId message }';

/** 工作台批量接单（§73）：多选待接单一次接单，逐单走既有状态机 */
export async function campusMerchantBatchAcceptOrders(orderIds: string[]): Promise<CampusMerchantBatchResult> {
  const res = await getAdminClient().request<{ campusMerchantBatchAcceptOrders: CampusMerchantBatchResult }>(
    `mutation ($orderIds: [ID!]!) { campusMerchantBatchAcceptOrders(orderIds: $orderIds) { ${BATCH_FIELDS} } }`,
    { orderIds },
  );
  return res.campusMerchantBatchAcceptOrders;
}

/** 工作台批量出餐（§73）：多选备餐中一次出餐，失败单跳过并在结果中回报 */
export async function campusMerchantBatchCookingDoneOrders(orderIds: string[]): Promise<CampusMerchantBatchResult> {
  const res = await getAdminClient().request<{ campusMerchantBatchCookingDoneOrders: CampusMerchantBatchResult }>(
    `mutation ($orderIds: [ID!]!) { campusMerchantBatchCookingDoneOrders(orderIds: $orderIds) { ${BATCH_FIELDS} } }`,
    { orderIds },
  );
  return res.campusMerchantBatchCookingDoneOrders;
}

/** 商家拒单/缺货：全额退款并取消订单（接单前或备餐中可用，必须填原因） */
export async function campusMerchantRejectOrder(orderId: string, reason: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusMerchantRejectOrder: { ok: boolean } }>(
    `mutation ($orderId: ID!, $reason: String!) {
      campusMerchantRejectOrder(orderId: $orderId, reason: $reason) { ok }
    }`,
    { orderId, reason },
  );
  return res.campusMerchantRejectOrder.ok;
}

export async function campusMerchantSetPaused(paused: boolean): Promise<boolean> {
  const res = await getAdminClient().request<{ campusMerchantSetPaused: { ok: boolean } }>(
    `mutation ($paused: Boolean!) { campusMerchantSetPaused(paused: $paused) { ok } }`,
    { paused },
  );
  return res.campusMerchantSetPaused.ok;
}

const STORE_PROFILE_FIELDS = 'storeName businessHours storeNotice storePhone paused openNow'
  + ' closedToday closureNote closureDates { date note }'
  + ' nextTransition { action at inMinutes today } unfinishedOrders';

/** 商家自助经营：门店资料 */
export async function campusMerchantStoreProfile(): Promise<MerchantStoreProfile> {
  const res = await getAdminClient().request<{ campusMerchantStoreProfile: MerchantStoreProfile }>(
    `query { campusMerchantStoreProfile { ${STORE_PROFILE_FIELDS} } }`,
  );
  return res.campusMerchantStoreProfile;
}

/** 商家自助修改门店资料：只改本渠道；营业时间留空=全天营业 */
export async function campusMerchantUpdateStore(input: {
  businessHours?: string | null;
  storeNotice?: string | null;
  storePhone?: string | null;
}): Promise<MerchantStoreProfile> {
  const res = await getAdminClient().request<{ campusMerchantUpdateStore: MerchantStoreProfile }>(
    `mutation ($businessHours: String, $storeNotice: String, $storePhone: String) {
      campusMerchantUpdateStore(businessHours: $businessHours, storeNotice: $storeNotice, storePhone: $storePhone) {
        ${STORE_PROFILE_FIELDS}
      }
    }`,
    {
      businessHours: input.businessHours ?? null,
      storeNotice: input.storeNotice ?? null,
      storePhone: input.storePhone ?? null,
    },
  );
  return res.campusMerchantUpdateStore;
}

/** 营业日历（§70）：整表覆盖保存休业日期；date=YYYY-MM-DD，note 可选，传空数组=清空 */
export async function campusMerchantSetClosureDates(
  dates: Array<{ date: string; note?: string | null }>,
): Promise<MerchantStoreProfile> {
  const res = await getAdminClient().request<{ campusMerchantSetClosureDates: MerchantStoreProfile }>(
    `mutation ($dates: String) {
      campusMerchantSetClosureDates(dates: $dates) { ${STORE_PROFILE_FIELDS} }
    }`,
    { dates: JSON.stringify(dates ?? []) },
  );
  return res.campusMerchantSetClosureDates;
}

/** 商家自动接单设置（§69）：acceptedToday=本校园日已自动接单数，openNow=false 时静默暂停 */
export interface CampusMerchantAutoAccept {
  enabled: boolean;
  delaySeconds: number;
  dailyLimit: number; // 0 = 不限
  routes: string[]; // R1/R2/R3
  acceptedToday: number;
  openNow: boolean;
  merchantConfirmEnabled: boolean;
}

const AUTO_ACCEPT_FIELDS = 'enabled delaySeconds dailyLimit routes acceptedToday openNow merchantConfirmEnabled';

export async function campusMerchantAutoAccept(): Promise<CampusMerchantAutoAccept> {
  const res = await getAdminClient().request<{ campusMerchantAutoAccept: CampusMerchantAutoAccept }>(
    `query { campusMerchantAutoAccept { ${AUTO_ACCEPT_FIELDS} } }`,
  );
  return res.campusMerchantAutoAccept;
}

/** 保存自动接单设置：delaySeconds 0-600，dailyLimit 0=不限，routes 仅 R1/R2/R3 */
export async function campusMerchantUpdateAutoAccept(input: {
  enabled: boolean;
  delaySeconds?: number | null;
  dailyLimit?: number | null;
  routes?: string[] | null;
}): Promise<CampusMerchantAutoAccept> {
  const res = await getAdminClient().request<{ campusMerchantUpdateAutoAccept: CampusMerchantAutoAccept }>(
    `mutation ($enabled: Boolean!, $delaySeconds: Int, $dailyLimit: Int, $routes: [String!]) {
      campusMerchantUpdateAutoAccept(enabled: $enabled, delaySeconds: $delaySeconds, dailyLimit: $dailyLimit, routes: $routes) {
        ${AUTO_ACCEPT_FIELDS}
      }
    }`,
    {
      enabled: input.enabled,
      delaySeconds: input.delaySeconds ?? null,
      dailyLimit: input.dailyLimit ?? null,
      routes: input.routes ?? null,
    },
  );
  return res.campusMerchantUpdateAutoAccept;
}

const REVENUE_BUCKET_FIELDS = 'orders gross avgTicket cancelled cancelledAmount';

/** 经营数据：今日 / 近 7 日 / 逐日趋势 */
export async function campusMerchantRevenue(): Promise<MerchantRevenue> {
  const res = await getAdminClient().request<{ campusMerchantRevenue: MerchantRevenue }>(
    `query { campusMerchantRevenue {
      today { ${REVENUE_BUCKET_FIELDS} }
      last7 { ${REVENUE_BUCKET_FIELDS} }
      days { date orders gross cancelled cancelledAmount }
      days30 { date orders gross cancelled cancelledAmount }
    } }`,
  );
  return res.campusMerchantRevenue;
}

/** 小票打印回执：打印成功后回写 waimaiPrintedAt（防重打 + 补打依据） */
export async function campusMerchantMarkPrinted(orderId: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusMerchantMarkPrinted: { ok: boolean } }>(
    `mutation ($orderId: ID!) { campusMerchantMarkPrinted(orderId: $orderId) { ok } }`,
    { orderId },
  );
  return res.campusMerchantMarkPrinted.ok;
}

/** 顾客催单「已知晓」（§78）：商家确认后解除工作台/出餐屏催单提醒（顾客再催会重新提醒） */
export async function campusMerchantAckUrge(orderId: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusMerchantAckUrge: { ok: boolean } }>(
    `mutation ($orderId: ID!) { campusMerchantAckUrge(orderId: $orderId) { ok } }`,
    { orderId },
  );
  return res.campusMerchantAckUrge.ok;
}

/** ===== P1-4 云打印 / KDS 出餐屏 ===== */

export interface CampusPrintResult {
  ok: boolean;
  provider: string;
  dryRun: boolean;
  jobId: string | null;
  error: string | null;
}

/** 云打印一张小票：后端签名直连服务商，成功后回写打印时间（本地 LODOP 通道会返回 error） */
export async function campusMerchantCloudPrint(orderId: string): Promise<CampusPrintResult> {
  const res = await getAdminClient().request<{ campusMerchantCloudPrint: CampusPrintResult }>(
    `mutation ($orderId: ID!) {
      campusMerchantCloudPrint(orderId: $orderId) { ok provider dryRun jobId error }
    }`,
    { orderId },
  );
  return res.campusMerchantCloudPrint;
}

/** 云打印连通性测试：不绑定订单，仅验证账号/设备/密钥 */
export async function campusMerchantCloudPrintTest(): Promise<CampusPrintResult> {
  const res = await getAdminClient().request<{ campusMerchantCloudPrintTest: CampusPrintResult }>(
    `mutation { campusMerchantCloudPrintTest { ok provider dryRun jobId error } }`,
  );
  return res.campusMerchantCloudPrintTest;
}

export interface CampusPrintJob {
  id: string;
  orderId: string | null;
  orderCode: string | null;
  provider: string;
  deviceSn: string | null;
  status: string; // ok | failed | pending
  triggerType: string; // auto | manual | test
  copies: number;
  dryRun: boolean;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

/** 最近云打印任务：失败原因/耗时排障 */
export async function campusMerchantPrintJobs(limit = 20): Promise<CampusPrintJob[]> {
  const res = await getAdminClient().request<{ campusMerchantPrintJobs: CampusPrintJob[] }>(
    `query ($limit: Int) {
      campusMerchantPrintJobs(limit: $limit) {
        id orderId orderCode provider deviceSn status triggerType copies dryRun errorMessage durationMs createdAt
      }
    }`,
    { limit },
  );
  return res.campusMerchantPrintJobs;
}

export interface CampusKitchenLine {
  name: string;
  quantity: number;
  addons: string[];
}

export interface CampusKitchenTicket {
  id: string;
  code: string;
  stage: 'pending' | 'cooking';
  createdAt: string;
  waitingMinutes: number;
  urgency: 'normal' | 'warn' | 'late';
  zone: string;
  building: string;
  slotText: string;
  note: string | null;
  printedAt: string | null;
  total: number;
  /** 顾客催单待处理（§78）：出餐屏置顶并标红 */
  urged: boolean;
  lines: CampusKitchenLine[];
}

export interface CampusKitchenQueue {
  tickets: CampusKitchenTicket[];
  pendingCount: number;
  cookingCount: number;
  lateCount: number;
  /** 待处理顾客催单数（§78） */
  urgedCount: number;
  warnMinutes: number;
  lateMinutes: number;
}

/** KDS 出餐屏队列：待接单 + 备餐中，按支付先后排序 */
export async function campusMerchantKitchenQueue(): Promise<CampusKitchenQueue> {
  const res = await getAdminClient().request<{ campusMerchantKitchenQueue: CampusKitchenQueue }>(
    `query { campusMerchantKitchenQueue {
      pendingCount cookingCount lateCount urgedCount warnMinutes lateMinutes
      tickets {
        id code stage createdAt waitingMinutes urgency zone building slotText note printedAt total urged
        lines { name quantity addons }
      }
    } }`,
  );
  return res.campusMerchantKitchenQueue;
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
    /** R1..R5 履约路线（R2/R3 可走外部快递） */
    fulfillmentRoute: string | null;
    /** 外部快递平台单号；有值且 thirdPartyState 非 cancelled/exception 表示在途 */
    thirdPartyNo: string | null;
    thirdPartyState: string | null;
    deliveryPlan: string | null;
    thirdPartyProvider: string | null;
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
  customFields { hallStatus hallEnteredAt deliveryStatus assignedAt campusZone buildingId campusCause exceptionType exceptionNote exceptionPhotos routeGroupId
    fulfillmentRoute thirdPartyNo thirdPartyState deliveryPlan thirdPartyProvider }`;

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

// ===== 经营分析（CampusViewDispatch 权限，跨店铺聚合）=====

export interface CampusSalesKpi {
  orders: number;
  /** 分 */
  gmvFen: number;
  /** 分 */
  aovFen: number;
  customers: number;
  newCustomers: number;
  /** 百分比数值（0-100） */
  repurchaseRate: number;
}

export interface CampusSalesStats {
  range: string;
  windowStart: string;
  kpis: CampusSalesKpi;
  /** 上一窗口同口径 */
  prev: CampusSalesKpi;
  /** 环比百分比数值，可为负；上期为 0 时后端返回 0（前端按 prev 判空显示 —） */
  compare: { ordersPct: number; gmvPct: number; aovPct: number; repurchaseRatePct: number };
  hourlyHeat: Array<{ hour: number; orders: number; gmvFen: number }>;
  dailyTrend: Array<{ date: string; orders: number; gmvFen: number }>;
  products: Array<{
    productId: string;
    name: string;
    quantity: number;
    gmvFen: number;
    quadrant: string;
    categories: Array<{ id: string; name: string }>;
  }>;
  cohorts: { once: number; twiceToFour: number; loyal: number };
  /** 四象限分隔线：销量中位数 */
  medianQuantity: number;
  /** 四象限分隔线：销售额中位数（分） */
  medianGmvFen: number;
}

/** range=today|7d|30d；传 from/to（YYYY-MM-DD）则按自定义自然日区间统计（含首尾两天） */
export async function campusSalesStats(
  range?: string | null,
  from?: string | null,
  to?: string | null,
): Promise<CampusSalesStats> {
  const res = await getAdminClient().request<{ campusSalesStats: CampusSalesStats }>(
    `query ($range: String, $from: String, $to: String) { campusSalesStats(range: $range, from: $from, to: $to) {
      range windowStart
      kpis { orders gmvFen aovFen customers newCustomers repurchaseRate }
      prev { orders gmvFen aovFen customers newCustomers repurchaseRate }
      compare { ordersPct gmvPct aovPct repurchaseRatePct }
      hourlyHeat { hour orders gmvFen }
      dailyTrend { date orders gmvFen }
      products { productId name quantity gmvFen quadrant categories { id name } }
      cohorts { once twiceToFour loyal }
      medianQuantity medianGmvFen
    } }`,
    { range: range ?? null, from: from ?? null, to: to ?? null },
  );
  return res.campusSalesStats;
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

// ===== 履约参数 + 时段容量（CampusConfig 权限，渠道隔离）=====

/** 渠道履约参数（campusConfig）：派单/退款/SLA/商家确认/超时赔付等 */
export interface CampusFulfillmentConfigData {
  id: string;
  channelId: string;
  routesEnabled: string[];
  /** 骑手分成百分比 */
  riderCommissionRate: number;
  autoAssignMinutes: number;
  paused: boolean;
  autoRefundMinutes: number;
  inProgressSlaMinutes: number;
  compensationCouponTemplateId: string | null;
  merchantConfirmEnabled: boolean;
  merchantAutoOpenMinutes: number;
  freeShippingThreshold: number | null;
  timeoutCompensationEnabled: boolean;
  timeoutGraceMinutes: number;
  timeoutCompensationWindowHours: number;
  timeoutCompensationCouponTemplateId: string | null;
  /** 接单班次校验：开启后骑手仅能在后台登记的排班时段内抢单 */
  shiftCheckEnabled: boolean;
  /** 自动拉黑阈值：近 30 天顾客主动取消达到该次数自动拉黑（0=关闭） */
  blacklistAutoCancelCount: number;
}

export interface CampusFulfillmentConfigPatch {
  routesEnabled?: string[];
  riderCommissionRate?: number;
  autoAssignMinutes?: number;
  paused?: boolean;
  autoRefundMinutes?: number;
  inProgressSlaMinutes?: number;
  compensationCouponTemplateId?: string | null;
  merchantConfirmEnabled?: boolean;
  merchantAutoOpenMinutes?: number;
  timeoutCompensationEnabled?: boolean;
  timeoutGraceMinutes?: number;
  timeoutCompensationWindowHours?: number;
  timeoutCompensationCouponTemplateId?: string | null;
  shiftCheckEnabled?: boolean;
  blacklistAutoCancelCount?: number;
}

const CONFIG_FIELDS =
  'id channelId routesEnabled riderCommissionRate autoAssignMinutes paused autoRefundMinutes inProgressSlaMinutes compensationCouponTemplateId merchantConfirmEnabled merchantAutoOpenMinutes freeShippingThreshold timeoutCompensationEnabled timeoutGraceMinutes timeoutCompensationWindowHours timeoutCompensationCouponTemplateId shiftCheckEnabled blacklistAutoCancelCount';

export async function campusConfig(): Promise<CampusFulfillmentConfigData> {
  const res = await getAdminClient().request<{ campusConfig: CampusFulfillmentConfigData }>(
    `query { campusConfig { ${CONFIG_FIELDS} } }`,
  );
  return res.campusConfig;
}

export async function campusUpdateConfig(
  input: CampusFulfillmentConfigPatch,
): Promise<CampusFulfillmentConfigData> {
  const res = await getAdminClient().request<{ campusUpdateConfig: CampusFulfillmentConfigData }>(
    `mutation ($input: CampusFulfillmentConfigInput!) {
      campusUpdateConfig(input: $input) { ${CONFIG_FIELDS} }
    }`,
    { input },
  );
  return res.campusUpdateConfig;
}

export interface CampusDeliverySlot {
  id: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  zoneId: string | null;
  capacity: number;
  lockedCount: number;
  active: boolean;
}

const SLOT_FIELDS = 'id slotDate startTime endTime zoneId capacity lockedCount active';

export async function campusSlots(): Promise<CampusDeliverySlot[]> {
  const res = await getAdminClient().request<{ campusSlots: CampusDeliverySlot[] }>(
    `query { campusSlots { ${SLOT_FIELDS} } }`,
  );
  return res.campusSlots;
}

export async function campusCreateSlot(input: {
  slotDate: string;
  startTime: string;
  endTime: string;
  zoneId?: string | null;
  capacity?: number | null;
}): Promise<CampusDeliverySlot> {
  const res = await getAdminClient().request<{ campusCreateSlot: CampusDeliverySlot }>(
    `mutation ($input: DeliverySlotInput!) { campusCreateSlot(input: $input) { ${SLOT_FIELDS} } }`,
    { input: { ...input, zoneId: input.zoneId ?? null, capacity: input.capacity ?? null } },
  );
  return res.campusCreateSlot;
}

export async function campusUpdateSlot(
  id: string,
  input: { startTime?: string; endTime?: string; capacity?: number; active?: boolean },
): Promise<CampusDeliverySlot> {
  const res = await getAdminClient().request<{ campusUpdateSlot: CampusDeliverySlot }>(
    `mutation ($id: ID!, $input: DeliverySlotUpdateInput!) {
      campusUpdateSlot(id: $id, input: $input) { ${SLOT_FIELDS} }
    }`,
    { id, input },
  );
  return res.campusUpdateSlot;
}

/** 新增配送分区（此前只能手工 GraphQL/SQL 建，后台缺入口） */
export async function campusCreateZone(name: string, fee: number): Promise<CampusZone> {
  const res = await getAdminClient().request<{ campusCreateZone: CampusZone }>(
    `mutation ($name: String!, $fee: Int!) {
      campusCreateZone(name: $name, fee: $fee) { id name fee }
    }`,
    { name, fee },
  );
  return res.campusCreateZone;
}

/** 分区改名/改运费（名称被历史订单快照引用，仅影响后续下单） */
export async function campusUpdateZone(
  id: string,
  patch: { name?: string; fee?: number },
): Promise<CampusZone> {
  const res = await getAdminClient().request<{ campusUpdateZone: CampusZone }>(
    `mutation ($id: ID!, $name: String, $fee: Int) {
      campusUpdateZone(id: $id, name: $name, fee: $fee) { id name fee }
    }`,
    { id, name: patch.name ?? null, fee: patch.fee ?? null },
  );
  return res.campusUpdateZone;
}

/** 删除宿舍楼：有订单引用时后端拒绝 */
export async function campusDeleteBuilding(id: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusDeleteBuilding: boolean }>(
    `mutation ($id: ID!) { campusDeleteBuilding(id: $id) }`,
    { id },
  );
  return res.campusDeleteBuilding;
}

// ===== 运营中心外部快递推送（CampusViewDispatch 权限）=====

export async function campusAdminDispatchExternal(
  orderId: string,
  provider: 'dada' | 'meituan',
): Promise<{ ok: boolean; provider: string | null; thirdPartyNo: string | null; already: boolean | null }> {
  const res = await getAdminClient().request<{ campusAdminDispatchExternal: any }>(
    `mutation ($orderId: ID!, $provider: String!) {
      campusAdminDispatchExternal(orderId: $orderId, provider: $provider) { ok provider thirdPartyNo already }
    }`,
    { orderId, provider },
  );
  return res.campusAdminDispatchExternal;
}

export async function campusAdminCancelExternal(orderId: string, reason?: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusAdminCancelExternal: { ok: boolean } }>(
    `mutation ($orderId: ID!, $reason: String) {
      campusAdminCancelExternal(orderId: $orderId, reason: $reason) { ok }
    }`,
    { orderId, reason: reason ?? null },
  );
  return res.campusAdminCancelExternal.ok;
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
  /** 结清凭证：补收的收款方式/流水号，退款/免收的说明 */
  settleNote: string | null;
  /** 实际退款单 id（action=refund 且差额>0 时写入） */
  refundId: string | null;
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
  'id orderId orderCode customerId fromZone fromBuilding fromDetail toZone toBuilding toDetail oldFee newFee diff status settledAt settleAction settleNote refundId source reason changedBy createdAt';

export async function campusAddressChanges(
  status?: string | null,
  skip?: number,
  take?: number,
  orderId?: string | null,
): Promise<CampusAddressChangeRow[]> {
  const res = await getAdminClient().request<{ campusAddressChanges: CampusAddressChangeRow[] }>(
    `query ($status: String, $skip: Int, $take: Int, $orderId: ID) {
      campusAddressChanges(status: $status, skip: $skip, take: $take, orderId: $orderId) { ${ADDRESS_CHANGE_FIELDS} }
    }`,
    { status: status ?? null, skip: skip ?? null, take: take ?? null, orderId: orderId ?? null },
  );
  return res.campusAddressChanges;
}

export async function campusAddressChangeStats(): Promise<CampusAddressChangeStats> {
  const res = await getAdminClient().request<{ campusAddressChangeStats: CampusAddressChangeStats }>(
    `query { campusAddressChangeStats { total pendingCount pendingCollect pendingRefund } }`,
  );
  return res.campusAddressChangeStats;
}

/** action: refund（已退款，差额为负时走真实退款）| collect（已补收，需填凭证）| waive（免收）| pending（撤销结清） */
export async function campusSettleAddressChange(
  id: string,
  action: string,
  note?: string | null,
): Promise<CampusAddressChangeRow> {
  const res = await getAdminClient().request<{ campusSettleAddressChange: CampusAddressChangeRow }>(
    `mutation ($id: ID!, $action: String!, $note: String) {
      campusSettleAddressChange(id: $id, action: $action, note: $note) { ${ADDRESS_CHANGE_FIELDS} }
    }`,
    { id, action, note: note ?? null },
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

/** R5 跑腿起步价 / R2 第三方到校基价 的动态报价口径 */
export interface CampusDynamicPricingBaseQuote {
  /** errand | third-party */
  key: string;
  /** 是否显式配置了基价（跑腿未配置按默认 2 元；第三方未配置为 false） */
  configured: boolean;
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
  /** R5 跑腿起步价口径（未配置按默认 2 元） */
  errand: CampusDynamicPricingBaseQuote;
  /** R2 第三方到校基价口径（null = 不接管，沿用店铺普通快递运费） */
  thirdParty: CampusDynamicPricingBaseQuote | null;
  zones: CampusDynamicPricingZoneQuote[];
}

export async function campusDynamicPricingPreview(): Promise<CampusDynamicPricingPreview> {
  const res = await getAdminClient().request<{ campusDynamicPricingPreview: CampusDynamicPricingPreview }>(
    `query { campusDynamicPricingPreview {
      at enabled backlog onlineRiders manualMultiplier maxAddFee
      supply { backlogThreshold riderThreshold addFee }
      peakWindows { label start end addFee }
      errand { key configured baseFee price addFee breakdown { key label fee } }
      thirdParty { key configured baseFee price addFee breakdown { key label fee } }
      zones { zoneId zoneName baseFee price addFee breakdown { key label fee } }
    } }`,
  );
  return res.campusDynamicPricingPreview;
}

// ===== 在线客服 IM（CampusDispatch 权限，渠道隔离）=====

export interface CampusChatConversationRow {
  id: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  orderCode: string | null;
  subject: string | null;
  /** open | closed */
  status: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  /** customer | admin */
  lastSenderType: string | null;
  unreadForCustomer: number;
  unreadForAdmin: number;
  closedAt: string | null;
  createdAt: string;
}

export interface CampusChatMessageRow {
  id: string;
  conversationId: string;
  /** customer | admin */
  senderType: string;
  senderId: string | null;
  content: string | null;
  images: string[] | null;
  readAt: string | null;
  createdAt: string;
}

const CHAT_CONV_FIELDS =
  'id customerId customerName customerPhone orderCode subject status lastMessage lastMessageAt lastSenderType unreadForCustomer unreadForAdmin closedAt createdAt';
const CHAT_MSG_FIELDS = 'id conversationId senderType senderId content images readAt createdAt';

/** 会话列表：status=open|closed，unreadOnly=仅待回复（unreadForAdmin>0） */
export async function campusChatConversations(opts?: {
  status?: string | null;
  unreadOnly?: boolean;
  skip?: number;
  take?: number;
}): Promise<{ items: CampusChatConversationRow[]; total: number }> {
  const res = await getAdminClient().request<{
    campusChatConversations: { items: CampusChatConversationRow[]; total: number };
  }>(
    `query ($status: String, $unreadOnly: Boolean, $skip: Int, $take: Int) {
      campusChatConversations(status: $status, unreadOnly: $unreadOnly, skip: $skip, take: $take) {
        total items { ${CHAT_CONV_FIELDS} }
      }
    }`,
    {
      status: opts?.status ?? null,
      unreadOnly: opts?.unreadOnly ?? null,
      skip: opts?.skip ?? null,
      take: opts?.take ?? null,
    },
  );
  return res.campusChatConversations;
}

/** 待回复角标 */
export async function campusChatUnread(): Promise<{ conversationCount: number; messageCount: number }> {
  const res = await getAdminClient().request<{
    campusChatUnread: { conversationCount: number; messageCount: number };
  }>(`query { campusChatUnread { conversationCount messageCount } }`);
  return res.campusChatUnread;
}

/** 会话消息：afterId 增量拉取（轮询用） */
export async function campusAdminChatMessages(
  conversationId: string,
  afterId?: string | null,
  take?: number,
): Promise<CampusChatMessageRow[]> {
  const res = await getAdminClient().request<{ campusAdminChatMessages: CampusChatMessageRow[] }>(
    `query ($conversationId: ID!, $afterId: ID, $take: Int) {
      campusAdminChatMessages(conversationId: $conversationId, afterId: $afterId, take: $take) { ${CHAT_MSG_FIELDS} }
    }`,
    { conversationId, afterId: afterId ?? null, take: take ?? null },
  );
  return res.campusAdminChatMessages;
}

/** 后台回复（同时把该会话运营侧待回复计数清零、会话恢复 open） */
export async function campusReplyChat(
  conversationId: string,
  content: string,
): Promise<CampusChatMessageRow> {
  const res = await getAdminClient().request<{ campusReplyChat: CampusChatMessageRow }>(
    `mutation ($conversationId: ID!, $content: String) {
      campusReplyChat(conversationId: $conversationId, content: $content) { ${CHAT_MSG_FIELDS} }
    }`,
    { conversationId, content },
  );
  return res.campusReplyChat;
}

/** 结束会话（顾客端将显示已结束，可重新发起） */
export async function campusCloseChatConversation(
  conversationId: string,
): Promise<CampusChatConversationRow> {
  const res = await getAdminClient().request<{ campusCloseChatConversation: CampusChatConversationRow }>(
    `mutation ($conversationId: ID!) {
      campusCloseChatConversation(conversationId: $conversationId) { ${CHAT_CONV_FIELDS} }
    }`,
    { conversationId },
  );
  return res.campusCloseChatConversation;
}

// ── P2-3 广告位与商家自助投放计费 ─────────────────────────────
// 商家侧：报价 / 本渠道投放单 / 下单 / 模拟支付 / 取消
// 平台侧：按渠道查投放单 / 审核
export interface CampusAdSlot {
  code: string;
  name: string;
  unitPriceFen: number;
}

export interface CampusAdCampaignRow {
  id: string;
  channelId: string;
  slot: string;
  title: string;
  imageUrl: string | null;
  linkUrl: string | null;
  startDate: string;
  endDate: string;
  days: number;
  unitPriceFen: number;
  totalFen: number;
  status: string;
  live: boolean;
  payRef: string | null;
  paidAt: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
}

const AD_FIELDS =
  'id channelId slot title imageUrl linkUrl startDate endDate days unitPriceFen totalFen status live payRef paidAt reviewNote reviewedBy reviewedAt createdAt';

/** 广告位报价（分/天） */
export async function campusAdSlots(): Promise<CampusAdSlot[]> {
  const res = await getAdminClient().request<{ campusAdSlots: CampusAdSlot[] }>(
    `query { campusAdSlots { code name unitPriceFen } }`,
  );
  return res.campusAdSlots;
}

/** 商家侧：本渠道投放单 */
export async function campusMerchantAds(): Promise<CampusAdCampaignRow[]> {
  const res = await getAdminClient().request<{ campusMerchantAds: CampusAdCampaignRow[] }>(
    `query { campusMerchantAds { ${AD_FIELDS} } }`,
  );
  return res.campusMerchantAds;
}

/** 商家下单（按天计费，下单即固化单价与总价） */
export async function campusMerchantCreateAd(input: {
  slot: string;
  title: string;
  startDate: string;
  endDate: string;
  imageUrl?: string | null;
  linkUrl?: string | null;
}): Promise<CampusAdCampaignRow> {
  const res = await getAdminClient().request<{ campusMerchantCreateAd: CampusAdCampaignRow }>(
    `mutation ($slot: String!, $title: String!, $startDate: String!, $endDate: String!, $imageUrl: String, $linkUrl: String) {
      campusMerchantCreateAd(slot: $slot, title: $title, startDate: $startDate, endDate: $endDate, imageUrl: $imageUrl, linkUrl: $linkUrl) { ${AD_FIELDS} }
    }`,
    {
      slot: input.slot,
      title: input.title,
      startDate: input.startDate,
      endDate: input.endDate,
      imageUrl: input.imageUrl ?? null,
      linkUrl: input.linkUrl ?? null,
    },
  );
  return res.campusMerchantCreateAd;
}

/** 商家支付广告费（模拟支付，转待审核；重复调用幂等） */
export async function campusMerchantPayAd(id: string): Promise<CampusAdCampaignRow> {
  const res = await getAdminClient().request<{ campusMerchantPayAd: CampusAdCampaignRow }>(
    `mutation ($id: ID!) { campusMerchantPayAd(id: $id) { ${AD_FIELDS} } }`,
    { id },
  );
  return res.campusMerchantPayAd;
}

/** 商家取消投放（仅未支付/待审核） */
export async function campusMerchantCancelAd(id: string): Promise<CampusAdCampaignRow> {
  const res = await getAdminClient().request<{ campusMerchantCancelAd: CampusAdCampaignRow }>(
    `mutation ($id: ID!) { campusMerchantCancelAd(id: $id) { ${AD_FIELDS} } }`,
    { id },
  );
  return res.campusMerchantCancelAd;
}

/** 平台侧：按渠道/状态查投放单 */
export async function campusAdCampaigns(
  status?: string | null,
  channelId?: string | null,
): Promise<CampusAdCampaignRow[]> {
  const res = await getAdminClient().request<{ campusAdCampaigns: CampusAdCampaignRow[] }>(
    `query ($status: String, $channelId: ID) {
      campusAdCampaigns(status: $status, channelId: $channelId) { ${AD_FIELDS} }
    }`,
    { status: status ?? null, channelId: channelId ?? null },
  );
  return res.campusAdCampaigns;
}

/** 平台审核：通过转投放中，驳回须填原因 */
export async function campusReviewAd(
  id: string,
  approve: boolean,
  note?: string | null,
): Promise<CampusAdCampaignRow> {
  const res = await getAdminClient().request<{ campusReviewAd: CampusAdCampaignRow }>(
    `mutation ($id: ID!, $approve: Boolean!, $note: String) {
      campusReviewAd(id: $id, approve: $approve, note: $note) { ${AD_FIELDS} }
    }`,
    { id, approve, note: note ?? null },
  );
  return res.campusReviewAd;
}

// ── P2-4 智能取餐柜 / 无人配送接口占位 ───────────────────────
// 取餐柜：本渠道站点 CRUD（平台写、商家读）
// 无人配送：通道配置（服务商 / 接口地址 / 密钥）+ 调用占位
export interface CampusLockerStationRow {
  id: string;
  channelId: string;
  name: string;
  location: string;
  provider: string;
  providerName: string;
  totalCells: number;
  availableCells: number;
  openHours: string | null;
  pickupGuide: string | null;
  enabled: boolean;
  sort: number;
  createdBy: string | null;
  createdAt: string | null;
}

export interface CampusLockerStationInput {
  name?: string;
  location?: string;
  provider?: string;
  totalCells?: number;
  availableCells?: number;
  openHours?: string | null;
  pickupGuide?: string | null;
  enabled?: boolean;
  sort?: number;
}

export interface CampusUnmannedProviderOption {
  code: string;
  name: string;
  needsEndpoint: boolean;
  needsKey: boolean;
}

export interface CampusUnmannedChannel {
  enabled: boolean;
  provider: string;
  providerName: string;
  providers: CampusUnmannedProviderOption[];
  endpoint: string | null;
  keyConfigured: boolean;
  needsEndpoint: boolean;
  needsKey: boolean;
}

export interface CampusUnmannedDeliveryResult {
  ok: boolean;
  provider: string;
  providerName: string;
  status: string;
  requestNo: string | null;
  message: string;
}

const LOCKER_FIELDS =
  'id channelId name location provider providerName totalCells availableCells openHours pickupGuide enabled sort createdBy createdAt';

const UNMANNED_CHANNEL_FIELDS =
  'enabled provider providerName providers { code name needsEndpoint needsKey } endpoint keyConfigured needsEndpoint needsKey';

/** 取餐柜站点（含停用） */
export async function campusLockerStations(): Promise<CampusLockerStationRow[]> {
  const res = await getAdminClient().request<{ campusLockerStations: CampusLockerStationRow[] }>(
    `query { campusLockerStations { ${LOCKER_FIELDS} } }`,
  );
  return res.campusLockerStations;
}

/** 新增取餐柜站点 */
export async function campusCreateLockerStation(
  input: CampusLockerStationInput,
): Promise<CampusLockerStationRow> {
  const res = await getAdminClient().request<{ campusCreateLockerStation: CampusLockerStationRow }>(
    `mutation ($input: CampusLockerStationInput!) {
      campusCreateLockerStation(input: $input) { ${LOCKER_FIELDS} }
    }`,
    { input },
  );
  return res.campusCreateLockerStation;
}

/** 编辑取餐柜站点（只改传入字段） */
export async function campusUpdateLockerStation(
  id: string,
  input: CampusLockerStationInput,
): Promise<CampusLockerStationRow> {
  const res = await getAdminClient().request<{ campusUpdateLockerStation: CampusLockerStationRow }>(
    `mutation ($id: ID!, $input: CampusLockerStationInput!) {
      campusUpdateLockerStation(id: $id, input: $input) { ${LOCKER_FIELDS} }
    }`,
    { id, input },
  );
  return res.campusUpdateLockerStation;
}

/** 删除取餐柜站点 */
export async function campusDeleteLockerStation(id: string): Promise<boolean> {
  const res = await getAdminClient().request<{ campusDeleteLockerStation: boolean }>(
    `mutation ($id: ID!) { campusDeleteLockerStation(id: $id) }`,
    { id },
  );
  return res.campusDeleteLockerStation;
}

/** 无人配送通道配置 */
export async function campusUnmannedChannel(): Promise<CampusUnmannedChannel> {
  const res = await getAdminClient().request<{ campusUnmannedChannel: CampusUnmannedChannel }>(
    `query { campusUnmannedChannel { ${UNMANNED_CHANNEL_FIELDS} } }`,
  );
  return res.campusUnmannedChannel;
}

/** 保存无人配送通道配置（endpoint / key 传空串 = 清空） */
export async function campusUpdateUnmannedChannel(input: {
  enabled?: boolean;
  provider?: string;
  endpoint?: string | null;
  key?: string | null;
}): Promise<CampusUnmannedChannel> {
  const res = await getAdminClient().request<{ campusUpdateUnmannedChannel: CampusUnmannedChannel }>(
    `mutation ($input: CampusUnmannedChannelInput!) {
      campusUpdateUnmannedChannel(input: $input) { ${UNMANNED_CHANNEL_FIELDS} }
    }`,
    { input },
  );
  return res.campusUpdateUnmannedChannel;
}
