// 购物圈帖子管理 admin-api 调用（schema 以 vendure/packages/shopping-circle-plugin/src/plugin.ts adminApiExtensions 为准）
//   - Query   circlePosts(options: CirclePostListOptions): { items: [CirclePost], totalItems }（options 仅 skip/take，无 filter）
//   - Mutation updateCirclePost(input: UpdateCirclePostInput!)，input { id, status?, isPinned? }
//   - admin 端 images 为 JSON 字符串（shop 端才是 [String!]），需自行 parse
//   - status：published（已发布）/ hidden（已隐藏）
import { getAdminClient, graphQlErrorMsg } from './client';

export interface CirclePostRow {
  id: string;
  customerId: string;
  title?: string | null;
  content: string;
  /** JSON 字符串数组（uploadCustomerAsset 的 source 列表） */
  images?: string | null;
  videoUrl?: string | null;
  productId?: string | null;
  likeCount: number;
  favoriteCount: number;
  status: 'published' | 'hidden' | string;
  isPinned: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const FIELDS = `id customerId title content images videoUrl productId likeCount favoriteCount status isPinned createdAt updatedAt`;

export async function fetchCirclePostPage(p: { skip: number; take: number }): Promise<{ items: CirclePostRow[]; total: number }> {
  try {
    const { circlePosts } = await getAdminClient().request<{ circlePosts: { items: CirclePostRow[]; totalItems: number } }>(
      `query CirclePosts($options: CirclePostListOptions) {
        circlePosts(options: $options) { items { ${FIELDS} } totalItems }
      }`,
      { options: { skip: p.skip, take: p.take } },
    );
    return { items: circlePosts?.items ?? [], total: circlePosts?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '加载帖子失败'));
  }
}

/** 置顶切换（isPinned）与隐藏/恢复（status: published | hidden）共用 */
export async function updateCirclePost(input: { id: string; status?: string; isPinned?: boolean }): Promise<CirclePostRow> {
  try {
    const { updateCirclePost } = await getAdminClient().request<{ updateCirclePost: CirclePostRow }>(
      `mutation UpdateCirclePost($input: UpdateCirclePostInput!) { updateCirclePost(input: $input) { ${FIELDS} } }`,
      { input },
    );
    return updateCirclePost;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '更新帖子失败'));
  }
}

export function parsePostImages(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
