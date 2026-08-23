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
//   - 库存只用单默认仓，create/update variant 的 stockLevels 传 stockOnHand（无本地 variant 写入先例，
//     需冒烟校准 stockLocationId；多仓时可改为按默认仓 stockLocationId 传）

export interface VariantRef {
  id: string;
  sku: string;
  price: number; // 单位：分
  stockOnHand: number;
  trackInventory: boolean;
  customFields?: { shippingProfileId?: string | null; paymentProfileId?: string | null } | null;
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
  assets?: { preview: string }[] | null;
  variant?: VariantRef | null;
  customFields?: { shippingProfileId?: string | null; paymentProfileId?: string | null } | null;
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
}

export async function fetchProductFull(id: string): Promise<ProductFull> {
  const { product } = await getAdminClient().request<{
    product: {
      id: string;
      name: string;
      slug: string;
      enabled: boolean;
      featuredAsset?: { preview: string } | null;
      assets?: { preview: string }[] | null;
      translations?: Array<{ languageCode: string; name: string; slug: string; description: string }>;
      variants: Array<{
        id: string;
        sku: string;
        price: number;
        stockOnHand: number;
        trackInventory: boolean;
        featuredAsset?: { preview: string } | null;
        customFields?: { shippingProfileId?: string | null; paymentProfileId?: string | null } | null;
      }>;
    };
  }>(
    `query ProductFull($id: ID!) {
      product(id: $id) {
        id name slug enabled
        featuredAsset { preview }
        assets { preview }
        translations { languageCode name slug description }
        variants {
          id sku price stockOnHand trackInventory
          featuredAsset { preview }
          customFields { shippingProfileId paymentProfileId }
        }
      }
    }`,
    { id },
  );
  const zh = product.translations?.find((t) => t.languageCode === PRODUCT_LANGUAGE_CODE);
  const v = product.variants?.[0];
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    enabled: product.enabled,
    description: zh?.description ?? '',
    featuredAsset: product.featuredAsset ?? null,
    assets: product.assets ?? null,
    variant: v ? { ...v } : null,
    customFields: v?.customFields ?? null,
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
          trackInventory: true,
          assetIds: input.assetIds,
          featuredAssetId: input.featuredAssetId,
          customFields: {
            shippingProfileId: input.shippingProfileId ?? '',
            paymentProfileId: input.paymentProfileId ?? '',
          },
          stockLevels: [{ stockOnHand: input.stock }],
          translations: [{ languageCode: PRODUCT_LANGUAGE_CODE, name: input.sku }],
        },
      ],
    },
  );
  return createProductVariants[0]?.id;
}

export async function createProductFull(input: ProductSaveInput): Promise<string> {
  const pid = await createProduct(input.name, input.slug, input.description ?? '');
  const featuredAssetId = input.featuredAssetId ?? (input.assetIds[0] || undefined);
  const variantId = await createVariantsForProduct({
    productId: pid,
    sku: 'P' + Date.now(),
    price: Math.round(input.priceYuan * 100),
    stock: input.stock,
    assetIds: input.assetIds,
    featuredAssetId,
    shippingProfileId: input.shippingProfileId,
    paymentProfileId: input.paymentProfileId,
  });
  void variantId;
  if (input.enabled === false) {
    await updateProduct(pid, { enabled: false });
  }
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

  // 3) 变体更新（sku 沿用原值，price 换算成分，更新库存与 profiles）
  const full = await fetchProductFull(id);
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
            trackInventory: true,
            customFields: {
              shippingProfileId: input.shippingProfileId ?? '',
              paymentProfileId: input.paymentProfileId ?? '',
            },
            stockLevels: [{ stockOnHand: input.stock }],
          },
        ],
      },
    );
  }
}
