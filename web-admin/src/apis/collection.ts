import { getAdminClient } from './client';

export interface CollectionItem {
  id: string;
  name: string;
}

export async function fetchCollectionsOptimized(take = 50): Promise<CollectionItem[]> {
  const { collections } = await getAdminClient().request<{
    collections: { items: CollectionItem[] };
  }>(`query Collections($take: Int) { collections(options: { take: $take }) { items { id name } } }`, { take });
  return collections.items;
}

interface CollectionInput {
  name: string;
  slug?: string;
  productIds?: string[];
}

const LAN = 'zh_Hans';

// calibrated against Vendure default-collection-filters.ts:
//  code = 'product-id-filter', arg name = 'productIds' (ID list)
// ConfigurableOperationInput uses `arguments` (NOT `args`), with ConfigArgInput { name, value }.
async function buildFilters(productIds: string | string[] = []) {
  const ids = Array.isArray(productIds) ? productIds : [productIds];
  return [{ code: 'product-id-filter', arguments: [{ name: 'productIds', value: JSON.stringify(ids) }] }];
}

export async function createCollection(input: CollectionInput): Promise<string> {
  const { createCollection } = await getAdminClient().request<{ createCollection: { id: string } }>(
    `mutation CreateCollection($input: CreateCollectionInput!) { createCollection(input: $input) { id } }`,
    {
      input: {
        isPrivate: false,
        // CreateCollectionTranslationInput requires description: String!
        translations: [{ languageCode: LAN, name: input.name, slug: input.slug || input.name, description: input.name }],
        filters: await buildFilters(input.productIds || []),
      },
    },
  );
  return createCollection.id;
}

export async function updateCollection(id: string, productIds: string[], name?: string): Promise<void> {
  const input: Record<string, unknown> = {
    id,
    filters: await buildFilters(productIds),
  };
  if (name) input.translations = [{ languageCode: LAN, name, slug: name, description: name }];
  await getAdminClient().request(
    `mutation UpdateCollection($input: UpdateCollectionInput!) { updateCollection(input: $input) { id } }`,
    { input },
  );
}

// 纯重命名：只更新 translations，不触碰 filters，避免清空分类下已挂载商品
export async function renameCollection(id: string, name: string): Promise<void> {
  await getAdminClient().request(
    `mutation UpdateCollectionName($input: UpdateCollectionInput!) {
      updateCollection(input: $input) { id }
    }`,
    { input: { id, translations: [{ languageCode: LAN, name, slug: name, description: name }] } },
  );
}

// 租户分类隔离创建：createTenantCollection（backend cjk-plugin adminApiExtensions 提供），
// 创建租户分类并从默认渠道摘除（隔离）。走平台的 product-id-filter 过滤器，含无商品时空 filters。
export async function createTenantCollection(input: CollectionInput): Promise<string> {
  const { createTenantCollection } = await getAdminClient().request<{ createTenantCollection: { id: string } }>(
    `mutation CreateTenantCollection($input: CreateCollectionInput!) {
      createTenantCollection(input: $input) { id }
    }`,
    {
      input: {
        isPrivate: false,
        translations: [{ languageCode: LAN, name: input.name, slug: input.slug || input.name, description: input.name }],
        filters: await buildFilters(input.productIds || []),
      },
    },
  );
  return createTenantCollection.id;
}

// 归位映射：租户分类名 -> 平台分类 collectionId，写入当前租户渠道的 categoryMapping 自定义字段。
// 复用后端 myUpdateChannelCustomFields 写回当前渠道（channel.ts 里同为该 mutation）。
export interface CategoryMapping {
  tenantCategory: string;
  collectionId: string;
}

export async function saveCategoryMapping(mapping: CategoryMapping[]): Promise<boolean> {
  await getAdminClient().request(
    `mutation SaveMapping($json: JSON!) { myUpdateChannelCustomFields(input: $json) }`,
    { json: { categoryMapping: mapping } },
  );
  return true;
}

export async function deleteCollectionById(id: string): Promise<void> {
  // DeletionResponse in this schema exposes `result: DeletionResult` (DELETED | NOT_DELETED),
  // not `success`. Calibrated against live :3000 admin-api.
  const { deleteCollection } = await getAdminClient().request<{ deleteCollection: { result: 'DELETED' | 'NOT_DELETED' } }>(
    `mutation DeleteCollection($id: ID!) { deleteCollection(id: $id) { result } }`,
    { id },
  );
  if (deleteCollection.result !== 'DELETED') {
    throw new Error(`deleteCollection returned ${deleteCollection.result} for id ${id}`);
  }
}