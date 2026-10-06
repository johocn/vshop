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
}

const REVIEW_FIELDS = `
  id customerId customerName productId variantId orderLineId parentId
  rating content images videos tags isAnonymous status reply repliedAt
  helpfulCount createdAt updatedAt
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
