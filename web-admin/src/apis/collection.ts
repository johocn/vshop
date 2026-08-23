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