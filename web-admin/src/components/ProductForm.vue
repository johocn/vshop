<template>
  <view class="form">
    <view class="tabbar">
      <view
        class="tab"
        v-for="t in TABS"
        :key="t"
        :class="{ on: activeTab === t }"
        @tap="activeTab = t"
      >{{ tabLabel(t) }}</view>
    </view>

    <!-- 基本信息 -->
    <template v-if="activeTab === '基本信息'">
      <!-- 多语言页签：已开启语言 > 1 才渲染；仅 1 种语言时整条不渲染，只输默认语言 -->
      <view v-if="isMulti" class="langbar">
        <text
          v-for="c in langCodes"
          :key="c"
          :class="['lg', { on: lang === c }]"
          @tap="lang = c"
        >{{ langLabel(c) }}</text>
      </view>
      <view class="card">
        <view class="cell">
          <text class="lbl">{{ locale.t('productForm.name') }}</text>
          <input :value="curName" @input="curName = $event.detail.value" :placeholder="locale.t('productForm.nameRequired')" />
        </view>
        <view class="cell">
          <text class="lbl">Slug</text>
          <input :value="curSlug" @input="curSlug = $event.detail.value" :placeholder="locale.t('productForm.slugAlias')" />
        </view>
        <view class="cell col">
          <text class="lbl">{{ locale.t('productForm.desc') }}</text>
          <RichTextEditor :model-value="curDesc" @update:model-value="curDesc = $event" />
        </view>
        <view class="cell">
          <text class="lbl">{{ locale.t('productForm.price') }}</text>
          <input
            v-model="d.priceYuan"
            type="digit"
            placeholder="0.00"
            @blur="syncBaseToSkus"
          />
        </view>
        <view class="cell">
          <text class="lbl">{{ locale.t('productForm.listPrice') }}</text>
          <input
            v-model="d.listPriceYuan"
            type="digit"
            placeholder="0.00"
            @blur="syncBaseToSkus"
          />
        </view>
        <view class="cell">
          <text class="lbl">{{ locale.t('productForm.cost') }}</text>
          <input
            v-model="d.costYuan"
            type="digit"
            placeholder="0.00"
            @blur="syncBaseToSkus"
          />
        </view>
        <view class="cell">
          <text class="lbl">{{ locale.t('productForm.stock') }}</text>
          <input v-model="d.stock" type="number" placeholder="0" @blur="syncBaseToSkus" />
        </view>
      </view>

      <view class="card">
        <picker mode="selector" :range="spNames" @change="onSpChange">
          <view class="cell row-in">
            <text class="lbl">{{ locale.t('productForm.shippingProfile') }}</text>
            <text class="val">{{ spName }}</text>
          </view>
        </picker>
        <view class="wa-cell">
          <text class="wa-lbl">{{ $t('productForm.deliveryDerived') }}</text>
          <text class="wa-readonly">{{ derivedText }}</text>
        </view>
        <view class="wa-cell link" @tap="goShippingProfile">
          <text class="wa-lbl">{{ $t('productForm.deliveryGotoProfile') }}</text>
          <text class="wa-arrow">›</text>
        </view>
        <picker mode="selector" :range="ppNames" @change="onPpChange">
          <view class="cell row-in">
            <text class="lbl">{{ locale.t('productForm.paymentProfile') }}</text>
            <text class="val">{{ ppName }}</text>
          </view>
        </picker>
        <picker mode="selector" :range="catNames" @change="onCatChange">
          <view class="cell row-in">
            <text class="lbl">{{ locale.t('productForm.category') }}</text>
            <text class="val">{{ catName }}</text>
          </view>
        </picker>
        <view class="cell col">
          <text class="lbl">{{ locale.t('productForm.typeLabel') }}</text>
          <view class="type-seg">
            <view class="seg-opt" :class="{ on: d.productType === 'physical' }" @tap="d.productType = 'physical'">{{ locale.t('productForm.typePhysical') }}</view>
            <view class="seg-opt" :class="{ on: d.productType === 'virtual' }" @tap="d.productType = 'virtual'">{{ locale.t('productForm.typeVirtual') }}</view>
            <view class="seg-opt" :class="{ on: d.productType === 'service' }" @tap="d.productType = 'service'">{{ locale.t('productForm.typeService') }}</view>
          </view>
          <text class="tip">{{ locale.t('productForm.typeHelper') }}</text>
        </view>
        <view class="cell row-in">
          <text class="lbl">{{ locale.t('productForm.onShelf') }}</text>
          <switch :checked="d.enabled" @change="onToggle" />
        </view>
      </view>

      <view class="card">
        <view class="img-title">{{ locale.t('productForm.imgTitle') }}<text v-if="d.assetIds.length" class="img-count">{{ locale.t('productForm.imgCount').replace('{n}', String(d.assetIds.length)) }}</text></view>
        <ImagePicker :max="9" :value="d.assetIds" @change="onImg" />
      </view>

      <view class="card">
        <view class="img-title">{{ locale.t('productForm.videoTitle') }}</view>
        <MediaPicker :max="1" mediaType="video" :value="d.videoAssetId ? [d.videoAssetId] : []" @change="onVideo" />
        <text class="vid-hint">{{ locale.t('productForm.videoHint') }}</text>
      </view>
    </template>

    <ProductBrandMarketingTab
      v-else-if="activeTab === '品牌营销'"
      :value="brandMarketing"
      @update:value="(o:any)=>brandMarketing=o"
    />

    <ProductVariantMatrixTab
      v-else-if="activeTab === '规格变体'"
      :value="variantMatrix"
      :base="baseFill"
      :variant-id="primaryVariantId"
      @update:value="(o:any)=>variantMatrix=o"
    />
  </view>
