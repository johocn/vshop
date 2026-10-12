<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">
        {{ $t('feedbackManage.' + s.label) }}
      </text>
    </view>

    <view class="card" v-for="r in page.items.value" :key="r.id">
      <view class="row">
        <text class="title">{{ r.title }}</text>
        <text class="st" :class="'st-' + r.status">{{ $t('feedbackManage.status_' + r.status) }}</text>
      </view>
      <view class="badges">
        <text class="type-badge">{{ typeName(r.type) }}</text>
        <text class="meta">{{ $t('feedbackManage.customerLabel') }}#{{ r.customerId }}</text>
      </view>
      <text class="content">{{ short(r.content) }}</text>
      <view class="imgs" v-if="imgsOf(r).length">
        <image
          v-for="(src, i) in imgsOf(r)"
          :key="i"
          :src="src"
          class="thumb"
          mode="aspectFill"
          @tap="preview(imgsOf(r), i)"
        />
      </view>
      <text class="meta" v-if="r.contactWay">{{ $t('feedbackManage.contactLabel') }}{{ r.contactWay }}</text>
      <text class="meta">{{ $t('feedbackManage.createdAtLabel') }}{{ fmtTime(r.createdAt) }}</text>
      <text class="meta" v-if="r.handledAt">{{ $t('feedbackManage.handledAtLabel') }}{{ fmtTime(r.handledAt) }}</text>

      <view v-if="r.reply" class="reply">
        <text class="reply-label">{{ $t('feedbackManage.replyLabel') }}</text>
        <text class="reply-text">{{ short(r.reply, 40) }}</text>
        <text class="meta" v-if="r.repliedAt">{{ $t('feedbackManage.repliedAtLabel') }}{{ fmtTime(r.repliedAt) }}</text>
      </view>

      <view class="ops" v-if="r.status === 'pending'">
        <button class="op" @tap="onSetStatus(r, 'processing')">{{ $t('feedbackManage.processBtn') }}</button>
        <button class="op" @tap="openReply(r)">{{ $t('feedbackManage.replyBtn') }}</button>
        <button class="op main" @tap="onSetStatus(r, 'resolved')">{{ $t('feedbackManage.resolveBtn') }}</button>
      </view>
      <view class="ops" v-else-if="r.status === 'processing'">
        <button class="op main" @tap="openReply(r)">{{ $t('feedbackManage.replyBtn') }}</button>
      </view>

      <view v-if="replyFor && replyFor.id === r.id" class="reply-editor">
        <textarea class="ta" v-model="replyFor.text" :placeholder="$t('feedbackManage.replyPlaceholder')" :maxlength="2000" />
        <view class="chk" @tap="replyFor.resolve = !replyFor.resolve">
          <view class="box" :class="{ on: replyFor.resolve }"><text v-if="replyFor.resolve" class="tick">✓</text></view>
          <text class="chk-label">{{ $t('feedbackManage.replyResolveToo') }}</text>
        </view>
        <view class="ops">
          <button class="op" @tap="replyFor = null">{{ $t('feedbackManage.replyCancel') }}</button>
          <button class="op main" :disabled="replySaving" @tap="onReplySubmit(r)">{{ replySaving ? $t('feedbackManage.replySubmitting') : $t('feedbackManage.replySubmit') }}</button>
        </view>
      </view>
    </view>

    <view v-if="page.loading.value" class="empty">{{ $t('feedbackManage.loading') }}</view>
    <view v-else-if="page.error.value" class="empty">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ $t('feedbackManage.retry') }}</text>
    </view>
    <view v-else-if="!page.items.value.length" class="empty">
      {{ cur === 'pending' ? $t('feedbackManage.emptyPending') : $t('feedbackManage.empty') }}
    </view>

    <view class="empty" v-if="page.loadingMore.value">{{ $t('feedbackManage.loadMore') }}</view>
    <view class="empty" v-else-if="page.items.value.length && !page.hasMore.value">{{ $t('feedbackManage.noMore') }}</view>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { useListPage } from '../../../composables/useListPage';
import { fetchFeedbackPage, updateFeedbackStatus, replyFeedback, parseFeedbackImgs, type FeedbackRow } from '../../../apis/feedback';

const locale = useLocaleStore();

// pending 默认（待办入口）
const tabs = [
  { key: 'pending', label: 'tabPending' },
  { key: 'processing', label: 'tabProcessing' },
  { key: 'resolved', label: 'tabResolved' },
  { key: 'ALL', label: 'tabAll' },
];
const cur = ref('pending');

