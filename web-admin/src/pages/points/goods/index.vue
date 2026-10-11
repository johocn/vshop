<template>
  <view class="page">
    <view class="pgoods-search">
      <input class="pgoods-search__input" v-model="keyword" :placeholder="locale.t('pointsGoods.searchPlaceholder')" confirm-type="search" @confirm="doSearch" />
      <button class="pgoods-search__btn" @tap="doSearch">{{ locale.t('pointsGoods.searchBtn') }}</button>
    </view>
    <view class="toolbar">
      <button class="add-btn" @tap="onAdd">+ {{ locale.t('pointsGoods.add') }}</button>
    </view>

    <view class="card" v-for="row in rows" :key="row.key">
      <view class="row">
        <text class="row-title">{{ row.id ? '#' + row.id : locale.t('pointsGoods.add') }}</text>
        <view class="switch-row">
          <text class="switch-label">{{ locale.t('pointsGoods.enabled') }}</text>
          <switch :checked="row.enabled" color="#2563eb" style="transform: scale(0.8)" @change="(e: any) => onToggleEnabled(row, e)" />
        </view>
      </view>

      <text v-if="row.id" class="tip">{{ locale.t('pointsGoods.redeemed') }}：{{ row.redeemedCount }}</text>

      <input v-model="row.productId" type="number" class="fld" :disabled="!!row.id" :placeholder="locale.t('pointsGoods.idPh')" />
      <input v-model="row.variantId" type="number" class="fld" :disabled="!!row.id" :placeholder="locale.t('pointsGoods.idPh')" />
      <view class="grid2">
        <view class="grid2__item">
          <text class="fld-label">{{ locale.t('pointsGoods.pointsPrice') }}</text>
          <input v-model="row.pointsPrice" type="number" class="fld" />
        </view>
        <view class="grid2__item">
          <text class="fld-label">{{ locale.t('pointsGoods.cashPrice') }}</text>
          <input v-model="row.cashPrice" type="number" class="fld" />
        </view>
        <view class="grid2__item">
          <text class="fld-label">{{ locale.t('pointsGoods.deliveryType') }}</text>
          <view class="switch-row">
            <switch :checked="row.isVirtual" color="#2563eb" style="transform: scale(0.8)" @change="(e: any) => (row.isVirtual = !!e.detail.value)" />
            <text class="switch-value">{{ locale.t(row.isVirtual ? 'pointsGoods.virtual' : 'pointsGoods.physical') }}</text>
          </view>
        </view>
        <view class="grid2__item">
          <text class="fld-label">{{ locale.t('pointsGoods.stock') }}</text>
          <input v-model="row.stock" type="number" class="fld" />
        </view>
        <view class="grid2__item">
          <text class="fld-label">{{ locale.t('pointsGoods.perUserLimit') }}</text>
          <input v-model="row.perUserLimit" type="number" class="fld" />
        </view>
        <view class="grid2__item">
          <text class="fld-label">{{ locale.t('pointsGoods.sortOrder') }}</text>
          <input v-model="row.sortOrder" type="number" class="fld" />
        </view>
        <view class="grid2__item">
          <view class="fld-head">
            <text class="fld-label">{{ locale.t('pointsGoods.validFrom') }}</text>
            <text v-if="row.validFrom" class="fld-clear" @tap="row.validFrom = ''">{{ locale.t('pointsGoods.clear') }}</text>
          </view>
          <picker mode="date" :value="row.validFrom" @change="(e: any) => (row.validFrom = e.detail.value)">
            <view class="fld fld--picker"><text :class="{ ph: !row.validFrom }">{{ row.validFrom || locale.t('pointsGoods.validPh') }}</text></view>
          </picker>
        </view>
        <view class="grid2__item">
          <view class="fld-head">
            <text class="fld-label">{{ locale.t('pointsGoods.validTo') }}</text>
            <text v-if="row.validTo" class="fld-clear" @tap="row.validTo = ''">{{ locale.t('pointsGoods.clear') }}</text>
          </view>
          <picker mode="date" :value="row.validTo" @change="(e: any) => (row.validTo = e.detail.value)">
            <view class="fld fld--picker"><text :class="{ ph: !row.validTo }">{{ row.validTo || locale.t('pointsGoods.validPh') }}</text></view>
          </picker>
        </view>
      </view>
      <text class="tip">{{ locale.t('pointsGoods.cashPriceTip') }}</text>
      <text class="tip">{{ locale.t('pointsGoods.perUserLimitTip') }}</text>

      <view class="ops">
        <button class="op main" :disabled="row.saving" @tap="onSave(row)">{{ locale.t('pointsGoods.save') }}</button>
        <button v-if="row.id" class="op danger" @tap="onDelete(row)">{{ locale.t('pointsGoods.delBtn') }}</button>
        <button v-else class="op" @tap="onCancelNew(row)">{{ locale.t('pointsGoods.cancel') }}</button>
      </view>
    </view>

    <view v-if="loading" class="empty">{{ locale.t('pointsGoods.loading') }}</view>
    <view v-else-if="error" class="empty">
      <text>{{ error }}</text>
      <text class="retry" @tap="load">{{ locale.t('pointsGoods.retry') }}</text>
    </view>
    <view v-else-if="!rows.length" class="empty">{{ locale.t('pointsGoods.empty') }}</view>

    <view v-if="total > 0" class="pager">
      <text class="pager__total">{{ locale.t('pointsGoods.total') }} {{ total }}</text>
      <view class="pager__nav">
        <button class="pager__btn" :disabled="pageIndex <= 0" @tap="onPrevPage">{{ locale.t('pointsGoods.prevPage') }}</button>
        <text class="pager__page">{{ pageIndex + 1 }} / {{ pageCount }}</text>
        <button class="pager__btn" :disabled="pageIndex + 1 >= pageCount" @tap="onNextPage">{{ locale.t('pointsGoods.nextPage') }}</button>
        <picker class="pager__size" mode="selector" :range="pageSizeOptions" :value="pageSizeIndex" @change="(e: any) => onPageSizeChange(Number(e.detail.value))">
          <view class="pager__size-val">{{ pageSize }} {{ locale.t('pointsGoods.perPage') }}</view>
        </picker>
      </view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchPointsProductsAdmin, createPointsProduct, updatePointsProduct, deletePointsProduct, type PointsProductRow } from '../../../apis/points-mall';