</template>

<script lang="ts" setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useLocaleStore } from '../stores/localeStore';
import ImagePicker from './ImagePicker.vue';
import MediaPicker from './MediaPicker.vue';
import RichTextEditor from './RichTextEditor.vue';
import ProductBrandMarketingTab from './product-tabs/ProductBrandMarketingTab.vue';
import ProductVariantMatrixTab from './product-tabs/ProductVariantMatrixTab.vue';
import {
  hydrateEditState,
  defaultBrandMarketing,
  defaultVariantMatrix,
  batchFillFromBase,
  type BrandMarketingState,
  type VariantMatrixState,
} from '../composables/useVariantMatrix';
import type { ProductFull } from '../apis/product';
import { fetchShippingProfiles, type ShippingProfileItem } from '../apis/shipping-profile';
import { fetchPaymentProfiles, type PaymentProfileItem } from '../apis/payment-profile';
import { fetchCollectionsOptimized, type CollectionItem } from '../apis/collection';
import { getAdminClient } from '../apis/client';
import { useLanguageStore } from '../stores/languageStore';
import { FALLBACK_LANGUAGE_CODE, languageLabel } from '../constants/languages';

interface I18nText {
  name?: string;
  slug?: string;
  description?: string;
}

interface ProductDraft {
  name: string;
  slug: string;
  description: string;
  /** 非默认语言译文：languageCode → { name, slug, description }（默认语言占用上方基准槽位） */
  i18n: Record<string, I18nText>;
  /** 基准语言码（= 租户默认语言），随保存提交，决定写入哪条 translation */
  baseLanguageCode: string;
  priceYuan: number;
  listPriceYuan: number;
  costYuan: number;
  stock: number;
  enabled: boolean;
  assetIds: string[];
  shippingProfileId?: string;
  paymentProfileId?: string;
  collectionId?: string;
  // 品牌/营销（随保存落库，apis 的 applyBrandAndMarketing 消费）
  brandFacetValueId?: string | null;
  marketingTags?: string[];
  promos?: string[];
  services?: string[];
  sellingPoint?: string;
  // 商品所属租户分类名，作过审归位的匹配依据（保存落库）
  tenantCategoryRef?: string | null;
  // 商品主视频资产 id（随 customFields 落库，详情页展示可播放视频）
  videoAssetId?: string | null;
  // 商品类型 physical/virtual/service（customFields 落库）
  productType: string;
  // 具变体矩阵：priceCents/listPriceCents 单位「分」；随保存落库（apis 的 createVariantMatrixForProduct 消费）
  variantMatrix?: VariantMatrixState;
}

const TABS = ['基本信息', '品牌营销', '规格变体'] as const;
const activeTab = ref<'基本信息' | '品牌营销' | '规格变体'>('基本信息');

