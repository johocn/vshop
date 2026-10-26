<template>
  <view class="page">
    <view class="head">
      <view class="tabs">
        <text
          v-for="t in TABS" :key="t.key" :class="{ on: tab === t.key }"
          @tap="onTab(t.key)"
        >{{ $t('campusChat.' + t.label) }}<text class="n" v-if="t.key === 'unread' && unread.messageCount">{{ unread.messageCount }}</text></text>
      </view>
      <text class="refresh" @tap="reload()">{{ $t('campusChat.refresh') }}</text>
    </view>

    <view v-if="loading" class="empty">{{ $t('campusChat.loading') }}</view>
    <view v-else-if="!items.length" class="empty">{{ tab === 'unread' ? $t('campusChat.emptyUnread') : $t('campusChat.empty') }}</view>
    <view
      v-for="c in items" :key="c.id" class="card" :class="{ closed: c.status === 'closed' }"
      @tap="openConversation(c)"
    >
      <view class="avatar">{{ (c.customerName || c.customerPhone || '?').slice(0, 1) }}</view>
      <view class="body">
        <view class="row">
          <text class="name">{{ c.customerName || $t('campusChat.customerFallback') }}</text>
          <text class="time">{{ fmtTime(c.lastMessageAt || c.createdAt) }}</text>
        </view>
        <view class="row">
          <text class="sub">
            <text v-if="c.orderCode" class="order">#{{ c.orderCode }}</text>
            <text class="last">{{ c.lastMessage || c.subject || $t('campusChat.noMessage') }}</text>
          </text>
          <text class="badge" v-if="c.unreadForAdmin">{{ c.unreadForAdmin > 99 ? '99+' : c.unreadForAdmin }}</text>
        </view>
        <text class="closed-tag" v-if="c.status === 'closed'">{{ $t('campusChat.statusClosed') }}</text>
      </view>
    </view>

    <view class="empty" v-if="!loading && items.length">{{ $t('campusChat.total').replace('{n}', String(total)) }}</view>
    <view style="height: 40rpx" />

    <!-- 聊天面板（覆盖整屏，轮询增量拉新消息） -->
    <view v-if="active" class="panel">
      <view class="panel__bar">
        <view class="panel__who">
          <text class="panel__name">{{ active.customerName || $t('campusChat.customerFallback') }}</text>
          <text class="panel__sub">
            <text v-if="active.orderCode">#{{ active.orderCode }} · </text>
            <text v-if="active.customerPhone">{{ active.customerPhone }}</text>
          </text>
        </view>
        <text class="panel__close" @tap="closePanel">✕</text>
      </view>
      <view class="panel__meta">
        <text>{{ active.status === 'closed' ? $t('campusChat.panelClosedHint') : $t('campusChat.panelOpenHint') }}</text>
        <text class="panel__end" v-if="active.status !== 'closed'" @tap="endConversation">{{ $t('campusChat.endBtn') }}</text>
      </view>
      <scroll-view class="panel__msgs" scroll-y :scroll-into-view="anchor" :scroll-with-animation="true">
        <view v-for="m in messages" :key="m.id" :id="'m' + m.id" class="msg" :class="m.senderType === 'admin' ? 'msg--mine' : 'msg--theirs'">
          <view class="msg__bubble">
            <text v-if="m.content" class="msg__text">{{ m.content }}</text>
            <view v-if="m.images?.length" class="msg__imgs">
              <image
                v-for="(img, i) in m.images" :key="i" class="msg__img" :src="img" mode="aspectFill"
                @tap="previewImages(m.images!, i)"
              />
            </view>
          </view>
          <text class="msg__time">{{ m.senderType === 'admin' ? $t('campusChat.senderAdmin') : $t('campusChat.senderCustomer') }} · {{ fmtTime(m.createdAt) }}</text>
        </view>
        <view v-if="!messages.length" class="panel__empty">{{ $t('campusChat.noMessage') }}</view>
        <view style="height: 20rpx" />
      </scroll-view>
      <view class="panel__input">
        <textarea
          class="panel__area" v-model="draft" :maxlength="500" auto-height
          :placeholder="$t('campusChat.placeholder')"
        />
        <button class="panel__send" :disabled="!canSend" @tap="send">{{ sending ? $t('campusChat.sending') : $t('campusChat.sendBtn') }}</button>
      </view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../stores/localeStore';
