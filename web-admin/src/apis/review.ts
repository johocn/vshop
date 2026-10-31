// 评价域 admin-api 调用（schema 以 vendure/packages/review-plugin/src/plugin.ts adminSchema 为准）
//   - Query reviews(options: { skip take productId status }): ReviewList!
//   - Mutation replyReview(id, reply) / approveReview(id) / rejectReview(id)
//   - Review 字段：id customerId customerName productId variantId orderLineId parentId followUps
//     rating content images videos tags isAnonymous status reply repliedAt helpfulCount createdAt updatedAt
//   - status 为字符串：pending（待审核）/ approved（已通过）/ rejected（已驳回）/ deleted（软删）
import { getAdminClient } from './client';

export interface ReviewRow {
  id: string;
  customerId: string;
  customerName?: string | null;
  productId: string;
  variantId?: string | null;
  orderLineId?: string | null;
  parentId?: string | null;
  rating: number;
  content: string;
  images?: string[] | null;
  videos?: string[] | null;
  tags?: string[] | null;
  isAnonymous: boolean;
  status: string;
  reply?: string | null;
  repliedAt?: string | null;
  helpfulCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** 差评申诉：pending / approved（评价已隐藏）/ rejected；null 表示未申诉 */
  appealStatus?: string | null;
  appealReason?: string | null;
  appealImages?: string[] | null;
  appealAt?: string | null;
  appealResult?: string | null;
  appealReviewedAt?: string | null;
}

const REVIEW_FIELDS = `
  id customerId customerName productId variantId orderLineId parentId
  rating content images videos tags isAnonymous status reply repliedAt
  helpfulCount createdAt updatedAt
  appealStatus appealReason appealImages appealAt appealResult appealReviewedAt
`;

/** 评价分页列表：skip/take/status 透传（admin ReviewListOptions 无 filter/sort） */
export async function fetchReviewPage(p: {
  skip: number;
  take: number;
  status?: string;
}): Promise<{ items: ReviewRow[]; total: number }> {
  const { reviews } = await getAdminClient().request<{
    reviews: { items: ReviewRow[]; totalItems: number };
  }>(
    `query Reviews($options: ReviewListOptions) {
      reviews(options: $options) {
        totalItems
        items { ${REVIEW_FIELDS} }
      }
    }`,
    {
      options: {
        skip: p.skip,
        take: p.take,
        ...(p.status ? { status: p.status } : {}),
      },
    },
  );
  return { items: reviews?.items ?? [], total: reviews?.totalItems ?? 0 };
}

/** 通过审核（主评通过会重算商品评分） */
export async function approveReview(id: string): Promise<ReviewRow> {
  const { approveReview } = await getAdminClient().request<{ approveReview: ReviewRow }>(
    `mutation ApproveReview($id: ID!) {
      approveReview(id: $id) { ${REVIEW_FIELDS} }
    }`,
    { id },
  );
  return approveReview;
}

/** 驳回评价（下架展示，不计入评分） */
export async function rejectReview(id: string): Promise<ReviewRow> {
  const { rejectReview } = await getAdminClient().request<{ rejectReview: ReviewRow }>(
    `mutation RejectReview($id: ID!) {
      rejectReview(id: $id) { ${REVIEW_FIELDS} }
    }`,
    { id },
  );
  return rejectReview;
}

/** 商家回复 */
export async function replyReview(id: string, reply: string): Promise<ReviewRow> {
  const { replyReview } = await getAdminClient().request<{ replyReview: ReviewRow }>(
    `mutation ReplyReview($id: ID!, $reply: String!) {
      replyReview(id: $id, reply: $reply) { ${REVIEW_FIELDS} }
    }`,
    { id, reply },
  );
  return replyReview;
}

/** 差评申诉列表：status 为空时返回全部已申诉记录（pending / approved / rejected） */
export async function fetchReviewAppeals(p: {
  skip: number;
  take: number;
  status?: string;
}): Promise<{ items: ReviewRow[]; total: number }> {
  const { reviewAppeals } = await getAdminClient().request<{
    reviewAppeals: { items: ReviewRow[]; totalItems: number };
  }>(
    `query ReviewAppeals($options: ReviewAppealListOptions) {
      reviewAppeals(options: $options) {
        totalItems
        items { ${REVIEW_FIELDS} }
      }
    }`,
    {
      options: {
        skip: p.skip,
        take: p.take,
        ...(p.status ? { status: p.status } : {}),
      },
    },
  );
  return { items: reviewAppeals?.items ?? [], total: reviewAppeals?.totalItems ?? 0 };
}

/** 通过申诉：评价置为 hidden（退出展示与评分聚合） */
export async function approveReviewAppeal(id: string, note?: string): Promise<ReviewRow> {
  const { approveReviewAppeal } = await getAdminClient().request<{ approveReviewAppeal: ReviewRow }>(
    `mutation ApproveReviewAppeal($id: ID!, $note: String) {
      approveReviewAppeal(id: $id, note: $note) { ${REVIEW_FIELDS} }
    }`,
    { id, note: note || null },
  );
  return approveReviewAppeal;
}

/** 驳回申诉：评价维持原状，仅留痕 */
export async function rejectReviewAppeal(id: string, note?: string): Promise<ReviewRow> {
  const { rejectReviewAppeal } = await getAdminClient().request<{ rejectReviewAppeal: ReviewRow }>(
    `mutation RejectReviewAppeal($id: ID!, $note: String) {
      rejectReviewAppeal(id: $id, note: $note) { ${REVIEW_FIELDS} }
    }`,
    { id, note: note || null },
  );
  return rejectReviewAppeal;
}

