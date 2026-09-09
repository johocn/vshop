// 规格变体矩阵 composable（纯前端源码，无第三方依赖）
// 提供：规格分组 -> 矩阵 SKU 笛卡尔积生成、批量填值、以及从 ProductFull 反解编辑态。
import type { ProductFull } from '../apis/product';

export interface SpecGroup {
  name: string;
  values: string[];
  /** 已复用系统规格组：其 ProductOptionGroup 的 id（存在时保存/建变体走复用路径，不新建组） */
  groupId?: string;
  /** 与 values 对齐，为各规格值对应的 ProductOption id（复用系统组时才有） */
  valueIds?: string[];
}

export interface MatrixSku {
  key: string;
  labels: string[];
  optionValueIds: string[];
  sku: string;
  priceCents: number; // 单位：分
  stock: number;
  listPriceCents?: number; // 划线价，单位：分
  costPrice?: number; // 成本价，单位：分
  barcode?: string; // 条形码
  internalCode?: string; // 内部编码
  assetIds?: string[]; // 变体图片（规格组合独立图）；首张作为变体主图 featuredAsset
  _baseSynced?: boolean; // 内部标记：是否由基础信息同步，false 表示已手动修改不覆盖
}

export function defaultSku(): MatrixSku {
  return { key: 'default', labels: [], optionValueIds: [], sku: '', priceCents: 0, stock: 0, _baseSynced: true };
}

// 无/空规格组 -> 返回单 SKU；否则对各组 values 做笛卡尔积（组合去空）。
export function buildMatrix(groups: SpecGroup[]): MatrixSku[] {
  const g = (groups || []).filter((it) => it?.values?.some((v) => typeof v === 'string' && v.trim() !== ''));
  if (!g.length) return [defaultSku()];

  let combos: string[][] = [[]];
  for (const grp of g) {
    const vals = grp.values.filter((v) => typeof v === 'string' && v.trim() !== '');
    if (!vals.length) continue;
    const next: string[][] = [];
    for (const c of combos) {
      for (const v of vals) next.push([...c, v.trim()]);
    }
    combos = next;
  }
  if (combos.length === 1 && combos[0].length === 0) return [defaultSku()];

  return combos.map((c) => ({
    key: c.join('-'),
    labels: c,
    optionValueIds: [],
    sku: c.join('-'),
    priceCents: 0,
    stock: 0,
    _baseSynced: true,
  }));
}

// 将基础信息四值（价格/库存/划线价/成本价）批量填充到各行变体；
// 已被手动修改的行（_baseSynced === false）不覆盖，其余行置 _baseSynced: true。
export function batchFillFromBase(
  skus: MatrixSku[],
  base: { priceCents: number; stock: number; listPriceCents: number; costPrice: number },
): MatrixSku[] {
  return skus.map((s) => {
    if (s._baseSynced === false) return s; // 已手动改过 → 不覆盖
    return {
      ...s,
      priceCents: base.priceCents,
      stock: base.stock,
      listPriceCents: base.listPriceCents,
      costPrice: base.costPrice,
      _baseSynced: true,
    };
  });
}

export function batchFill(
  skus: MatrixSku[],
  field: 'priceCents' | 'stock' | 'listPriceCents',
  value: number,
): MatrixSku[] {
  const n = Number(value) || 0;
  return skus.map((s) => ({ ...s, [field]: n }));
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === 'string');
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

export interface BrandMarketingState {
  brandFacetValueId: string;
  brandName: string;
  saleStart: string;
  saleEnd: string;
  tags: string[];
  sellingPoint: string;
  newBrand: string; // 本期仅收集品牌名（暂不落库）
}

export interface VariantMatrixState {
  noSpec: boolean;
  groups: SpecGroup[];
  skus: MatrixSku[];
  showListPrice: boolean;
}

export function defaultBrandMarketing(): BrandMarketingState {
  return {
    brandFacetValueId: '',
    brandName: '',
    saleStart: '',
    saleEnd: '',
    tags: [],
    sellingPoint: '',
    newBrand: '',
  };
}

export function defaultVariantMatrix(): VariantMatrixState {
  return { noSpec: true, groups: [], skus: [defaultSku()], showListPrice: true };
}

