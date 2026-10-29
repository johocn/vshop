// 运营中心 / 沽清域 admin-api 调用（schema 以 vendure/packages/campus-delivery-plugin/src/campus-delivery.plugin.ts adminApiExtensions 为准）
//   Query：campusSupportTickets / campusRiderAppeals / campusBlacklist / campusRiderShifts /
//          campusRiderOnlineStats / campusRiderReviews / campusRiderRating / campusMerchantProducts
//   Mutation：campusReplySupportTicket / campusReviewRiderAppeal / campusAddBlacklist /
//             campusImportBlacklist / campusRemoveBlacklist /
//             campusSaveRiderShift / campusDeleteRiderShift / campusMerchantSetProductSoldOut
import { getAdminClient } from './client';

/** 客服工单（status：open / replied / closed） */
export interface SupportTicket {
  id: string;
  customerId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  orderCode?: string | null;
  category: string;
  content: string;
  images?: string[] | null;
  status: string;
  reply?: string | null;
  repliedAt?: string | null;
  createdAt: string;
}

/** 骑手申诉（status：pending / approved / rejected） */
export interface RiderAppeal {
  id: string;
  riderCustomerId: string;
  riderName?: string | null;
  riderPhone?: string | null;
  orderId?: string | null;
  orderCode?: string | null;
  reason: string;
  images?: string[] | null;
  status: string;
  creditDelta: number;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

/** 黑名单（type：user / phone） */
export interface BlacklistEntry {
  id: string;
  type: string;
  customerId?: string | null;
  phone?: string | null;
  reason?: string | null;
  createdBy?: string | null;
  active: boolean;
  createdAt: string;
}

/** 骑手班次（时间均为 HH:mm） */
export interface RiderShift {
  id: string;
  riderCustomerId: string;
  realName?: string | null;
  shiftDate: string;
  startTime: string;
  endTime: string;
  note?: string | null;
  onlineMinutes?: number | null;
  shiftMinutes?: number | null;
}

export interface RiderOnlineStat {
  riderCustomerId: string;
  realName: string;
  onlineMinutes: number;
}

export interface RiderReview {
  id: string;
  riderCustomerId: string;
  orderId: string;
  rating: number;
  tags?: string[] | null;
  comment?: string | null;
  createdAt: string;
}

export interface RiderRating {
  riderCustomerId: string;
  avgRating: number;
  ratingCount: number;
}

export interface MerchantProduct {
  productId: string;
  name: string;
  soldOut: boolean;
  monthlySales: number;
  variantCount: number;
  /** 商品级打包费（分/件）；null = 沿用店铺配置金额 */
  packingFee?: number | null;
  /** 加料组配置 JSON 字符串（AddonGroupConfig[]）；null = 无加料 */
  addonGroups?: string | null;
  /** 套餐内容 JSON 字符串（ComboConfig）；null = 非套餐 */
  combo?: string | null;
  /** 每日限量（份）；null = 不限 */
  dailyLimit?: number | null;
  /** 每人限购（份）；null = 不限 */
  perUserLimit?: number | null;
  /** 今日已售份数（UTC+8 当日已支付订单） */
  soldToday?: number;
  /** 今日剩余可售份数；null = 不限 */
  remaining?: number | null;
}

/** 每日限量/每人限购保存结果：remaining=null 表示不限 */
export interface ProductLimitResult {
  ok: boolean;
  dailyLimit: number | null;
  perUserLimit: number | null;
  soldToday: number;
  remaining: number | null;
}

/** 加料组（P1-2）：price 为单份加价（分）；min/max 为该组可选数量约束（0 = 不限） */
export interface AddonOptionConfig {
  name: string;
  price: number;
}

export interface AddonGroupConfig {
  name: string;
  min?: number;
  max?: number;
  options: AddonOptionConfig[];
}

/** 套餐内容（P1-2）：价格仅用于「原价/立省」展示，可空 */
export interface ComboItemConfig {
  name: string;
  qty: number;
  price?: number | null;
}

export interface ComboConfig {
  title?: string | null;
  items: ComboItemConfig[];
  note?: string | null;
}

export interface CampusRiderShiftInput {
  id?: string | null;
  riderCustomerId: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  note?: string | null;
}

// ===== 客服工单 =====

/** 按状态分页查询客服工单；status 为空表示全部 */
export async function fetchSupportTickets(
  status = '',
  skip = 0,
  take = 20,
): Promise<{ items: SupportTicket[]; total: number }> {
  const { campusSupportTickets } = await getAdminClient().request<{
    campusSupportTickets: { items: SupportTicket[]; total: number };
  }>(
    `query CampusSupportTickets($status: String, $skip: Int, $take: Int) {
      campusSupportTickets(status: $status, skip: $skip, take: $take) {
        items {
          id customerId customerName customerPhone orderCode category content images
          status reply repliedAt createdAt
        }
        total
      }
    }`,
    { status: status || null, skip, take },
  );
  return { items: campusSupportTickets?.items ?? [], total: campusSupportTickets?.total ?? 0 };
}

/** 回复/关闭工单：status 传 replied 为回复，closed 为关闭 */
export async function replySupportTicket(id: string, reply: string, status: 'replied' | 'closed' = 'replied'): Promise<SupportTicket> {
  const { campusReplySupportTicket } = await getAdminClient().request<{ campusReplySupportTicket: SupportTicket }>(
    `mutation CampusReplySupportTicket($id: ID!, $reply: String, $status: String) {
      campusReplySupportTicket(id: $id, reply: $reply, status: $status) {
        id customerId customerName customerPhone orderCode category content images
        status reply repliedAt createdAt
      }
    }`,
    { id, reply, status },
  );
  return campusReplySupportTicket;
}

// ===== 骑手申诉 =====

/** 按状态分页查询骑手申诉；status 为空表示全部 */
export async function fetchRiderAppeals(
  status = '',
  skip = 0,
  take = 20,
): Promise<{ items: RiderAppeal[]; total: number }> {
  const { campusRiderAppeals } = await getAdminClient().request<{
    campusRiderAppeals: { items: RiderAppeal[]; total: number };
  }>(
    `query CampusRiderAppeals($status: String, $skip: Int, $take: Int) {
      campusRiderAppeals(status: $status, skip: $skip, take: $take) {
        items {
          id riderCustomerId riderName riderPhone orderId orderCode reason images
          status creditDelta reviewNote reviewedAt createdAt
        }
        total
      }
    }`,
    { status: status || null, skip, take },
  );
  return { items: campusRiderAppeals?.items ?? [], total: campusRiderAppeals?.total ?? 0 };
}

/** 审核申诉：approve=true 通过（可回补信用分），false 驳回（note 说明原因） */
export async function reviewRiderAppeal(
  id: string,
  approve: boolean,
  creditDelta?: number | null,
  note?: string | null,
): Promise<RiderAppeal> {
  const { campusReviewRiderAppeal } = await getAdminClient().request<{ campusReviewRiderAppeal: RiderAppeal }>(
    `mutation CampusReviewRiderAppeal($id: ID!, $approve: Boolean!, $creditDelta: Int, $note: String) {
      campusReviewRiderAppeal(id: $id, approve: $approve, creditDelta: $creditDelta, note: $note) {
        id riderCustomerId riderName riderPhone orderId orderCode reason images
        status creditDelta reviewNote reviewedAt createdAt
      }
    }`,
    { id, approve, creditDelta: creditDelta ?? null, note: note ?? null },
  );
  return campusReviewRiderAppeal;
}

// ===== 黑名单 =====

export async function fetchBlacklist(skip = 0, take = 20): Promise<{ items: BlacklistEntry[]; total: number }> {
  const { campusBlacklist } = await getAdminClient().request<{
    campusBlacklist: { items: BlacklistEntry[]; total: number };
  }>(
    `query CampusBlacklist($skip: Int, $take: Int) {
      campusBlacklist(skip: $skip, take: $take) {
        items { id type customerId phone reason createdBy active createdAt }
        total
      }
    }`,
    { skip, take },
  );
  return { items: campusBlacklist?.items ?? [], total: campusBlacklist?.total ?? 0 };
}

/**
 * 新增黑名单：type=user 时 value 为 customerId；type=phone 时 value 为手机号
 */
export async function addBlacklist(
  type: 'user' | 'phone',
  value: string,
  reason?: string | null,
): Promise<BlacklistEntry> {
  const { campusAddBlacklist } = await getAdminClient().request<{ campusAddBlacklist: BlacklistEntry }>(
    `mutation CampusAddBlacklist($type: String!, $value: String!, $reason: String) {
      campusAddBlacklist(type: $type, value: $value, reason: $reason) {
        id type customerId phone reason createdBy active createdAt
      }
    }`,
    { type, value, reason: reason ?? null },
  );
  return campusAddBlacklist;
}

export interface BlacklistImportResult {
  added: number;
  skipped: number;
  invalid: number;
}

/** 批量导入黑名单：type=phone 时 values 为手机号；type=user 时为用户 ID（单次 ≤500 条） */
export async function importBlacklist(
  type: 'user' | 'phone',
  values: string[],
  reason?: string | null,
): Promise<BlacklistImportResult> {
  const { campusImportBlacklist } = await getAdminClient().request<{
    campusImportBlacklist: BlacklistImportResult;
  }>(
    `mutation CampusImportBlacklist($type: String!, $values: [String!]!, $reason: String) {
      campusImportBlacklist(type: $type, values: $values, reason: $reason) { added skipped invalid }
    }`,
    { type, values, reason: reason ?? null },
  );
  return campusImportBlacklist;
}

export async function removeBlacklist(id: string): Promise<boolean> {
  const { campusRemoveBlacklist } = await getAdminClient().request<{ campusRemoveBlacklist: { ok: boolean } }>(
    `mutation CampusRemoveBlacklist($id: ID!) {
      campusRemoveBlacklist(id: $id) { ok }
    }`,
    { id },
  );
  return !!campusRemoveBlacklist?.ok;
}

// ===== 骑手班次 / 在线时长 =====

export async function fetchRiderShifts(date: string): Promise<{ date: string; items: RiderShift[] }> {
  const { campusRiderShifts } = await getAdminClient().request<{
    campusRiderShifts: { date: string; items: RiderShift[] };
  }>(
    `query CampusRiderShifts($date: String!) {
      campusRiderShifts(date: $date) {
        date
        items { id riderCustomerId realName shiftDate startTime endTime note onlineMinutes shiftMinutes }
      }
    }`,
    { date },
  );
  return { date: campusRiderShifts?.date ?? date, items: campusRiderShifts?.items ?? [] };
}

export async function saveRiderShift(input: CampusRiderShiftInput): Promise<RiderShift> {
  const { campusSaveRiderShift } = await getAdminClient().request<{ campusSaveRiderShift: RiderShift }>(
    `mutation CampusSaveRiderShift($input: CampusRiderShiftInput!) {
      campusSaveRiderShift(input: $input) {
        id riderCustomerId realName shiftDate startTime endTime note onlineMinutes shiftMinutes
      }
    }`,
    { input },
  );
  return campusSaveRiderShift;
}

export async function deleteRiderShift(id: string): Promise<boolean> {
  const { campusDeleteRiderShift } = await getAdminClient().request<{ campusDeleteRiderShift: { ok: boolean } }>(
    `mutation CampusDeleteRiderShift($id: ID!) {
      campusDeleteRiderShift(id: $id) { ok }
    }`,
    { id },
  );
  return !!campusDeleteRiderShift?.ok;
}

/** 当天骑手在线时长（date 为空时后端按今天） */
export async function fetchRiderOnlineStats(date?: string): Promise<{ date: string; items: RiderOnlineStat[] }> {
  const { campusRiderOnlineStats } = await getAdminClient().request<{
    campusRiderOnlineStats: { date: string; items: RiderOnlineStat[] };
  }>(
    `query CampusRiderOnlineStats($date: String) {
      campusRiderOnlineStats(date: $date) {
        date
        items { riderCustomerId realName onlineMinutes }
      }
    }`,
    { date: date ?? null },
  );
  return { date: campusRiderOnlineStats?.date ?? '', items: campusRiderOnlineStats?.items ?? [] };
}

// ===== 骑手评分 =====

export async function fetchRiderReviews(
  riderCustomerId: string,
  skip = 0,
  take = 20,
): Promise<RiderReview[]> {
  const { campusRiderReviews } = await getAdminClient().request<{ campusRiderReviews: RiderReview[] }>(
    `query CampusRiderReviews($riderCustomerId: ID, $skip: Int, $take: Int) {
      campusRiderReviews(riderCustomerId: $riderCustomerId, skip: $skip, take: $take) {
        id riderCustomerId orderId rating tags comment createdAt
      }
    }`,
    { riderCustomerId, skip, take },
  );
  return campusRiderReviews ?? [];
}

export async function fetchRiderRating(riderCustomerId: string): Promise<RiderRating> {
  const { campusRiderRating } = await getAdminClient().request<{ campusRiderRating: RiderRating }>(
    `query CampusRiderRating($riderCustomerId: ID!) {
      campusRiderRating(riderCustomerId: $riderCustomerId) { riderCustomerId avgRating ratingCount }
    }`,
    { riderCustomerId },
  );
  return campusRiderRating;
}

// ===== 一键沽清 =====

export async function fetchMerchantProducts(
  search = '',
  skip = 0,
  take = 20,
): Promise<{ items: MerchantProduct[]; total: number }> {
  const { campusMerchantProducts } = await getAdminClient().request<{
    campusMerchantProducts: { items: MerchantProduct[]; total: number };
  }>(
    `query CampusMerchantProducts($search: String, $skip: Int, $take: Int) {
      campusMerchantProducts(search: $search, skip: $skip, take: $take) {
        items { productId name soldOut monthlySales variantCount packingFee addonGroups combo dailyLimit perUserLimit soldToday remaining }
        total
      }
    }`,
    { search: search || null, skip, take },
  );
  return { items: campusMerchantProducts?.items ?? [], total: campusMerchantProducts?.total ?? 0 };
}

/** R5 跑腿单：幂等初始化 0 元载体商品（新建店铺/新校区首次上线跑腿前调用） */
export async function ensureErrandProducts(): Promise<{ variantId: string; sku: string }> {
  const { campusEnsureErrandProducts } = await getAdminClient().request<{
    campusEnsureErrandProducts: { variantId: string; sku: string };
  }>(
    `mutation { campusEnsureErrandProducts { variantId sku } }`,
  );
  return campusEnsureErrandProducts;
}

/** 设置商品售罄；返回后端实际状态 */
export async function setMerchantProductSoldOut(productId: string, soldOut: boolean): Promise<boolean> {
  const { campusMerchantSetProductSoldOut } = await getAdminClient().request<{
    campusMerchantSetProductSoldOut: { ok: boolean; soldOut: boolean };
  }>(
    `mutation CampusMerchantSetProductSoldOut($productId: ID!, $soldOut: Boolean!) {
      campusMerchantSetProductSoldOut(productId: $productId, soldOut: $soldOut) { ok soldOut }
    }`,
    { productId, soldOut },
  );
  return !!campusMerchantSetProductSoldOut?.soldOut;
}

/** 全店批量沽清 / 恢复（打烊场景）；返回实际影响的本店商品数 */
export async function setMerchantAllProductsSoldOut(soldOut: boolean): Promise<number> {
  const { campusMerchantSetAllProductsSoldOut } = await getAdminClient().request<{
    campusMerchantSetAllProductsSoldOut: { ok: boolean; soldOut: boolean; count: number };
  }>(
    `mutation CampusMerchantSetAllProductsSoldOut($soldOut: Boolean!) {
      campusMerchantSetAllProductsSoldOut(soldOut: $soldOut) { ok soldOut count }
    }`,
    { soldOut },
  );
  return Number(campusMerchantSetAllProductsSoldOut?.count || 0);
}

/** 沽清次日自动恢复：开关与待恢复件数 */
export async function getMerchantSoldOutAutoRestore(): Promise<{ enabled: boolean; pending: number }> {
  const { campusMerchantSoldOutAutoRestore } = await getAdminClient().request<{
    campusMerchantSoldOutAutoRestore: { enabled: boolean; pending: number };
  }>(`query CampusSoldOutAutoRestore { campusMerchantSoldOutAutoRestore { enabled pending } }`);
  return campusMerchantSoldOutAutoRestore;
}

export async function setMerchantSoldOutAutoRestore(enabled: boolean): Promise<{ enabled: boolean; pending: number }> {
  const { campusMerchantSetSoldOutAutoRestore } = await getAdminClient().request<{
    campusMerchantSetSoldOutAutoRestore: { enabled: boolean; pending: number };
  }>(
    `mutation CampusMerchantSetSoldOutAutoRestore($enabled: Boolean!) {
      campusMerchantSetSoldOutAutoRestore(enabled: $enabled) { enabled pending }
    }`,
    { enabled },
  );
  return campusMerchantSetSoldOutAutoRestore;
}

/** 设置商品级打包费（分/件）；传 null 清除，回落到店铺配置金额 */
export async function setMerchantProductPackingFee(
  productId: string,
  packingFee: number | null,
): Promise<number | null> {
  const { campusMerchantSetProductPackingFee } = await getAdminClient().request<{
    campusMerchantSetProductPackingFee: { ok: boolean; packingFee: number | null };
  }>(
    `mutation CampusMerchantSetProductPackingFee($productId: ID!, $packingFee: Int) {
      campusMerchantSetProductPackingFee(productId: $productId, packingFee: $packingFee) { ok packingFee }
    }`,
    { productId, packingFee },
  );
  return campusMerchantSetProductPackingFee?.packingFee ?? null;
}

/** 每日限量 / 每人限购（§68）：传 null 或 0 表示不限 */
export async function setMerchantProductLimit(
  productId: string,
  dailyLimit: number | null,
  perUserLimit: number | null,
): Promise<ProductLimitResult> {
  const { campusMerchantSetProductLimit } = await getAdminClient().request<{
    campusMerchantSetProductLimit: ProductLimitResult;
  }>(
    `mutation CampusMerchantSetProductLimit($productId: ID!, $dailyLimit: Int, $perUserLimit: Int) {
      campusMerchantSetProductLimit(productId: $productId, dailyLimit: $dailyLimit, perUserLimit: $perUserLimit) {
        ok dailyLimit perUserLimit soldToday remaining
      }
    }`,
    { productId, dailyLimit, perUserLimit },
  );
  return campusMerchantSetProductLimit;
}

/** 保存商品加料组：groups 传空数组 = 清除加料 */
export async function setMerchantProductAddonGroups(
  productId: string,
  groups: AddonGroupConfig[],
): Promise<string | null> {
  const { campusMerchantSetProductAddonGroups } = await getAdminClient().request<{
    campusMerchantSetProductAddonGroups: { ok: boolean; addonGroups: string | null };
  }>(
    `mutation CampusMerchantSetProductAddonGroups($productId: ID!, $groups: [String!]!) {
      campusMerchantSetProductAddonGroups(productId: $productId, groups: $groups) { ok addonGroups }
    }`,
    { productId, groups: groups.map(g => JSON.stringify(g)) },
  );
  return campusMerchantSetProductAddonGroups?.addonGroups ?? null;
}

/** 保存商品套餐内容：combo 传 null = 清除（恢复普通商品） */
export async function setMerchantProductCombo(
  productId: string,
  combo: ComboConfig | null,
): Promise<string | null> {
  const { campusMerchantSetProductCombo } = await getAdminClient().request<{
    campusMerchantSetProductCombo: { ok: boolean; combo: string | null };
  }>(
    `mutation CampusMerchantSetProductCombo($productId: ID!, $combo: String) {
      campusMerchantSetProductCombo(productId: $productId, combo: $combo) { ok combo }
    }`,
    { productId, combo: combo ? JSON.stringify(combo) : null },
  );
  return campusMerchantSetProductCombo?.combo ?? null;
}
