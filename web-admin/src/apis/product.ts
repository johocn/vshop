// 商品域 admin-api 调用（Task 3 + Task 7，schema 已校准）
// 校准结果（本地 admin-api 实测）：
//   - products(options:{take,skip,filter:{name:{contains}}}) { totalItems items { id name enabled slug } }
//     —— name/slug 直接可用（无需 translations），filter.name.contains 可用
//   - product(id) { id name enabled slug } / translations { languageCode name slug description } —— 可用
//   - updateProduct(input:{id,enabled}) / updateProduct(input:{id,translations}) —— 可用
//   - createProduct(input:{translations:[{languageCode,name,slug,description}]}) 直接返回 Product（非 union）
//     —— description 为 NOT NULL 必须提供；本地实测无需 variant 即可创建商品
//   - createProductVariants(input:[{productId,sku,price,taxCategoryId,translations:[{languageCode,name}]}])
//     —— 若需为商品补 SKU/变体，用此 mutation（本地实测可用，无需 optionValues/optionIds）
//   - collections(options:{take}) { totalItems items { id name } } —— 可用
import { getAdminClient } from './client';

// 本地 admin-api 实测的 LanguageCode 枚举值（zh_Hans 可用，en 也可用）
export const PRODUCT_LANGUAGE_CODE = 'zh_Hans';

export interface ProductListItem {
  id: string;
  name: string;
  enabled: boolean;
  slug: string;
}

export interface ProductDetail extends ProductListItem {
  featuredAsset?: { preview: string } | null;
  description?: string;
}

export interface CollectionListItem {
  id: string;
  name: string;
}

export async function fetchProducts(
  take = 20,
  skip = 0,
  term?: string,
): Promise<{ totalItems: number; items: ProductListItem[] }> {
  const { products } = await getAdminClient().request<{
    products: { totalItems: number; items: ProductListItem[] };
  }>(
    `query Products($take: Int, $skip: Int, $term: String) {
      products(options: { take: $take, skip: $skip, filter: { name: { contains: $term } } }) {
        totalItems
        items { id name enabled slug }
      }
    }`,
    { take, skip, term },
  );
  return products;
}

export async function fetchProduct(id: string): Promise<ProductListItem | null> {
  const { product } = await getAdminClient().request<{ product: ProductListItem | null }>(
    `query Product($id: ID!) { product(id: $id) { id name enabled slug } }`,
    { id },
  );
  return product;
}

export async function fetchProductDetail(id: string): Promise<ProductDetail> {
  const { product } = await getAdminClient().request<{
    product: {
      id: string;
      name: string;
      enabled: boolean;
      slug: string;
      featuredAsset?: { preview: string } | null;
      translations?: Array<{ languageCode: string; description: string }>;
    };
  }>(
    `query ProductDetail($id: ID!) {
      product(id: $id) {
        id name enabled slug featuredAsset { preview }
        translations { languageCode description }
      }
    }`,
    { id },
  );
  const zh = product.translations?.find((t) => t.languageCode === PRODUCT_LANGUAGE_CODE);
  return {
    id: product.id,
    name: product.name,
    enabled: product.enabled,
    slug: product.slug,
    featuredAsset: product.featuredAsset,
    description: zh?.description ?? '',
  };
}

export async function setProductEnabled(id: string, enabled: boolean): Promise<void> {
  await getAdminClient().request(
    `mutation SetEnabled($id: ID!, $enabled: Boolean!) { updateProduct(input: { id: $id, enabled: $enabled }) { id enabled } }`,
    { id, enabled },
  );
}

export async function createProduct(name: string, slug: string, description = ''): Promise<string> {
  const { createProduct } = await getAdminClient().request<{ createProduct: { id: string } }>(
    `mutation CreateProduct($input: CreateProductInput!) {
      createProduct(input: $input) { id }
    }`,
    {
      input: {
        translations: [{ languageCode: PRODUCT_LANGUAGE_CODE, name, slug, description }],
      },
    },
  );
  return createProduct.id;
}

export interface UpdateProductArgs {
  enabled?: boolean;
  name?: string;
  slug?: string;
  description?: string;
}

