// 拼团活动管理 admin-api 调用（group-buy-plugin，schema 已按插件 SDL 校准）
// 校准要点：
//   - Query   groupBuyActivities(options: GroupBuyActivityListOptions): { items: [GroupBuyActivity], totalItems }
//             groupBuyActivity(id: ID!): GroupBuyActivity
//   - Mutation createGroupBuyActivity(input: CreateGroupBuyActivityInput!)、
//             updateGroupBuyActivity(input: UpdateGroupBuyActivityInput!)、deleteGroupBuyActivity(id)
//   - 价格单位：分（groupPrice）。展示 /100 元，提交 Math.round(元*100)。
//   - leaderDiscount 为金额（分）：leaderRewardType=discount 时团长开团订单每单直减该金额
//     （后端 groupBuyLeaderRewardAction 直接作为订单行折让负数使用）。
//   - Update 输入不含 productId/variantId/leaderRewardType/autoConfirm/allowJoinAfterComplete，
//     这些字段创建后不可修改（编辑页只读展示）。
import { getAdminClient, graphQlErrorMsg } from './client';

export type GroupBuyStatus = 'active' | 'completed' | 'expired';
export type GroupBuyLeaderRewardType = 'discount' | 'cashback' | 'free';

export interface GroupBuyActivity {
  id: string;
  name: string;
  description: string;
  targetCount: number;
  currentCount: number;
  /** 最大参团人数；0 = 不限 */
  maxCount: number;
  status: GroupBuyStatus;
  startAt: string;
  endAt: string;
  /** 成团价（分） */
  groupPrice: number;
  /** 团长优惠金额（分），leaderRewardType=discount 时生效 */
  leaderDiscount: number;
  leaderRewardType: GroupBuyLeaderRewardType;
  autoConfirm: boolean;
  allowJoinAfterComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GroupBuyCreateInput {
  name: string;
  description: string;
  targetCount: number;
  maxCount?: number;
  startAt: string;
  endAt: string;
  /** 成团价（分） */
  groupPrice: number;
  /** 团长优惠（分） */
  leaderDiscount?: number;
  leaderRewardType?: GroupBuyLeaderRewardType;
  autoConfirm?: boolean;
  allowJoinAfterComplete?: boolean;
  productId: string;
  variantId: string;
}

/** Update 输入仅含后端支持的可更新字段（不含商品/奖励类型/自动成团等创建期字段） */
export interface GroupBuyUpdateInput {
  id: string;
  name?: string;
  description?: string;
  targetCount?: number;
  maxCount?: number;
  startAt?: string;
  endAt?: string;
  groupPrice?: number;
  leaderDiscount?: number;
  status?: GroupBuyStatus;
}

const FIELDS = `id name description targetCount currentCount maxCount status startAt endAt groupPrice leaderDiscount leaderRewardType autoConfirm allowJoinAfterComplete createdAt updatedAt`;

export async function fetchGroupBuyActivities(take = 20, skip = 0): Promise<{ items: GroupBuyActivity[]; totalItems: number }> {
  try {
    const { groupBuyActivities } = await getAdminClient().request<{ groupBuyActivities: { items: GroupBuyActivity[]; totalItems: number } }>(
      `query GroupBuyActivities($options: GroupBuyActivityListOptions) {
        groupBuyActivities(options: $options) { items { ${FIELDS} } totalItems }
      }`,
      { options: { take, skip } },
    );
    return { items: groupBuyActivities?.items ?? [], totalItems: groupBuyActivities?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载拼团活动失败'));
  }
}

export async function fetchGroupBuyActivity(id: string): Promise<GroupBuyActivity | null> {
  try {
    const { groupBuyActivity } = await getAdminClient().request<{ groupBuyActivity: GroupBuyActivity | null }>(
      `query GroupBuyActivity($id: ID!) { groupBuyActivity(id: $id) { ${FIELDS} } }`,
      { id },
    );
    return groupBuyActivity ?? null;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载拼团活动失败'));
  }
}

export async function createGroupBuyActivity(input: GroupBuyCreateInput): Promise<string> {
  try {
    const { createGroupBuyActivity } = await getAdminClient().request<{ createGroupBuyActivity: { id: string } }>(
      `mutation CreateGroupBuyActivity($input: CreateGroupBuyActivityInput!) { createGroupBuyActivity(input: $input) { id } }`,
      { input },
    );
    return createGroupBuyActivity.id;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '创建拼团活动失败'));
  }
}

export async function updateGroupBuyActivity(input: GroupBuyUpdateInput): Promise<string> {
  try {
    const { updateGroupBuyActivity } = await getAdminClient().request<{ updateGroupBuyActivity: { id: string } }>(
      `mutation UpdateGroupBuyActivity($input: UpdateGroupBuyActivityInput!) { updateGroupBuyActivity(input: $input) { id } }`,
      { input },
    );
    return updateGroupBuyActivity.id;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '保存拼团活动失败'));
  }
}

export async function deleteGroupBuyActivity(id: string): Promise<void> {
  try {
    await getAdminClient().request<{ deleteGroupBuyActivity: boolean }>(
      `mutation DeleteGroupBuyActivity($id: ID!) { deleteGroupBuyActivity(id: $id) }`,
      { id },
    );
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '删除拼团活动失败'));
  }
}
