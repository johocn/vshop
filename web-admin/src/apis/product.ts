// 商品域 admin-api 调用（Task 3 + Task 7，schema 已校准）
// 校准结果（本地 admin-api 实测）：
//   - products(options:{take,skip,filter:{name:{contains}}}) { totalItems items { id name enabled slug } }
//     —— name/slug 直接可用（无需 translations），filter.name.contains 可用
//   - product(id) { id name enabled slug } / translations { languageCode name slug description } —— 可用
//   - updateProduct(input:{id,enabled}) / updateProduct(input:{id,translations}) —— 可用
//   - createProduct(input:{translations:[{languageCode,name,slug,description}]}) 直接返回 Product（非 union）
//     —— description 为 NOT NULL 必须提供；本地实测无需 variant 即可创建商品
//   - createProductVariants(input:[{productId,sku,price,taxCategoryId,translations:[{languageCode,name}]}])
//     —— 若需为商品补 SKU/变体，用此 mutation（本地实测可用，无需 options/optionIds）
//   - collections(options:{take}) { totalItems items { id name } } —— 可用
import { getAdminClient } from './client';
import { getChannelToken } from './session';
import { mapProductToCollection } from './collection';

// 本地 admin-api 实测的 LanguageCode 枚举值（zh_Hans 可用，en 也可用）
export const PRODUCT_LANGUAGE_CODE = 'zh_Hans';

/**
 * 由当前渠道默认仓拼出库存字段。
 * 多租户/多仓（MultiChannelStockLocationStrategy）下，「当前渠道」上下文的 stockLocations
 * 已按渠道隔离，只返回本租户关联的默认仓；保存库存必须用 stockLevels 指定该仓，
 * 否则顶层 stockOnHand 会写入 Vendure 全局默认仓（长春，location 1），租户页读不到更新——
 * 这正是「商品库存失效/不更新」的根因。无仓时回退顶层 stockOnHand（单仓兜底）。
 */
function stockFieldWith(locationId: string | null | undefined, stock: number): Record<string, unknown> {
  const v = Math.round(stock) || 0;
  return locationId
    ? { stockLevels: [{ stockLocationId: locationId, stockOnHand: v }] }
    : { stockOnHand: v };
}

/** 商品保存路径复用 resolveStockLocationId（与库存页一致），保证同一渠道定位同一默认仓 */
const getChannelStockLocationId = resolveStockLocationId;

// ---- 价格税率换算 ----
// 运营端录入的是净价（不含税）。本仓库 Vendure 的 price 输入按「含税价」处理
// （实测：写入 price=20000 回读 net=17699 / withTax=20000），故保存前须把净价
// 换算成含税输入 gross = net × (1 + rate/100)，否则关闭税率后 C 端显示 net 会被
// 税吃掉 13%（录入 200 显示 176.99）。税率动态取默认 TaxRate（当前生产仅 13% 一条）。
let _taxRatePercent: number | null = null;

export async function fetchTaxRatePercent(): Promise<number> {
  if (_taxRatePercent != null) return _taxRatePercent;
  const { taxRates } = await getAdminClient().request<{
    taxRates: { items: Array<{ value: number; enabled: boolean }> };
  }>(`query TaxRates { taxRates { items { value enabled } } }`);
  const rate = (taxRates?.items || []).find((r) => r.enabled)?.value ?? 0;
  _taxRatePercent = rate;
  return rate;
}

/** 净价(分) -> Vendure price 输入（含税口径，分） */
export function grossPriceFromNet(netCents: number, ratePercent: number): number {
  if (!ratePercent) return Math.round(netCents);
  return Math.round(netCents * (1 + ratePercent / 100));
}

/**
 * 把选中图片资产先绑定到当前渠道（vendure-token 所在渠道）。
 * 背景：Vendure 的 asset 关联按渠道隔离（AssetService.updateEntityAssets 用
 * findByIdsInChannel 只接受属于当前渠道的资产）。若商品是跨渠道共享、图片先挂在
 * 另一渠道，商户在本渠道保存时 assetIds 会被判定为 0 张，导致 updateProduct 把
 * 该商品「全局」的 ProductAsset 关联项清空（实测商品 60 被误清）。
 * 此处幂等保险：保存前把选中资产 assign 到当前渠道，保证写入不丢、图片各端可见。
 */