const TAB_KEYS: Record<string, string> = { '基本信息': 'productForm.tabBasic', '品牌营销': 'productForm.tabBrandMk', '规格变体': 'productForm.tabVariant' };
const locale = useLocaleStore();
const tabLabel = (t: string) => locale.t(TAB_KEYS[t]);

const props = defineProps<{
  initial?: Partial<{
    name?: string;
    slug?: string;
    description?: string;
    i18n?: Record<string, I18nText>;
    priceYuan?: number;
    listPriceYuan?: number;
    costYuan?: number;
    stock?: number;
    enabled?: boolean;
    assetIds?: string[];
    shippingProfileId?: string;
    paymentProfileId?: string;
    collectionId?: string;
    videoAssetId?: string | null;
    productType?: string;
  }>;
  full?: ProductFull | null;
}>();

const emit = defineEmits<{ (e: 'submit', d: ProductDraft): void }>();

const d = reactive<ProductDraft>({
  name: props.initial?.name || '',
  slug: props.initial?.slug || '',
  description: props.initial?.description || '',
  i18n: props.initial?.i18n ? JSON.parse(JSON.stringify(props.initial.i18n)) : {},
  baseLanguageCode: 'zh_Hans',
  priceYuan: props.initial?.priceYuan ?? 0,
  listPriceYuan: props.initial?.listPriceYuan ?? baseYuanFromVariants((cf: any) => cf?.listPrice),
  costYuan: props.initial?.costYuan ?? baseYuanFromVariants((cf: any) => cf?.costPrice),
  stock: props.initial?.stock ?? 0,
  enabled: props.initial?.enabled ?? false,
  assetIds: props.initial?.assetIds ? [...props.initial.assetIds] : [],
  shippingProfileId: props.initial?.shippingProfileId,
  paymentProfileId: props.initial?.paymentProfileId,
  collectionId: props.initial?.collectionId,
  // 主视频 id：优先取 initial（edit 页已回填），fallback full（兼容未透传 initial 的场景）
  videoAssetId: props.initial?.videoAssetId ?? props.full?.videoAssetId ?? null,
  // 商品类型：新建默认实体；编辑页由 initial 回填（存量老商品回退 physical）
  productType: props.initial?.productType ?? 'physical',
});

// 品牌营销 / 规格变体：编辑态用 full 反解，否则给默认初值
const _hydrated = props.full
  ? hydrateEditState(props.full)
  : { brandMarketing: defaultBrandMarketing(), variantMatrix: defaultVariantMatrix() };
const brandMarketing = ref<BrandMarketingState>({ ..._hydrated.brandMarketing });
const variantMatrix = ref<VariantMatrixState>({ ..._hydrated.variantMatrix });

const spList = ref<ShippingProfileItem[]>([]);
const ppList = ref<PaymentProfileItem[]>([]);
const catList = ref<CollectionItem[]>([]);

// 商品首个变体 id（编辑态存在；创建态 full 为空 → 传空串，规格变体 Tab 的酒店配置分组隐藏）
const primaryVariantId = computed(() => (props.full as any)?.variants?.[0]?.id ?? '');

// ---- 配送方式：只读展示，值由配送档案（ShippingProfileMethod.mode）派生，表单不再手填 ----
type DeliveryMethod = 'MAIL' | 'SELF_PICKUP';

// 待派生配送能力的变体 id（编辑态取 full 变体；创建态为空 → 显示「暂不可判定」）
const variantIds = computed<string[]>(() =>
  ((props.full as any)?.variants ?? []).map((v: any) => String(v?.id)).filter(Boolean),
);

const derivedModes = ref<DeliveryMethod[] | null>(null);

const derivedText = computed(() => {
  const m = derivedModes.value;
  if (!m) return locale.t('productForm.deliveryUnknown');
  if (m.length === 2) return locale.t('productForm.deliveryBoth');
  return m[0] === 'MAIL' ? locale.t('productForm.deliveryMailOnly') : locale.t('productForm.deliveryPickupOnly');
});

async function loadDerivedModes() {
  const ids = (variantIds.value ?? []).map(String);
  if (!ids.length) { derivedModes.value = null; return; }
  try {
    const r = await getAdminClient().request<{ variantDeliveryModes: Array<{ variantId: string; modes: string[] }> }>(
      `query ($ids: [ID!]!) { variantDeliveryModes(variantIds: $ids) { variantId modes } }`,
      { ids },
    );
    const set = new Set<string>();
    for (const row of r.variantDeliveryModes ?? []) for (const m of row.modes ?? []) set.add(m);
    derivedModes.value = set.size ? ([...set] as DeliveryMethod[]) : null;
  } catch {
    derivedModes.value = null; // 查不到就显示「暂不可判定」，不阻塞保存
  }
}