export async function updateProduct(id: string, args: UpdateProductArgs = {}): Promise<void> {
  const input: Record<string, unknown> = { id };
  if (args.enabled !== undefined) input.enabled = args.enabled;
  if (args.name !== undefined) {
    input.translations = [
      {
        languageCode: PRODUCT_LANGUAGE_CODE,
        name: args.name,
        slug: args.slug ?? '',
        description: args.description ?? '',
      },
    ];
  }
  await getAdminClient().request(
    `mutation UpdateProduct($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`,
    { input },
  );
}

export async function fetchCollections(): Promise<CollectionListItem[]> {
  const { collections } = await getAdminClient().request<{
    collections: { items: CollectionListItem[] };
  }>(
    `query Collections { collections(options: { take: 50 }) { items { id name } } }`,
  );
  return collections.items;
}

// ---- 商品经营闭环扩展 ----
// 支撑商品表单「两步创建」与「整表更新」。schema 沿用文件头部校准结果：
//   - createProductVariants(input:[{productId,sku,price,taxCategoryId,translations}]) —— 本地实测可用
//   - customFields{shippingProfileId,paymentProfileId} 为 cjk-plugin 在 ProductVariant 上的自定义字段
//   - 库存用顶层 stockOnHand（StockLevelInput.stockLocationId 为必填，顶层 stockOnHand 无需 location）；
//     trackInventory 是 GlobalFlag 枚举(TRUE/FALSE/INHERIT)，传字符串 'TRUE'

export interface VariantRef {
  id: string;
  sku: string;
  price: number; // 单位：分
  stockOnHand: number;
  trackInventory: boolean;
  optionValues?: Array<{ id: string; code: string; name: string }> | null;
  customFields?:
    | {
        shippingProfileId?: string | null;
        paymentProfileId?: string | null;
        listPrice?: number | null;
        saleStart?: string | null;
        saleEnd?: string | null;
      }
    | null;
  featuredAsset?: { preview: string } | null;
  assets?: { preview: string }[] | null;
}

export interface ProductFull {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  description?: string;
  featuredAsset?: { preview: string } | null;
  assets?: { id: string; preview: string }[] | null;
  facetValues?: Array<{
    id: string;
    code: string;
    name: string;
    facetValue?: { name: string; code: string; id: string };
  }> | null;
  variant?: VariantRef | null;
  variants?: Array<{
    id: string;
    sku: string;
    price: number;
    stockOnHand: number;
    trackInventory: boolean;
    featuredAsset?: { preview: string } | null;
    optionValues?: Array<{ id: string; code: string; name: string }> | null;
    customFields?: {
      shippingProfileId?: string | null;
      paymentProfileId?: string | null;
      listPrice?: number | null;
      saleStart?: string | null;
      saleEnd?: string | null;
    } | null;
  }> | null;
  customFields?: { shippingProfileId?: string | null; paymentProfileId?: string | null } | null;
  productCustomFields?: { marketingTags?: string | null; sellingPoint?: string | null } | null;
}

export interface ProductSaveInput {
  name: string;
  slug: string;
  description?: string;
  enabled?: boolean;
  priceYuan: number; // 单位：元，内部换算成分
  stock: number;
  assetIds: string[];
  featuredAssetId?: string;
  shippingProfileId?: string;
  paymentProfileId?: string;
  brandFacetValueId?: string | null; // 品牌
  marketingTags?: string[]; // 营销标签 code 数组
  sellingPoint?: string; // 卖点
  // 多规格变体矩阵（新建落库 / 编辑同结构数值更新用）。productId 由 create/update 补齐。
  variantMatrix?: CreateVariantMatrixInput | null;
}