async function ensureAssetsInCurrentChannel(
  assetIds: string[],
  featuredAssetId?: string,
): Promise<void> {
  const ids = Array.from(
    new Set([...(assetIds || []).filter(Boolean), ...(featuredAssetId ? [featuredAssetId] : [])]),
  );
  if (!ids.length) return;
  try {
    const { activeChannel } = await getAdminClient().request<{ activeChannel: { id: string } }>(
      `query ActiveChannel { activeChannel { id } }`,
    );
    const channelId = activeChannel?.id;
    if (!channelId) return;
    await getAdminClient().request(
      `mutation AssignAssets($input: AssignAssetsToChannelInput!) {
        assignAssetsToChannel(input: $input) { id }
      }`,
      { input: { assetIds: ids, channelId } },
    );
  } catch (err) {
    // 幂等且非阻断：assign 失败仅个别渠道临时不可见；但必须留痕，避免跨渠道图片被静默清空难排查
    console.error('[ensureAssetsInCurrentChannel] assignAssetsToChannel 失败', err);
  }
}

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
  price: number; // 单位：分（净价）
  priceWithTax?: number; // 单位：分（含税=对客最终价，后台统一读写此值）
  stockOnHand: number;
  trackInventory: boolean;
  options?: Array<{ id: string; code: string; name: string }> | null;
  customFields?:
    | {
        shippingProfileId?: string | null;
        paymentProfileId?: string | null;
        listPrice?: number | null;
        saleStart?: string | null;
        saleEnd?: string | null;
        costPrice?: number | null;
        barcode?: string | null;
        internalCode?: string | null;
      }
    | null;
  featuredAsset?: { id: string; preview: string } | null;
  assets?: { id: string; preview: string }[] | null;
}

export interface ProductFull {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  description?: string;
  nameEn?: string;
  slugEn?: string;
  descriptionEn?: string;
  featuredAsset?: { id: string; preview: string } | null;
  assets?: { id: string; preview: string }[] | null;
  videoAssetId?: string | null;
  facetValues?: Array<{
    id: string;
    code: string;
    name: string;
    facet?: { name: string; code: string; id: string };
  }> | null;
  variant?: VariantRef | null;
  variants?: Array<{
    id: string;
    sku: string;
    price: number;
    priceWithTax?: number;
    stockOnHand: number;
    trackInventory: boolean;
    featuredAsset?: { preview: string } | null;
    assets?: Array<{ id: string; preview: string }>;
    options?: Array<{ id: string; code: string; name: string }> | null;
    customFields?: {
      shippingProfileId?: string | null;
      paymentProfileId?: string | null;
      listPrice?: number | null;
      saleStart?: string | null;
      saleEnd?: string | null;
      costPrice?: number | null;
      barcode?: string | null;
      internalCode?: string | null;
    } | null;
  }> | null;
  customFields?: { shippingProfileId?: string | null; paymentProfileId?: string | null } | null;
  productCustomFields?: { marketingTags?: string[] | null; sellingPoint?: string | null; tenantCategoryRef?: string | null; promos?: string[] | null; services?: string[] | null } | null;
}