function goShippingProfile() {
  uni.navigateTo({ url: '/pages/shipping/profile/index' });
}

const spNames = computed(() => spList.value.map((i) => i.name));
const ppNames = computed(() => ppList.value.map((i) => i.name));
const catNames = computed(() => catList.value.map((i) => i.name));

const spName = computed(() => spList.value.find((i) => i.id === d.shippingProfileId)?.name || locale.t('productForm.choose'));
const ppName = computed(() => ppList.value.find((i) => i.id === d.paymentProfileId)?.name || locale.t('productForm.choose'));
const catName = computed(() => catList.value.find((i) => i.id === d.collectionId)?.name || locale.t('productForm.choose'));

// ---- 多语言：基准槽位 = 默认语言；其余已开启语言走 d.i18n ----
const languageStore = useLanguageStore();
const langCodes = computed(() => languageStore.availableLanguageCodes);
const defaultCode = computed(() => languageStore.defaultLanguageCode);
const isMulti = computed(() => langCodes.value.length > 1);
// 当前编辑语种（默认语言），仅多语言时可由页签切换
const lang = ref<string>(FALLBACK_LANGUAGE_CODE);

function langLabel(code: string): string {
  return languageLabel(code);
}
function isBase(code: string): boolean {
  return code === defaultCode.value;
}
function setI18nField(code: string, key: keyof I18nText, v: string): void {
  if (!d.i18n[code]) d.i18n[code] = {};
  d.i18n[code][key] = v;
}
function getI18nField(code: string, key: keyof I18nText): string {
  return d.i18n[code]?.[key] ?? '';
}

// 按当前语种绑定基础输入（默认语言 → d.*，其余 → d.i18n[lang]）
const curName = computed({
  get: () => (isBase(lang.value) ? d.name : getI18nField(lang.value, 'name')),
  set: (v: string) => (isBase(lang.value) ? (d.name = v) : setI18nField(lang.value, 'name', v)),
});
const curSlug = computed({
  get: () => (isBase(lang.value) ? d.slug : getI18nField(lang.value, 'slug')),
  set: (v: string) => (isBase(lang.value) ? (d.slug = v) : setI18nField(lang.value, 'slug', v)),
});
const curDesc = computed({
  get: () => (isBase(lang.value) ? d.description : getI18nField(lang.value, 'description')),
  set: (v: string) =>
    isBase(lang.value) ? (d.description = v) : setI18nField(lang.value, 'description', v),
});

/** 语言加载完成后：把默认语言的译文搬进基准槽位，并从 d.i18n 摘除 */
function syncBaseFromI18n(): void {
  const def = defaultCode.value;
  d.baseLanguageCode = def;
  lang.value = def;
  const base = d.i18n[def];
  if (!base) return;
  d.name = base.name ?? '';
  d.slug = base.slug ?? '';
  d.description = base.description ?? '';
  delete d.i18n[def];
}

function onSpChange(e: any) {
  const it = spList.value[Number(e.detail.value)];
  if (it) d.shippingProfileId = it.id;
}
function onPpChange(e: any) {
  const it = ppList.value[Number(e.detail.value)];
  if (it) d.paymentProfileId = it.id;
}
function onCatChange(e: any) {
  const it = catList.value[Number(e.detail.value)];
  if (it) d.collectionId = it.id;
}
function onToggle(e: any) {
  d.enabled = !!e.detail.value;
}
function onImg(ids: string[]) {
  d.assetIds = ids;
}
function onVideo(ids: string[]) {
  d.videoAssetId = ids[0] || null;
}

// 从 full 首个变体 customFields 取划线价/成本价（分→元），用于基础信息的初始回填
function baseYuanFromVariants(pick: (cf: any) => number | null | undefined): number {
  const v = props.full as unknown as {
    variants?: Array<{ customFields?: { listPrice?: number | null; costPrice?: number | null } }>;
  };
  const cf = v?.variants?.[0]?.customFields as { listPrice?: number | null; costPrice?: number | null } | undefined;
  const raw = cf ? pick(cf) : undefined;
  return typeof raw === 'number' ? Math.round(raw / 100) : 0;
}

