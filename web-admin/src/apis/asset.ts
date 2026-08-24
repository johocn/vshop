import { getAdminClient, buildClientUrl } from './client';
import { getAuthToken, getChannelToken } from './session';

export interface AssetItem {
  id: string;
  preview: string;
  source: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export async function fetchAssets(take = 30, skip = 0): Promise<{ totalItems: number; items: AssetItem[] }> {
  const { assets } = await getAdminClient().request<{
    assets: { totalItems: number; items: AssetItem[] };
  }>(
    `query Assets($take: Int, $skip: Int) {
      assets(options: { take: $take, skip: $skip, sort: { createdAt: DESC } }) {
        totalItems
        items { id preview source mimeType width height }
      }
    }`,
    { take, skip },
  );
  return assets;
}

export async function uploadAsset(file: File | Blob, fileName: string): Promise<AssetItem> {
  const query = `mutation CreateAssets($input: [CreateAssetInput!]!) {
    createAssets(input: $input) { __typename ... on Asset { id preview source mimeType } }
  }`;
  const operations = JSON.stringify({ query, variables: { input: [{ file: null }] } });
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