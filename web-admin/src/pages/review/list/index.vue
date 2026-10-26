<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">
        {{ $t('review.list.' + s.label) }}
      </text>
    </view>

    <template v-if="cur !== 'appeal'">
    <view class="card" v-for="r in page.items.value" :key="r.id">
      <view class="row">
        <text class="stars">{{ '★'.repeat(r.rating) }}<text class="off">{{ '★'.repeat(5 - r.rating) }}</text></text>
        <text class="st" :class="'st-' + r.status">{{ $t('review.list.status_' + r.status) }}</text>
      </view>
      <text class="meta">{{ customerText(r) }} · {{ $t('review.list.createdAtLabel') }}{{ fmtTime(r.createdAt) }}</text>
      <text class="content">{{ r.content }}</text>
      <view v-if="r.images?.length" class="imgs">
        <image
          v-for="(img, i) in r.images" :key="i" class="thumb" :src="img" mode="aspectFill"
          @tap="previewImages(r.images!, i)"
        />
      </view>
      <view v-if="r.tags?.length" class="chips">
        <text v-for="(t, i) in r.tags" :key="i" class="chip">{{ t }}</text>
      </view>
      <view v-if="r.reply" class="reply">{{ $t('review.list.replyLabel') }}：{{ r.reply }}</view>
      <text class="follow" v-if="r.parentId">{{ $t('review.list.followUpMark') }}</text>
      <!-- 申诉留痕（非申诉页签下也可见） -->
      <view v-if="r.appealStatus" class="appeal" :class="'appeal--' + r.appealStatus">
        <text class="appeal__tag">{{ $t('review.list.appealTag') }} · {{ appealStatusText(r.appealStatus) }}</text>
        <text v-if="r.appealReason" class="appeal__text">{{ $t('review.list.appealReasonLabel') }}{{ r.appealReason }}</text>
        <text v-if="r.appealResult" class="appeal__text">{{ $t('review.list.appealResultLabel') }}{{ r.appealResult }}</text>
      </view>

      <view class="ops" v-if="canApprove(r) || canReject(r) || canReply(r)">
        <button v-if="canApprove(r)" class="op main" @tap="onApprove(r)">{{ $t('review.list.approveBtn') }}</button>
        <button v-if="canReply(r)" class="op main" @tap="onReply(r)">{{ $t('review.list.replyBtn') }}</button>
        <button v-if="canReject(r)" class="op" @tap="onReject(r)">{{ $t('review.list.rejectBtn') }}</button>
      </view>
    </view>
    </template>

    <!-- 差评申诉审核：仅 pending 可操作，通过后评价隐藏 -->
    <template v-if="cur === 'appeal'">
      <view class="filters">
        <text
          v-for="s in APPEAL_STATUSES" :key="s" :class="{ on: appealStatus === s }"
          @tap="onAppealStatus(s)"
        >{{ appealTabLabel(s) }}</text>
      </view>
      <view class="card" v-for="r in appeals" :key="r.id">
        <view class="row">
          <text class="stars">{{ '★'.repeat(r.rating) }}<text class="off">{{ '★'.repeat(5 - r.rating) }}</text></text>
          <text class="st" :class="'ap-' + r.appealStatus">{{ appealStatusText(r.appealStatus) }}</text>
        </view>
        <text class="meta">{{ customerText(r) }} · {{ $t('review.list.appealAtLabel') }}{{ fmtTime(r.appealAt) }}</text>
        <text class="content">{{ r.content }}</text>
        <view v-if="r.images?.length" class="imgs">
          <image
            v-for="(img, i) in r.images" :key="i" class="thumb" :src="img" mode="aspectFill"
            @tap="previewImages(r.images!, i)"
          />
        </view>
        <view class="appeal" :class="'appeal--' + r.appealStatus">
          <text class="appeal__tag">{{ $t('review.list.appealTag') }} · {{ appealStatusText(r.appealStatus) }}</text>
          <text v-if="r.appealReason" class="appeal__text">{{ $t('review.list.appealReasonLabel') }}{{ r.appealReason }}</text>
          <text v-if="r.appealResult" class="appeal__text">{{ $t('review.list.appealResultLabel') }}{{ r.appealResult }}</text>
        </view>
        <view v-if="r.appealImages?.length" class="imgs">
          <image
            v-for="(img, i) in r.appealImages" :key="i" class="thumb" :src="img" mode="aspectFill"
            @tap="previewImages(r.appealImages!, i)"
          />
        </view>
        <view class="ops" v-if="r.appealStatus === 'pending'">
          <button class="op main" @tap="onApproveAppeal(r)">{{ $t('review.list.approveAppealBtn') }}</button>
          <button class="op" @tap="onRejectAppeal(r)">{{ $t('review.list.rejectAppealBtn') }}</button>
        </view>
      </view>
      <view v-if="appealLoading" class="empty">{{ $t('review.list.loading') }}</view>
      <view v-else-if="!appeals.length" class="empty">{{ $t('review.list.emptyAppeal') }}</view>
    </template>

    <view v-if="page.loading.value && cur !== 'appeal'" class="empty">{{ $t('review.list.loading') }}</view>
    <view v-else-if="page.error.value && cur !== 'appeal'" class="empty">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ $t('review.list.retry') }}</text>
    </view>
    <view v-else-if="!page.items.value.length && cur !== 'appeal'" class="empty">
      {{ cur === 'pending' ? $t('review.list.emptyPending') : $t('review.list.empty') }}
    </view>

    <view class="empty" v-if="page.loadingMore.value && cur !== 'appeal'">{{ $t('review.list.loadMore') }}</view>
    <view class="empty" v-else-if="page.items.value.length && !page.hasMore.value && cur !== 'appeal'">{{ $t('review.list.noMore') }}</view>
    <view class="progress" v-if="page.total.value && cur !== 'appeal'">
      {{ $t('review.list.shown').replace('{n}', String(page.shown.value)).replace('{m}', String(page.total.value)) }}
    </view>

    <!-- 申诉审核弹窗（自绘：H5 原生 editable 弹窗内容与输入框会重叠） -->
    <view v-if="appealDialog" class="am-mask" @tap="closeAppealDialog">
      <view class="am-sheet" @tap.stop>
        <text class="am-sheet__title">{{ $t('review.list.' + (appealDialog.kind === 'approve' ? 'approveAppealTitle' : 'rejectAppealTitle')) }}</text>
        <text class="am-sheet__desc">{{ $t('review.list.' + (appealDialog.kind === 'approve' ? 'approveAppealContent' : 'rejectAppealContent')) }}</text>
        <textarea
          class="am-sheet__area" v-model="appealNote" :maxlength="200"
          :placeholder="$t('review.list.appealNotePlaceholder')"
        />
        <view class="am-sheet__ops">
          <button class="am-btn" :disabled="appealBusy" @tap="closeAppealDialog">{{ $t('review.list.cancel') }}</button>
          <button class="am-btn main" :disabled="appealBusy" @tap="submitAppealDialog">{{ $t('review.list.confirm') }}</button>
        </view>
      </view>
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
import {
  fetchReviewPage, approveReview, rejectReview, replyReview,
  fetchReviewAppeals, approveReviewAppeal, rejectReviewAppeal,
  type ReviewRow,
} from '../../../apis/review';