export interface ProductSaveInput {
  name: string;
  slug: string;
  description?: string;
  // 多语言（multilingualEnabled 开启时写入 en translation）：缺失回退 zh
  nameEn?: string;
  slugEn?: string;
  descriptionEn?: string;
  sellingPointEn?: string;
  enabled?: boolean;
  priceYuan: number; // 单位：元，内部换算成分
  stock: number;
  assetIds: string[];
  featuredAssetId?: string;
  shippingProfileId?: string;
  paymentProfileId?: string;
  brandFacetValueId?: string | null; // 品牌
  marketingTags?: string[]; // 营销标签 code 数组
  promos?: string[]; // 促销方案 code 数组（customFields.promos JSON）
  services?: string[]; // 服务保障 code 数组（customFields.services JSON）
  sellingPoint?: string; // 卖点
  tenantCategoryRef?: string | null; // 商品所属租户分类名（过审归位匹配依据）
  collectionId?: string; // 归属分类 id：保存时经 mapProductToCollection 把商品挂入该分类 filter，建立关联
  videoAssetId?: string | null; // 商品主视频资产 id（随 customFields 落库）
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
      featuredAsset?: { id: string; preview: string } | null;
      assets?: { id: string; preview: string }[] | null;
      facetValues?: Array<{
        id: string;
        code: string;
        name: string;
        facet?: { name: string; code: string; id: string };
      }>;
      customFields?: { marketingTags?: string | null; sellingPoint?: string | null; tenantCategoryRef?: string | null; videoAssetId?: string | null; promos?: string | null; services?: string | null } | null;
      translations?: Array<{ languageCode: string; name: string; slug: string; description: string }>;
      variants: Array<{
        id: string;
        sku: string;
        price: number;
        stockOnHand: number;
        trackInventory: boolean;
        options?: Array<{ id: string; code: string; name: string }>;
        featuredAsset?: { id: string; preview: string } | null;
        assets?: Array<{ id: string; preview: string }>;
        customFields?: { shippingProfileId?: string | null; paymentProfileId?: string | null; saleStart?: string | null; saleEnd?: string | null; listPrice?: number | null; costPrice?: number | null; barcode?: string | null; internalCode?: string | null } | null;
      }>;
    };
  }>(
    `query ProductFull($id: ID!) {
      product(id: $id) {
        id name slug enabled
        featuredAsset { id preview }
        assets { id preview }
        facetValues { id code name facet { id code name } }
        customFields { marketingTags sellingPoint tenantCategoryRef videoAssetId promos services }
        translations { languageCode name slug description }
        variants {
          id sku price priceWithTax stockOnHand trackInventory
          options { id code name }
          featuredAsset { id preview }
          assets { id preview }
          customFields { shippingProfileId paymentProfileId saleStart saleEnd listPrice costPrice barcode internalCode }
        }
      }
    }`,
    { id },
  );
  const zh = product.translations?.find((t) => t.languageCode === PRODUCT_LANGUAGE_CODE);
  const en = product.translations?.find((t) => t.languageCode === 'en');
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
  let promos: string[] = [];
  try {
    promos = product.customFields?.promos ? JSON.parse(product.customFields.promos) : [];
    if (!Array.isArray(promos)) promos = [];
  } catch {
    promos = [];
  }
  let services: string[] = [];
  try {
    services = product.customFields?.services ? JSON.parse(product.customFields.services) : [];
    if (!Array.isArray(services)) services = [];
  } catch {
    services = [];
  }
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    enabled: product.enabled,
    description: zh?.description ?? '',
    nameEn: en?.name ?? '',
    slugEn: en?.slug ?? '',
    descriptionEn: en?.description ?? '',
    featuredAsset: product.featuredAsset ?? null,
    assets: product.assets ?? null,
    facetValues: product.facetValues ?? null,
    variant: v ? { ...v } : null,
    variants: product.variants ? [...product.variants] : null,
    customFields: v?.customFields ?? null,
    videoAssetId: product.customFields?.videoAssetId ?? null,
    productCustomFields: product.customFields
      ? {
          marketingTags: marketingTags,
          sellingPoint: product.customFields.sellingPoint ?? '',
          tenantCategoryRef: product.customFields.tenantCategoryRef ?? null,
          promos: promos,
          services: services,
        }
      : null,
  };
}

export interface CreateVariantInput {
  productId: string;
  sku: string;
  /** 变体显示名；缺省回退 sku（多规格矩阵由调用方传规格组合，单品传商品名） */
  productName?: string;
  price: number;
  stock: number;
  assetIds: string[];
  featuredAssetId?: string;
  shippingProfileId?: string;
  paymentProfileId?: string;
  costPriceCents?: number;
  barcode?: string;
  internalCode?: string;
}

