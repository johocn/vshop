import { getGraphQLClient } from '../client';

// 购物圈（shopping-circle-plugin）shop-api 调用。
// SDL 校准要点（以 vendure packages/shopping-circle-plugin/src/plugin.ts 为准）：
//   - CirclePostListOptions 仅 { skip: Int, take: Int }
//   - shop 端 CirclePost.images 为 [String!]!（后端已 JSON 解析），admin 端才是 JSON 字符串
//   - viewerLiked/viewerFavorited：未登录时为 false；feed/详情游客可访问
//   - toggleCircleLike/toggleCircleFavorite 返回 ToggleCircleResult { liked favorited likeCount favoriteCount }

const POST_FIELDS = `
    id createdAt customerId nickname title content images videoUrl productId
    likeCount favoriteCount viewerLiked viewerFavorited isPinned
`;

/** 购物圈 feed（置顶在前，其余按 id 倒序；仅 published） */
export async function getCircleFeed(skip: number, take: number) {
    const client = getGraphQLClient();
    return client.request(
        `query CircleFeed($skip: Int, $take: Int) {
            circleFeed(options: { skip: $skip, take: $take }) { items { ${POST_FIELDS} } totalItems }
        }`,
        { skip, take },
    );
}

/** 我的帖子（含被隐藏的） */
export async function getMyCirclePosts(skip: number, take: number) {
    const client = getGraphQLClient();
    return client.request(
        `query MyCirclePosts($skip: Int, $take: Int) {
            myCirclePosts(options: { skip: $skip, take: $take }) { items { ${POST_FIELDS} } totalItems }
        }`,
        { skip, take },
    );
}

/** 帖子详情（游客可访问） */
export async function getCirclePost(id: string) {
    const client = getGraphQLClient();
    return client.request(
        `query CirclePost($id: ID!) { circlePost(id: $id) { ${POST_FIELDS} } }`,
        { id },
    );
}

export interface CreateCirclePostInput {
    title?: string | null;
    content: string;
    images?: string[] | null;
    videoUrl?: string | null;
    productId?: string | null;
}

/** 发布帖子（登录；title ≤50、content 必填由后端校验） */
export async function createCirclePost(input: CreateCirclePostInput) {
    const client = getGraphQLClient();
    return client.request(
        `mutation CreateCirclePost($input: CreateCirclePostInput!) {
            createCirclePost(input: $input) { ${POST_FIELDS} }
        }`,
        { input },
    );
}

export interface ToggleCircleResult {
    liked: boolean;
    favorited: boolean;
    likeCount: number;
    favoriteCount: number;
}

/** 点赞/取消点赞（登录） */
export async function toggleCircleLike(postId: string): Promise<ToggleCircleResult> {
    const client = getGraphQLClient();
    const res: any = await client.request(
        `mutation ToggleCircleLike($postId: ID!) { toggleCircleLike(postId: $postId) { liked favorited likeCount favoriteCount } }`,
        { postId },
    );
    return res?.toggleCircleLike;
}

/** 收藏/取消收藏（登录） */
export async function toggleCircleFavorite(postId: string): Promise<ToggleCircleResult> {
    const client = getGraphQLClient();
    const res: any = await client.request(
        `mutation ToggleCircleFavorite($postId: ID!) { toggleCircleFavorite(postId: $postId) { liked favorited likeCount favoriteCount } }`,
        { postId },
    );
    return res?.toggleCircleFavorite;
}