export async function fetchProductFull(id: string): Promise<ProductFull> {
  const { product } = await getAdminClient().request<{
    product: {
      id: string;
      name: string;
      slug: string;
      enabled: boolean;
      featuredAsset?: { preview: string } | null;
      assets?: { id: string; preview: string }[] | null;
      facetValues?: Array<{
        id: string;
        code: string;
        name: string;
        facetValue?: { name: string; code: string; id: string };
      }>;
      customFields?: { marketingTags?: string | null; sellingPoint?: string | null } | null;
      translations?: Array<{ languageCode: string; name: string; slug: string; description: string }>;
      variants: Array<{
        id: string;
        sku: string;
        price: number;
        stockOnHand: number;
        trackInventory: boolean;
        optionValues?: Array<{ id: string; code: string; name: string }>;
        featuredAsset?: { preview: string } | null;
        customFields?: { shippingProfileId?: string | null; paymentProfileId?: string | null; saleStart?: string | null; saleEnd?: string | null; listPrice?: number | null } | null;
      }>;
    };
  }>(
    `query ProductFull($id: ID!) {
      product(id: $id) {
        id name slug enabled
        featuredAsset { preview }
        assets { id preview }
        facetValues { id code facetValue { id code name } }
        customFields { marketingTags sellingPoint }
        translations { languageCode name slug description }
        variants {
          id sku price stockOnHand trackInventory
          optionValues { id code name }
          featuredAsset { preview }
          customFields { shippingProfileId paymentProfileId saleStart saleEnd listPrice }
        }
      }
    }`,
    { id },
  );
  const zh = product.translations?.find((t) => t.languageCode === PRODUCT_LANGUAGE_CODE);
  const v = product.variants?.[0];
  let marketingTags: string[] = [];
  try {
    marketingTags = product.customFields?.marketingTags
      ? JSON.parse(product.customFields.marketingTags)
      : [];
    if (!Array.isArray(marketingTags)) marketingTags = [];
  } catch {
    marketingTags = [];
  }
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    enabled: product.enabled,
    description: zh?.description ?? '',
    featuredAsset: product.featuredAsset ?? null,
    assets: product.assets ?? null,
    facetValues: product.facetValues ?? null,
    variant: v ? { ...v } : null,
    variants: product.variants ? [...product.variants] : null,
    customFields: v?.customFields ?? null,
    productCustomFields: product.customFields
      ? {
          marketingTags: marketingTags,
          sellingPoint: product.customFields.sellingPoint ?? '',
        }
      : null,
  };
}

export interface CreateVariantInput {
  productId: string;
  sku: string;
  price: number;
  stock: number;
  assetIds: string[];
  featuredAssetId?: string;
  shippingProfileId?: string;
  paymentProfileId?: string;
}

export async function createVariantsForProduct(input: CreateVariantInput): Promise<string> {
  const { createProductVariants } = await getAdminClient().request<{
    createProductVariants: Array<{ id: string }>;
  }>(
    `mutation CreateProductVariants($input: [CreateProductVariantInput!]!) {
      createProductVariants(input: $input) { id }
    }`,
    {
      input: [
        {
          productId: input.productId,
          sku: input.sku,
          price: input.price,
          // stockOnHand 为顶层字段（无需 StockLevelInput 的必填 stockLocationId）；trackInventory 是 GlobalFlag 枚举
          trackInventory: 'TRUE',
          stockOnHand: input.stock,
          assetIds: input.assetIds,
          featuredAssetId: input.featuredAssetId,
          customFields: {
            shippingProfileId: input.shippingProfileId ?? '',
            paymentProfileId: input.paymentProfileId ?? '',
          },
          translations: [{ languageCode: PRODUCT_LANGUAGE_CODE, name: input.sku }],
        },
      ],
    },
  );
  return createProductVariants[0]?.id;
}

export interface BrandOption {
  id: string;
  name: string;
}

// ---- 变体矩阵落库 ----
// 新建商品的多规格落库：逐组 createProductOptionGroup（带 values），再一次性 createProductVariants。
// 规格关联字段采用 Vendure admin `CreateProductVariantInput.optionIds: [ID!]`（指向 ProductOption）。
// 若线上 schema 用 `optionValueIds` 而非 `optionIds`，以实际 schema 为准。
export interface CreateVariantMatrixInput {
  productId: string;
  groups: { name: string; values: string[] }[]; // 规格组
  skus: { labels: string[]; priceCents: number; stock: number; listPriceCents?: number }[];
  shippingProfileId?: string;
  paymentProfileId?: string;
}

// code 打斜线：小写 + 非字母数字转 '-'，去首尾并压缩连续连字符。
function baseSlug(v: string): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

// 规格值 code：纯中文退化为空时用 `v-序号`；与同组已有 code 冲突时追加序号，保证合法且同组唯一。
function uniqueValueCodes(values: string[]): Array<{ name: string; code: string }> {
  const used = new Set<string>();
  return values.map((val, i) => {
    let code = baseSlug(val) || `v-${i}`;
    let n = 1;
    while (used.has(code)) code = `${baseSlug(val) || `v-${i}`}-${n++}`;
    used.add(code);
    return { name: val, code };
  });
}

