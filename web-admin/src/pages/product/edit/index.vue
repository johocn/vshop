<template>
  <view class="page">
    <view v-if="loaded">
      <ProductForm ref="form" :initial="initial" :full="full" @submit="onSubmit" />

      <!-- 商品专属券：商品-券绑定（coupon-plugin productCouponBindings） -->
      <view class="bind-card">
        <view class="bind-hd">
          <text class="title">商品专属券</text>
          <text class="sub">此处绑定的券会展示在商品详情页，仅该商品可用</text>
        </view>

        <view class="bind-list" v-if="bindings.length">
          <view class="bind-item" v-for="(b, i) in bindings" :key="b.id">
            <view class="bind-top">
              <view class="bind-head">
                <text class="name">{{ b.template?.name || '未知券模板' }}</text>
                <text class="badge" :class="(b.template?.type || '').toLowerCase()">{{ typeLabel(b.template?.type) }}</text>
                <text class="badge off" v-if="b.template && !b.template.enabled">模板停用</text>
              </view>
              <text class="value">{{ valueText(b.template) }}</text>
            </view>
            <view class="bind-ops">
              <text @tap="onMove(b, i, -1)" :class="{ disabled: i === 0 || bindBusy }">上移</text>
              <text @tap="onMove(b, i, 1)" :class="{ disabled: i === bindings.length - 1 || bindBusy }">下移</text>
              <view class="switch-box">
                <text>启用</text>
                <switch :checked="b.enabled" :disabled="bindBusy" @change="onToggle(b, $event.detail.value)" color="#2563eb" />
              </view>
              <text class="del" @tap="onDelete(b)">删除</text>
            </view>
          </view>
        </view>
        <view v-else-if="loadingBindings" class="bind-empty">加载绑定中…</view>
        <view v-else class="bind-empty">暂未绑定商品专属券</view>

        <!-- 添加入口：只展示 enabled 的券模板（过滤已绑定，避免重复） -->
        <picker v-if="pickTemplateNames.length" :range="pickTemplateNames" @change="onPickTemplate">
          <view class="add-btn">{{ bindBusy ? '处理中…' : '＋ 添加商品专属券' }}</view>
        </picker>
        <view v-else-if="templatesLoading" class="bind-empty small">加载券模板中…</view>
        <view v-else-if="templatesFailed" class="bind-empty small" @tap="loadTemplates">券模板加载失败，点击重试</view>
        <view v-else class="bind-empty small">暂无可用券模板，请先创建</view>

        <!-- 快捷建券：直接新建券模板并自动绑定本商品 -->
        <view class="add-btn ghost" @tap="onQuickCreateTemplate">{{ bindBusy ? '处理中…' : '＋ 新建券模板并绑定本商品' }}</view>
      </view>

      <button class="save" @tap="doSave">保存</button>
    </view>
    <view v-else class="empty">加载中…</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import ProductForm from '../../../components/ProductForm.vue';
import { fetchProductFull, updateProductFull, type ProductFull } from '../../../apis/product';
import { fetchCollectionsOptimized } from '../../../apis/collection';
import {
  fetchProductCouponBindings, createProductCouponBinding, updateProductCouponBinding, deleteProductCouponBinding,
  fetchCouponTemplates, couponTypeLabel, fmtCNY,
  type CouponTemplateItem, type ProductCouponBindingItem,
} from '../../../apis/coupon';

const id = ref('');
const loaded = ref(false);
const form = ref<any>(null);
const initial = ref<any>(null);
const full = ref<ProductFull | null>(null);
let busy = false;

/* ------------------------- 商品专属券 ------------------------- */
const bindings = ref<ProductCouponBindingItem[]>([]);
const loadingBindings = ref(false);
const bindBusy = ref(false);
const templates = ref<CouponTemplateItem[]>([]);
const templatesLoading = ref(false);
const templatesFailed = ref(false);

const typeLabel = (t?: string) => couponTypeLabel(t || '');
const valueText = (t?: CouponTemplateItem | null): string => {
  if (!t) return '';
  switch (t.type) {
    case 'FIXED': return `满 ${fmtCNY(t.minSpend)} 减 ${fmtCNY(t.discountValue)}`;
    case 'PERCENT': return `满 ${fmtCNY(t.minSpend)} 打 ${t.discountValue / 10} 折`;
    case 'FULL': return `直减 ${fmtCNY(t.discountValue)}`;
    case 'FREE_SHIPPING': return '免邮';
    default: return '';
  }
};

/** 可选添加的模板：仅 enabled 且未绑定（避免同一模板重复绑定） */
const pickTemplates = computed(() => {
  const boundIds = new Set(bindings.value.map((b) => b.couponTemplateId));
  return templates.value.filter((t) => t.enabled && !boundIds.has(t.id));
});
const pickTemplateNames = computed(() => pickTemplates.value.map((t) => t.name));

/** 快捷建券：跳到券模板编辑页（新建），返回后刷新绑定 */
function onQuickCreateTemplate() {
  if (bindBusy.value || !id.value) return;
  uni.navigateTo({ url: `/pages/coupon/edit/index?productId=${id.value}` });
}

async function loadBindings() {
  if (!id.value) return;
  loadingBindings.value = true;
  try {
    const list = await fetchProductCouponBindings(id.value);
    bindings.value = [...list].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  } catch (e: any) {
    uni.showToast({ title: e?.message || '加载商品专属券失败', icon: 'none' });
  } finally {
    loadingBindings.value = false;
  }
}

