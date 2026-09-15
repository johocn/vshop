<template>
  <view class="page">
    <view class="head">
      <text class="title">四流对账</text>
      <view class="ops">
        <picker mode="date" :value="pickDate" @change="onPickDate">
          <view class="btn ghost">{{ pickDate }} ▾</view>
        </picker>
        <text class="btn primary" @tap="onRun">立即对账</text>
      </view>
    </view>

    <view class="sum" v-if="batches.length">
      <view class="sum-kpi">
        <text class="kpi-num">{{ closedRate }}%</text>
        <text class="kpi-label">全闭环率</text>
      </view>
      <view class="sum-kpi">
        <text class="kpi-num">{{ batches.length }}</text>
        <text class="kpi-label">批次</text>
      </view>
      <view class="sum-kpi">
        <text class="kpi-num">{{ totalOrders }}</text>
        <text class="kpi-label">核对订单</text>
      </view>
    </view>

    <view class="card" v-for="b in batches" :key="b.id" @tap="openBatch(b)">
      <view class="row">
        <text class="name">{{ b.date }}</text>
        <text class="tag" :class="b.status">{{ b.status === 'done' ? '已完成' : '运行中' }}</text>
      </view>
      <view class="row sub">
        <text class="diff" :class="{ on: b.d1Count }">D1 缺配送 {{ b.d1Count }}</text>
        <text class="diff" :class="{ on: b.d2Count }">D2 扣仓 {{ b.d2Count }}</text>
        <text class="diff" :class="{ on: b.d3Count }">D3 金额 {{ b.d3Count }}</text>
        <text class="diff" :class="{ on: b.d4Count }">D4 镜像 {{ b.d4Count }}</text>
      </view>
    </view>
    <view v-if="!batches.length" class="empty">暂无对账批次，点「立即对账」开始</view>

    <view class="mask" v-if="linesVisible" @tap="linesVisible = false">
      <view class="pop" @tap.stop>
        <view class="pop-head">
          <text class="pop-title">批次明细 {{ currentBatch ? currentBatch.date : '' }}</text>
          <text class="pop-close" @tap="linesVisible = false">×</text>
        </view>
        <scroll-view scroll-y class="pop-scroll">
          <view class="line" v-for="l in lines" :key="l.id">
            <view class="line-info">
              <text class="line-order">单 {{ l.orderId }}</text>
              <view class="line-diffs">
                <text v-for="d in diffLabels(l.diffTypes)" :key="d.code" class="diff-tag" :class="d.code">{{ d.label }}</text>
                <text v-if="!l.diffTypes || l.diffTypes === '[]'" class="diff-tag none">无差异</text>
              </view>
            </view>
            <text class="link" @tap="onRerun(l)">{{ l.status === 'closed' ? '已闭环' : '重跑' }}</text>
          </view>
          <view v-if="!lines.length" class="empty">该批次无差异行</view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  fetchBatches, fetchLines, runReconciliation, rerunLine,
  type ReconcileBatch, type ReconcileLine,
} from '../../../apis/reconcile';
import { graphQlErrorMsg } from '../../../apis/client';

const batches = ref<ReconcileBatch[]>([]);
const lines = ref<ReconcileLine[]>([]);
const linesVisible = ref(false);
const currentBatch = ref<ReconcileBatch | null>(null);
const pickDate = ref(new Date().toISOString().slice(0, 10));

const totalOrders = computed(() => batches.value.reduce((s, b) => s + b.orderTotal, 0));
const closedRate = computed(() => {
  const total = totalOrders.value;
  if (!total) return 0;
  const closed = batches.value.reduce(
    (s, b) => s + Math.max(0, b.orderTotal - b.d1Count - b.d2Count - b.d3Count - b.d4Count),
    0,
  );
  return Math.round((closed / total) * 100);
});

const DIFF_META: Record<string, string> = {
  D1: '缺配送', D2: '扣仓', D3: '金额', D4: '镜像',
};

