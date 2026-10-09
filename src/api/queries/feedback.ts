import { getGraphQLClient } from '../client';

/** 常见问题列表（未登录可查；type 可选：register/order/pay/afterSale/account/general，不传返回全部） */
export async function getFaqs(type?: string) {
    const client = getGraphQLClient();
    return client.request(
        `query Faqs($type: String) { faqs(type: $type) { id title content type sort } }`,
        { type: type || null },
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
