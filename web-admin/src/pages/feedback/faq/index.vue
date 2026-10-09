<template>
  <view class="page">
    <view class="toolbar">
      <button class="add-btn" @tap="onAdd">+ {{ $t('feedbackManage.faqNew') }}</button>
    </view>

    <view class="card" v-for="(row, idx) in rows" :key="row.key">
      <view class="row">
        <picker :range="typeNameList" @change="(e: any) => onTypeChange(idx, e)">
          <text class="type-badge">{{ typeName(row.type) }}</text>
        </picker>
        <view class="switch-row">
          <text class="switch-label">{{ $t('feedbackManage.faqEnabledLabel') }}</text>
          <switch :checked="row.enabled" color="#2563eb" style="transform: scale(0.8)" @change="(e: any) => onToggleEnabled(idx, e)" />
        </view>
      </view>
      <input v-model="row.title" class="fld" :placeholder="$t('feedbackManage.faqPhTitle')" :maxlength="100" />
      <textarea v-model="row.content" class="fld area" :placeholder="$t('feedbackManage.faqPhContent')" />
      <view class="row">
        <text class="sort-label">{{ $t('feedbackManage.faqSortLabel') }}</text>
        <input v-model="row.sort" type="number" class="fld sort" />
      </view>
      <view class="ops">
        <button class="op main" :disabled="row.saving" @tap="onSave(idx)">{{ $t('feedbackManage.faqSave') }}</button>
        <button v-if="row.id" class="op danger" @tap="onDelete(idx)">{{ $t('feedbackManage.faqDelete') }}</button>
        <button v-else class="op" @tap="onCancelNew(idx)">{{ $t('feedbackManage.faqCancel') }}</button>
      </view>
    </view>

    <view v-if="loading" class="empty">{{ $t('feedbackManage.loading') }}</view>
    <view v-else-if="error" class="empty">
      <text>{{ error }}</text>
      <text class="retry" @tap="load">{{ $t('feedbackManage.retry') }}</text>
    </view>
    <view v-else-if="!rows.length" class="empty">{{ $t('feedbackManage.faqEmpty') }}</view>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchFaqPage, saveFaq, deleteFaq, type FaqEntryRow } from '../../../apis/feedback';

const locale = useLocaleStore();

const FAQ_TYPES = ['general', 'register', 'order', 'pay', 'afterSale', 'account'];
const typeNameList = FAQ_TYPES.map((t) => locale.t('feedbackManage.faqType_' + t));

interface EditRow {
  key: number;
  id: string;
  title: string;
  content: string;
  type: string;
  sort: string;
  enabled: boolean;
  saving: boolean;
}

let keySeq = 1;
const rows = ref<EditRow[]>([]);
const loading = ref(false);
const error = ref('');

function toRow(f: FaqEntryRow): EditRow {
  return { key: keySeq++, id: f.id, title: f.title, content: f.content, type: f.type || 'general', sort: String(f.sort ?? 0), enabled: !!f.enabled, saving: false };
}

function typeName(t: string): string {
  return locale.t('feedbackManage.faqType_' + (FAQ_TYPES.includes(t) ? t : 'general'));
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const r = await fetchFaqPage(100, 0);
    rows.value = r.items.map(toRow);
  } catch (e: any) {
    error.value = e?.message || locale.t('feedbackManage.opFailed');
  } finally {
    loading.value = false;
  }
}

function onAdd() {
  rows.value.unshift({ key: keySeq++, id: '', title: '', content: '', type: 'general', sort: '0', enabled: true, saving: false });
}

function onTypeChange(idx: number, e: any) {
  const i = Number(e.detail.value) || 0;
  rows.value[idx].type = FAQ_TYPES[i] || 'general';
}

function onToggleEnabled(idx: number, e: any) {
  const row = rows.value[idx];
  row.enabled = !!e.detail.value;
  // 已保存的条目：切换即持久化；新卡片仅改本地态，随保存提交
  if (row.id) void doSave(idx);
}

async function doSave(idx: number): Promise<boolean> {
  const row = rows.value[idx];
  const title = row.title.trim();
  const content = row.content.trim();
  if (!title) { toast(locale.t('feedbackManage.faqTitleRequired')); return false; }
  if (!content) { toast(locale.t('feedbackManage.faqContentRequired')); return false; }
  row.saving = true;
  try {
    const saved = await saveFaq({
      id: row.id || undefined,
      title,
      content,
      type: row.type,
      sort: Number(row.sort) || 0,
      enabled: row.enabled,
    });
    const i = rows.value.findIndex((r) => r.key === row.key);
    if (i >= 0) rows.value[i] = toRow(saved);
    return true;
  } catch (e: any) {
    toast(e?.message || locale.t('feedbackManage.opFailed'));
    return false;
  } finally {
    row.saving = false;
  }
}

async function onSave(idx: number) {
  const ok = await doSave(idx);
  if (ok) toast(locale.t('feedbackManage.faqSaveOk'));
}

function onDelete(idx: number) {
  const row = rows.value[idx];
  uni.showModal({
    title: locale.t('feedbackManage.faqDeleteTitle'),
    content: locale.t('feedbackManage.faqDeleteContent'),
    success: (res) => {
      if (!res.confirm) return;
      deleteFaq(row.id)
        .then(() => {
          rows.value = rows.value.filter((r) => r.key !== row.key);
          toast(locale.t('feedbackManage.faqDeleteOk'));
        })
        .catch((e: any) => toast(e?.message || locale.t('feedbackManage.opFailed')));
    },
  });
}

function onCancelNew(idx: number) {
  const row = rows.value[idx];
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
  .toolbar { display: flex; justify-content: flex-end; margin-bottom: 20rpx;
    .add-btn { margin: 0; padding: 0 32rpx; height: 64rpx; line-height: 64rpx; font-size: 26rpx;
      border-radius: $wa-radius; background: $wa-accent; color: #fff; } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    display: flex; flex-direction: column; gap: 16rpx;
    .row { display: flex; align-items: center; justify-content: space-between; }
    .type-badge { font-size: 24rpx; color: #2563eb; background: #e7eefc; border-radius: 999rpx; padding: 6rpx 20rpx; }
    .switch-row { display: flex; align-items: center; gap: 8rpx;
      .switch-label { font-size: 24rpx; color: $wa-muted; } }
    .fld { height: 72rpx; background: $wa-bg; border-radius: $wa-radius; padding: 0 20rpx; font-size: 26rpx; color: $wa-ink;
      &.area { height: 160rpx; padding: 16rpx 20rpx; width: 100%; box-sizing: border-box; line-height: 1.5; }
      &.sort { width: 160rpx; } }
    .sort-label { font-size: 24rpx; color: $wa-muted; }
    .ops { display: flex; gap: 12rpx; margin-top: 4rpx;
      .op { min-width: 140rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
        font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; }
        &.danger { color: #dc2626; } } }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
}
</style>
