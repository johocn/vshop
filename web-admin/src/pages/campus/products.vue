<template>
  <view class="page">
    <view class="notice">{{ $t('campusProducts.notice') }}</view>

    <!-- R5 跑腿载体商品初始化：新店铺/新校区首次开跑腿前必须执行（幂等） -->
    <view class="errand">
      <text class="errand-hint">{{ $t('campusProducts.errandHint') }}</text>
      <button class="errand-btn" :disabled="errandBusy" @tap="initErrand">
        {{ errandBusy ? $t('campusProducts.errandBusy') : $t('campusProducts.errandInit') }}
      </button>
    </view>

    <view class="searchbar">
      <input
        v-model="search" class="search"
        :placeholder="$t('campusProducts.searchPh')" confirm-type="search"
        @confirm="load(true)"
      />
      <text class="search-btn" @tap="load(true)">{{ $t('campusProducts.search') }}</text>
    </view>

    <view v-if="loading && !products.length" class="hint">{{ $t('campusProducts.loading') }}</view>
    <view v-else-if="!products.length" class="hint">{{ $t('campusProducts.empty') }}</view>
    <view v-for="p in products" :key="p.productId" class="card">
      <view class="main">
        <text class="name">{{ p.name }}</text>
        <view class="meta">
          <text class="m">{{ $t('campusProducts.monthlySales') }} {{ p.monthlySales }}</text>
          <text class="m">{{ $t('campusProducts.variantCount') }} {{ p.variantCount }}</text>
        </view>
      </view>
      <view class="right">
        <text class="state" :class="{ out: p.soldOut }">
          {{ p.soldOut ? $t('campusProducts.soldOut') : $t('campusProducts.onSale') }}
        </text>
        <switch
          class="sw" :checked="p.soldOut"
          :disabled="!!busy[p.productId]"
          color="#ff6600"
          @change="onToggle(p, $event)"
        />
      </view>
    </view>

    <button
      v-if="products.length < total" class="more" :disabled="loading"
      @tap="load(false)"
    >{{ loading ? $t('campusProducts.loading') : $t('campusProducts.loadMore') }}</button>
  </view>
</template>

<script lang="ts" setup>
// 一键沽清：商品售罄仅影响 C 端加购，仍保留菜单展示（避免频繁上下架打断装修/搜索索引）。
import { onMounted, ref } from 'vue';
import { fetchMerchantProducts, setMerchantProductSoldOut, ensureErrandProducts, type MerchantProduct } from '../../apis/campus-ops';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const TAKE = 20;

const locale = useLocaleStore();
const products = ref<MerchantProduct[]>([]);
const total = ref(0);
const search = ref('');
const loading = ref(false);
const busy = ref<Record<string, boolean>>({});
const errandBusy = ref(false);

/** 幂等初始化跑腿载体商品（SKU 查重，重复点击安全） */
async function initErrand(): Promise<void> {
  if (errandBusy.value) return;
  errandBusy.value = true;
  try {
    const r = await ensureErrandProducts();
    uni.showToast({
      title: locale.t('campusProducts.errandOk').replace('{sku}', r.sku),
      icon: 'success',
    });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.setFailed')), icon: 'none' });
  } finally {
    errandBusy.value = false;
  }
}

async function load(reset: boolean): Promise<void> {
  if (loading.value) return;
  loading.value = true;
  try {
    const skip = reset ? 0 : products.value.length;
    const res = await fetchMerchantProducts(search.value.trim(), skip, TAKE);
    products.value = reset ? res.items : [...products.value, ...res.items];
    total.value = res.total;
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

/** 乐观更新：先切 UI，失败回滚并提示 */
async function onToggle(p: MerchantProduct, e: any): Promise<void> {
  const next = !!e?.detail?.value;
  const prev = p.soldOut;
  if (next === prev || busy.value[p.productId]) return;
  p.soldOut = next;
  busy.value[p.productId] = true;
  try {
    const actual = await setMerchantProductSoldOut(p.productId, next);
    p.soldOut = actual;
  } catch (err: any) {
    p.soldOut = prev;
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.setFailed')), icon: 'none' });
  } finally {
    delete busy.value[p.productId];
  }
}

onMounted(() => {
  void load(true);
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx; padding-bottom: 80rpx;
  .notice { font-size: 24rpx; color: #c47b00; background: #fff7e6; border: 1.5px solid #ffe1a8;
    border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 20rpx; }
  .errand { display: flex; align-items: center; gap: 16rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 20rpx;
    .errand-hint { flex: 1; font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
    .errand-btn { flex: none; margin: 0; font-size: 22rpx; line-height: 56rpx; padding: 0 24rpx;
      background: transparent; border: 1.5px solid $wa-accent; color: $wa-accent; border-radius: $wa-radius; } }
  .searchbar { display: flex; align-items: center; gap: 16rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 12rpx 24rpx; margin-bottom: 20rpx;
    .search { flex: 1; font-size: 26rpx; }
    .search-btn { flex: none; font-size: 26rpx; color: $wa-accent; font-weight: 600; padding: 8rpx 4rpx; } }
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .card { display: flex; align-items: center; gap: 20rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10rpx;
      .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; word-break: break-all; }
      .meta { display: flex; gap: 24rpx;
        .m { font-size: 22rpx; color: $wa-muted; } } }
    .right { flex: none; display: flex; flex-direction: column; align-items: center; gap: 8rpx;
      .state { font-size: 20rpx; color: $wa-success;
        &.out { color: $wa-danger; } }
      .sw { transform: scale(.8); } } }
  .more { margin: 12rpx 0 0; background: transparent; border: 1.5px solid $wa-accent;
    color: $wa-accent; font-size: 26rpx; border-radius: $wa-radius; }
}
</style>
