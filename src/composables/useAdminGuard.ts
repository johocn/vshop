// 管理页前端守卫（C 端包内的 admin 页面：分销结算 / 平台上架审批 / 商家上架）。
// 后端对这些操作有 @Allow(SuperAdmin) 兜底鉴权，前端守卫用于「进入即校验」：
// 未登录或后端判定无权限时立刻退回首页，不渲染管理界面与数据。
// 注意：前端守卫只是纵深防御，真正的权限判定始终以后端为准。
import { useAuthStore } from '../stores/auth';
import { getAdminDistributors } from '../api/queries/distribution';

const HOME_URL = '/pages/home/index';

let redirecting = false;

function deny(message: string): void {
    if (redirecting) return;
    redirecting = true;
    uni.showToast({ title: message, icon: 'none' });
    setTimeout(() => {
        redirecting = false;
        uni.reLaunch({ url: HOME_URL });
    }, 1200);
}

function isForbidden(e: any): boolean {
    const msg = String(e?.message || e?.response?.errors?.[0]?.message || e || '');
    return /FORBIDDEN|not\s+(currently\s+)?authorized|未授权|无权限|SuperAdmin/i.test(msg);
}

/**
 * 校验当前用户可访问管理功能。
 * @returns true 放行；false 已触发退回首页
 */
export async function requireAdmin(): Promise<boolean> {
    const auth = useAuthStore();
    if (!auth.token) {
        deny('请先登录管理员账号');
        return false;
    }
    try {
        // 轻量探针：管理类查询，非管理员会被后端拒绝
        await getAdminDistributors({ take: 1 });
        return true;
    } catch (e) {
        if (isForbidden(e)) {
            deny('当前账号无管理权限');
            return false;
        }
        // 网络等非权限错误不拦截，交由页面自身提示
        return true;
    }
}

/** 仅要求登录（商家自助页：商家在自有渠道提交商品上架，非平台管理员） */
export function requireAuth(): boolean {
    const auth = useAuthStore();
    if (!auth.token) {
        deny('请先登录');
        return false;
    }
    return true;
}
