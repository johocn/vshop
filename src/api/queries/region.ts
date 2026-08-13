import { getGraphQLClient } from '../client';

export interface DistrictNode {
    adcode: string;
    name: string;
    level: string;
    center: { lat: number; lng: number };
}

/**
 * 获取行政区划数据（省→市→区）
 * parentAdcode 为空时返回省级列表，传入省级 adcode 返回市级，依此类推
 */
export async function getDistricts(parentAdcode?: string): Promise<DistrictNode[]> {
    const client = getGraphQLClient();
    const variables: any = {};
    if (parentAdcode) variables.parentAdcode = parentAdcode;
    const res: any = await client.request(
        `query($parentAdcode: String) {
            mapDistricts(parentAdcode: $parentAdcode) {
                adcode name level center { lat lng }
            }
        }`,
        variables,
    );
    return res?.mapDistricts || [];
}

/**
 * 逆地理编码：根据经纬度获取省市区街道
 */
export async function reverseGeocode(lat: number, lng: number) {
    const client = getGraphQLClient();
    const res: any = await client.request(
        `query($lat: Float!, $lng: Float!) {
            reverseGeocode(lat: $lat, lng: $lng) {
                province city district street formattedAddress
            }
        }`,
        { lat, lng },
    );
    return res?.reverseGeocode;
}