// 基本信息「价格/划线价/成本价/库存」失焦时，将当前基准值（元→分）联动到全部变体 SKU；
// 已被手动修改的行（_baseSynced === false）不覆盖
function syncBaseToSkus() {
  const base = {
    priceCents: Math.round((Number(d.priceYuan) || 0) * 100),
    stock: Math.round(Number(d.stock) || 0),
    listPriceCents: Math.round((Number(d.listPriceYuan) || 0) * 100),
    costPrice: Math.round((Number(d.costYuan) || 0) * 100),
  };
  variantMatrix.value = { ...variantMatrix.value, skus: batchFillFromBase(variantMatrix.value.skus, base) };
}

// 基础信息四值 → 供规格变体 Tab 重建矩阵时自动代入（元→分）
const baseFill = computed(() => ({
  priceCents: Math.round((Number(d.priceYuan) || 0) * 100),
  stock: Math.round(Number(d.stock) || 0),
  listPriceCents: Math.round((Number(d.listPriceYuan) || 0) * 100),
  costPrice: Math.round((Number(d.costYuan) || 0) * 100),
}));

// 基础信息四值变化即联动到变体矩阵（不依赖 blur 时序，覆盖「改动即填」场景）；
// 已手动改过的行（_baseSynced === false）不覆盖
watch(
  () => [d.priceYuan, d.listPriceYuan, d.costYuan, d.stock],
  syncBaseToSkus,
);

function submit() {
  if (!d.name) return uni.showToast({ title: locale.t('productForm.nameRequiredToast'), icon: 'none' });
  d.priceYuan = Number(d.priceYuan);
  d.stock = Number(d.stock);
  const out: ProductDraft = JSON.parse(JSON.stringify(d));
  // 仅保留非默认语言、且至少填了一项的译文
  const i18nOut: Record<string, I18nText> = {};
  for (const [code, t] of Object.entries(out.i18n || {})) {
    if (code === defaultCode.value) continue;
    const has = (t.name ?? '').trim() || (t.slug ?? '').trim() || (t.description ?? '').trim();
    if (has) i18nOut[code] = t;
  }
  out.i18n = i18nOut;
  out.baseLanguageCode = defaultCode.value;
  // 汇入品牌/营销到最终 ProductSaveInput（apis 内 applyBrandAndMarketing 落库）
  out.brandFacetValueId = brandMarketing.value.brandFacetValueId || null;
  out.marketingTags = brandMarketing.value.tags;
  out.promos = brandMarketing.value.promos;
  out.services = brandMarketing.value.services;
  out.sellingPoint = brandMarketing.value.sellingPoint;
  // 无规格（单品）：基本信息 Tab 的价格/划线价/成本价/库存是唯一输入源，四值联动进默认变体行；
  // 保证与规格变体 Tab 的矩阵单行一致；多规格则保留各自的矩阵值。
  // 已手动改过变体行（_baseSynced === false）不覆盖。
  const plain =
    !(variantMatrix.value.groups || []).some((g) =>
      (g?.values || []).some((v) => String(v ?? '').trim() !== ''),
    );
  if (plain) {
    // 元→分 口径与 syncBaseToSkus 一致；漏乘会直接把 200 元写成 200 分 → 保存后 C 端价格缩水 100 倍
    const base = {
      priceCents: Math.round((Number(d.priceYuan) || 0) * 100),
      stock: Math.round(Number(d.stock) || 0),
      listPriceCents: Math.round((Number(d.listPriceYuan) || 0) * 100),
      costPrice: Math.round((Number(d.costYuan) || 0) * 100),
    };
    variantMatrix.value = { ...variantMatrix.value, skus: batchFillFromBase(variantMatrix.value.skus, base) };
  }
  // 序列化提交前剔除内部标记 _baseSynced，绝不写入 API/后端字段
  out.variantMatrix = JSON.parse(
    JSON.stringify({
      ...variantMatrix.value,
      skus: (variantMatrix.value.skus || []).map((s) => {
        const { _baseSynced, ...rest } = s as { _baseSynced?: boolean };
        return rest;
      }),
    }),
  );
  // 所选租户分类名写入 tenantCategoryRef，作为过审归位的匹配依据（unused 时置空，避免残留）
  out.tenantCategoryRef = d.collectionId ? (catList.value.find((i) => i.id === d.collectionId)?.name ?? null) : null;
  emit('submit', out);
}