const locale = useLocaleStore();

interface EditRow {
  key: number;
  id: string;
  productId: string;
  variantId: string;
  pointsPrice: string;
  cashPrice: string;
  isVirtual: boolean;
  stock: string;
  perUserLimit: string;
  /** 'YYYY-MM-DD' 或 ''（不限） */
  validFrom: string;
  validTo: string;
  sortOrder: string;
  enabled: boolean;
  redeemedCount: number;
  saving: boolean;
}

let keySeq = 1;
const rows = ref<EditRow[]>([]);
const loading = ref(false);
const error = ref('');
const keyword = ref('');
const total = ref(0);
const pageIndex = ref(0);
const pageSize = ref(20);
const pageSizeOptions = [10, 20, 50];
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const pageSizeIndex = computed(() => Math.max(0, pageSizeOptions.indexOf(pageSize.value)));

function doSearch() {
  keyword.value = keyword.value.trim();
  pageIndex.value = 0;
  void load();
}

function onPrevPage() {
  if (pageIndex.value <= 0) return;
  pageIndex.value--;
  void load();
}

function onNextPage() {
  if (pageIndex.value + 1 >= pageCount.value) return;
  pageIndex.value++;
  void load();
}

function onPageSizeChange(i: number) {
  const v = pageSizeOptions[i];
  if (!v || v === pageSize.value) return;
  pageSize.value = v;
  pageIndex.value = 0;
  void load();
}

function toRow(p: PointsProductRow): EditRow {
  return {
    key: keySeq++,
    id: p.id,
    productId: String(p.productId ?? ''),
    variantId: String(p.variantId ?? ''),
    pointsPrice: String(p.pointsPrice ?? 0),
    cashPrice: String(p.cashPrice ?? 0),
    isVirtual: p.deliveryType === 'virtual',
    stock: String(p.stock ?? 0),
    perUserLimit: String(p.perUserLimit ?? 0),
    validFrom: (p.validFrom || '').slice(0, 10),
    validTo: (p.validTo || '').slice(0, 10),
    sortOrder: String(p.sortOrder ?? 0),
    enabled: p.status !== 'disabled',
    redeemedCount: p.redeemedCount ?? 0,
    saving: false,
  };
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const r = await fetchPointsProductsAdmin({ skip: pageIndex.value * pageSize.value, take: pageSize.value, keyword: keyword.value || null });
    rows.value = r.items.map(toRow);
    total.value = r.total;
  } catch (e: any) {
    error.value = e?.message || locale.t('pointsGoods.opFailed');
  } finally {
    loading.value = false;
  }
}

