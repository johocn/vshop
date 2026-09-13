<template>
  <view class="form">
    <view class="tabbar">
      <view
        class="tab"
        v-for="t in TABS"
        :key="t"
        :class="{ on: activeTab === t }"
        @tap="activeTab = t"
      >{{ t }}</view>
    </view>

    <!-- 基本信息 -->
    <template v-if="activeTab === '基本信息'">
      <!-- 多语言 Tab：multilingualEnabled 开启时展示，中/英分别编辑名称、Slug、描述、卖点 -->
      <view v-if="multilingual" class="langbar">
        <text :class="['lg', { on: lang === 'zh' }]" @tap="lang = 'zh'">中文</text>
        <text :class="['lg', { on: lang === 'en' }]" @tap="lang = 'en'">English</text>
      </view>
      <view class="card">
        <view class="cell">
          <text class="lbl">商品名</text>
          <input :value="curName" @input="curName = $event.detail.value" placeholder="必填" />
        </view>
        <view class="cell">
          <text class="lbl">Slug</text>
          <input :value="curSlug" @input="curSlug = $event.detail.value" placeholder="URL 别名" />
        </view>
        <view class="cell col">
          <text class="lbl">描述</text>
          <RichTextEditor :model-value="curDesc" @update:model-value="curDesc = $event" />
        </view>
        <view class="cell">
          <text class="lbl">价格（元）</text>
          <input
            v-model="d.priceYuan"
            type="digit"
            placeholder="0.00"
            @blur="syncBaseToSkus"
          />
        </view>
        <view class="cell">
          <text class="lbl">划线价（元）</text>
          <input
            v-model="d.listPriceYuan"
            type="digit"
            placeholder="0.00"
            @blur="syncBaseToSkus"
          />
        </view>
        <view class="cell">
          <text class="lbl">成本价（元）</text>
          <input
            v-model="d.costYuan"
            type="digit"
            placeholder="0.00"
            @blur="syncBaseToSkus"
          />
        </view>
        <view class="cell">
          <text class="lbl">库存（件）</text>
          <input v-model="d.stock" type="number" placeholder="0" @blur="syncBaseToSkus" />
        </view>
      </view>

      <view class="card">
        <picker mode="selector" :range="spNames" @change="onSpChange">
          <view class="cell row-in">
            <text class="lbl">配送档案</text>
            <text class="val">{{ spName }}</text>
          </view>
        </picker>
        <picker mode="selector" :range="ppNames" @change="onPpChange">
          <view class="cell row-in">
            <text class="lbl">支付档案</text>
            <text class="val">{{ ppName }}</text>
          </view>
        </picker>
        <picker mode="selector" :range="catNames" @change="onCatChange">
          <view class="cell row-in">
            <text class="lbl">分类</text>
            <text class="val">{{ catName }}</text>
          </view>
        </picker>
        <view class="cell row-in">
          <text class="lbl">上架</text>
          <switch :checked="d.enabled" @change="onToggle" />
        </view>
      </view>

      <view class="card">
        <view class="img-title">商品图片<text v-if="d.assetIds.length" class="img-count">（已关联 {{ d.assetIds.length }} 张）</text></view>
        <ImagePicker :max="9" :value="d.assetIds" @change="onImg" />
      </view>

      <view class="card">
        <view class="img-title">商品视频</view>
        <MediaPicker :max="1" mediaType="video" :value="d.videoAssetId ? [d.videoAssetId] : []" @change="onVideo" />
        <text class="vid-hint">支持 mp4/webm 等，详情页将展示可播放视频</text>
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
      @update:value="(o:any)=>variantMatrix=o"
    />
  </view>
</template>

<script lang="ts" setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
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
import { fetchActiveChannel } from '../apis/channel';

interface ProductDraft {
  name: string;
  slug: string;
  description: string;
  // 多语言英文槽位（multilingualEnabled 开启时使用，缺失回退 zh）
  nameEn?: string;
  slugEn?: string;
  descriptionEn?: string;
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
  // 具变体矩阵：priceCents/listPriceCents 单位「分」；随保存落库（apis 的 createVariantMatrixForProduct 消费）
  variantMatrix?: VariantMatrixState;
}

const TABS = ['基本信息', '品牌营销', '规格变体'] as const;
const activeTab = ref<'基本信息' | '品牌营销' | '规格变体'>('基本信息');

const props = defineProps<{
  initial?: Partial<{
    name?: string;
    slug?: string;
    description?: string;
    nameEn?: string;
    slugEn?: string;
    descriptionEn?: string;
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
  }>;
  full?: ProductFull | null;
}>();

const emit = defineEmits<{ (e: 'submit', d: ProductDraft): void }>();

const d = reactive<ProductDraft>({
  name: props.initial?.name || '',
  slug: props.initial?.slug || '',
  description: props.initial?.description || '',
  nameEn: props.initial?.nameEn || '',
  slugEn: props.initial?.slugEn || '',
  descriptionEn: props.initial?.descriptionEn || '',
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

const spNames = computed(() => spList.value.map((i) => i.name));
const ppNames = computed(() => ppList.value.map((i) => i.name));
const catNames = computed(() => catList.value.map((i) => i.name));

const spName = computed(() => spList.value.find((i) => i.id === d.shippingProfileId)?.name || '请选择');
const ppName = computed(() => ppList.value.find((i) => i.id === d.paymentProfileId)?.name || '请选择');
const catName = computed(() => catList.value.find((i) => i.id === d.collectionId)?.name || '请选择');

// ---- 多语言（multilingualEnabled 开启时启用）----
const multilingual = ref(false);
const lang = ref<'zh' | 'en'>('zh');
// 按当前语言绑定基础输入（中文->d.*，英文->d.*En）
const curName = computed({
  get: () => (lang.value === 'zh' ? d.name : d.nameEn || ''),
  set: (v: string) => (lang.value === 'zh' ? (d.name = v) : (d.nameEn = v)),
});
const curSlug = computed({
  get: () => (lang.value === 'zh' ? d.slug : d.slugEn || ''),
  set: (v: string) => (lang.value === 'zh' ? (d.slug = v) : (d.slugEn = v)),
});
const curDesc = computed({
  get: () => (lang.value === 'zh' ? d.description : d.descriptionEn || ''),
  set: (v: string) => (lang.value === 'zh' ? (d.description = v) : (d.descriptionEn = v)),
});

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
  if (!d.name) return uni.showToast({ title: '请填商品名', icon: 'none' });
  d.priceYuan = Number(d.priceYuan);
  d.stock = Number(d.stock);
  const out: ProductDraft = JSON.parse(JSON.stringify(d));
  // 多语言开启时携带英文槽位，随 translations[].en 一次写入（缺失回退 zh 展示）
  if (multilingual.value) {
    out.nameEn = d.nameEn || '';
    out.slugEn = d.slugEn || '';
    out.descriptionEn = d.descriptionEn || '';
  }
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
  // 拉取当前渠道：multilingualEnabled 决定是否显示多语言 Tab
  fetchActiveChannel()
    .then((c) => (multilingual.value = !!c.customFields?.multilingualEnabled))
    .catch(() => {});
  const [sp, pp, cat] = await Promise.all([
    fetchShippingProfiles().catch(() => []),
    fetchPaymentProfiles().catch(() => []),
    fetchCollectionsOptimized().catch(() => []),
  ]);
  spList.value = sp;
  ppList.value = pp;
  catList.value = cat;
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

    .ta {
      width: 100%;
      min-height: 140rpx;
      font-size: 28rpx;
      box-sizing: border-box;
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