export async function createVariantsForProduct(input: CreateVariantInput): Promise<string> {
  const locationId = await getChannelStockLocationId();
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
          // 直接存录入净价(分)：价格含税口径由渠道 pricesIncludeTax 解释（inclusive=立即售价 / exclusive=净价）
          price: Math.round(input.price),
          // 多租户下必须用 stockLevels 指定当前渠道默认仓，否则写入全局默认仓致库存读不到
          trackInventory: 'TRUE',
          ...stockFieldWith(locationId, input.stock),
          assetIds: input.assetIds,
          featuredAssetId: input.featuredAssetId,
          customFields: {
            shippingProfileId: input.shippingProfileId ?? '',
            paymentProfileId: input.paymentProfileId ?? '',
            costPrice: input.costPriceCents != null ? Math.round(input.costPriceCents) : null,
            barcode: input.barcode ?? '',
            internalCode: input.internalCode ?? '',
          },
          translations: [{ languageCode: PRODUCT_LANGUAGE_CODE, name: input.productName || input.sku }],
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
// 新建商品的多规格落库：逐组 createProductOptionGroup（规格值在 options 内嵌创建），
// 每组创建后必须 addOptionGroupToProduct 关联到商品（否则 createProductVariants 的
// optionIds 校验失败，线上实测确认），最后一次性 createProductVariants。
// 规格值关联用 Vendure admin `CreateProductVariantInput.optionIds: [ID!]`（指向 ProductOption）。
// 中文规格名/值经 baseSlug/uniqueValueCodes 兜底为合法且唯一的 code。
export interface CreateVariantMatrixInput {
  productId: string;
  groups: { name: string; values: string[]; groupId?: string; valueIds?: string[] }[]; // 规格组（groupId 存在表示复用系统规格组，不新建组）
  skus: { labels: string[]; sku?: string; priceCents: number; stock: number; listPriceCents?: number; costPrice?: number; barcode?: string; internalCode?: string; assetIds?: string[] }[];
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
  // 多租户：提前取当前渠道默认仓，供变体 stockLevels 使用
  const locationId = await getChannelStockLocationId();
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
    const valueToOptionId = new Map<string, string>();
    const grp = groups[gi] as (typeof groups)[number] & { groupId?: string; valueIds?: string[] };
    if (grp?.groupId) {
      // 复用系统规格组：不新建组，走 reuseOptionGroupForProduct 关联；直接以 valueIds（与 values 对齐）构建映射
      await reuseOptionGroupForProduct(input.productId, grp.groupId);
      const valueIds = grp.valueIds || [];
      for (let k = 0; k < values.length && k < valueIds.length; k++) {
        valueToOptionId.set(values[k], valueIds[k]);
      }
      dims.push({ groupIndex: gi, valueToOptionId });
      continue;
    }
    // 规格值 code 兜底：中文退化 `v-序号` 且同组唯一（见 uniqueValueCodes）
    const valueCodes = uniqueValueCodes(values);
    const { createProductOptionGroup } = await getAdminClient().request<{
      createProductOptionGroup: { id: string; options: Array<{ id: string }> };
    }>(
      `mutation CreateOptionGroup($input: CreateProductOptionGroupInput!) {
        createProductOptionGroup(input: $input) { id options { id } }
      }`,
      {
        input: {
          // 组 code 兜底：中文退化 `option-group-<gi>`，避免空串/非法字符
          code: baseSlug(name) || `option-group-${gi}`,
          translations: [{ languageCode: PRODUCT_LANGUAGE_CODE, name }],
          // 规格值在 options 内嵌创建（Vendure 3.x CreateProductOptionGroupInput 无 values 字段）
          options: valueCodes.map(({ name: vName, code }) => ({
            code,
            translations: [{ languageCode: PRODUCT_LANGUAGE_CODE, name: vName }],
          })),
        },
      },
    );
    const groupId = createProductOptionGroup?.id;
    const opts = createProductOptionGroup?.options || [];
    // 规格组必须关联到商品，否则创建变体时 optionIds 校验失败
    // （线上冒烟实测：addOptionGroupToProduct 后再 createProductVariants）
    if (groupId) {
      await getAdminClient().request(
        `mutation LinkOptionGroup($productId: ID!, $optionGroupId: ID!) {
          addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) { id }
        }`,
        { productId: input.productId, optionGroupId: groupId },
      );
    }
    valueToOptionId.clear();
    for (let k = 0; k < opts.length && k < values.length; k++) {
      valueToOptionId.set(values[k], opts[k].id); // options 顺序与入参 values 一致
    }
    dims.push({ groupIndex: gi, valueToOptionId });
  }
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
      ...stockFieldWith(locationId, sku.stock),
      assetIds: sku.assetIds ?? [],
      featuredAssetId: (sku.assetIds ?? [])[0] ?? undefined,
      customFields: {
        shippingProfileId: input.shippingProfileId ?? '',
        paymentProfileId: input.paymentProfileId ?? '',
        listPrice: sku.listPriceCents != null ? Math.round(sku.listPriceCents) : null,
        costPrice: sku.costPrice != null ? Math.round(sku.costPrice) : null,
        barcode: sku.barcode ?? '',
        internalCode: sku.internalCode ?? '',
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

export interface BrandFacetInfo {
  facetId: string;
  items: BrandOption[];
}

export async function fetchBrands(term?: string): Promise<BrandFacetInfo> {
  const { facets } = await getAdminClient().request<{
    facets: {
      items: Array<{ id: string; values: Array<{ id: string; code: string; name: string }> }>;
    };
  }>(
    `query Brands($term: String) { facets(options: { take: 100, filter: { code: { eq: "brand" } } }) { items { id values { id code name } } } }`,
  );
  const facet = facets?.items?.[0];
  const values = facet?.values ?? [];
  const filtered = term ? values.filter((v) => v.name.includes(term)) : values;
  return {
    facetId: facet?.id ?? '',
    items: filtered.map((v) => ({ id: v.id, name: v.name })),
  };
}

// 新建品牌：在 code=brand 的 Facet 下追加一个 FacetValue 并落库（随后的 fetchBrands 可复用）。
// 品牌 facet 缺失时兜底抛错，提示先用初始化接口建 brand Facet。
export async function createBrand(name: string): Promise<BrandOption> {
  const { facetId } = await fetchBrands();
  if (!facetId) throw new Error('品牌库未初始化');
  const code = baseSlug(name) || 'brand-' + Date.now();
  const { createFacetValue } = await getAdminClient().request<{
    createFacetValue: { id: string; name: string };
  }>(
    `mutation CreateBrand($input: CreateFacetValueInput!) {
      createFacetValue(input: $input) { id name }
    }`,
    {
      input: {
        facetId,
        code,
        translations: [
          { languageCode: PRODUCT_LANGUAGE_CODE, name },
          { languageCode: 'en', name },
        ],
      },
    },
  );
  return { id: createFacetValue.id, name: createFacetValue.name };
}

async function applyBrandAndMarketing(id: string, input: ProductSaveInput): Promise<void> {
  // 仅在品牌/营销/卖点/租户分类名有值时才触发 updateProduct；facetValueIds 只在有品牌时传。
  // marketingTags 为 text 自定义字段（写 customFields）；sellingPoint 为 localeString，
  // 只能走 translations[].customFields 写入（实测确认，UpdateProductCustomFieldsInput 无 sellingPoint）。
  // tenantCategoryRef 为 Product 自定义 string 字段，随 customFields 落库，null 则清除。
  if (!input.brandFacetValueId && !input.marketingTags?.length && !input.sellingPoint && input.tenantCategoryRef == null && input.videoAssetId == null && !input.promos?.length && !input.services?.length) return;
  const updated: Record<string, unknown> = { id };
  if (input.brandFacetValueId) updated.facetValueIds = [input.brandFacetValueId];
  const customFields: Record<string, unknown> = {};
  if (input.marketingTags?.length) customFields.marketingTags = JSON.stringify(input.marketingTags);
  if (input.promos?.length) customFields.promos = JSON.stringify(input.promos);
  if (input.services?.length) customFields.services = JSON.stringify(input.services);
  if (input.tenantCategoryRef != null) customFields.tenantCategoryRef = input.tenantCategoryRef;
  if (input.videoAssetId != null) customFields.videoAssetId = input.videoAssetId;
  if (Object.keys(customFields).length) updated.customFields = customFields;
  if (input.sellingPoint) {
    updated.translations = [
      { languageCode: PRODUCT_LANGUAGE_CODE, customFields: { sellingPoint: input.sellingPoint } },
    ];
  }
  await getAdminClient().request(
    `mutation UpdateProductBrand($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`,
    { input: updated },
  );
}

// 通用设置某语言商品翻译（zh 或 en，幂等 upsert）。
// en 缺失时用户侧回退 zh 展示；sellingPoint 只在有值时才写入该语言的 customFields.sellingPoint。
export async function upsertProductTranslation(
  id: string,
  lang: string,
  t: { name: string; slug?: string; description?: string; sellingPoint?: string },
): Promise<void> {
  const input: Record<string, unknown> = {
    id,
    translations: [
      {
        languageCode: lang,
        name: t.name,
        slug: t.slug ?? t.name,
        description: t.description ?? '',
        ...(t.sellingPoint != null ? { customFields: { sellingPoint: t.sellingPoint } } : {}),
      },
    ],
  };
  await getAdminClient().request(
    `mutation UpPdt($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`,
    { input },
  );
}

export async function createProductFull(input: ProductSaveInput): Promise<string> {
  if (input.assetIds?.length || input.featuredAssetId) {
    await ensureAssetsInCurrentChannel(input.assetIds, input.featuredAssetId);
  }
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
    // 无矩阵（含 noSpec 单品）：沿用既有的单变体创建；成本/条码/内码从矩阵单行取（单品时也有默认行）
    const s0 = vm?.skus?.[0];
    await createVariantsForProduct({
      productId: pid,
      productName: input.name,
      sku: 'P' + Date.now(),
      price: Math.round(s0?.priceCents != null ? s0.priceCents : input.priceYuan * 100),
      stock: Math.round(s0?.stock != null ? s0.stock : input.stock),
      assetIds: input.assetIds,
      featuredAssetId,
      shippingProfileId: input.shippingProfileId,
      paymentProfileId: input.paymentProfileId,
      costPriceCents: s0?.costPrice,
      barcode: s0?.barcode,
      internalCode: s0?.internalCode,
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
  const hasEn = input.nameEn != null && input.nameEn !== '';
  if (hasEn) {
    // 英文卖点仅在显式提供时写入 en customFields.sellingPoint，否则回退 zh 展示
    await upsertProductTranslation(pid, 'en', {
      name: input.nameEn!,
      slug: input.slugEn,
      description: input.descriptionEn,
      sellingPoint: input.sellingPointEn ? input.sellingPointEn : undefined,
    });
  }
  // 归属分类：保存即建立商品→分类关联，使商品出现在该分类商品列表
  if (input.collectionId) await mapProductToCollection(pid, input.collectionId);
  return pid;
}

export async function updateProductFull(id: string, input: ProductSaveInput): Promise<void> {
  // 多租户：提前取当前渠道默认仓，供变体 stockLevels 使用
  const locationId = await getChannelStockLocationId();
  // 保险：先把选中图片绑定到当前渠道，避免跨渠道共享商品在本渠道保存把全局 asset 关联清空
  if (input.assetIds?.length || input.featuredAssetId) {
    await ensureAssetsInCurrentChannel(input.assetIds, input.featuredAssetId);
  }
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
  const multiSpecNow = !!allVariants[0]?.options?.length;

  if (multiSpecNow && vm?.skus?.length) {
    // ---- 多规格编辑：同结构仅更新数值 ----
    // 已有多规格（变体带 options）。最低可用路径：列数（维度数）一致则
    // 逐变体 updateProductVariants 更新价格/库存/划线价/profiles（按对齐顺序 skus[i]<->variants[i]）。
    // 【已知限制】规格组/值数量或顺序变更（结构变更）需重开新建，本轮不强制 diff 重建。
    const curDims = allVariants[0].options?.length ?? 0;
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
          ...stockFieldWith(locationId, sku.stock),
          assetIds: sku.assetIds ?? [],
          featuredAssetId: (sku.assetIds ?? [])[0] ?? undefined,
          customFields: {
            shippingProfileId: input.shippingProfileId ?? '',
            paymentProfileId: input.paymentProfileId ?? '',
            listPrice: sku.listPriceCents != null ? Math.round(sku.listPriceCents) : null,
            costPrice: sku.costPrice != null ? Math.round(sku.costPrice) : null,
            barcode: sku.barcode ?? '',
            internalCode: sku.internalCode ?? '',
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
      const s0 = vm?.skus?.[0];
      await getAdminClient().request(
        `mutation UpdateProductVariants($input: [UpdateProductVariantInput!]!) {
          updateProductVariants(input: $input) { id }
        }`,
        {
          input: [
            {
          id: v.id,
          sku: v.sku,
          price: Math.round(s0?.priceCents != null ? s0.priceCents : input.priceYuan * 100),
          trackInventory: 'TRUE',
          // 多租户需写当前渠道默认仓，否则更新落入全局默认仓、租户页读不到
          ...stockFieldWith(locationId, s0?.stock != null ? s0.stock : input.stock),
          // 编辑时商品图片以「商品级 assets」为准（上方 UpdateProductAssets 已写入），
          // 这里同步到变体，确保 C 端变体图与商品图一致、多图都能显示、删图能生效
          ...(input.assetIds?.length
            ? { assetIds: input.assetIds, featuredAssetId: featuredAssetId }
            : {}),
          customFields: {
                shippingProfileId: input.shippingProfileId ?? '',
                paymentProfileId: input.paymentProfileId ?? '',
                listPrice: s0?.listPriceCents != null ? Math.round(s0.listPriceCents) : null,
                costPrice: s0?.costPrice != null ? Math.round(s0.costPrice) : null,
                barcode: s0?.barcode ?? '',
                internalCode: s0?.internalCode ?? '',
              },
            },
          ],
        },
      );
    }
  }
  await applyBrandAndMarketing(id, input);
  const hasEn = input.nameEn != null && input.nameEn !== '';
  if (hasEn) {
    await upsertProductTranslation(id, 'en', {
      name: input.nameEn!,
      slug: input.slugEn,
      description: input.descriptionEn,
      sellingPoint: input.sellingPointEn ? input.sellingPointEn : undefined,
    });
  }
  // 归属分类：保存即建立商品→分类关联（幂等，追加进分类 filter；分类未变/未选则跳过）
  if (input.collectionId) await mapProductToCollection(id, input.collectionId);
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
  /** 首选在售变体 id，用于批量库存等需要具体变体的操作 */
  firstVariantId?: string;
}

const LOW_STOCK = 5;

/** 列表小图强制走小尺寸预设（vendor 资产预览预设 thumb≈150px），
 *  否则直接使用 featuredAsset.preview 会返回原始大图（如 3MB PNG），拖慢列表首屏。 */
function assetThumbUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}preset=thumb`;
}

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
        items { id name slug enabled featuredAsset { preview } variants { id price priceWithTax stockOnHand } customFields { marketplaceStatus } }
      }
    }`,
    { take: q.take ?? 20, skip: q.skip ?? 0, filter },
  );
  const items: ProductListRow[] = products.items.map((p: any) => {
    const variants = p.variants || [];
    // 库存取所有变体库存求和（多规格商品首个变体≠总量，求和才准确）
    const stock = variants.reduce((sum: number, v: any) => sum + (v.stockOnHand ?? 0), 0);
    const first = variants[0];
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      enabled: p.enabled,
      thumb: assetThumbUrl(p.featuredAsset?.preview),
      priceYuan: (first?.priceWithTax ?? first?.price ?? 0) / 100,
      stock,
      low: stock <= LOW_STOCK,
      marketplaceStatus: p.customFields?.marketplaceStatus ?? null,
      firstVariantId: first?.id,
    };
  });
  return { totalItems: products.totalItems, items };
}