function onAdd() {
  rows.value.unshift({
    key: keySeq++, id: '', productId: '', variantId: '', pointsPrice: '', cashPrice: '0',
    isVirtual: false, stock: '0', perUserLimit: '0', validFrom: '', validTo: '', sortOrder: '0',
    enabled: true, redeemedCount: 0, saving: false,
  });
}

function onToggleEnabled(row: EditRow, e: any) {
  row.enabled = !!e.detail.value;
  // 已保存的条目：切换即持久化（update 仅覆盖传入字段）；新卡片仅改本地态，随保存提交
  if (row.id) {
    void persist(row, { id: row.id, status: row.enabled ? 'enabled' : 'disabled' });
  }
}

async function persist(row: EditRow, input: Record<string, unknown>): Promise<boolean> {
  row.saving = true;
  try {
    const saved = await updatePointsProduct(input as any);
    // 开关切换只回写 enabled（及 redeemedCount 快照），保留该行未保存的编辑
    const i = rows.value.findIndex((r) => r.key === row.key);
    if (i >= 0) {
      rows.value[i].enabled = saved.status !== 'disabled';
      rows.value[i].redeemedCount = saved.redeemedCount ?? rows.value[i].redeemedCount;
    }
    return true;
  } catch (e: any) {
    toast(e?.message || locale.t('pointsGoods.opFailed'));
    return false;
  } finally {
    row.saving = false;
  }
}

/** 日期 'YYYY-MM-DD' → ISO；endOfDay=true 取本地当天 23:59:59.999（validTo 当日有效），否则本地 00:00:00；空/非法返回 null */
function toIso(s: string, endOfDay = false): string | null {
  const v = (s || '').trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) {
    const d = endOfDay
      ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999)
      : new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
    return d.toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 解析表单数字字段；非法返回 null 并 toast */
function parseNums(row: EditRow): { productId: string; variantId: string; pointsPrice: number; cashPrice: number; stock: number; perUserLimit: number | null; sortOrder: number } | null {
  const productId = row.productId.trim();
  if (!/^\d+$/.test(productId)) {
    toast(locale.t('pointsGoods.productInvalid'));
    return null;
  }
  const variantId = row.variantId.trim();
  if (!/^\d+$/.test(variantId)) {
    toast(locale.t('pointsGoods.variantInvalid'));
    return null;
  }
  if (String(row.pointsPrice).trim() === '') {
    toast(locale.t('pointsGoods.pointsPriceRequired'));
    return null;
  }
  const pointsPrice = Math.floor(Number(row.pointsPrice));
  if (!Number.isFinite(pointsPrice) || pointsPrice < 0) {
    toast(locale.t('pointsGoods.pointsPriceInvalid'));
    return null;
  }
  let cashPrice = 0;
  if (String(row.cashPrice).trim() !== '') {
    cashPrice = Math.floor(Number(row.cashPrice));
    if (!Number.isFinite(cashPrice) || cashPrice < 0) {
      toast(locale.t('pointsGoods.cashPriceInvalid'));
      return null;
    }
  }
  let stock = 0;
  if (String(row.stock).trim() !== '') {
    stock = Math.floor(Number(row.stock));
    if (!Number.isFinite(stock) || stock < 0) {
      toast(locale.t('pointsGoods.stockInvalid'));
      return null;
    }
  }
  let perUserLimit: number | null = null;
  if (String(row.perUserLimit).trim() !== '') {
    perUserLimit = Math.floor(Number(row.perUserLimit));
    if (!Number.isFinite(perUserLimit) || perUserLimit < 0) {
      toast(locale.t('pointsGoods.perUserLimitInvalid'));
      return null;
    }
  }
  let sortOrder = 0;
  if (String(row.sortOrder).trim() !== '') {
    sortOrder = Math.floor(Number(row.sortOrder));
    if (!Number.isFinite(sortOrder) || sortOrder < 0) {
      toast(locale.t('pointsGoods.sortOrderInvalid'));
      return null;
    }
  }
  return { productId, variantId, pointsPrice, cashPrice, stock, perUserLimit, sortOrder };
}