import {
  campusChatConversations,
  campusChatUnread,
  campusAdminChatMessages,
  campusReplyChat,
  campusCloseChatConversation,
  type CampusChatConversationRow,
  type CampusChatMessageRow,
} from '../../apis/campus';

const locale = useLocaleStore();

const TABS = [
  { key: 'all', label: 'tabAll' },
  { key: 'unread', label: 'tabUnread' },
];

const tab = ref('all');
const items = ref<CampusChatConversationRow[]>([]);
const total = ref(0);
const loading = ref(true);
const unread = ref({ conversationCount: 0, messageCount: 0 });

const active = ref<CampusChatConversationRow | null>(null);
const messages = ref<CampusChatMessageRow[]>([]);
const draft = ref('');
const sending = ref(false);
const anchor = ref('');

const POLL_MS = 5000;
let timer: any = null;
let lastId: string | null = null;

const canSend = computed(() => !!draft.value.trim() && !sending.value);

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}

function fmtTime(t?: string | null): string {
  if (!t) return '';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function loadList(silent = false) {
  if (!silent) loading.value = true;
  try {
    const res = await campusChatConversations({
      unreadOnly: tab.value === 'unread',
      skip: 0,
      take: 50,
    });
    items.value = res?.items ?? [];
    total.value = res?.total ?? 0;
    const u = await campusChatUnread();
    unread.value = u;
  } catch (e: any) {
    if (!silent) toast(e?.message || locale.t('campusChat.loadFail'));
  } finally {
    loading.value = false;
  }
}

function reload() {
  void loadList();
}

function onTab(key: string) {
  if (tab.value === key) return;
  tab.value = key;
  void loadList();
}

function scrollToBottom(id: string | number) {
  // scroll-view 需在 DOM 更新后跳转，简单延迟足够（轮询 5s，无长列表压力）
  setTimeout(() => { anchor.value = 'm' + id; }, 50);
}

function openConversation(c: CampusChatConversationRow) {
  active.value = c;
  messages.value = [];
  lastId = null;
  draft.value = '';
  void loadMessages(c.id, true);
}

async function loadMessages(conversationId: string, initial = false) {
  try {
    const rows = await campusAdminChatMessages(conversationId, lastId, 200);
    if (!rows.length) return;
    messages.value = initial ? rows : [...messages.value, ...rows];
    const last = rows[rows.length - 1];
    lastId = last.id;
    scrollToBottom(last.id);
  } catch (e: any) {
    if (initial) toast(e?.message || locale.t('campusChat.loadFail'));
  }
}

async function poll() {
  await loadList(true);
  if (active.value) await loadMessages(active.value.id);
}

function closePanel() {
  active.value = null;
  messages.value = [];
  lastId = null;
  draft.value = '';
}

async function send() {
  const conversation = active.value;
  if (!conversation || !canSend.value) return;
  const content = draft.value.trim();
  sending.value = true;
  try {
    const msg = await campusReplyChat(conversation.id, content);
    messages.value = [...messages.value, msg];
    lastId = msg.id;
    draft.value = '';
    scrollToBottom(msg.id);
    // 回复后会话恢复 open、运营侧待回复清零
    if (conversation.status === 'closed') conversation.status = 'open';
    void loadList(true);
  } catch (e: any) {
    toast(e?.message || locale.t('campusChat.sendFail'));
  } finally {
    sending.value = false;
  }
}

function endConversation() {
  const conversation = active.value;
  if (!conversation) return;
  uni.showModal({
    title: locale.t('campusChat.endTitle'),
    content: locale.t('campusChat.endConfirm'),
    success: async (res) => {
      if (!res.confirm) return;
      try {
        const updated = await campusCloseChatConversation(conversation.id);
        if (active.value?.id === updated.id) active.value = updated;
        toast(locale.t('campusChat.ended'));
        void loadList(true);
      } catch (e: any) {
        toast(e?.message || locale.t('campusChat.opFail'));
      }
    },
  });
}

function previewImages(images: string[], current: number) {
  uni.previewImage({ urls: images, current });
}

onShow(() => {
  void loadList();
  if (timer) clearInterval(timer);
  timer = setInterval(() => { void poll(); }, POLL_MS);
});
onHide(() => {
  if (timer) { clearInterval(timer); timer = null; }
});
onUnload(() => {
  if (timer) { clearInterval(timer); timer = null; }
});
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 24rpx 40rpx;

  .head { display: flex; align-items: center; gap: 16rpx; margin-bottom: 20rpx;
    .tabs { flex: 1; display: flex; background: $wa-card; border-radius: $wa-radius; padding: 8rpx;
      text { flex: 1; text-align: center; padding: 14rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius;
        &.on { color: #fff; background: $wa-accent; font-weight: 600; }
        .n { margin-left: 8rpx; font-size: 20rpx; color: #fff; background: #dc2626; border-radius: 999rpx; padding: 0 10rpx; }
      }
    }
    .refresh { font-size: 24rpx; color: $wa-accent; padding: 10rpx 4rpx; }
  }

  .card { display: flex; gap: 18rpx; background: $wa-card; border-radius: $wa-radius; padding: 22rpx 24rpx; margin-bottom: 16rpx;
    &.closed { opacity: .62; }
    .avatar { width: 72rpx; height: 72rpx; border-radius: 50%; background: $wa-bg; color: $wa-accent;
      display: flex; align-items: center; justify-content: center; font-size: 30rpx; font-weight: 700; flex-shrink: 0; }
    .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx;
      .row { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
      .name { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
      .time { font-size: 22rpx; color: $wa-muted; flex-shrink: 0; }
      .sub { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10rpx; font-size: 24rpx; color: $wa-muted;
        .order { color: $wa-accent; flex-shrink: 0; }
        .last { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      }
      .badge { min-width: 34rpx; height: 34rpx; line-height: 34rpx; text-align: center; padding: 0 8rpx;
        border-radius: 999rpx; background: #dc2626; color: #fff; font-size: 20rpx; flex-shrink: 0; }
      .closed-tag { font-size: 20rpx; color: $wa-muted; }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 60rpx 0; }
}

/* 聊天面板（顶部让出 H5 原生导航栏高度，避免标题被遮挡） */
.panel {
  position: fixed; top: var(--window-top, 44px); left: 0; right: 0; bottom: 0; z-index: 99;
  background: $wa-bg; display: flex; flex-direction: column;

  &__bar { display: flex; align-items: center; justify-content: space-between; gap: 16rpx;
    background: $wa-card; padding: 24rpx 28rpx;
    .panel__who { display: flex; flex-direction: column; gap: 4rpx; }
    .panel__name { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
    .panel__sub { font-size: 22rpx; color: $wa-muted; }
    .panel__close { font-size: 34rpx; color: $wa-muted; padding: 4rpx 8rpx; }
  }
  &__meta { display: flex; align-items: center; justify-content: space-between; gap: 12rpx;
    padding: 14rpx 28rpx; font-size: 22rpx; color: $wa-muted; background: $wa-card;
    border-top: 1rpx solid $wa-bg;
    .panel__end { color: #dc2626; font-size: 24rpx; }
  }
  &__msgs { flex: 1; padding: 20rpx 24rpx; box-sizing: border-box; }
  &__empty { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 80rpx 0; }
  &__input { display: flex; align-items: flex-end; gap: 14rpx; padding: 16rpx 24rpx 28rpx;
    background: $wa-card; border-top: 1rpx solid $wa-bg;
    .panel__area { flex: 1; min-height: 72rpx; max-height: 240rpx; background: $wa-bg; border-radius: $wa-radius;
      padding: 16rpx 20rpx; font-size: 26rpx; color: $wa-ink; box-sizing: border-box; }
    .panel__send { width: 150rpx; height: 72rpx; line-height: 72rpx; padding: 0; margin: 0;
      border-radius: $wa-radius; background: $wa-accent; color: #fff; font-size: 26rpx;
      &[disabled] { opacity: .5; } }
  }
}

.msg { display: flex; flex-direction: column; gap: 6rpx; margin-bottom: 22rpx; max-width: 100%;
  &__bubble { max-width: 78%; padding: 16rpx 20rpx; border-radius: 16rpx; background: $wa-card; }
  &__text { font-size: 26rpx; color: $wa-ink; line-height: 1.55; word-break: break-all; }
  &__imgs { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 10rpx; }
  &__img { width: 150rpx; height: 150rpx; border-radius: 10rpx; background: $wa-bg; }
  &__time { font-size: 20rpx; color: $wa-muted; }
  &--mine { align-items: flex-end; .msg__bubble { background: $wa-accent; .msg__text { color: #fff; } } }
  &--theirs { align-items: flex-start; }
}
</style>
