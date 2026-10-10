<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">
        {{ locale.t('lotteryManage.' + s.label) }}
      </text>
    </view>

    <template v-if="cur === 'prizes'">
    <view class="toolbar">
      <button class="add-btn" @tap="onAdd">+ {{ locale.t('lotteryManage.add') }}</button>
    </view>

    <view class="card" v-for="row in rows" :key="row.key">
      <view class="row">
        <text class="row-title">{{ row.id ? '#' + row.id : locale.t('lotteryManage.add') }}</text>
        <view class="switch-row">
          <text class="switch-label">{{ locale.t('lotteryManage.enabled') }}</text>
          <switch :checked="row.enabled" color="#2563eb" style="transform: scale(0.8)" @change="(e: any) => onToggleEnabled(row, e)" />
        </view>
      </view>

      <view class="row">
        <view class="img-pick" @tap="onPickImage(row)">
          <image v-if="row.image" class="img-pick__preview" :src="row.image" mode="aspectFill" />
          <text v-else class="img-pick__plus">＋</text>
        </view>
        <text class="img-pick__label" @tap="onPickImage(row)">{{ row.image ? locale.t('lotteryManage.changeImage') : locale.t('lotteryManage.pickImage') }}</text>
      </view>

      <input v-model="row.name" class="fld" :placeholder="locale.t('lotteryManage.namePh')" :maxlength="50" />
      <view class="grid2">
        <view class="grid2__item">
          <text class="fld-label">{{ locale.t('lotteryManage.weight') }}</text>
          <input v-model="row.weight" type="number" class="fld" />
        </view>
        <view class="grid2__item">
          <text class="fld-label">{{ locale.t('lotteryManage.consume') }}</text>
          <input v-model="row.consume" type="number" class="fld" />
        </view>
        <view class="grid2__item">
          <text class="fld-label">{{ locale.t('lotteryManage.stock') }}</text>
          <input v-model="row.stock" type="number" class="fld" :placeholder="locale.t('lotteryManage.stockPh')" />
        </view>
        <view class="grid2__item">
          <text class="fld-label">{{ locale.t('lotteryManage.sort') }}</text>
          <input v-model="row.sort" type="number" class="fld" />
        </view>
      </view>
      <text class="tip">{{ locale.t('lotteryManage.weightTip') }}</text>
      <text class="tip">{{ locale.t('lotteryManage.consumeTip') }}</text>

      <view class="ops">
        <button class="op main" :disabled="row.saving" @tap="onSave(row)">{{ locale.t('lotteryManage.save') }}</button>
        <button v-if="row.id" class="op danger" @tap="onDelete(row)">{{ locale.t('lotteryManage.delBtn') }}</button>
        <button v-else class="op" @tap="onCancelNew(row)">{{ locale.t('lotteryManage.cancel') }}</button>
      </view>
    </view>

    <MediaLibraryModal v-model:visible="imgModalVisible" :max="1" media-type="image" :value="[]" @confirm="onImageConfirm" />

    <view v-if="loading" class="empty">{{ locale.t('lotteryManage.loading') }}</view>
    <view v-else-if="error" class="empty">
      <text>{{ error }}</text>
      <text class="retry" @tap="load">{{ locale.t('lotteryManage.retry') }}</text>
    </view>
    <view v-else-if="!rows.length" class="empty">{{ locale.t('lotteryManage.empty') }}</view>
    </template>

    <template v-else>
      <view class="card rec-card" v-for="r in recPage.items.value" :key="r.id">
        <image v-if="r.prizeImage" class="rec-img" :src="r.prizeImage" mode="aspectFill" />
        <view v-else class="rec-img rec-ph"><text>{{ (r.prizeName || '?').slice(0, 1) }}</text></view>
        <view class="rec-main">
          <view class="rec-top">
            <text class="rec-name">{{ r.prizeName }}</text>
            <text class="rec-cost">{{ r.consume }}{{ locale.t('lotteryManage.pointsUnit') }}</text>
          </view>
          <text class="rec-meta">{{ locale.t('lotteryManage.customerLabel') }} #{{ r.customerId }} · {{ fmtTime(r.createdAt) }}</text>
        </view>
      </view>

      <view v-if="recPage.loading.value" class="empty">{{ locale.t('lotteryManage.loading') }}</view>
      <view v-else-if="recPage.error.value" class="empty">
        <text>{{ recPage.error.value }}</text>
        <text class="retry" @tap="recPage.refresh()">{{ locale.t('lotteryManage.retry') }}</text>
      </view>
      <view v-else-if="!recPage.items.value.length" class="empty">{{ locale.t('lotteryManage.recEmpty') }}</view>

      <view class="empty" v-if="recPage.loadingMore.value">{{ locale.t('lotteryManage.loadMore') }}</view>
      <view class="empty" v-else-if="recPage.items.value.length && !recPage.hasMore.value">{{ locale.t('lotteryManage.noMore') }}</view>
    </template>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { useListPage } from '../../../composables/useListPage';