export async function createVariantMatrixForProduct(input: CreateVariantMatrixInput): Promise<number> {
  // 1) 逐组创建规格组，收集「维度号 -> (规格值名 -> option id)」。
  //    维度口径与 buildMatrix 一致：仅统计至少含一个非空规格值的组，保持原顺序对齐 skus[i].labels[d]。
  const dims: Array<{ groupIndex: number; valueToOptionId: Map<string, string> }> = [];
  const groups = input.groups || [];
  for (let gi = 0; gi < groups.length; gi++) {
    const name = String(groups[gi]?.name ?? '').trim();
    const values = (groups[gi]?.values || [])
      .map((val) => String(val ?? '').trim())
      .filter((val) => val !== '');
    if (!name || !values.length) continue; // 空组名或无数值则跳过该组
    // 规格值 code 兜底：中文退化 `v-序号` 且同组唯一（见 uniqueValueCodes）
    const valueCodes = uniqueValueCodes(values);
    const { createProductOptionGroup } = await getAdminClient().request<{
      createProductOptionGroup: { options: Array<{ id: string }> };
    }>(
      `mutation CreateOptionGroup($input: CreateProductOptionGroupInput!) {
        createProductOptionGroup(input: $input) { options { id } }
      }`,
      {
        input: {
          // 组 code 兜底：中文退化 `option-group-<gi>`，避免空串/非法字符
          code: baseSlug(name) || `option-group-${gi}`,
          translations: [{ languageCode: PRODUCT_LANGUAGE_CODE, name }],
          values: valueCodes.map(({ name: vName, code }) => ({
            code,
            translations: [{ languageCode: PRODUCT_LANGUAGE_CODE, name: vName }],
          })),
        },
      },
    );
    const opts = createProductOptionGroup?.options || [];
    const valueToOptionId = new Map<string, string>();
    for (let k = 0; k < opts.length && k < values.length; k++) {
      valueToOptionId.set(values[k], opts[k].id); // options 顺序与入参 values 一致
    }
    dims.push({ groupIndex: gi, valueToOptionId });
  }

  const skus = input.skus || [];
  if (!dims.length || !skus.length) return 0; // 无有效维度或 SKU，不建任何变体

  // 2) 每个 SKU 依据 labels 定位各维度 option id，组装 optionIds。
  const variants = skus.map((sku) => {
    const optionIds: string[] = [];
    for (let d = 0; d < dims.length; d++) {
      const label = sku.labels?.[d];
      const oid = label != null ? dims[d].valueToOptionId.get(String(label)) : undefined;
      if (oid) optionIds.push(oid);
    }
    return {
      productId: input.productId,
      sku: sku.sku ?? '',
      price: Math.round(sku.priceCents) || 0,
      optionIds,
      trackInventory: 'TRUE',
      stockOnHand: Math.round(sku.stock) || 0,
      customFields: {
        shippingProfileId: input.shippingProfileId ?? '',
        paymentProfileId: input.paymentProfileId ?? '',
        listPrice: sku.listPriceCents != null ? Math.round(sku.listPriceCents) : null,
      },
      translations: [
        {
          languageCode: PRODUCT_LANGUAGE_CODE,
          name: (sku.labels || []).join('·') || sku.sku || '',
        },
      ],
    };
  });

  // 3) 一次性创建全部变体。
  const { createProductVariants } = await getAdminClient().request<{
    createProductVariants: Array<{ id: string }>;
  }>(
    `mutation CreateMatrixVariants($input: [CreateProductVariantInput!]!) {
      createProductVariants(input: $input) { id }
    }`,
    { input: variants },
  );
  return (createProductVariants || []).length;
}

export async function fetchBrands(term?: string): Promise<BrandOption[]> {
  const { facets } = await getAdminClient().request<{
    facets: {
      items: Array<{ facetValues: Array<{ id: string; code: string; name: string }> }>;
    };
  }>(
    `query Brands($term: String) { facets(options: { take: 100, filter: { code: { eq: "brand" } } }) { items { facetValues { id code name } } } }`,
  );
  const values = facets?.items?.[0]?.facetValues ?? [];
  const filtered = term ? values.filter((v) => v.name.includes(term)) : values;
  return filtered.map((v) => ({ id: v.id, name: v.name }));
}

