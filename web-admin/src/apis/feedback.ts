// 常见问题/意见反馈域 admin-api 调用（schema 以 vendure/packages/feedback-plugin/src/plugin.ts adminApiExtensions 为准）
//   - Query faqEntries(options: FaqEntryListOptions { skip, take }) / feedbacks(options: FeedbackListOptions { skip, take, status })
//     （ListOptions 为显式字段 input，无 filter）
//   - Mutation saveFaq(input: SaveFaqInput!) / deleteFaq(id: ID!) / updateFeedbackStatus(id: ID!, status: String!)
//   - FaqEntry.type：general/register/order/pay/afterSale/account；Feedback.status：pending/processing/resolved
//   - Feedback.imgs 为 JSON 字符串（uploadCustomerAsset source 数组），展示侧需 JSON.parse
import { getAdminClient, graphQlErrorMsg } from './client';

export interface FaqEntryRow {
  id: string;
  title: string;
  content: string;
  type: string;
  sort: number;
  enabled: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface FeedbackRow {
  id: string;
  customerId: string;
  type: string;
  title: string;
  content: string;
  /** JSON 字符串（图片 URL 数组） */
  imgs?: string | null;
  contactWay?: string | null;
  status: 'pending' | 'processing' | 'resolved' | string;
  handledAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SaveFaqInput {
  id?: string;
  title: string;
  content: string;
  type?: string;
  sort?: number;
  enabled?: boolean;
}

const FAQ_FIELDS = `id title content type sort enabled createdAt updatedAt`;
const FEEDBACK_FIELDS = `id customerId type title content imgs contactWay status handledAt createdAt updatedAt`;

export async function fetchFaqPage(take = 50, skip = 0): Promise<{ items: FaqEntryRow[]; total: number }> {
  try {
    const { faqEntries } = await getAdminClient().request<{ faqEntries: { items: FaqEntryRow[]; totalItems: number } }>(
      `query FaqEntries($options: FaqEntryListOptions) {
        faqEntries(options: $options) { items { ${FAQ_FIELDS} } totalItems }
      }`,
      { options: { skip, take } },
    );
    return { items: faqEntries?.items ?? [], total: faqEntries?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载常见问题失败'));
  }
}

export async function saveFaq(input: SaveFaqInput): Promise<FaqEntryRow> {
  try {
    const { saveFaq } = await getAdminClient().request<{ saveFaq: FaqEntryRow }>(
      `mutation SaveFaq($input: SaveFaqInput!) { saveFaq(input: $input) { ${FAQ_FIELDS} } }`,
      { input },
    );
    return saveFaq;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '保存常见问题失败'));
  }
}

export async function deleteFaq(id: string): Promise<void> {
  try {
    await getAdminClient().request<{ deleteFaq: boolean }>(
      `mutation DeleteFaq($id: ID!) { deleteFaq(id: $id) }`,
      { id },
    );
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '删除常见问题失败'));
  }
}

export async function fetchFeedbackPage(p: { skip: number; take: number; status?: string }): Promise<{ items: FeedbackRow[]; total: number }> {
  try {
    const { feedbacks } = await getAdminClient().request<{ feedbacks: { items: FeedbackRow[]; totalItems: number } }>(
      `query Feedbacks($options: FeedbackListOptions) {
        feedbacks(options: $options) { items { ${FEEDBACK_FIELDS} } totalItems }
      }`,
      { options: { skip: p.skip, take: p.take, status: p.status || undefined } },
    );
    return { items: feedbacks?.items ?? [], total: feedbacks?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载意见反馈失败'));
  }
}

export async function updateFeedbackStatus(id: string, status: string): Promise<FeedbackRow> {
  try {
    const { updateFeedbackStatus } = await getAdminClient().request<{ updateFeedbackStatus: FeedbackRow }>(
      `mutation UpdateFeedbackStatus($id: ID!, $status: String!) { updateFeedbackStatus(id: $id, status: $status) { ${FEEDBACK_FIELDS} } }`,
      { id, status },
    );
    return updateFeedbackStatus;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '操作失败'));
  }
}

/** 解析 Feedback.imgs JSON 字符串为图片 URL 数组（脏数据容错） */
export function parseFeedbackImgs(imgs?: string | null): string[] {
  if (!imgs) return [];
  try {
    const arr = JSON.parse(imgs);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s) : [];
  } catch {
    return [];
  }
}
