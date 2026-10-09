<template>
  <view class="page">
    <view class="card" v-for="r in page.items.value" :key="r.id">
      <view class="row">
        <image
          v-if="firstImg(r)"
          :src="firstImg(r)"
          class="thumb"
          mode="aspectFill"
          @tap="preview(imgsOf(r), 0)"
        />
        <view class="main" :class="{ 'main--noimg': !firstImg(r) }">
          <view class="row">
            <text class="title">{{ r.title || short(r.content) }}</text>
            <text class="st" :class="'st-' + r.status">{{ $t('circleManage.status_' + r.status) }}</text>
          </view>
          <text class="meta">{{ $t('circleManage.authorLabel') }}#{{ r.customerId }}</text>
          <text class="meta">{{ $t('circleManage.likeLabel') }}{{ r.likeCount }} · {{ $t('circleManage.favoriteLabel') }}{{ r.favoriteCount }}</text>
          <text class="meta">{{ $t('circleManage.createdAtLabel') }}{{ fmtTime(r.createdAt) }}</text>
        </view>
      </view>
      <view class="badges" v-if="r.isPinned">
        <text class="pin-badge">{{ $t('circleManage.pinnedBadge') }}</text>
      </view>

      <view class="ops">
        <button class="op" @tap="onTogglePin(r)">
          {{ $t(r.isPinned ? 'circleManage.unpinBtn' : 'circleManage.pinBtn') }}
        </button>
        <button class="op" :class="{ warn: r.status === 'published' }" @tap="onToggleHide(r)">
          {{ $t(r.status === 'hidden' ? 'circleManage.restoreBtn' : 'circleManage.hideBtn') }}
        </button>
      </view>
    </view>

    <view v-if="page.loading.value" class="empty">{{ $t('circleManage.loading') }}</view>
    <view v-else-if="page.error.value" class="empty">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ $t('circleManage.retry') }}</text>
    </view>
    <view v-else-if="!page.items.value.length" class="empty">{{ $t('circleManage.empty') }}</view>

    <view class="empty" v-if="page.loadingMore.value">{{ $t('circleManage.loadMore') }}</view>
    <view class="empty" v-else-if="page.items.value.length && !page.hasMore.value">{{ $t('circleManage.noMore') }}</view>
  </view>
</template>
<script lang="ts" setup>
import { onLoad } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { useListPage } from '../../../composables/useListPage';
import { fetchCirclePostPage, updateCirclePost, parsePostImages, type CirclePostRow } from '../../../apis/circle';

const locale = useLocaleStore();

// 后端 CirclePostListOptions 仅 skip/take（无 filter），不做状态 tab，全量列表 + 状态徽标
const page = useListPage<CirclePostRow>({
  take: 20,
  immediate: false,
  fetcher: ({ skip, take }) => fetchCirclePostPage({ skip, take }),
});

function imgsOf(r: CirclePostRow): string[] {
  return parsePostImages(r.images);
}
function firstImg(r: CirclePostRow): string {
  return imgsOf(r)[0] || '';
}
function short(s: string): string {
  return s && s.length > 30 ? s.slice(0, 30) + '…' : s || '';
}
function preview(urls: string[], current: number) {
  uni.previewImage({ current, urls });
}

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}

function onTogglePin(r: CirclePostRow) {
  const target = !r.isPinned;
  uni.showModal({
    title: locale.t(target ? 'circleManage.pinTitle' : 'circleManage.unpinTitle'),
    content: locale.t(target ? 'circleManage.pinContent' : 'circleManage.unpinContent'),
    success: (res) => {
      if (!res.confirm) return;
      updateCirclePost({ id: r.id, isPinned: target })
        .then(() => {
          toast(locale.t('circleManage.opOk'));
          void page.refresh();
        })
        .catch((e: any) => toast(e?.message || locale.t('circleManage.opFailed')));
    },
  });
}

function onToggleHide(r: CirclePostRow) {
  const hide = r.status !== 'hidden';
  uni.showModal({
    title: locale.t(hide ? 'circleManage.hideTitle' : 'circleManage.restoreTitle'),
    content: locale.t(hide ? 'circleManage.hideContent' : 'circleManage.restoreContent'),
    success: (res) => {
      if (!res.confirm) return;
      updateCirclePost({ id: r.id, status: hide ? 'hidden' : 'published' })
        .then(() => {
          toast(locale.t('circleManage.opOk'));
          void page.refresh();
        })
        .catch((e: any) => toast(e?.message || locale.t('circleManage.opFailed')));
    },
  });
}

onLoad(() => {
  void page.refresh();
});
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx; display: flex; flex-direction: column; gap: 12rpx;
    .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx; }
    .thumb { width: 140rpx; height: 140rpx; border-radius: $wa-radius; flex-shrink: 0; }
    .main { flex: 1; display: flex; flex-direction: column; gap: 8rpx; min-width: 0;
      &--noimg { margin-left: 0; } }
    .title { font-size: 30rpx; font-weight: 700; color: $wa-ink; flex: 1; margin-right: 16rpx; }
    .st { font-size: 24rpx; border-radius: 999rpx; padding: 4rpx 16rpx; flex-shrink: 0;
      &.st-published { color: #16a34a; background: #e6f5ec; }
      &.st-hidden { color: #8a919c; background: #f5f6f8; } }
    .badges { display: flex; }
    .pin-badge { font-size: 22rpx; color: #b45309; background: #fdf3e0; border-radius: 999rpx; padding: 4rpx 16rpx; }
    .meta { font-size: 24rpx; color: $wa-muted; }
    .ops { display: flex; gap: 12rpx; margin-top: 8rpx;
      .op { min-width: 160rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
        font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.warn { color: #b45309; } } }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
}
</style>