/** 撤销申诉通过：评价恢复展示并重新计入评分聚合（撤销原因必填） */
export async function revokeReviewAppeal(id: string, note: string): Promise<ReviewRow> {
  const { revokeReviewAppeal } = await getAdminClient().request<{ revokeReviewAppeal: ReviewRow }>(
    `mutation RevokeReviewAppeal($id: ID!, $note: String) {
      revokeReviewAppeal(id: $id, note: $note) { ${REVIEW_FIELDS} }
    }`,
    { id, note },
  );
  return revokeReviewAppeal;
}

// ---------------------------------------------------------------------------
// P4-2 评价品质闭环：差评预警
//   - Query reviewAlertRule / reviewAlerts(options) / reviewAlert(id) / reviewAlertStats
//   - Mutation updateReviewAlertRule(input) / replyReviewAlert / resendReviewAlertCoupon / closeReviewAlert
//   - 预警 status：new（待处理）/ replied（已回评）/ closed（已关闭）
//   - couponStatus：none（未发）/ issued（已发）/ failed（发放失败，可补发）
// ---------------------------------------------------------------------------

export interface ReviewAlertRow {
  id: string;
  reviewId: string;
  productId: string;
  customerId: string;
  productName?: string | null;
  rating: number;
  content: string;
  tags: string[];
  couponStatus: string;
  couponCode?: string | null;
  status: string;
  note?: string | null;
  handledAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ReviewAlertRule {
  channelId: string;
  enabled: boolean;
  maxRating: number;
  couponTemplateId?: string | null;
}

export interface ReviewAlertStats {
  newCount: number;
  totalCount: number;
  compensatedCount: number;
  last7dCount: number;
}

const ALERT_FIELDS = `
  id reviewId productId customerId productName rating content tags
  couponStatus couponCode status note handledAt createdAt updatedAt
`;

/** 当前渠道预警规则 */
export async function fetchReviewAlertRule(): Promise<ReviewAlertRule> {
  const { reviewAlertRule } = await getAdminClient().request<{ reviewAlertRule: ReviewAlertRule }>(
    `query ReviewAlertRule {
      reviewAlertRule { channelId enabled maxRating couponTemplateId }
    }`,
  );
  return reviewAlertRule;
}

/** 保存预警规则（每渠道一条） */
export async function updateReviewAlertRule(input: {
  enabled?: boolean;
  maxRating?: number;
  couponTemplateId?: string | null;
}): Promise<ReviewAlertRule> {
  const { updateReviewAlertRule } = await getAdminClient().request<{ updateReviewAlertRule: ReviewAlertRule }>(
    `mutation UpdateReviewAlertRule($input: UpdateReviewAlertRuleInput!) {
      updateReviewAlertRule(input: $input) { channelId enabled maxRating couponTemplateId }
    }`,
    { input },
  );
  return updateReviewAlertRule;
}

/** 预警分页列表：status 为空时返回全部；from/to 为创建时间范围（ISO 字符串） */
export async function fetchReviewAlertPage(p: {
  skip: number;
  take: number;
  status?: string;
  from?: string;
  to?: string;
}): Promise<{ items: ReviewAlertRow[]; total: number }> {
  const { reviewAlerts } = await getAdminClient().request<{
    reviewAlerts: { items: ReviewAlertRow[]; totalItems: number };
  }>(
    `query ReviewAlerts($options: ReviewAlertListOptions) {
      reviewAlerts(options: $options) {
        totalItems
        items { ${ALERT_FIELDS} }
      }
    }`,
    {
      options: {
        skip: p.skip,
        take: p.take,
        ...(p.status ? { status: p.status } : {}),
        ...(p.from ? { from: p.from } : {}),
        ...(p.to ? { to: p.to } : {}),
      },
    },
  );
  return { items: reviewAlerts?.items ?? [], total: reviewAlerts?.totalItems ?? 0 };
}

/** 预警计数 */
export async function fetchReviewAlertStats(): Promise<ReviewAlertStats> {
  const { reviewAlertStats } = await getAdminClient().request<{ reviewAlertStats: ReviewAlertStats }>(
    `query ReviewAlertStats {
      reviewAlertStats { newCount totalCount compensatedCount last7dCount }
    }`,
  );
  return reviewAlertStats;
}

/** 一键回评（写回评价回复，预警置 replied） */
export async function replyReviewAlert(id: string, reply: string): Promise<ReviewAlertRow> {
  const { replyReviewAlert } = await getAdminClient().request<{ replyReviewAlert: ReviewAlertRow }>(
    `mutation ReplyReviewAlert($id: ID!, $reply: String!) {
      replyReviewAlert(id: $id, reply: $reply) { ${ALERT_FIELDS} }
    }`,
    { id, reply },
  );
  return replyReviewAlert;
}

/** 补发致歉券 */
export async function resendReviewAlertCoupon(id: string): Promise<ReviewAlertRow> {
  const { resendReviewAlertCoupon } = await getAdminClient().request<{ resendReviewAlertCoupon: ReviewAlertRow }>(
    `mutation ResendReviewAlertCoupon($id: ID!) {
      resendReviewAlertCoupon(id: $id) { ${ALERT_FIELDS} }
    }`,
    { id },
  );
  return resendReviewAlertCoupon;
}

/** 关闭预警（无需回评时的兜底） */
export async function closeReviewAlert(id: string, note?: string): Promise<ReviewAlertRow> {
  const { closeReviewAlert } = await getAdminClient().request<{ closeReviewAlert: ReviewAlertRow }>(
    `mutation CloseReviewAlert($id: ID!, $note: String) {
      closeReviewAlert(id: $id, note: $note) { ${ALERT_FIELDS} }
    }`,
    { id, note: note || null },
  );
  return closeReviewAlert;
}