/**
 * 批量上架/下架商品：调用 Vendure core 原生 updateProducts（数组输入）。
 * enabled 为 true 上架、false 下架，一次提交，事务性。
 */
export async function bulkSetProductsEnabled(
  ids: string[],
  enabled: boolean,
): Promise<number> {
  if (!ids.length) return 0;
  const { updateProducts } = await getAdminClient().request<{ updateProducts: Array<{ id: string }> }>(
    `mutation BulkEnabled($input: [UpdateProductInput!]!) {
      updateProducts(input: $input) { id }
    }`,
    { input: ids.map((id) => ({ id, enabled })) },
  );
  return (updateProducts || []).length;
}

/**
 * 解析一个可写库存的仓库 id（库存写在逐仓 StockLevel 上）。
 * 平台多仓模式下，顶层 `stockOnHand` 仅在存在「默认仓」时才能落库；
 * 无默认仓时会静默落空（表现为改库存无效）。这里显式取当前渠道可见的首个仓库，
 * 通过 `stockLevels` 携带 locationId 写入以稳定生效。
 * 实现要点：
 *  - 「当前渠道」上下文（vendure-token 头）决定 stockLocations 返回哪些仓，
 *    故缓存以渠道 token 为 key，切租户立即失效，避免 t2 读到 t1 的旧仓 id。
 *  - 查询失败或返回空不缓存（返回 null），下次调用重新查询，
 *    避免「空闲/无渠道上下文时首次置 null 后永久失效」导致的库存写不进租户仓。
 */
