// 知识库索引管理 admin-api 调用（vendure meilisearch-plugin，schema 已按插件 SDL 校准）
// 校准要点：
//   - Query  meiliIndexStats: [MeiliIndexStatus!]!（index/documents/healthy）
//   - Mutation meiliReindex(scope: MeiliReindexScope!): MeiliReindexResult!（queued/contentsTriggered）
//   - MeiliReindexScope 枚举：PRODUCTS（商品域）/ CONTENTS（内容域）/ ALL（全部）
//   - 内容域（Strapi）重建由 vendure 服务间触发（contentsTriggered 标识），web-admin 不直调 strapi
import { getAdminClient, graphQlErrorMsg } from './client';

export type MeiliReindexScope = 'PRODUCTS' | 'CONTENTS' | 'ALL';

export interface MeiliIndexStatus {
  index: string;
  documents: number;
  healthy: boolean;
}

export interface MeiliReindexResult {
  queued: boolean;
  contentsTriggered: boolean;
}

export async function fetchIndexStats(): Promise<MeiliIndexStatus[]> {
  try {
    const { meiliIndexStats } = await getAdminClient().request<{ meiliIndexStats: MeiliIndexStatus[] }>(
      `query MeiliIndexStats { meiliIndexStats { index documents healthy } }`,
    );
    return meiliIndexStats ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载索引状态失败'));
  }
}

export async function reindex(scope: MeiliReindexScope): Promise<MeiliReindexResult> {
  try {
    const { meiliReindex } = await getAdminClient().request<{ meiliReindex: MeiliReindexResult }>(
      `mutation MeiliReindex($scope: MeiliReindexScope!) { meiliReindex(scope: $scope) { queued contentsTriggered } }`,
      { scope },
    );
    return meiliReindex;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '提交重建失败'));
  }
}