import { fetchLotteryPrizes, createLotteryPrize, updateLotteryPrize, deleteLotteryPrize, fetchLotteryRecords, type LotteryPrizeRow, type LotteryRecordRow } from '../../../apis/lottery';
import type { AssetItem } from '../../../apis/asset';
import MediaLibraryModal from '../../../components/MediaLibraryModal.vue';

const locale = useLocaleStore();

interface EditRow {
  key: number;
  id: string;
  name: string;
  /** 奖品图 URL（媒体库 source）；'' = 无 */
  image: string;
  weight: string;
  consume: string;
  /** '' = 不限量（存 null） */
  stock: string;
  sort: string;
  enabled: boolean;
  saving: boolean;
}

let keySeq = 1;
const rows = ref<EditRow[]>([]);
const loading = ref(false);
const error = ref('');

const tabs = [
  { key: 'prizes', label: 'tabPrizes' },
  { key: 'records', label: 'tabRecords' },
];
const cur = ref('prizes');

// 抽奖记录 tab：首次切入加载；分页 / 上滑加载 / 下拉刷新由 useListPage 托管
const recPage = useListPage<LotteryRecordRow>({
  take: 20,
  immediate: false,
  fetcher: ({ skip, take }) => fetchLotteryRecords(skip, take),
});
const recLoaded = ref(false);

function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  if (key === 'records' && !recLoaded.value) {
    recLoaded.value = true;
    void recPage.refresh();
  }
}

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const imgModalVisible = ref(false);
let imgTargetKey = -1;

function toRow(p: LotteryPrizeRow): EditRow {
  return {
    key: keySeq++,
    id: p.id,
    name: p.name,
    image: p.image || '',
    weight: String(p.weight ?? 0),
    consume: String(p.consume ?? 0),
    stock: p.stock == null ? '' : String(p.stock),
    sort: String(p.sort ?? 0),
    enabled: !!p.enabled,
    saving: false,
  };
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const r = await fetchLotteryPrizes(100, 0);
    rows.value = r.items.map(toRow);
  } catch (e: any) {
    error.value = e?.message || locale.t('lotteryManage.opFailed');
  } finally {
    loading.value = false;
  }
}

function onAdd() {
  rows.value.unshift({ key: keySeq++, id: '', name: '', image: '', weight: '1', consume: '0', stock: '', sort: '0', enabled: true, saving: false });
}

function onPickImage(row: EditRow) {
  imgTargetKey = row.key;
  imgModalVisible.value = true;
}

function onImageConfirm(assets: AssetItem[]) {
  const asset = assets[0];
  if (!asset) return;
  const row = rows.value.find((r) => r.key === imgTargetKey);
  if (row) row.image = asset.source;
}

function onToggleEnabled(row: EditRow, e: any) {
  row.enabled = !!e.detail.value;
  // 已保存的条目：切换即持久化（update 仅覆盖传入字段）；新卡片仅改本地态，随保存提交
  if (row.id) {
    void persist(row, { id: row.id, enabled: row.enabled });
  }
}

/** 解析表单数字字段；非法返回 null 并 toast */
function parseNums(row: EditRow): { weight: number; consume: number; stock: number | null } | null {
  const weight = Math.floor(Number(row.weight));
  const consume = Math.floor(Number(row.consume));
  if (!Number.isFinite(weight) || weight < 0) {
    toast(locale.t('lotteryManage.weightInvalid'));
    return null;
  }
  if (!Number.isFinite(consume) || consume < 0) {
    toast(locale.t('lotteryManage.consumeInvalid'));
    return null;
  }
  let stock: number | null = null;
  if (String(row.stock).trim() !== '') {
    stock = Math.floor(Number(row.stock));
    if (!Number.isFinite(stock) || stock < 0) {
      toast(locale.t('lotteryManage.stockInvalid'));
      return null;
    }
  }
  return { weight, consume, stock };
}