let cachedStockLocation: { channel: string; id: string | null } | null = null;
export async function resolveStockLocationId(): Promise<string | null> {
  const ch = getChannelToken();
  if (cachedStockLocation && cachedStockLocation.channel === ch) {
    return cachedStockLocation.id;
  }
  let id: string | null = null;
  try {
    const { stockLocations } = await getAdminClient().request<{
      stockLocations: { items: Array<{ id: string }> };
    }>(`query StockLocs { stockLocations { items { id } } }`);
    id = stockLocations?.items?.find((l) => l.id != null)?.id ?? null;
  } catch {
    id = null;
  }
  // 命中真实仓则缓存（缓存含当前渠道 key）；空/失败不缓存，待渠道就绪后重查
  if (id) {
    cachedStockLocation = { channel: ch, id };
  }
  return id;
}

/**
 * 批量设置库存：单选变体时用变体 id；商品级（firstVariantId）则设置该商品首选变体库存。
 * 调用 Vendure core 原生 updateProductVariants（数组输入）。
 * 库存走显式 `stockLevels:[{stockLocationId, stockOnHand}]` 写入（绝对覆盖值），
 * 避免无默认仓时顶层 stockOnHand 静默落空。返回成功改动的变体数。
 */
export async function bulkSetVariantsStock(
  updates: Array<{ variantId: string; stock: number }>,
): Promise<number> {
  const valid = updates.filter((u) => u.variantId && Number.isFinite(u.stock));
  if (!valid.length) return 0;
  const locId = await resolveStockLocationId();
  const input = valid.map((u) => {
    const stock = Math.max(0, Math.round(u.stock));
    return locId
      ? { id: u.variantId, stockLevels: [{ stockLocationId: locId, stockOnHand: stock }] }
      : { id: u.variantId, stockOnHand: stock };
  });
  const { updateProductVariants } = await getAdminClient().request<{
    updateProductVariants: Array<{ id: string }>;
  }>(
    `mutation BulkStock($input: [UpdateProductVariantInput!]!) {
      updateProductVariants(input: $input) { id }
    }`,
    { input },
  );
  return (updateProductVariants || []).length;
}