async function onSave(row: EditRow) {
  const nums = parseNums(row);
  if (!nums) return;
  const base = {
    pointsPrice: nums.pointsPrice,
    cashPrice: nums.cashPrice,
    deliveryType: row.isVirtual ? 'virtual' : 'physical',
    stock: nums.stock,
    perUserLimit: nums.perUserLimit,
    validFrom: toIso(row.validFrom),
    validTo: toIso(row.validTo, true),
    status: row.enabled ? 'enabled' : 'disabled',
    sortOrder: nums.sortOrder,
  };
  row.saving = true;
  try {
    // update 不支持改 productId / variantId，仅新卡创建时提交
    const saved = row.id
      ? await updatePointsProduct({ id: row.id, ...base })
      : await createPointsProduct({ productId: nums.productId, variantId: nums.variantId, ...base });
    const i = rows.value.findIndex((r) => r.key === row.key);
    if (i >= 0) rows.value[i] = toRow(saved);
    toast(locale.t('pointsGoods.saveOk'));
  } catch (e: any) {
    toast(e?.message || locale.t('pointsGoods.opFailed'));
  } finally {
    row.saving = false;
  }
}

function onDelete(row: EditRow) {
  uni.showModal({
    title: locale.t('pointsGoods.delTitle'),
    content: locale.t('pointsGoods.delContent'),
    success: (res) => {
      if (!res.confirm) return;
      deletePointsProduct(row.id)
        .then(() => {
          rows.value = rows.value.filter((r) => r.key !== row.key);
          toast(locale.t('pointsGoods.delOk'));
        })
        .catch((e: any) => toast(e?.message || locale.t('pointsGoods.opFailed')));
    },
  });
}

function onCancelNew(row: EditRow) {
  rows.value = rows.value.filter((r) => r.key !== row.key);
}

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}

onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

onLoad(() => {
  void load();
});
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .pgoods-search { display: flex; gap: 12rpx; margin-bottom: 20rpx;
    &__input { flex: 1; height: 64rpx; background: $wa-card; border-radius: $wa-radius; padding: 0 28rpx; font-size: 26rpx; color: $wa-ink; }
    &__btn { margin: 0; padding: 0 30rpx; height: 64rpx; line-height: 64rpx; font-size: 26rpx; border-radius: $wa-radius; background: $wa-accent; color: #fff; border: none; } }
  .toolbar { display: flex; justify-content: flex-end; margin-bottom: 20rpx;
    .add-btn { margin: 0; padding: 0 32rpx; height: 64rpx; line-height: 64rpx; font-size: 26rpx;
      border-radius: $wa-radius; background: $wa-accent; color: #fff; } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    display: flex; flex-direction: column; gap: 16rpx;
    .row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
    .row-title { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
    .switch-row { display: flex; align-items: center; gap: 8rpx;
      .switch-label { font-size: 24rpx; color: $wa-muted; }
      .switch-value { font-size: 24rpx; color: $wa-ink; } }
    .grid2 { display: flex; flex-wrap: wrap; gap: 12rpx;
      .grid2__item { width: calc(50% - 6rpx); display: flex; flex-direction: column; gap: 8rpx; } }
    .fld-head { display: flex; align-items: center; justify-content: space-between; gap: 8rpx;
      .fld-clear { font-size: 22rpx; color: $wa-muted; } }
    .fld-label { font-size: 24rpx; color: $wa-muted; }
    .fld { height: 72rpx; background: $wa-bg; border-radius: $wa-radius; padding: 0 20rpx; font-size: 26rpx; color: $wa-ink;
      width: 100%; box-sizing: border-box;
      &.fld--picker { display: flex; align-items: center;
        .ph { color: $wa-muted; } } }
    .tip { font-size: 22rpx; color: $wa-muted; }
    .ops { display: flex; gap: 12rpx; margin-top: 4rpx;
      .op { min-width: 140rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
        font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; }
        &.danger { color: #dc2626; } } }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
  .pager { display: flex; flex-direction: column; align-items: center; gap: 16rpx; padding: 24rpx 0 40rpx;
    .pager__total { font-size: 24rpx; color: $wa-muted; }
    .pager__nav { display: flex; align-items: center; gap: 20rpx; }
    .pager__btn { margin: 0; padding: 0 28rpx; height: 56rpx; line-height: 56rpx; font-size: 24rpx;
      border-radius: $wa-radius; background: $wa-card; color: $wa-ink;
      &[disabled] { color: $wa-muted; opacity: .5; } }
    .pager__page { font-size: 26rpx; color: $wa-ink; }
    .pager__size-val { font-size: 24rpx; color: $wa-accent; padding: 8rpx 16rpx; } }
}
</style>
