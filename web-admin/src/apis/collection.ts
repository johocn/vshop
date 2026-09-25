import { getAdminClient } from './client';

export interface CollectionItem {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
  /** 分类图标等扩展字段，存 Collection.customFields */
  customFields?: { icon?: string | null } | null;
  productVariantCount?: number;
}

export async function fetchCollectionsOptimized(take = 200): Promise<CollectionItem[]> {
  const { collections } = await getAdminClient().request<{
    collections: { items: CollectionItem[] };
  }>(
    `query Collections($take: Int) {
      collections(options: { take: $take }) {
        items { id name parentId position productVariantCount customFields { icon } }
      }
    }`,
    { take },
  );
  return collections.items;
}

export interface CollectionTreeNode extends CollectionItem {
  depth: number;
  children: CollectionTreeNode[];
}

/** 由扁平列表构建嵌套树（同级按 position 升序；position 相同按 name） */
export function buildCollectionTreeNodes(list: CollectionItem[]): CollectionTreeNode[] {
  const byId = new Map<string, CollectionTreeNode>();
  for (const it of list) byId.set(String(it.id), { ...it, depth: 0, children: [] });
  const roots: CollectionTreeNode[] = [];
  for (const node of byId.values()) {
    const pid = node.parentId == null ? null : String(node.parentId);
    const parent = pid ? byId.get(pid) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (nodes: CollectionTreeNode[], depth: number) => {
    nodes.sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name));
    for (const n of nodes) {
      n.depth = depth;
      sortRec(n.children, depth + 1);
    }
  };
  sortRec(roots, 0);
  return roots;
}

/** 把嵌套树摊平成可渲染行，跳过已折叠节点的子树 */
export function flattenCollectionTree(
  nodes: CollectionTreeNode[],
  collapsed: Set<string>,
): CollectionTreeNode[] {
  const out: CollectionTreeNode[] = [];
  const walk = (list: CollectionTreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (!collapsed.has(String(n.id))) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export interface PlatformCollectionNode {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * 平台（默认租户）分类列表：审批手动归类 / 租户归位映射下拉用。
 * 始终取 default channel 的分类，避免拿到登录租户渠道自己的分类。
 */
export async function fetchPlatformCollections(): Promise<PlatformCollectionNode[]> {
  const { platformCollections } = await getAdminClient().request<{
    platformCollections: PlatformCollectionNode[];
  }>(`query PlatformCollections { platformCollections { id name parentId } }`);
  return platformCollections ?? [];
}

/** 按 id 建立 父->子 有序树，返回带层级缩进的分层节点，用于下拉选择 */
export function buildCollectionTree(
  list: PlatformCollectionNode[],
  indent = '　',
): Array<{ id: string; name: string; depth: number }> {
  const byParent = new Map<string | null, PlatformCollectionNode[]>();
  for (const it of list) {
    const k = it.parentId == null ? null : String(it.parentId);
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(it);
  }
  const out: Array<{ id: string; name: string; depth: number }> = [];
  const walk = (nodes: PlatformCollectionNode[] | undefined, depth: number) => {
    if (!nodes) return;
    for (const n of nodes) {
      out.push({ id: n.id, name: indent.repeat(depth) + n.name, depth });
      walk(byParent.get(String(n.id)), depth + 1);
    }
  };
  walk(byParent.get(null) ?? [], 0);
  return out;
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

/** 排序 / 移动（Vendure 原生 moveCollection）。index 为同父级内的目标序号（0 起） */
export async function moveCollection(id: string, parentId: string | null, index: number): Promise<void> {
  await getAdminClient().request(
    `mutation MoveCollection($input: MoveCollectionInput!) { moveCollection(input: $input) { id } }`,
    { input: { collectionId: id, parentId, index } },
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

// 把商品挂入分类（Collection）：调用后端 mapProductToPlatformCollection，追加进该分类的 product-id-filter
// 并重新计算成员，使商品立即出现在分类商品列表（新增/编辑保存商品且选了「分类」时调用）。
export async function mapProductToCollection(productId: string, collectionId: string): Promise<void> {
  await getAdminClient().request(
    `mutation MapProductToCollection($productId: ID!, $collectionId: ID!) {
      mapProductToPlatformCollection(productId: $productId, collectionId: $collectionId)
    }`,
    { productId, collectionId },
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

/** 设置分类图标（写入 Collection.customFields.icon）；icon 传 null 表示清除 */
export async function setCollectionIcon(id: string, icon: string | null): Promise<void> {
  await getAdminClient().request(
    `mutation SetCollectionIcon($input: UpdateCollectionInput!) { updateCollection(input: $input) { id } }`,
    { input: { id, customFields: { icon } } },
  );
}

/**
 * 批量删除预判：只放行「空分类」（无商品、无子分类）。
 * - 子分类：来自已加载的分类表，可靠；
 * - 商品数：来自 collections.items.productVariantCount（admin-api 实测可用）。
 */
export function pickDeletableCollections(
  targets: CollectionItem[],
  all: CollectionItem[],
  productCountById: Map<string, number>,
): { ok: CollectionItem[]; blocked: Array<{ item: CollectionItem; reason: 'hasProducts' | 'hasChildren' }> } {
  const hasChild = new Set(all.filter((c) => c.parentId != null).map((c) => String(c.parentId)));
  const ok: CollectionItem[] = [];
  const blocked: Array<{ item: CollectionItem; reason: 'hasProducts' | 'hasChildren' }> = [];
  for (const c of targets) {
    if (hasChild.has(String(c.id))) blocked.push({ item: c, reason: 'hasChildren' });
    else if ((productCountById.get(String(c.id)) ?? 0) > 0) blocked.push({ item: c, reason: 'hasProducts' });
    else ok.push(c);
  }
  return { ok, blocked };
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