const locale = useLocaleStore();

// status 页签：pending 默认（先审后显的待办入口）；appeal 为差评申诉专列（另一套查询）
const tabs = [
  { key: 'pending', label: 'tabPending' },
  { key: 'approved', label: 'tabApproved' },
  { key: 'rejected', label: 'tabRejected' },
  { key: 'all', label: 'tabAll' },
  { key: 'appeal', label: 'tabAppeal' },
];
const cur = ref('pending');

const page = useListPage<ReviewRow>({
  take: 20,
  immediate: false,
  fetcher: ({ skip, take }) => fetchReviewPage({ skip, take, status: cur.value === 'all' ? undefined : cur.value }),
});

/** 申诉页签独立数据源（默认只看待处理，便于审核待办） */
const APPEAL_STATUSES = ['pending', 'approved', 'rejected'];
const appeals = ref<ReviewRow[]>([]);
const appealLoading = ref(false);
const appealStatus = ref('pending');

function appealTabLabel(s: string): string {
  return locale.t('review.list.tab' + s.charAt(0).toUpperCase() + s.slice(1));
}

function onAppealStatus(s: string) {
  if (appealStatus.value === s) return;
  appealStatus.value = s;
  void loadAppeals();
}

async function loadAppeals() {
  appealLoading.value = true;
  try {
    const res = await fetchReviewAppeals({ skip: 0, take: 50, status: appealStatus.value || undefined });
    appeals.value = res.items;
  } catch (e: any) {
    toast(e?.message || locale.t('review.list.opFailed'));
  } finally {
    appealLoading.value = false;
  }
}