const page = useListPage<FeedbackRow>({
  take: 20,
  immediate: false,
  fetcher: ({ skip, take }) => fetchFeedbackPage({ skip, take, status: cur.value === 'ALL' ? undefined : cur.value }),
});

function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  void page.refresh();
}

function short(s: string, n = 60): string {
  return s && s.length > n ? s.slice(0, n) + '…' : s || '';
}

// 类型徽标兜底：未知 key（词条缺失）原样显示 type 文本，不显示 vue-i18n key 路径
function typeName(type: string): string {
  const key = 'feedbackManage.type_' + type;
  const translated = locale.t(key);
  return translated === key ? type : translated;
}

function imgsOf(r: FeedbackRow): string[] {
  return parseFeedbackImgs(r.imgs);
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

// 回复闭环：pending/processing 行展开编辑器，提交后刷新（新回复会重开 C 端未读角标）
const replyFor = ref<{ id: string; text: string; resolve: boolean } | null>(null);
const replySaving = ref(false);

function openReply(r: FeedbackRow) {
  replyFor.value = { id: r.id, text: '', resolve: r.status === 'pending' };
}

async function onReplySubmit(r: FeedbackRow) {
  if (!replyFor.value) return;
  const reply = replyFor.value.text.trim();
  if (!reply) { toast(locale.t('feedbackManage.replyRequired')); return; }
  replySaving.value = true;
  try {
    await replyFeedback(r.id, reply, replyFor.value.resolve);
    replyFor.value = null;
    toast(locale.t('feedbackManage.replyOk'));
    void page.refresh();
  } catch (e: any) {
    toast(e?.message || locale.t('feedbackManage.opFailed'));
  } finally {
    replySaving.value = false;
  }
}

function onSetStatus(r: FeedbackRow, status: string) {
  uni.showModal({
    title: locale.t('feedbackManage.statusTitle'),
    content: locale.t('feedbackManage.statusContent')
      .replace('{title}', r.title)
      .replace('{status}', locale.t('feedbackManage.status_' + status)),
    success: (res) => {
      if (!res.confirm) return;
      updateFeedbackStatus(r.id, status)
        .then(() => {
          toast(locale.t('feedbackManage.opOk'));
          void page.refresh();
        })
        .catch((e: any) => toast(e?.message || locale.t('feedbackManage.opFailed')));
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
  .tabs { display: flex; margin-bottom: 24rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx;
    text { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx; display: flex; flex-direction: column; gap: 12rpx;
    .row { display: flex; align-items: center; justify-content: space-between; }
    .title { font-size: 30rpx; font-weight: 700; color: $wa-ink; flex: 1; margin-right: 16rpx; }
    .st { font-size: 24rpx; border-radius: 999rpx; padding: 4rpx 16rpx; flex-shrink: 0;
      &.st-pending { color: #b45309; background: #fdf3e0; }
      &.st-processing { color: #2563eb; background: #e7eefc; }
      &.st-resolved { color: #16a34a; background: #e6f5ec; } }
    .badges { display: flex; align-items: center; gap: 16rpx; }
    .type-badge { font-size: 22rpx; color: #7c3aed; background: #f1eafd; border-radius: 999rpx; padding: 4rpx 16rpx; }
    .content { font-size: 26rpx; color: $wa-muted; line-height: 1.6; }
    .imgs { display: flex; flex-wrap: wrap; gap: 12rpx;
      .thumb { width: 120rpx; height: 120rpx; border-radius: $wa-radius; } }
    .meta { font-size: 24rpx; color: $wa-muted; }
    .reply { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; display: flex; flex-direction: column; gap: 8rpx;
      .reply-label { font-size: 24rpx; color: #2563eb; font-weight: 600; }
      .reply-text { font-size: 26rpx; color: $wa-ink; line-height: 1.6; } }
    .reply-editor { display: flex; flex-direction: column; gap: 16rpx; padding-top: 16rpx; border-top: 1px dashed #e5e7eb;
      .ta { box-sizing: border-box; width: 100%; height: 180rpx; background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 26rpx; color: $wa-ink; line-height: 1.5; }
      .chk { display: flex; align-items: center; gap: 12rpx;
        .box { width: 32rpx; height: 32rpx; border: 2rpx solid #d1d5db; border-radius: 8rpx; display: flex; align-items: center; justify-content: center;
          &.on { background: $wa-accent; border-color: $wa-accent; } }
        .tick { color: #fff; font-size: 22rpx; line-height: 1; }
        .chk-label { font-size: 24rpx; color: $wa-muted; } } }
    .ops { display: flex; gap: 12rpx; margin-top: 8rpx;
      .op { min-width: 160rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
        font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; } } }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
}
</style>