function diffLabels(json: string): Array<{ code: string; label: string }> {
  try {
    const arr = JSON.parse(json || '[]') as string[];
    return arr.filter((d) => DIFF_META[d]).map((d) => ({ code: d, label: `${d} ${DIFF_META[d]}` }));
  } catch {
    return [];
  }
}

async function load() {
  batches.value = await fetchBatches();
}

async function onRun() {
  uni.showLoading({ title: '对账中…', mask: true });
  try {
    const b = await runReconciliation(pickDate.value);
    if (!b) {
      uni.showToast({ title: `${pickDate.value} 当日批次已完成（幂等跳过）`, icon: 'none' });
    } else {
      uni.showToast({ title: '对账完成', icon: 'none' });
    }
    await load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '对账失败'), icon: 'none' });
  } finally {
    uni.hideLoading();
  }
}

function onPickDate(e: any) {
  pickDate.value = e.detail.value;
}

async function openBatch(b: ReconcileBatch) {
  currentBatch.value = b;
  linesVisible.value = true;
  try {
    lines.value = await fetchLines(b.id);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '加载明细失败'), icon: 'none' });
    linesVisible.value = false;
  }
}

async function onRerun(l: ReconcileLine) {
  if (l.status === 'closed') return;
  try {
    await rerunLine(l.id);
    uni.showToast({ title: '已重跑', icon: 'none' });
    if (currentBatch.value) {
      lines.value = await fetchLines(currentBatch.value.id);
    }
    await load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '重跑失败'), icon: 'none' });
  }
}

onShow(load);
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.title { font-size: 34rpx; font-weight: 700; }
.ops { display: flex; align-items: center; gap: 16rpx; }
.btn { padding: 10rpx 24rpx; border-radius: 999rpx; font-size: 24rpx; }
.btn.ghost { background: #fff; color: #666; border: 1px solid #eee; }
.btn.primary { background: $pm-info; color: #fff; }
.sum { display: flex; background: #fff; border-radius: 20rpx; padding: 28rpx 0; margin-bottom: 20rpx; }
.sum-kpi { flex: 1; text-align: center; }
.kpi-num { display: block; font-size: 40rpx; font-weight: 700; color: $pm-info; }
.kpi-label { display: block; font-size: 22rpx; color: #999; margin-top: 6rpx; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; margin-bottom: 20rpx; }
.row { display: flex; justify-content: space-between; align-items: center; }
.row.sub { margin-top: 16rpx; flex-wrap: wrap; gap: 10rpx; }
.name { font-size: 30rpx; font-weight: 700; }
.tag { font-size: 22rpx; padding: 4rpx 18rpx; border-radius: 999rpx; background: #f2f2f2; color: #999; }
.tag.done { background: #e8f8f0; color: #07c160; }
.diff { font-size: 22rpx; color: #bbb; }
.diff.on { color: #e64340; font-weight: 600; }
.empty { text-align: center; color: #bbb; padding: 60rpx 0; font-size: 26rpx; }
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 640rpx; max-height: 70vh; background: #fff; border-radius: 20rpx; padding: 32rpx; display: flex; flex-direction: column; }
.pop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
.pop-title { font-size: 30rpx; font-weight: 700; }
.pop-close { font-size: 36rpx; color: #999; line-height: 1; padding: 8rpx; }
.pop-scroll { flex: 1; min-height: 0; }
.line { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.line-info { flex: 1; min-width: 0; }
.line-order { display: block; font-size: 26rpx; font-weight: 600; word-break: break-all; }
.line-diffs { display: flex; flex-wrap: wrap; gap: 8rpx; margin-top: 8rpx; }
.diff-tag { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; background: #fdecec; color: #e64340; }
.diff-tag.none { background: #e8f8f0; color: #07c160; }
.link { flex: 0 0 auto; font-size: 26rpx; color: #e64340; }
</style>