// 从 ProductFull 反解编辑态：
//  - facetValues 中取品牌（FacetValue 的 facet.code=brand -> id/name 取该 FacetValue 自身）
//  - productCustomFields 解析 marketingTags JSON / sellingPoint
//  - variants[0].customFields 回填 listPrice(分->元) / saleStart / saleEnd
//  - 以 variants[0].options 是否为空判定单/多规格；多规格按维度反解 groups 与 skus
export function hydrateEditState(product: ProductFull): {
  brandMarketing: BrandMarketingState;
  variantMatrix: VariantMatrixState;
} {
  const emptyBan = defaultBrandMarketing();
  const emptyMat = defaultVariantMatrix();

  if (!product) return { brandMarketing: emptyBan, variantMatrix: emptyMat };

  // 品牌
  let brandFacetValueId = '';
  let brandName = '';
  const brandEntry = (product.facetValues || []).find(
    (f) => f?.facet?.code === 'brand' || f?.code === 'brand',
  );
  if (brandEntry) {
    // brandFacetValueId 必须是 FacetValue 自身 id（updateProduct 的 facets 参数接收 FacetValue id）
    brandFacetValueId = brandEntry.id ?? '';
    brandName = brandEntry.name ?? '';
  }

  // 营销/卖点
  const tags = parseTags(product.productCustomFields?.marketingTags ?? '');
  const sellingPoint = product.productCustomFields?.sellingPoint ?? '';

  // 促销（取首个变体）
  const v = product.variant ?? (product as unknown as { variants?: Array<{ id: string }> }).variants?.[0];
  const vcf =
    (v && (v as unknown as { customFields?: { listPrice?: number | null; saleStart?: string | null; saleEnd?: string | null } }).customFields) || null;
  const saleStart = vcf?.saleStart ?? '';
  const saleEnd = vcf?.saleEnd ?? '';

  const brandMarketing: BrandMarketingState = {
    brandFacetValueId,
    brandName,
    saleStart,
    saleEnd,
    tags,
    sellingPoint,
    newBrand: '',
  };

  // 变体矩阵
  const all = (product as unknown as {
    variants?: Array<{
      sku: string;
      price: number;
      stockOnHand: number;
      options?: Array<{ id: string; name: string }>;
      customFields?: { listPrice?: number | null; costPrice?: number | null; barcode?: string | null; internalCode?: string | null };
      assets?: Array<{ id: string; preview: string }>;
    }>;
  }).variants;
  const variants = Array.isArray(all) ? all : [];
  const first = variants[0];
  const multiSpec = !!first?.options?.length;

  let variantMatrix: VariantMatrixState;
  if (!multiSpec) {
    variantMatrix = { ...emptyMat };
    if (first) {
      variantMatrix.skus = [
        {
          ...defaultSku(),
          sku: first.sku || '',
          priceCents: Number(first.price) || 0,
          stock: Number(first.stockOnHand) || 0,
          listPriceCents: first.customFields?.listPrice ?? undefined,
          costPrice: first.customFields?.costPrice ?? undefined,
          barcode: first.customFields?.barcode ?? undefined,
          internalCode: first.customFields?.internalCode ?? undefined,
          assetIds:
            (first as unknown as { assets?: Array<{ id: string }> })?.assets?.map((a) => a.id) ?? [],
          _preview:
            (first as unknown as { assets?: Array<{ id: string; preview: string }> })?.assets?.[0]?.preview ?? '',
          _baseSynced: true,
        } as MatrixSku,
      ];
    }
  } else {
    // 多规格：各维度按位置聚合 distinct 值（分组名受限于查询未带 groupName，用「规格1/规格2…」兜底）
    const dimCount = Math.max(0, ...variants.map((x) => x?.options?.length || 0));
    const groups: SpecGroup[] = [];
    for (let d = 0; d < dimCount; d++) {
      const values: string[] = [];
      for (const x of variants) {
        const ov = x?.options?.[d];
        if (ov?.name && !values.includes(ov.name)) values.push(ov.name);
      }
      groups.push({ name: `规格${d + 1}`, values });
    }
    const skus: MatrixSku[] = variants.map((x, idx) => ({
      key: (x.options || []).map((o) => o.name).join('-') || `sku-${idx}`,
      labels: (x.options || []).map((o) => o.name),
      optionValueIds: (x.options || []).map((o) => o.id).filter(Boolean),
      sku: x.sku || '',
      priceCents: Number(x.price) || 0,
      stock: Number(x.stockOnHand) || 0,
      listPriceCents: x.customFields?.listPrice ?? undefined,
      costPrice: x.customFields?.costPrice ?? undefined,
      barcode: x.customFields?.barcode ?? undefined,
      internalCode: x.customFields?.internalCode ?? undefined,
      assetIds:
        (x as unknown as { assets?: Array<{ id: string }> })?.assets?.map((a) => a.id) ?? [],
      _preview:
        (x as unknown as { assets?: Array<{ id: string; preview: string }> })?.assets?.[0]?.preview ?? '',
      _baseSynced: true,
    })) as MatrixSku[];
    variantMatrix = { noSpec: false, groups, skus, showListPrice: true };
  }

  return { brandMarketing, variantMatrix };
}