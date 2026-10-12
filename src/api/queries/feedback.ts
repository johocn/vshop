import { getGraphQLClient } from '../client';

/** 常见问题列表（未登录可查；type 可选：register/order/pay/afterSale/account/general，不传返回全部；lang 直传前端 locale，缺语言回退基线） */
export async function getFaqs(type?: string, lang?: string) {
    const client = getGraphQLClient();
    return client.request(
        `query Faqs($type: String, $lang: String) { faqs(type: $type, lang: $lang) { id title content type sort } }`,
        { type: type || null, lang: lang || null },
    );
}

export interface CreateFeedbackInput {
    type?: string;
    title: string;
    content: string;
    imgs?: string[];
    contactWay?: string;
}

/** 提交意见反馈（title ≤20 字、contactWay ≤30 字，超长后端报错；imgs 为图片 URL 数组） */
export async function createFeedback(input: CreateFeedbackInput) {
    const client = getGraphQLClient();
    return client.request(
        `mutation CreateFeedback($input: CreateFeedbackInput!) {
            createFeedback(input: $input) { id status }
        }`,
        { input },
    );
}

/** 我的反馈列表（登录态；含商家回复闭环字段） */
export async function getMyFeedbacks(skip = 0, take = 50) {
    const client = getGraphQLClient();
    return client.request(
        `query MyFeedbacks($options: FeedbackListOptions) {
            myFeedbacks(options: $options) {
                items { id type title content status reply repliedAt repliedBy readAt createdAt }
                totalItems
            }
        }`,
        { options: { skip, take } },
    );
}

/** 全部可读反馈标记已读（幂等），返回最新未读数 */
export async function markFeedbacksRead() {
    const client = getGraphQLClient();
    return client.request(`mutation { markFeedbacksRead }`, {});
}

/** 反馈未读数（readAt 为空且状态非 pending） */
export async function getUnreadFeedbackCount() {
    const client = getGraphQLClient();
    return client.request(`query { unreadFeedbackCount }`, {});
}
