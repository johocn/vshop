<template>
  <view class="page">
    <view v-if="loaded">
      <ProductForm ref="form" :initial="initial" :full="full" @submit="onSubmit" />
      <button class="save" @tap="doSave">保存</button>
    </view>
    <view v-else class="empty">加载中…</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import ProductForm from '../../../components/ProductForm.vue';
import { fetchProductFull, updateProductFull, type ProductFull } from '../../../apis/product';
import { fetchCollectionsOptimized } from '../../../apis/collection';

const id = ref('');
const loaded = ref(false);
const form = ref<any>(null);
const initial = ref<any>(null);
const full = ref<ProductFull | null>(null);
let busy = false;

onMounted(async () => {
  id.value = (getCurrentPages().at(-1) as any)?.options?.id || '';
  // 并行拉取商品全量与租户分类列表，用于按 tenantCategoryRef 反解 collectionId 预选分类
  const [data, cats] = await Promise.all([
    fetchProductFull(id.value),
    fetchCollectionsOptimized().catch(() => []),
  ]);
  full.value = data;
  // 归位反解：商品自带 tenantCategoryRef（租户分类名），按名反查分类 id 预选
  const refName = data.productCustomFields?.tenantCategoryRef ?? null;
  const mappedCat = refName ? cats.find((c) => c.name === refName) : undefined;
  initial.value = {
    name: data.name,
    slug: data.slug,
    description: data.description,
    // 多语言英文回填（multilingualEnabled 开启时表单展示，缺失回退 zh）
    nameEn: data.nameEn,
    slugEn: data.slugEn,
    descriptionEn: data.descriptionEn,
    priceYuan: data.variant ? (data.variant.priceWithTax ?? data.variant.price) / 100 : 0,
    stock: data.variant?.stockOnHand ?? 0,
    enabled: data.enabled,
    // ImagePicker 的 value 是资产 id 数组，故回填真实 id（full.assets 已带 id）。
    // 兼容「仅 featuredAsset 有图、assets 为空」的商品：把主图并入，避免编辑时
    // 图片不预加载、保存时 assetIds=[] 把图清空（保存路径的持久化本身没问题）。
    assetIds: Array.from(
      new Set([
        ...(data.assets || []).map((a) => a.id).filter(Boolean),
        ...(data.featuredAsset?.id ? [data.featuredAsset.id] : []),
      ]),
    ),
    shippingProfileId: data.variant?.customFields?.shippingProfileId ?? '',
    paymentProfileId: data.variant?.customFields?.paymentProfileId ?? '',
    // 主视频资产 id 回填
    videoAssetId: data.videoAssetId ?? null,
    // 归属分类：优先按 tenantCategoryRef 反解预选；找不到则 undefined（不预选不改动）
    collectionId: mappedCat?.id ?? undefined,
  };
  loaded.value = true;
});

async function doSave() {
  if (!busy) await form.value?.submit?.();
}

async function onSubmit(d: any) {
  busy = true;
  try {
    await updateProductFull(id.value, d);
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: e?.message || '保存失败', icon: 'none' });
  } finally {
    busy = false;
  }
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 32rpx 32rpx 160rpx;
  .save {
    margin-top: 48rpx;
    background: $wa-accent;
    color: #fff;
    font-size: 30rpx;
    border-radius: $wa-radius;
  }
  .empty {
    padding: 80rpx 0;
    text-align: center;
    color: $wa-muted;
    font-size: 28rpx;
  }
}
</style>