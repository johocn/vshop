// 秒杀活动管理 admin-api 调用（flash-sale-plugin，schema 已按插件 SDL 校准）
// 校准要点：
//   - Query   flashSaleActivities(options: FlashSaleActivityListOptions): { items: [FlashSaleActivity], totalItems }
//             flashSaleActivity(id: ID!): FlashSaleActivity
//   - Mutation createFlashSaleActivity(input: CreateFlashSaleActivityInput!)、
//             updateFlashSaleActivity(input: UpdateFlashSaleActivityInput!)、deleteFlashSaleActivity(id)
//             setFlashSaleActivityStatus(id: ID!, status: FlashSaleStatus!): FlashSaleActivity
//   - 价格单位：分（flashPrice）。展示 /100 元，提交 Math.round(元*100)。
//   - 创建/更新均不提交 status；启用/结束走 setFlashSaleActivityStatus，非法转换返回 USER_INPUT_ERROR。
import { getAdminClient, graphQlErrorMsg } from './client';

export type FlashSaleStatus = 'upcoming' | 'active' | 'ended';

export interface FlashSaleActivity {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  /** 秒杀价（分） */
  flashPrice: number;
  totalStock: number;
  soldCount: number;
  /** 每人限购件数；0 = 不限 */
  limitPerUser: number;
  productId: string;
  variantId: string;
  status: FlashSaleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FlashSaleCreateInput {
  name: string;
  startAt: string;
  endAt: string;
  /** 秒杀价（分） */
  flashPrice: number;
  totalStock: number;
  limitPerUser?: number;
  productId: string;
  variantId: string;
}

export interface FlashSaleUpdateInput {
  id: string;
  name?: string;
  startAt?: string;
  endAt?: string;
  flashPrice?: number;
  totalStock?: number;
  limitPerUser?: number;
  productId?: string;
  variantId?: string;
}

const FIELDS = `id name startAt endAt flashPrice totalStock soldCount limitPerUser productId variantId status createdAt updatedAt`;

export async function fetchFlashSaleActivities(take = 20, skip = 0): Promise<{ items: FlashSaleActivity[]; totalItems: number }> {
  try {
    const { flashSaleActivities } = await getAdminClient().request<{ flashSaleActivities: { items: FlashSaleActivity[]; totalItems: number } }>(
      `query FlashSaleActivities($options: FlashSaleActivityListOptions) {
        flashSaleActivities(options: $options) { items { ${FIELDS} } totalItems }
      }`,
      { options: { take, skip, sort: { createdAt: 'DESC' as const } } },
    );
    return { items: flashSaleActivities?.items ?? [], totalItems: flashSaleActivities?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载秒杀活动失败'));
  }
}

export async function fetchFlashSaleActivity(id: string): Promise<FlashSaleActivity | null> {
  try {
    const { flashSaleActivity } = await getAdminClient().request<{ flashSaleActivity: FlashSaleActivity | null }>(
      `query FlashSaleActivity($id: ID!) { flashSaleActivity(id: $id) { ${FIELDS} } }`,
      { id },
    );
    return flashSaleActivity ?? null;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载秒杀活动失败'));
  }
}

export async function createFlashSaleActivity(input: FlashSaleCreateInput): Promise<string> {
  try {
    const { createFlashSaleActivity } = await getAdminClient().request<{ createFlashSaleActivity: { id: string } }>(
      `mutation CreateFlashSaleActivity($input: CreateFlashSaleActivityInput!) { createFlashSaleActivity(input: $input) { id } }`,
      { input },
    );
    return createFlashSaleActivity.id;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '创建秒杀活动失败'));
  }
}

export async function updateFlashSaleActivity(input: FlashSaleUpdateInput): Promise<string> {
  try {
    const { updateFlashSaleActivity } = await getAdminClient().request<{ updateFlashSaleActivity: { id: string } }>(
      `mutation UpdateFlashSaleActivity($input: UpdateFlashSaleActivityInput!) { updateFlashSaleActivity(input: $input) { id } }`,
      { input },
    );
    return updateFlashSaleActivity.id;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '保存秒杀活动失败'));
  }
}

/** 显式改状态：active 需在活动时间内，upcoming 仅开始前，ended 随时可下线；非法转换返回 USER_INPUT_ERROR */
export async function setFlashSaleActivityStatus(id: string, status: FlashSaleStatus): Promise<FlashSaleActivity> {
  try {
    const { setFlashSaleActivityStatus } = await getAdminClient().request<{ setFlashSaleActivityStatus: FlashSaleActivity }>(
      `mutation SetFlashSaleActivityStatus($id: ID!, $status: FlashSaleStatus!) {
        setFlashSaleActivityStatus(id: $id, status: $status) { ${FIELDS} }
      }`,
      { id, status },
    );
    return setFlashSaleActivityStatus;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '更新秒杀活动状态失败'));
  }
}

export async function deleteFlashSaleActivity(id: string): Promise<void> {
  try {
    await getAdminClient().request<{ deleteFlashSaleActivity: boolean }>(
      `mutation DeleteFlashSaleActivity($id: ID!) { deleteFlashSaleActivity(id: $id) }`,
      { id },
    );
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '删除秒杀活动失败'));
  }
}
