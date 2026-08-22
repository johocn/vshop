import { useAuthStore } from '../stores/auth';
import { getGraphQLClient } from '../api/client';

/**
 * 解析并落址邀请码：
 * 1. 若 URL 带 ref 参数（H5）/ options.ref（小程序 onLoad），写入 authStore（含 storage）。
 * 2. 若当前已登录且客户尚未绑定 referredBy，就地补写。
 * 返回解析到的 ref 码（无则空串）。
 */
export async function parseAndBindRef(ref?: string): Promise<string> {
    const authStore = useAuthStore();
    const code = (ref && String(ref).trim()) || '';
    if (code) {
        authStore.setInviteCode(code);
    }
    const stored = authStore.inviteCode;
    if (!stored) return '';
    if (!authStore.isLoggedIn) return stored;

    try {
        const client = getGraphQLClient();
        const res: any = await client.request(`query {
            activeCustomer { id customFields { referredBy } }
        }`);
        if (res?.activeCustomer?.customFields?.referredBy) return stored;
        await client.request(`mutation UpdateCustomerReferredBy($referredBy: String!) {
            updateCustomer(input: { customFields: { referredBy: $referredBy } }) {
                ...on Customer { id }
                ...on ErrorResult { errorCode }
            }
        }`, { referredBy: stored });
    } catch (e) {
        console.error('parseAndBindRef 补写 referredBy 失败', e);
    }
    return stored;
}