function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  if (key === 'appeal') void loadAppeals();
  else void page.refresh();
}

function appealStatusText(s?: string | null): string {
  return s ? locale.t('review.list.appealStatus_' + s) : '';
}

// 通过/驳回/回复的可用矩阵：追评（parentId 非空）不给回复入口
function canApprove(r: ReviewRow): boolean {
  return r.status === 'pending' || r.status === 'rejected';
}
function canReject(r: ReviewRow): boolean {
  return r.status === 'pending' || r.status === 'approved';
}
function canReply(r: ReviewRow): boolean {
  return r.status === 'approved' && !r.parentId;
}

function customerText(r: ReviewRow): string {
  if (r.isAnonymous) return locale.t('review.list.anonymous');
  return r.customerName || locale.t('review.list.customerFallback');
}

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function previewImages(images: string[], current: number) {
  uni.previewImage({ urls: images, current });
}

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}

async function run(action: () => Promise<unknown>, okMsg: string) {
  try {
    await action();
    uni.showToast({ title: okMsg, icon: 'success' });
    await page.refresh();
  } catch (e: any) {
    toast(e?.message || locale.t('review.list.opFailed'));
  }
}

function onApprove(r: ReviewRow) {
  uni.showModal({
    title: locale.t('review.list.approveTitle'),
    content: locale.t('review.list.approveContent'),
    success: (res) => { if (res.confirm) void run(() => approveReview(r.id), locale.t('review.list.approved')); },
  });
}

function onReject(r: ReviewRow) {
  uni.showModal({
    title: locale.t('review.list.rejectTitle'),
    content: locale.t('review.list.rejectContent'),
    success: (res) => { if (res.confirm) void run(() => rejectReview(r.id), locale.t('review.list.rejected')); },
  });
}

function onReply(r: ReviewRow) {
  uni.showModal({
    title: locale.t('review.list.replyTitle'),
    editable: true,
    placeholderText: locale.t('review.list.replyPlaceholder'),
    success: (res) => {
      if (!res.confirm) return;
      const reply = (res.content || '').trim();
      if (!reply) { toast(locale.t('review.list.replyEmpty')); return; }
      void run(() => replyReview(r.id, reply), locale.t('review.list.replied'));
    },
  });
}

/** 申诉审核：自绘弹窗（确认说明 + 审核说明选填） */
const appealDialog = ref<{ row: ReviewRow; kind: 'approve' | 'reject' } | null>(null);
const appealNote = ref('');
const appealBusy = ref(false);

function askAppealDecision(r: ReviewRow, kind: 'approve' | 'reject') {
  appealNote.value = '';
  appealDialog.value = { row: r, kind };
}

function closeAppealDialog() {
  if (appealBusy.value) return;
  appealDialog.value = null;
  appealNote.value = '';
}

async function submitAppealDialog() {
  const dlg = appealDialog.value;
  if (!dlg || appealBusy.value) return;
  appealBusy.value = true;
  const { row, kind } = dlg;
  const note = appealNote.value.trim();
  try {
    await (kind === 'approve' ? approveReviewAppeal(row.id, note) : rejectReviewAppeal(row.id, note));
    uni.showToast({
      title: locale.t(kind === 'approve' ? 'review.list.appealApproved' : 'review.list.appealRejected'),
      icon: 'success',
    });
    appealDialog.value = null;
    appealNote.value = '';
    await loadAppeals();
  } catch (e: any) {
    toast(e?.message || locale.t('review.list.opFailed'));
  } finally {
    appealBusy.value = false;
  }
}

