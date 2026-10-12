import { getGraphQLClient } from '../client';
import { DIY_PLAN_FIELDS } from '../queries/diy';

/** 槽位选材（spec v2，结构对齐 @diy/calc SlotSelection） */
export interface DiySpecSlot {
    role: string;
    materialId?: string;
    /** 隔片：每隔几颗插一片 */
    every?: number;
    /** 用户数量槽位覆盖值 */
    qtyOverride?: number;
    /** 序列排布模式 */
    arrange?: 'alternate' | 'random' | 'zoned';
}

/** spec v2（SDL 中为 JSON 标量；templateCode 同时作为独立入参传入） */
export interface DiyPlanSpecV2 {
    templateCode: string;
    mode: 'byWrist' | 'byCount' | 'pattern' | 'free';
    params: { wristSize?: number; fit?: string; gap?: number; [key: string]: number | string | undefined };
    slots: DiySpecSlot[];
    /** pattern 模式的素材序列 */
    sequence?: string[];
}

/** 创建方案（status 落 draft，金额以 BOM 计算为准） */
export async function createDiyPlan(templateCode: string, spec: DiyPlanSpecV2, thumb?: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation CreateDiyPlan($templateCode: String!, $spec: JSON!, $thumb: String) {
            createDiyPlan(templateCode: $templateCode, spec: $spec, thumb: $thumb) { ${DIY_PLAN_FIELDS} }
        }
    `;
    return client.request(mutation, { templateCode, spec, thumb });
}

/** 生成报价单（draft → quoted，返回含 quoteNo/expiresAt 的方案） */
export async function quoteDiyPlan(id: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation QuoteDiyPlan($id: ID!) {
            quoteDiyPlan(id: $id) { ${DIY_PLAN_FIELDS} }
        }
    `;
    return client.request(mutation, { id });
}

/** 方案下单（生成挂 diyPlanId 自定义字段的订单行） */
export async function createOrderFromPlan(id: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation CreateOrderFromPlan($id: ID!) {
            createOrderFromPlan(id: $id) { ${DIY_PLAN_FIELDS} }
        }
    `;
    return client.request(mutation, { id });
}

/** 公开/取消公开到作品广场 */
export async function publishDiyPlan(id: string, isPublic: boolean) {
    const client = getGraphQLClient();
    const mutation = `
        mutation PublishDiyPlan($id: ID!, $isPublic: Boolean!) {
            publishDiyPlan(id: $id, isPublic: $isPublic) { ${DIY_PLAN_FIELDS} }
        }
    `;
    return client.request(mutation, { id, isPublic });
}

/** 复制他人公开方案到我的方案 */
export async function copyDiyPlan(id: string) {
    const client = getGraphQLClient();
    const mutation = `
        mutation CopyDiyPlan($id: ID!) {
            copyDiyPlan(id: $id) { ${DIY_PLAN_FIELDS} }
        }
    `;
    return client.request(mutation, { id });
}