onMounted(async () => {
  // 语言配置决定页签数量；加载后把默认语言译文搬进基准槽位
  await languageStore.ensureLoaded();
  syncBaseFromI18n();
  const [sp, pp, cat] = await Promise.all([
    fetchShippingProfiles().catch(() => []),
    fetchPaymentProfiles().catch(() => []),
    fetchCollectionsOptimized().catch(() => []),
  ]);
  spList.value = sp;
  ppList.value = pp;
  catList.value = cat;
  await loadDerivedModes();
});

defineExpose({ submit, brandMarketing, variantMatrix });
</script>

<style lang="scss" scoped>
.form {
  min-height: 100vh;

  .tabbar {
    display: flex;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 8rpx;
    margin-bottom: 24rpx;

    .tab {
      flex: 1;
      text-align: center;
      padding: 20rpx 0;
      font-size: 30rpx;
      color: $wa-muted;
      border-radius: $wa-radius;

      &.on {
        background: $wa-accent;
        color: #fff;
      }
    }
  }

  .langbar {
    display: flex;
    gap: 16rpx;
    margin-bottom: 24rpx;

    .lg {
      padding: 12rpx 32rpx;
      font-size: 26rpx;
      color: $wa-muted;
      background: $wa-card;
      border-radius: $wa-radius;
      border: 2rpx solid transparent;

      &.on {
        color: #fff;
        background: $wa-accent;
      }
    }
  }

  .card {
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 8rpx 32rpx;
    margin-bottom: 24rpx;

    .cell {
      display: flex;
      align-items: center;
      padding: 28rpx 0;
      border-bottom: 1rpx solid $wa-rule;

      .lbl {
        width: 200rpx;
        font-size: 28rpx;
        color: $wa-ink;
        flex-shrink: 0;
      }
      input {
        flex: 1;
        font-size: 28rpx;
      }
      &.col {
        flex-direction: column;
        align-items: flex-start;
        .lbl { margin-bottom: 16rpx; }
      }
      &.row-in {
        justify-content: space-between;
        &:last-child { border-bottom: none; }
      }
      .val {
        font-size: 28rpx;
        color: $wa-muted;
      }
      &:last-child { border-bottom: none; }
    }

    // 配送方式：只读展示（由配送档案推导）+ 跳转档案入口
    .wa-cell {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 28rpx 0;
      border-bottom: 1rpx solid $wa-rule;

      &.link .wa-lbl { color: $wa-accent; }
      .wa-lbl {
        width: 200rpx;
        font-size: 28rpx;
        color: $wa-ink;
        flex-shrink: 0;
      }
      .wa-readonly {
        flex: 1;
        font-size: 28rpx;
        color: $wa-muted;
        text-align: right;
      }
      .wa-arrow {
        font-size: 32rpx;
        color: $wa-muted;
        margin-left: 8rpx;
      }
    }

    .ta {
      width: 100%;
      min-height: 140rpx;
      font-size: 28rpx;
      box-sizing: border-box;
    }

    // 商品类型三选一 segmented（实体/虚拟/服务）
    .type-seg {
      display: flex;
      gap: 8rpx;
      width: 100%;
      background: $wa-bg;
      border-radius: 12rpx;
      padding: 6rpx;
      box-sizing: border-box;

      .seg-opt {
        flex: 1;
        text-align: center;
        padding: 14rpx 0;
        border-radius: 10rpx;
        font-size: 26rpx;
        color: $wa-muted;

        &.on {
          background: $wa-accent;
          color: #fff;
          font-weight: 600;
        }
      }
    }

    .tip {
      font-size: 24rpx;
      color: $wa-muted;
      margin-top: 12rpx;
    }

    .img-title {
      padding-top: 20rpx;
      font-size: 28rpx;
      color: $wa-ink;
    }

    .img-count { font-size: 24rpx; color: $wa-muted; margin-left: 12rpx; }

    .vid-hint {
      font-size: 24rpx;
      color: $wa-muted;
      padding: 8rpx 4rpx 0;
      display: block;
    }
  }
}
</style>