function onApproveAppeal(r: ReviewRow) {
  askAppealDecision(r, 'approve');
}

function onRejectAppeal(r: ReviewRow) {
  askAppealDecision(r, 'reject');
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
    .stars { font-size: 28rpx; color: #f59e0b; .off { color: #e3e6ea; } }
    .st { font-size: 24rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
      &.st-pending { color: #b45309; background: #fdf3e0; }
      &.st-approved { color: #16a34a; background: #e6f5ec; }
      &.st-rejected, &.st-deleted, &.st-hidden { color: #8a919c; background: #f5f6f8; }
      &.ap-pending { color: #b45309; background: #fdf3e0; }
      &.ap-approved { color: #16a34a; background: #e6f5ec; }
      &.ap-rejected { color: #8a919c; background: #f5f6f8; } }
    .appeal { display: flex; flex-direction: column; gap: 6rpx; border-radius: $wa-radius;
      padding: 14rpx 18rpx; background: $wa-bg; font-size: 24rpx; color: $wa-muted;
      &__tag { color: #b45309; font-weight: 600; }
      &__text { font-size: 24rpx; color: $wa-ink; line-height: 1.5; }
      &--approved { background: #e6f5ec; .appeal__tag { color: #16a34a; } }
      &--rejected { background: #f5f6f8; .appeal__tag { color: $wa-muted; } } }
    .meta { font-size: 24rpx; color: $wa-muted; }
    .content { font-size: 28rpx; color: $wa-ink; line-height: 1.6; }
    .imgs { display: flex; gap: 12rpx; flex-wrap: wrap;
      .thumb { width: 140rpx; height: 140rpx; border-radius: $wa-radius; background: $wa-bg; } }
    .chips { display: flex; gap: 12rpx; flex-wrap: wrap;
      .chip { font-size: 22rpx; color: $wa-accent; background: $wa-bg; border-radius: 999rpx; padding: 6rpx 20rpx; } }
    .reply { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 24rpx; color: $wa-muted; line-height: 1.5; }
    .follow { font-size: 22rpx; color: $wa-muted; }
    .ops { display: flex; gap: 12rpx; flex-wrap: wrap; margin-top: 8rpx;
      .op { min-width: 128rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
        font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; } } }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .filters { display: flex; gap: 12rpx; margin-bottom: 20rpx;
    text { flex: 1; text-align: center; padding: 12rpx 0; font-size: 24rpx; color: $wa-muted;
      background: $wa-card; border-radius: $wa-radius;
      &.on { color: $wa-accent; font-weight: 600; background: #fff7f2; } }
  }
  .progress { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
}

/* 申诉审核弹窗 */
.am-mask { position: fixed; inset: 0; z-index: 200; background: rgba(0, 0, 0, .45);
  display: flex; align-items: center; justify-content: center; padding: 0 48rpx; }
.am-sheet { width: 100%; background: #fff; border-radius: 20rpx; padding: 40rpx 36rpx 28rpx;
  display: flex; flex-direction: column; gap: 18rpx;
  &__title { font-size: 32rpx; font-weight: 700; color: $wa-ink; text-align: center; }
  &__desc { font-size: 26rpx; color: $wa-muted; line-height: 1.55; text-align: center; }
  &__area { width: 100%; height: 150rpx; background: $wa-bg; border-radius: $wa-radius;
    padding: 18rpx 20rpx; font-size: 26rpx; color: $wa-ink; box-sizing: border-box; }
  &__ops { display: flex; gap: 20rpx; margin-top: 8rpx;
    .am-btn { flex: 1; margin: 0; height: 80rpx; line-height: 80rpx; font-size: 28rpx;
      border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
      &.main { background: $wa-accent; color: #fff; }
      &[disabled] { opacity: .5; } } }
}
</style>
