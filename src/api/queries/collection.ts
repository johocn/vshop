import { getGraphQLClient } from '../client';

export interface FloorItemConfig {
    productId: string;
    size: string;
    highlighted: boolean;
    label: string;
}

export interface FloorCollection {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    featuredAsset: { preview: string } | null;
    customFields: {
        floorEnabled: boolean;
        floorTitle: string;
        floorSubtitle: string;
        floorLayout: string;
        floorSortOrder: number;
        floorMaxScreens: number;
        floorTheme: { primaryColor: string; backgroundColor: string; titleIcon: string } | null;
        floorItemConfig: FloorItemConfig[];
        floorSchedule: { startAt: string | null; endAt: string | null } | null;
    };
    productVariants: {
        items: Array<{
            id: string;
            productId: string;
            product: {
                id: string;
                name: string;
                slug: string;
                featuredAsset: { preview: string } | null;
                variants: Array<{ price: number; priceWithTax: number; currencyCode: string }>;
            };
        }>;
    };
}

export async function getEnabledFloors(): Promise<any> {
    const client = getGraphQLClient();
    const query = `
        query GetEnabledFloors {
            collections {
                items {
                    id
                    slug
                    name
                    description
                    featuredAsset { preview }
                    customFields {
                        floorEnabled
                        floorTitle
                        floorSubtitle
                        floorLayout
                        floorSortOrder
                        floorMaxScreens
                        floorTheme { primaryColor backgroundColor titleIcon }
                        floorItemConfig { productId size highlighted label }
                        floorSchedule { startAt endAt }
                    }
                    productVariants(options: { take: 30 }) {
                        items {
                            id
                            productId
                            product {
                                id
                                name
                                slug
                                featuredAsset { preview }
                                variants { price priceWithTax currencyCode }
                            }
                        }
                    }
                }
            }
        }
    `;
    return client.request(query);
}

/**
 * 过滤启用中的楼层：
 * - floorEnabled=true
 * - 在 floorSchedule 时间范围内
 * - 有商品（productVariants.items 非空）
 */
export function filterActiveFloors(floors: FloorCollection[]): FloorCollection[] {
    const now = new Date();
    return floors
        .filter(f => f.customFields?.floorEnabled)
        .filter(f => (f.productVariants?.items?.length ?? 0) > 0)
        .filter(f => {
            const schedule = f.customFields?.floorSchedule;
            if (!schedule) return true;
            const startAt = schedule.startAt ? new Date(schedule.startAt) : null;
            const endAt = schedule.endAt ? new Date(schedule.endAt) : null;
            if (startAt && now < startAt) return false;
            if (endAt && now > endAt) return false;
            return true;
        })
        .sort((a, b) => (a.customFields?.floorSortOrder || 0) - (b.customFields?.floorSortOrder || 0));
}