async function loadTemplates() {
  templatesLoading.value = true;
  templatesFailed.value = false;
  try {
    const res = await fetchCouponTemplates({ skip: 0, take: 50 });
    templates.value = res.items;
  } catch {
    templatesFailed.value = true;
  } finally {
    templatesLoading.value = false;
  }
}

async function onPickTemplate(e: any) {
  const t = pickTemplates.value[e.detail.value];
  if (!t || bindBusy.value) return;
  bindBusy.value = true;
  try {
    const maxOrder = bindings.value.reduce((m, b) => Math.max(m, b.displayOrder || 0), 0);
    // variantIds 不传（null=全规格适用）
    await createProductCouponBinding({
      productId: id.value,
      couponTemplateId: t.id,
      enabled: true,
      displayOrder: maxOrder + 1,
    });
    uni.showToast({ title: '已添加', icon: 'none' });
    await loadBindings();
  } catch (e: any) {
    uni.showToast({ title: e?.message || '添加失败', icon: 'none' });
  } finally {
    bindBusy.value = false;
  }
}

async function onToggle(b: ProductCouponBindingItem, enabled: boolean) {
  if (bindBusy.value) return;
  bindBusy.value = true;
  try {
    // 只传 id + enabled，其余字段局部更新
    await updateProductCouponBinding({ id: b.id, enabled });
    b.enabled = enabled;
    uni.showToast({ title: enabled ? '已启用' : '已停用', icon: 'none' });
  } catch (e: any) {
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' });
  } finally {
    bindBusy.value = false;
  }
}

async function onMove(b: ProductCouponBindingItem, i: number, dir: number) {
  const j = i + dir;
  if (bindBusy.value || j < 0 || j >= bindings.value.length) return;
  bindBusy.value = true;
  const next = bindings.value[j];
  try {
    // 交换相邻两项 displayOrder 后逐个提交
    const tmp = b.displayOrder;
    b.displayOrder = next.displayOrder;
    next.displayOrder = tmp;
    await updateProductCouponBinding({ id: b.id, displayOrder: b.displayOrder });
    await updateProductCouponBinding({ id: next.id, displayOrder: next.displayOrder });
    await loadBindings();
  } catch (e: any) {
    uni.showToast({ title: e?.message || '排序失败', icon: 'none' });
    await loadBindings();
  } finally {
    bindBusy.value = false;
  }
}

function onDelete(b: ProductCouponBindingItem) {
  if (bindBusy.value) return;
  uni.showModal({
    title: '删除',
    content: `确认移除商品专属券「${b.template?.name || ''}」？`,
    success: async (r) => {
      if (!r.confirm || bindBusy.value) return;
      bindBusy.value = true;
      try {
        await deleteProductCouponBinding(b.id);
        bindings.value = bindings.value.filter((x) => x.id !== b.id);
        uni.showToast({ title: '已删除', icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || '删除失败', icon: 'none' });
      } finally {
        bindBusy.value = false;
      }
    },
  });
}

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
  // 商品专属券与可选券模板（不阻塞表单）
  loadBindings();
  loadTemplates();
});

// 从快捷建券/优惠券管理页返回后刷新绑定与可选券模板
onShow(() => {
  if (id.value && loaded.value) {
    loadBindings();
    loadTemplates();
  }
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
  .bind-card {
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 28rpx 32rpx;
    margin-top: 24rpx;
    .bind-hd {
      .title { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
      .sub { display: block; margin-top: 6rpx; font-size: 22rpx; color: $wa-muted; }
    }
    .bind-list { margin-top: 20rpx;
      .bind-item { border: 1rpx solid $wa-rule; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 16rpx;
        .bind-top { display: flex; align-items: center; justify-content: space-between;
          .bind-head { display: flex; align-items: center; flex-wrap: wrap;
            .name { font-size: 26rpx; color: $wa-ink; font-weight: 600; margin-right: 12rpx; }
            .badge { font-size: 20rpx; color: #fff; border-radius: 16rpx; padding: 2rpx 14rpx; margin-right: 8rpx;
              &.fixed { background: #f0821f; }
              &.percent { background: #2563eb; }
              &.full { background: #0a9c6e; }
              &.free_shipping { background: #7c3aed; }
              &.off { background: #bbb; }
            }
          }
          .value { font-size: 26rpx; color: $wa-danger; font-weight: 700; flex-shrink: 0; margin-left: 12rpx; }
        }
        .bind-ops { margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx solid $wa-rule; display: flex; align-items: center; flex-wrap: wrap;
          text { font-size: 24rpx; color: $wa-accent; margin-right: 28rpx;
            &.disabled { color: #ccc; }
            &.del { color: #e64340; }
          }
          .switch-box { display: flex; align-items: center; margin-left: auto;
            text { color: $wa-muted; margin-right: 8rpx; }
            switch { transform: scale(0.8); }
          }
        }
      }
    }
    .bind-empty { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 40rpx 0;
      &.small { padding: 24rpx 0; font-size: 22rpx; }
    }
    .add-btn { margin-top: 8rpx; text-align: center; border: 1rpx dashed $wa-rule; border-radius: $wa-radius; padding: 18rpx 0; font-size: 26rpx; color: $wa-accent;
      &.ghost { border-style: solid; background: $wa-bg; color: $wa-muted; }
    }
  }
  .empty {
    padding: 80rpx 0;
    text-align: center;
    color: $wa-muted;
    font-size: 28rpx;
  }
}
</style>