async function persist(row: EditRow, input: Record<string, unknown>): Promise<boolean> {
  row.saving = true;
  try {
    const saved = await updateLotteryPrize(input as any);
    const i = rows.value.findIndex((r) => r.key === row.key);
    if (i >= 0) rows.value[i] = toRow(saved);
    return true;
  } catch (e: any) {
    toast(e?.message || locale.t('lotteryManage.opFailed'));
    return false;
  } finally {
    row.saving = false;
  }
}

async function onSave(row: EditRow) {
  const name = row.name.trim();
  if (!name) {
    toast(locale.t('lotteryManage.nameRequired'));
    return;
  }
  const nums = parseNums(row);
  if (!nums) return;
  row.saving = true;
  try {
    const saved = row.id
      ? await updateLotteryPrize({
          id: row.id,
          name,
          image: row.image || null,
          weight: nums.weight,
          consume: nums.consume,
          stock: nums.stock,
          enabled: row.enabled,
          sort: Math.floor(Number(row.sort)) || 0,
        })
      : await createLotteryPrize({
          name,
          image: row.image || null,
          weight: nums.weight,
          consume: nums.consume,
          stock: nums.stock,
          enabled: row.enabled,
          sort: Math.floor(Number(row.sort)) || 0,
        });
    const i = rows.value.findIndex((r) => r.key === row.key);
    if (i >= 0) rows.value[i] = toRow(saved);
    toast(locale.t('lotteryManage.saveOk'));
  } catch (e: any) {
    toast(e?.message || locale.t('lotteryManage.opFailed'));
  } finally {
    row.saving = false;
  }
}

function onDelete(row: EditRow) {
  uni.showModal({
    title: locale.t('lotteryManage.delTitle'),
    content: locale.t('lotteryManage.delContent'),
    success: (res) => {
      if (!res.confirm) return;
      deleteLotteryPrize(row.id)
        .then(() => {
          rows.value = rows.value.filter((r) => r.key !== row.key);
          toast(locale.t('lotteryManage.delOk'));
        })
        .catch((e: any) => toast(e?.message || locale.t('lotteryManage.opFailed')));
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
  // 记录 tab 的下拉刷新由 useListPage 内部注册的钩子处理
  if (cur.value !== 'prizes') return;
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
  .tabs { display: flex; margin-bottom: 24rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx;
    text { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; } } }
  .toolbar { display: flex; justify-content: flex-end; margin-bottom: 20rpx;
    .add-btn { margin: 0; padding: 0 32rpx; height: 64rpx; line-height: 64rpx; font-size: 26rpx;
      border-radius: $wa-radius; background: $wa-accent; color: #fff; } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    display: flex; flex-direction: column; gap: 16rpx;
    .row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
    .row-title { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
    .switch-row { display: flex; align-items: center; gap: 8rpx;
      .switch-label { font-size: 24rpx; color: $wa-muted; } }
    .img-pick { width: 120rpx; height: 120rpx; border-radius: $wa-radius; border: 1rpx dashed $wa-rule;
      display: flex; align-items: center; justify-content: center; overflow: hidden; box-sizing: border-box; flex-shrink: 0;
      .img-pick__preview { width: 100%; height: 100%; display: block; }
      .img-pick__plus { font-size: 40rpx; color: $wa-muted; line-height: 1; } }
    .img-pick__label { font-size: 24rpx; color: $wa-accent; }
    .grid2 { display: flex; flex-wrap: wrap; gap: 12rpx;
      .grid2__item { width: calc(50% - 6rpx); display: flex; flex-direction: column; gap: 8rpx; } }
    .fld-label { font-size: 24rpx; color: $wa-muted; }
    .fld { height: 72rpx; background: $wa-bg; border-radius: $wa-radius; padding: 0 20rpx; font-size: 26rpx; color: $wa-ink;
      width: 100%; box-sizing: border-box; }
    .tip { font-size: 22rpx; color: $wa-muted; }
    .ops { display: flex; gap: 12rpx; margin-top: 4rpx;
      .op { min-width: 140rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
        font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; }
        &.danger { color: #dc2626; } } }
  }
  .rec-card { flex-direction: row; align-items: center; gap: 20rpx;
    .rec-img { width: 100rpx; height: 100rpx; border-radius: $wa-radius; background: $wa-bg; overflow: hidden; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; }
    .rec-ph { font-size: 32rpx; color: $wa-muted; font-weight: 600; }
    .rec-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx; }
    .rec-top { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
    .rec-name { font-size: 28rpx; color: $wa-ink; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rec-cost { font-size: 24rpx; color: $wa-accent; flex-shrink: 0; }
    .rec-meta { font-size: 24rpx; color: $wa-muted; } }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
}
</style>
