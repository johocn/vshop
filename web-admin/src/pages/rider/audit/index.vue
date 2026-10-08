<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">
        {{ $t('rider.audit.' + s.label) }}
      </text>
    </view>

    <view class="card" v-for="r in page.items.value" :key="r.id">
      <view class="row">
        <text class="name">{{ r.customFields.riderRealName || nameFallback(r) }}</text>
        <text class="st" :class="'st-' + (r.customFields.riderStatus || 'none')">
          {{ $t('rider.audit.status_' + (r.customFields.riderStatus || 'none')) }}
        </text>
      </view>
      <text class="meta">{{ $t('rider.audit.account') }}{{ r.emailAddress }}</text>
      <text class="meta" v-if="r.customFields.riderStudentNo">{{ $t('rider.audit.studentNo') }}{{ r.customFields.riderStudentNo }}</text>
      <text class="meta" v-if="r.customFields.riderCampus">{{ $t('rider.audit.campus') }}{{ r.customFields.riderCampus }}</text>
      <text class="meta">{{ $t('rider.audit.credit') }}{{ r.customFields.riderCredit ?? '—' }}</text>

      <view class="idimg" v-if="r.customFields.riderIdImg" @tap="preview(r)">
        <image :src="r.customFields.riderIdImg" mode="aspectFill" />
        <text>{{ $t('rider.audit.idImgLabel') }}</text>
      </view>

      <view class="ops" v-if="r.customFields.riderStatus === 'pending'">
        <button class="op main" @tap="onApprove(r)">{{ $t('rider.audit.approveBtn') }}</button>
        <button class="op" @tap="onReject(r)">{{ $t('rider.audit.rejectBtn') }}</button>
      </view>
      <view class="ops" v-else-if="r.customFields.riderStatus === 'approved'">
        <button class="op" @tap="onSuspend(r)">{{ $t('rider.audit.suspendBtn') }}</button>
      </view>
      <view class="ops" v-else-if="r.customFields.riderStatus === 'suspended'">
        <button class="op main" @tap="onRestore(r)">{{ $t('rider.audit.restoreBtn') }}</button>
      </view>
    </view>

    <view v-if="page.loading.value" class="empty">{{ $t('rider.audit.loading') }}</view>
    <view v-else-if="page.error.value" class="empty">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ $t('rider.audit.retry') }}</text>
    </view>
    <view v-else-if="!page.items.value.length" class="empty">
      {{ cur === 'pending' ? $t('rider.audit.emptyPending') : $t('rider.audit.empty') }}
    </view>

    <view style="height: 160rpx" />
    <BottomBar current="order" />
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import { useListPage } from '../../../composables/useListPage';
import { fetchRiderApplications, campusSetRiderStatus, type RiderApplicationRow } from '../../../apis/rider-audit';

const locale = useLocaleStore();

// pending 默认（待办入口）；approved/suspended 也可在对应页签继续操作
const tabs = [
  { key: 'pending', label: 'tabPending' },
  { key: 'approved', label: 'tabApproved' },
  { key: 'suspended', label: 'tabSuspended' },
];
const cur = ref('pending');

const page = useListPage<RiderApplicationRow>({
  take: 50,
  immediate: false,
  // F8 后端分页：resolver 返回 { items, total }
  fetcher: async (p) => {
    return await fetchRiderApplications(cur.value, p.skip, p.take);
  },
});

function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  void page.refresh();
}

function nameFallback(r: RiderApplicationRow): string {
  const n = [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
  return n || r.emailAddress;
}

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}

function preview(r: RiderApplicationRow) {
  const url = r.customFields.riderIdImg;
  if (url) uni.previewImage({ urls: [url] });
}

async function run(action: () => Promise<unknown>, okMsg: string) {
  try {
    await action();
    uni.showToast({ title: okMsg, icon: 'success' });
    await page.refresh();
  } catch (e: any) {
    toast(e?.response?.errors?.[0]?.message || e?.message || locale.t('rider.audit.opFailed'));
  }
}

function onApprove(r: RiderApplicationRow) {
  uni.showModal({
    title: locale.t('rider.audit.approveTitle'),
    content: (locale.t('rider.audit.approveContent') as string).replace('{name}', r.customFields.riderRealName || nameFallback(r)),
    success: (res) => {
      if (res.confirm) void run(() => campusSetRiderStatus(r.id, 'approved'), locale.t('rider.audit.approveOk'));
    },
  });
}

function onReject(r: RiderApplicationRow) {
  uni.showModal({
    title: locale.t('rider.audit.rejectTitle'),
    content: (locale.t('rider.audit.rejectContent') as string).replace('{name}', r.customFields.riderRealName || nameFallback(r)),
    success: (res) => {
      if (res.confirm) void run(() => campusSetRiderStatus(r.id, 'none'), locale.t('rider.audit.rejectOk'));
    },
  });
}

function onSuspend(r: RiderApplicationRow) {
  uni.showModal({
    title: locale.t('rider.audit.suspendTitle'),
    content: (locale.t('rider.audit.suspendContent') as string).replace('{name}', r.customFields.riderRealName || nameFallback(r)),
    success: (res) => {
      if (res.confirm) void run(() => campusSetRiderStatus(r.id, 'suspended'), locale.t('rider.audit.suspendOk'));
    },
  });
}

function onRestore(r: RiderApplicationRow) {
  uni.showModal({
    title: locale.t('rider.audit.restoreTitle'),
    content: (locale.t('rider.audit.restoreContent') as string).replace('{name}', r.customFields.riderRealName || nameFallback(r)),
    success: (res) => {
      if (res.confirm) void run(() => campusSetRiderStatus(r.id, 'approved'), locale.t('rider.audit.restoreOk'));
    },
  });
}

onLoad(() => {
  void page.refresh();
});
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .tabs { display: flex; margin-bottom: 24rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx;
    text { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx; display: flex; flex-direction: column; gap: 12rpx;
    .row { display: flex; align-items: center; justify-content: space-between; }
    .name { font-size: 32rpx; font-weight: 700; color: $wa-ink; }
    .st { font-size: 24rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
      &.st-pending { color: #b45309; background: #fdf3e0; }
      &.st-approved { color: #16a34a; background: #e6f5ec; }
      &.st-suspended { color: #b91c1c; background: #fdeaea; }
      &.st-none { color: #8a919c; background: #f5f6f8; } }
    .meta { font-size: 24rpx; color: $wa-muted; }
    .idimg { display: flex; align-items: center; gap: 16rpx;
      image { width: 160rpx; height: 120rpx; border-radius: $wa-radius; background: $wa-bg; }
      text { font-size: 24rpx; color: $wa-accent; } }
    .ops { display: flex; gap: 12rpx; margin-top: 8rpx;
      .op { min-width: 160rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
        font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; } } }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
}
</style>