async function applyBrandAndMarketing(id: string, input: ProductSaveInput): Promise<void> {
  // 仅在品牌/营销/卖点有值时才触发 updateProduct；facets 只在有品牌时传。
  // marketingTags 存 JSON 字符串；customFields 只在对应字段非空时填充。
  if (!input.brandFacetValueId && !input.marketingTags?.length && !input.sellingPoint) return;
  const updated: Record<string, unknown> = { id };
  if (input.brandFacetValueId) updated.facets = [input.brandFacetValueId];
  const customFields: Record<string, unknown> = {};
  if (input.marketingTags?.length) customFields.marketingTags = JSON.stringify(input.marketingTags);
  if (input.sellingPoint) customFields.sellingPoint = input.sellingPoint;
  if (Object.keys(customFields).length) updated.customFields = customFields;
  await getAdminClient().request(
    `mutation UpdateProductBrand($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`,
    { input: updated },
  );
}

export async function createProductFull(input: ProductSaveInput): Promise<string> {
  const pid = await createProduct(input.name, input.slug, input.description ?? '');
  const featuredAssetId = input.featuredAssetId ?? (input.assetIds[0] || undefined);
  const vm = input.variantMatrix;
  const isMatrix = !!vm && !!(vm.groups || []).length && !!(vm.skus || []).length;
  if (isMatrix) {
    // 多规格：建规格组 + 全部变体（矩阵本身在 createVariantMatrixForProduct 内调 createProductVariants）
    await createVariantMatrixForProduct({
      productId: pid,
      groups: vm!.groups,
      skus: vm!.skus,
      shippingProfileId: input.shippingProfileId,
      paymentProfileId: input.paymentProfileId,
    });
  } else {
    // 无矩阵（含 noSpec 单品）：沿用既有的单变体创建
    await createVariantsForProduct({
      productId: pid,
      sku: 'P' + Date.now(),
      price: Math.round(input.priceYuan * 100),
      stock: input.stock,
      assetIds: input.assetIds,
      featuredAssetId,
      shippingProfileId: input.shippingProfileId,
      paymentProfileId: input.paymentProfileId,
    });
  }
  // 图片同时挂到商品级：列表用 product.featuredAsset 做缩略图、编辑页用 product.assets 回填，
  // 只挂变体会导致新建商品无缩略图、编辑页回填不到图（冒烟实证 assets:0）
  if (input.assetIds.length || featuredAssetId) {
    await getAdminClient().request(
      `mutation CreateProductAssets($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`,
      { input: { id: pid, assetIds: input.assetIds, featuredAssetId } },
    );
  }
  if (input.enabled === false) {
    await updateProduct(pid, { enabled: false });
  }
  await applyBrandAndMarketing(pid, input);
  return pid;
}

