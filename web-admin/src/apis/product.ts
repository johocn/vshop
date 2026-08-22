// 商品域 admin-api 调用（Task 3，schema 已校准）
// 校准结果（本地 admin-api 实测）：
//   - products(options:{take,skip,filter:{name:{contains}}}) { totalItems items { id name enabled slug } }
//     —— name/slug 直接可用（无需 translations），filter.name.contains 可用
//   - product(id) { id name enabled slug } —— 可用
//   - updateProduct(input:{id,enabled}) { id enabled } —— 可用
//   - createProduct(input:{translations:[{languageCode,name,slug,description}]}) 直接返回 Product（非 union）
//   - collections(options:{take}) { totalItems items { id name } } —— 可用
import { getAdminClient } from './client';

export interface ProductListItem {
  id: string;
  name: string;
  enabled: boolean;
  slug: string;
}

export interface ProductTranslationInput {
  languageCode: string;
  name: string;
  slug: string;
  description?: string;
}

export interface ProductInput {
  enabled?: boolean;
  translations: ProductTranslationInput[];
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

export async function setProductEnabled(id: string, enabled: boolean): Promise<void> {
  await getAdminClient().request(
    `mutation SetEnabled($id: ID!, $enabled: Boolean!) { updateProduct(input: { id: $id, enabled: $enabled }) { id enabled } }`,
    { id, enabled },
  );
}

export async function createProduct(input: ProductInput): Promise<ProductListItem> {
  const { createProduct } = await getAdminClient().request<{ createProduct: ProductListItem }>(
    `mutation CreateProduct($input: CreateProductInput!) {
      createProduct(input: $input) { id name enabled slug }
    }`,
    { input },
  );
  return createProduct;
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<ProductListItem> {
  const { updateProduct } = await getAdminClient().request<{ updateProduct: ProductListItem }>(
    `mutation UpdateProduct($input: UpdateProductInput!) {
      updateProduct(input: $input) { id name enabled slug }
    }`,
    { input: { id, ...input } },
  );
  return updateProduct;
}

export interface CollectionListItem {
  id: string;
  name: string;
}

export async function fetchCollections(take = 50): Promise<{ totalItems: number; items: CollectionListItem[] }> {
  const { collections } = await getAdminClient().request<{
    collections: { totalItems: number; items: CollectionListItem[] };
  }>(
    `query Collections($take: Int) {
      collections(options: { take: $take }) { totalItems items { id name } }
    }`,
    { take },
  );
  return collections;
}
