import { getAdminClient, buildClientUrl } from './client';
import { getAuthToken, getChannelToken, getUserId } from './session';

export interface AssetItem {
  id: string;
  name?: string;
  preview: string;
  source: string;
  mimeType: string;
  width?: number;
  height?: number;
  assetTags?: string[];
}

export interface AssetTagSummary {
  name: string;
  count: number;
}

export async function fetchAssets(
  take = 30,
  skip = 0,
  tag?: string,
): Promise<{ totalItems: number; items: AssetItem[] }> {
  const { assetLibrary } = await getAdminClient().request<{
    assetLibrary: { totalItems: number; items: AssetItem[] };
  }>(
    `query AssetLibrary($take: Int, $skip: Int, $tag: String) {
      assetLibrary(take: $take, skip: $skip, tag: $tag) {
        totalItems
        items { id name preview source mimeType width height assetTags }
      }
    }`,
    { take, skip, tag: tag ?? null },
  );
  return assetLibrary;
}

export async function fetchAssetTags(): Promise<AssetTagSummary[]> {
  const res = await getAdminClient().request<{ assetTags: AssetTagSummary[] }>(
    `query AssetTags {
      assetTags { name count }
    }`,
  );
  return res.assetTags;
}

export async function setAssetTags(assetIds: string[], tags: string[]): Promise<void> {
  await getAdminClient().request(
    `mutation SetAssetTags($assetIds: [String!]!, $tags: [String!]) {
      setAssetTags(assetIds: $assetIds, tags: $tags)
    }`,
    { assetIds, tags },
  );
}

export async function uploadAsset(file: File | Blob, fileName: string): Promise<AssetItem> {
  // 记录上传者（普通用户图库按用户过滤时只能看到自己的上传）+ 空分类标签
  const uploadedBy = getUserId();
  const query = `mutation CreateAssets($input: [CreateAssetInput!]!) {
    createAssets(input: $input) { __typename ... on Asset { id preview source mimeType } }
  }`;
  const operations = JSON.stringify({
    query,
    variables: {
      input: [{ file: null, customFields: { uploadedBy, assetTags: [] } } satisfies Record<string, unknown>],
    },
  });
  const form = new FormData();
  form.append('operations', operations);
  form.append('map', JSON.stringify({ '0': ['variables.input.0.file'] }));
  form.append('0', file, fileName);
  const headers: Record<string, string> = {};
  const auth = getAuthToken();
  if (auth) headers['Authorization'] = 'Bearer ' + auth;
  const ch = getChannelToken();
  if (ch) headers['vendure-token'] = ch;
  const res = await fetch(buildClientUrl(), { method: 'POST', headers, body: form });
  const body = await res.json();
  const r = (body?.data?.createAssets || [])[0];
  if (!r?.id) throw new Error(body?.errors?.[0]?.message || '上传失败');
  return r;
}

export async function deleteAsset(id: string): Promise<void> {
  await getAdminClient().request(
    `mutation DeleteAsset($assetId: ID!) { deleteAsset(assetId: $assetId, force: true) { success } }`,
    { assetId: id },
  );
}