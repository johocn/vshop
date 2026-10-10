// 积分抽奖 admin-api 调用（schema 以 vendure/packages/lottery-plugin/src/plugin.ts adminApiExtensions 为准）
//   - Query lotteryPrizes(options: LotteryPrizeListOptions { skip, take }): LotteryPrizeList（sort ASC/id ASC）
//   - Query lotteryRecords(options: LotteryRecordListOptions { skip, take }): LotteryRecordList（id DESC）
//   - Mutation createLotteryPrize(input) / updateLotteryPrize(input) / deleteLotteryPrize(id)
//   - LotteryPrize { id name image weight consume stock enabled sort }
//   - LotteryRecord { id customerId prizeId prizeName prizeImage consume channelId createdAt }
//   - weight<=0 仅展示、不参与抽取；stock null=不限量、0=停用
//   - update 仅覆盖传入字段；image/stock 传 null 可清空
import { getAdminClient, graphQlErrorMsg } from './client';

export interface LotteryPrizeRow {
  id: string;
  name: string;
  image?: string | null;
  weight: number;
  consume: number;
  stock?: number | null;
  enabled: boolean;
  sort: number;
}

export interface LotteryPrizeInput {
  name: string;
  image?: string | null;
  weight: number;
  consume: number;
  stock?: number | null;
  enabled?: boolean;
  sort?: number;
}

export interface LotteryPrizeUpdateInput extends Partial<LotteryPrizeInput> {
  id: string;
}

export interface LotteryRecordRow {
  id: string;
  customerId: string;
  prizeId: string;
  prizeName: string;
  prizeImage?: string | null;
  consume: number;
  channelId: string;
  createdAt?: string | null;
}

const FIELDS = `id name image weight consume stock enabled sort`;

export async function fetchLotteryPrizes(take = 100, skip = 0): Promise<{ items: LotteryPrizeRow[]; total: number }> {
  try {
    const { lotteryPrizes } = await getAdminClient().request<{ lotteryPrizes: { items: LotteryPrizeRow[]; totalItems: number } }>(
      `query LotteryPrizes($options: LotteryPrizeListOptions) {
        lotteryPrizes(options: $options) { items { ${FIELDS} } totalItems }
      }`,
      { options: { skip, take } },
    );
    return { items: lotteryPrizes?.items ?? [], total: lotteryPrizes?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载奖品失败'));
  }
}

export async function createLotteryPrize(input: LotteryPrizeInput): Promise<LotteryPrizeRow> {
  try {
    const { createLotteryPrize } = await getAdminClient().request<{ createLotteryPrize: LotteryPrizeRow }>(
      `mutation CreateLotteryPrize($input: CreateLotteryPrizeInput!) { createLotteryPrize(input: $input) { ${FIELDS} } }`,
      { input },
    );
    return createLotteryPrize;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '新增奖品失败'));
  }
}

export async function updateLotteryPrize(input: LotteryPrizeUpdateInput): Promise<LotteryPrizeRow> {
  try {
    const { updateLotteryPrize } = await getAdminClient().request<{ updateLotteryPrize: LotteryPrizeRow }>(
      `mutation UpdateLotteryPrize($input: UpdateLotteryPrizeInput!) { updateLotteryPrize(input: $input) { ${FIELDS} } }`,
      { input },
    );
    return updateLotteryPrize;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '更新奖品失败'));
  }
}

export async function deleteLotteryPrize(id: string): Promise<void> {
  try {
    await getAdminClient().request<{ deleteLotteryPrize: boolean }>(
      `mutation DeleteLotteryPrize($id: ID!) { deleteLotteryPrize(id: $id) }`,
      { id },
    );
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '删除奖品失败'));
  }
}

const RECORD_FIELDS = `id customerId prizeId prizeName prizeImage consume channelId createdAt`;

export async function fetchLotteryRecords(skip = 0, take = 20): Promise<{ items: LotteryRecordRow[]; total: number }> {
  try {
    const { lotteryRecords } = await getAdminClient().request<{ lotteryRecords: { items: LotteryRecordRow[]; totalItems: number } }>(
      `query LotteryRecords($options: LotteryRecordListOptions) {
        lotteryRecords(options: $options) { items { ${RECORD_FIELDS} } totalItems }
      }`,
      { options: { skip, take } },
    );
    return { items: lotteryRecords?.items ?? [], total: lotteryRecords?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载抽奖记录失败'));
  }
}
