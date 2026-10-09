// 会员等级/权益配置 admin-api 调用（member-level-plugin，schema 已按插件 SDL 校准）
// 校准要点（vendure packages/member-level-plugin/src/plugin.ts adminApiExtensions 实摘）：
//   - Query  memberTiers: [MemberTier!]!
//            levelConfig: LevelConfig!
//            members(options: JSON): MemberList!
//   - Mutation saveTiers(input: [MemberTierInput!]!): [MemberTier!]!   ← service 方法名是 saveMemberTiers，SDL 实名 saveTiers
//            updateLevelConfig(input: UpdateLevelConfigInput!): LevelConfig!
//            adjustPoints(customerId: ID!, amount: Int!, remark: String): MemberInfo!
//            adjustMemberGrowth(customerId: ID!, amount: Int!, source: String): MemberInfo!
//   - 所有比率字段均为千分比：specialDiscountRate 50 = 95 折（折扣额 = subTotal×rate/1000），
//     pointsMultiplier 1000 = ×1，redeemCapRatio 500 = 封顶 50%；specialDiscountRate 0 = 无专属折扣。
//   - saveTiers 按 tierLevel upsert（同档覆盖、缺档保留），保存前需回填所有档位完整提交。
import { getAdminClient, graphQlErrorMsg } from './client';

export interface MemberTier {
  id: string;
  tierLevel: number;
  /** 升级门槛（成长值） */
  threshold: number;
  name: string;
  /** 积分获取倍率（千分比，1000 = ×1） */
  pointsMultiplier: number;
  /** 抵现折扣率（千分比，1000 = 1 分抵 1 分） */
  redeemDiscountRate: number;
  /** 可抵占订单金额上限比例（千分比，500 = 最多抵 50%） */
  redeemCapRatio: number;
  /** 等级专属折扣率（千分比，0 = 无专属折扣，50 = 95 折） */
  specialDiscountRate: number;
}

export interface MemberTierInput {
  tierLevel: number;
  threshold: number;
  name: string;
  pointsMultiplier?: number;
  redeemDiscountRate?: number;
  redeemCapRatio?: number;
  specialDiscountRate?: number;
}

export interface LevelConfig {
  level1Threshold: number;
  level1Name: string;
  level2Threshold: number;
  level2Name: string;
  level3Threshold: number;
  level3Name: string;
  level4Threshold: number;
  level4Name: string;
  level5Threshold: number;
  level5Name: string;
  pointsEarnRatio: number;
  pointsEarnOnShipping: boolean;
}

export type UpdateLevelConfigInput = Partial<LevelConfig>;

const TIER_FIELDS = `id tierLevel threshold name pointsMultiplier redeemDiscountRate redeemCapRatio specialDiscountRate`;
const LEVEL_CONFIG_FIELDS = `level1Threshold level1Name level2Threshold level2Name level3Threshold level3Name level4Threshold level4Name level5Threshold level5Name pointsEarnRatio pointsEarnOnShipping`;

/** 千分比折扣率 → 折扣展示文案（50 = 95 折；0/空 = 无折扣） */
export function specialDiscountText(rate: number | string | null | undefined): string {
  const n = Number(rate);
  if (!n || Number.isNaN(n) || n <= 0) return '-';
  return `${(1000 - n) / 10} 折`;
}

export async function fetchMemberTiers(): Promise<MemberTier[]> {
  try {
    const { memberTiers } = await getAdminClient().request<{ memberTiers: MemberTier[] }>(
      `query MemberTiers { memberTiers { ${TIER_FIELDS} } }`,
    );
    return memberTiers ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载会员档位失败'));
  }
}

export async function saveTiers(input: MemberTierInput[]): Promise<MemberTier[]> {
  try {
    const { saveTiers } = await getAdminClient().request<{ saveTiers: MemberTier[] }>(
      `mutation SaveMemberTiers($input: [MemberTierInput!]!) { saveTiers(input: $input) { ${TIER_FIELDS} } }`,
      { input },
    );
    return saveTiers ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '保存会员档位失败'));
  }
}

export async function fetchLevelConfig(): Promise<LevelConfig> {
  try {
    const { levelConfig } = await getAdminClient().request<{ levelConfig: LevelConfig }>(
      `query LevelConfig { levelConfig { ${LEVEL_CONFIG_FIELDS} } }`,
    );
    return levelConfig;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载升级配置失败'));
  }
}

export async function updateLevelConfig(input: UpdateLevelConfigInput): Promise<LevelConfig> {
  try {
    const { updateLevelConfig } = await getAdminClient().request<{ updateLevelConfig: LevelConfig }>(
      `mutation UpdateLevelConfig($input: UpdateLevelConfigInput!) { updateLevelConfig(input: $input) { ${LEVEL_CONFIG_FIELDS} } }`,
      { input },
    );
    return updateLevelConfig;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '保存升级配置失败'));
  }
}