// ---- 规格组复用（跨渠道） ----
// 后端 cjk-plugin TenantCatalogAdminResolver 暴露：
//   query reusableOptionGroups { id name options { id name } }
//   mutation reuseOptionGroupForProduct(productId, optionGroupId)
export interface ReusableOptionGroup {
  id: string;
  name: string;
  options: Array<{ id: string; name: string }>;
}

export async function fetchReusableOptionGroups(): Promise<ReusableOptionGroup[]> {
  const { reusableOptionGroups } = await getAdminClient().request<{
    reusableOptionGroups: ReusableOptionGroup[];
  }>(
    `query ReusableOptionGroups { reusableOptionGroups { id name options { id name } } }`,
  );
  return reusableOptionGroups || [];
}

export async function reuseOptionGroupForProduct(
  productId: string,
  optionGroupId: string,
): Promise<boolean> {
  const { reuseOptionGroupForProduct } = await getAdminClient().request<{
    reuseOptionGroupForProduct: boolean;
  }>(
    `mutation ReuseOptionGroup($productId: ID!, $optionGroupId: ID!) {
      reuseOptionGroupForProduct(productId: $productId, optionGroupId: $optionGroupId)
    }`,
    { productId, optionGroupId },
  );
  return !!reuseOptionGroupForProduct;
}