export async function updateProductFull(id: string, input: ProductSaveInput): Promise<void> {
  // 三件套更新：
  // 1) 基本字段（enabled/name/slug/description）
  await updateProduct(id, {
    enabled: input.enabled,
    name: input.name,
    slug: input.slug,
    description: input.description,
  });

  // 2) 商品图片与翻译（单独 mutation，携带 assetIds / featuredAssetId）
  const featuredAssetId = input.featuredAssetId ?? (input.assetIds[0] || undefined);
  await getAdminClient().request(
    `mutation UpdateProductAssets($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`,
    {
      input: {
        id,
        translations: [
          {
            languageCode: PRODUCT_LANGUAGE_CODE,
            name: input.name,
            slug: input.slug,
            description: input.description ?? '',
          },
        ],
        assetIds: input.assetIds,
        featuredAssetId,
      },
    },
  );

  // 3) 变体更新
  const full = await fetchProductFull(id);
  const allVariants = full.variants || [];
  const vm = input.variantMatrix;
  const multiSpecNow = !!allVariants[0]?.optionValues?.length;

  if (multiSpecNow && vm?.skus?.length) {
    // ---- 多规格编辑：同结构仅更新数值 ----
    // 已有多规格（变体带 optionValues）。最低可用路径：列数（维度数）一致则
    // 逐变体 updateProductVariants 更新价格/库存/划线价/profiles（按对齐顺序 skus[i]<->variants[i]）。
    // 【已知限制】规格组/值数量或顺序变更（结构变更）需重开新建，本轮不强制 diff 重建。
    const curDims = allVariants[0].optionValues?.length ?? 0;
    const dims = (vm.groups || []).filter((g) =>
      (g.values || []).some((val) => String(val ?? '').trim() !== ''),
    ).length;
    if (dims !== curDims) {
      throw new Error('多规格结构变更需重开新建：推理仅支持同结构下修改价格/库存/划线价');
    }
    const updates = (vm.skus || [])
      .map((sku, i) => {
        const v = allVariants[i];
        return {
          id: v?.id,
          sku: v?.sku ?? sku.sku ?? '',
          price: Math.round(sku.priceCents) || 0,
          trackInventory: 'TRUE',
          stockOnHand: Math.round(sku.stock) || 0,
          customFields: {
            shippingProfileId: input.shippingProfileId ?? '',
            paymentProfileId: input.paymentProfileId ?? '',
            listPrice: sku.listPriceCents != null ? Math.round(sku.listPriceCents) : null,
          },
        };
      })
      .filter((u) => u.id);
    if (updates.length) {
      await getAdminClient().request(
        `mutation UpdateMatrixVariants($input: [UpdateProductVariantInput!]!) {
          updateProductVariants(input: $input) { id }
        }`,
        { input: updates },
      );
    }
  } else {
    // 单变体（含编辑时切换到无矩阵/单规格）：沿用既有更新逻辑
    const v = full.variant;
    if (v?.id) {
      await getAdminClient().request(
        `mutation UpdateProductVariants($input: [UpdateProductVariantInput!]!) {
          updateProductVariants(input: $input) { id }
        }`,
        {
          input: [
            {
              id: v.id,
              sku: v.sku,
              price: Math.round(input.priceYuan * 100),
              trackInventory: 'TRUE',
              stockOnHand: input.stock,
              customFields: {
                shippingProfileId: input.shippingProfileId ?? '',
                paymentProfileId: input.paymentProfileId ?? '',
              },
            },
          ],
        },
      );
    }
  }
  await applyBrandAndMarketing(id, input);
}

// ---- Task 10：商品列表增强 ----
// 列表专用查询：主图缩略 + 首个变体的价格/库存/是否缺货，支持按名称搜索与在售/下架筛选。
// 说明：enabled 字段对象是否被 ProductFilterParameter 支持、stockOnHand 的默认仓口径，
//       属于冒烟校准项（Task 13 统一校准），本期先按此写，编译通过即可。
export interface ProductListQuery {
  take?: number;
  skip?: number;
  term?: string;
  enabled?: boolean;
}

export interface ProductListRow {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  thumb?: string;
  priceYuan: number;
  stock: number;
  low: boolean;
  marketplaceStatus?: string | null;
}

const LOW_STOCK = 5;

export async function fetchProductList(
  q: ProductListQuery = {},
): Promise<{ totalItems: number; items: ProductListRow[] }> {
  const filter: Record<string, unknown> = {};
  if (q.term) filter.name = { contains: q.term };
  if (q.enabled !== undefined) filter.enabled = { eq: q.enabled };
  const { products } = await getAdminClient().request<{
    products: { totalItems: number; items: any[] };
  }>(
    `query ProductList($take: Int, $skip: Int, $filter: ProductFilterParameter) {
      products(options: { take: $take, skip: $skip, filter: $filter }) {
        totalItems
        items { id name slug enabled featuredAsset { preview } variants { price stockOnHand } customFields { marketplaceStatus } }
      }
    }`,
    { take: q.take ?? 20, skip: q.skip ?? 0, filter },
  );
  const items: ProductListRow[] = products.items.map((p: any) => {
    const price = p.variants?.[0]?.price ?? 0;
    const stock = p.variants?.[0]?.stockOnHand ?? 0;
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      enabled: p.enabled,
      thumb: p.featuredAsset?.preview,
      priceYuan: price / 100,
      stock,
      low: stock <= LOW_STOCK,
      marketplaceStatus: p.customFields?.marketplaceStatus ?? null,
    };
  });
  return { totalItems: products.totalItems, items };
}
