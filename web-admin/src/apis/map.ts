// 地图/admin-api 调用（cjk-plugin map 模块：行政区划联动 / 逆地理编码 / SDK 配置）
import { getAdminClient } from './client';

export interface DistrictNode {
  adcode: string;
  name: string;
  level: string;
  center: { lat: number; lng: number };
}

export interface ReverseGeocodeResult {
  province: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  formattedAddress: string;
}

export interface MapSdkConfig {
  provider: string;
  sdkUrl: string;
  hasConfigured: boolean;
}

// 拉取某级行政区划的下级（parentAdcode=null 时返回中国省级）
export async function fetchDistricts(parentAdcode?: string | null): Promise<DistrictNode[]> {
  const { mapDistricts } = await getAdminClient().request<{ mapDistricts: DistrictNode[] }>(
    `query Districts($parentAdcode: String) {
      mapDistricts(parentAdcode: $parentAdcode) { adcode name level center { lat lng } }
    }`,
    { parentAdcode: parentAdcode ?? null },
  );
  return mapDistricts ?? [];
}

// 经纬度逆地理编码 → 省市区/街道/详细地址
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const { reverseGeocode: r } = await getAdminClient().request<{ reverseGeocode: ReverseGeocodeResult }>(
    `query Re($lat: Float!, $lng: Float!) {
      reverseGeocode(lat: $lat, lng: $lng) { province city district street formattedAddress }
    }`,
    { lat, lng },
  );
  return r ?? null;
}

// 读取地图 SDK 加载地址（provider=sdkUrl）
export async function fetchMapSdkConfig(): Promise<MapSdkConfig> {
  const { mapSdkConfig } = await getAdminClient().request<{ mapSdkConfig: MapSdkConfig }>(
    `query Sdk { mapSdkConfig { provider sdkUrl hasConfigured } }`,
  );
  return mapSdkConfig ?? { provider: '', sdkUrl: '', hasConfigured: false };
}