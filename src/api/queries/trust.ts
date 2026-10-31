import { getGraphQLClient } from '../client';

/** §113 店铺级信任文案：评价页信任签名卡三行开关 + 自定义文案 */
export interface StoreTrustCopy {
    qualityEnabled: boolean;
    qualityText: string | null;
    serviceEnabled: boolean;
    serviceText: string | null;
    timeEnabled: boolean;
    timeText: string | null;
}

/** 缺省/失败回落：三行全开 + 空文案（组件层再回落各语言默认文案） */
const DEFAULT_TRUST: StoreTrustCopy = {
    qualityEnabled: true,
    qualityText: null,
    serviceEnabled: true,
    serviceText: null,
    timeEnabled: true,
    timeText: null,
};

const TRUST_QUERY = `
    query StoreTrustCopy {
        campusStoreTrust {
            qualityEnabled qualityText
            serviceEnabled serviceText
            timeEnabled timeText
        }
    }
`;

let cached: Promise<StoreTrustCopy> | null = null;

/** 模块级缓存：一次会话只拉一次；接口失败回落缺省值，保证评价页卡片不空窗 */
export function fetchStoreTrust(): Promise<StoreTrustCopy> {
    if (!cached) {
        cached = getGraphQLClient()
            .request(TRUST_QUERY)
            .then((res: any) => (res?.campusStoreTrust as StoreTrustCopy) ?? DEFAULT_TRUST)
            .catch(() => DEFAULT_TRUST);
    }
    return cached;
}
