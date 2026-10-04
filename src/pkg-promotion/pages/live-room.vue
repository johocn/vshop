<template>
  <view class="page">
    <!-- 播放区 -->
    <view class="player">
      <template v-if="canPlay">
        <!-- #ifdef H5 -->
        <video ref="videoRef" class="video" controls autoplay playsinline @error="h5PlayError = true"></video>
        <view v-if="h5PlayError" class="retry" @click="setupH5Player"><text>加载失败，点击重试</text></view>
        <!-- #endif -->
        <!-- #ifndef H5 -->
        <video
          :id="'player-' + roomId"
          class="video"
          :src="playUrl || ''"
          controls
          autoplay
          object-fit="contain"
        />
        <!-- #endif -->
      </template>
      <view v-else class="no-live">
        <template v-if="platforms.length">
          <image v-if="room.coverUrl" class="no-live-cover" :src="room.coverUrl" mode="aspectFill" />
          <text v-if="firstPlatform" class="go-btn" @click="onPlatformTap(firstPlatform)">前往{{ platformLabel(firstPlatform.platform) }}观看</text>
        </template>
        <text v-else>{{ room.status === 'ended' ? '直播已结束' : '直播未开始' }}</text>
      </view>
      <view v-if="platforms.length" class="pills">
        <text v-for="p in platforms" :key="p.platform" class="pill" :class="'p-' + p.platform" @click="onPlatformTap(p)">{{ platformLabel(p.platform) }}</text>
      </view>
      <view class="head">
        <text class="h-name">{{ room.name }}</text>
        <view class="h-meta">
          <text class="h-online">{{ onlineCount }} 人在看</text>
          <text class="h-status">{{ statusLabel }}</text>
        </view>
      </view>
    </view>

    <!-- 互动：弹幕 + 点赞 + 关注 -->
    <view class="interact">
      <view v-if="sysTip" class="sys-tip"><text>{{ sysTip }}</text></view>
      <scroll-view scroll-y class="danmaku">
        <view v-for="(d, i) in danmakuList" :key="i" class="d-item">
          <text class="d-user">{{ d.user }}:</text>
          <text class="d-text">{{ d.text }}</text>
        </view>
      </scroll-view>
      <view class="actions">
        <input v-model="inputText" class="input" placeholder="说点什么…" confirm-type="send" @confirm="sendDanmaku" />
        <text class="btn" @click="sendDanmaku">发送</text>
        <view class="like-wrap">
          <text class="btn" @click="sendLike">赞 {{ likeCount }}</text>
          <text v-for="h in hearts" :key="h.id" class="heart" :style="{ left: (h.id % 3) * 24 + 'rpx' }">♥</text>
        </view>
        <text class="btn" @click="sendFollow">关注</text>
      </view>
    </view>

    <!-- 商品货架 -->
    <view class="shelf">
      <view v-for="p in products" :key="p.id" class="p-item" @click="buy(p)">
        <image class="p-img" :src="p.imageUrl" mode="aspectFill" />
        <text class="p-name">{{ p.name }}</text>
        <text class="p-price">¥{{ (p.price / 100).toFixed(2) }}</text>
      </view>
    </view>

    <!-- 视频号引导弹层（H5） -->
    <view v-if="wxSheet" class="sheet-mask" @click="wxSheet = null">
      <view class="sheet" @click.stop>
        <view class="sheet-head">
          <text class="sheet-title">观看视频号直播</text>
          <text class="sheet-x" @click="wxSheet = null">✕</text>
        </view>
        <text class="sheet-name">@{{ wxSheet.finder }}</text>
        <view class="sheet-steps">
          <text>1. 点击下方复制视频号名</text>
          <text>2. 打开微信 → 搜一搜</text>
          <text>3. 进入视频号观看直播</text>
        </view>
        <view class="sheet-btn" @click="copyWxChannels"><text>复制视频号名</text></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';
import { getLiveRoom, enterLiveRoom, setOrderLiveRoom } from '../../api/queries/live';
import { addItemToOrder } from '../../api/mutations/cart';
import { useUIStore } from '../../stores/ui';

const ui = useUIStore();
const roomId = ref<string>('');
const room = ref<any>({});
const playUrl = ref('');
const wsUrl = ref('');
const wsTicket = ref('');
const danmakuList = ref<any[]>([]);
const inputText = ref('');
const likeCount = ref(0);
const onlineCount = ref(0);
const sysTip = ref('');
const hearts = ref<{ id: number }[]>([]);
let socket: Socket | null = null;
let heartId = 0;
let sysTimer: ReturnType<typeof setTimeout> | null = null;

const products = computed(() => room.value?.products || []);
const canPlay = computed(() => !!(playUrl.value && room.value.status === 'live'));
const statusLabel = computed(() => {
  if (room.value.status === 'live') return '直播中';
  if (room.value.status === 'ended') return '已结束';
  return '预告';
});

// ---- 平台分发（双形态 + 平台按钮组 + 视频号引导） ----
const platforms = computed<any[]>(() => room.value?.platforms || []);
const firstPlatform = computed(() => platforms.value[0]);
const PLATFORM_LABELS: Record<string, string> = { douyin: '抖音', kuaishou: '快手', wechat_channels: '视频号' };
function platformLabel(p: string) { return PLATFORM_LABELS[p] || p; }

const wxSheet = ref<{ finder: string } | null>(null);

// #ifdef H5
const videoRef = ref<HTMLVideoElement | null>(null);
const h5PlayError = ref(false);
let hls: any = null;

async function setupH5Player() {
  h5PlayError.value = false;
  const v = videoRef.value;
  if (!v || !playUrl.value) return;
  if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = playUrl.value; return; }
  try {
    const mod: any = await import('hls.js');
    if (!mod.default.isSupported()) return;
    hls?.destroy();
    hls = new mod.default();
    hls.loadSource(playUrl.value);
    hls.attachMedia(v);
  } catch { h5PlayError.value = true; }
}
watch(canPlay, (v) => { if (v) nextTick(setupH5Player); });
// #endif

function isWeixinBrowser() {
  return /MicroMessenger/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');
}

function onPlatformTap(p: any) {
  if (p.platform === 'wechat_channels') { onWxChannelsTap(p); return; }
  // #ifdef H5
  if (isWeixinBrowser()) {
    uni.setClipboardData({ data: p.externalUrl, success: () => ui.showToast('链接已复制，请在浏览器打开', 'success') });
  } else {
    window.location.href = p.externalUrl;
  }
  // #endif
  // #ifndef H5
  uni.setClipboardData({ data: p.externalUrl, success: () => ui.showToast('链接已复制', 'success') });
  // #endif
}

function onWxChannelsTap(p: any) {
  const m = /^wxchannels:\/\/finder=([^&]+)(?:&feed=([^&]+))?/.exec(p.externalUrl || '');
  const finder = m ? decodeURIComponent(m[1]) : '';
  // #ifdef MP-WEIXIN
  if (finder && typeof wx !== 'undefined') {
    const open = (feedId?: string) => wx.openChannelsLive({ finderUserName: finder, feedId });
    if (m?.[2]) { open(decodeURIComponent(m[2])); return; }
    wx.getChannelsLiveInfo({ finderUserName: finder, success: (r: any) => open(r.feedId), fail: () => (wxSheet.value = { finder }) });
    return;
  }
  // #endif
  wxSheet.value = { finder: finder || p.externalUrl };
}

function copyWxChannels() {
  if (!wxSheet.value) return;
  uni.setClipboardData({ data: wxSheet.value.finder, success: () => ui.showToast('视频号名已复制', 'success') });
}

async function load() {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1] as any;
  roomId.value = (page?.options?.id as string) || '';
  if (!roomId.value) { ui.showToast('缺少直播间ID', 'error'); return; }
  try {
    const [r, e]: any[] = await Promise.all([getLiveRoom(roomId.value), enterLiveRoom(roomId.value)]);
    room.value = r?.liveRoom || {};
    const enter = e?.enterLiveRoom || {};
    playUrl.value = enter.playUrl || '';
    wsUrl.value = enter.wsUrl;
    wsTicket.value = enter.wsTicket;
    likeCount.value = room.value.likeCount || 0;
    connectWs();
  } catch (err: any) {
    ui.showToast(err.message || '加载失败', 'error');
  }
}

function connectWs() {
  if (!wsUrl.value) return;
  socket = io(wsUrl.value, {
    transports: ['websocket'],
    query: { roomId: String(roomId.value), ticket: wsTicket.value },
    reconnection: true,
    reconnectionDelay: 2000,
  });
  socket.on('connect', () => console.log('live ws connected'));
  socket.on('history', ({ items }: any) => { danmakuList.value.push(...items); trimDanmaku(); });
  socket.on('danmaku', (m: any) => { danmakuList.value.push(m); trimDanmaku(); });
  socket.on('like', ({ count }: any) => { likeCount.value += count; popHearts(count); });
  socket.on('online', ({ count }: any) => { onlineCount.value = count; });
  socket.on('sys', (m: any) => {
    sysTip.value = m.text;
    if (sysTimer) clearTimeout(sysTimer);
    sysTimer = setTimeout(() => (sysTip.value = ''), 3000);
  });
  socket.on('connect_error', () => { sysTip.value = '互动通道连接中…'; });
}

function sendDanmaku() {
  const text = inputText.value.trim();
  if (!text || !socket) return;
  socket.emit('danmaku', { text });
  inputText.value = '';
}

function sendLike() {
  socket?.emit('like');
}

function sendFollow() {
  ui.showToast('关注成功', 'success');
}

function trimDanmaku() {
  if (danmakuList.value.length > 60) danmakuList.value.splice(0, danmakuList.value.length - 60);
}

function popHearts(n: number) {
  const count = Math.min(Math.max(n, 1), 3);
  for (let i = 0; i < count; i++) {
    if (hearts.value.length >= 6) hearts.value.shift();
    const id = ++heartId;
    hearts.value.push({ id });
    setTimeout(() => {
      const idx = hearts.value.findIndex((h) => h.id === id);
      if (idx > -1) hearts.value.splice(idx, 1);
    }, 1200);
  }
}

async function buy(p: any) {
  // 绑定直播间归因后加入购物车（MVP 直接加入购物车）
  try {
    await setOrderLiveRoom(roomId.value);
  } catch { /* 归因失败不阻断购物 */ }
  try {
    await addItemToOrder(p.variantId, 1);
    ui.showToast('已加入购物车', 'success');
  } catch (e: any) {
    ui.showToast(e.message || '加购失败', 'error');
  }
}

onMounted(load);
onUnmounted(() => {
  socket?.disconnect();
  if (sysTimer) clearTimeout(sysTimer);
  // #ifdef H5
  hls?.destroy();
  hls = null;
  // #endif
});
</script>

<style scoped>
.page { padding-bottom: env(safe-area-inset-bottom); }
.player { position: relative; background: #000; height: 420rpx; }
.video { width: 100%; height: 100%; }
.no-live { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #fff; }
.head { position: absolute; left: 0; right: 0; bottom: 0; padding: 16rpx 24rpx; display: flex; justify-content: space-between; background: linear-gradient(transparent, rgba(0,0,0,.6)); }
.h-name { color: #fff; font-size: 30rpx; font-weight: 600; }
.h-meta { display: flex; align-items: center; gap: 12rpx; }
.h-online { color: #fff; background: rgba(0,0,0,.4); border-radius: 999rpx; padding: 4rpx 20rpx; font-size: 24rpx; }
.h-status { color: #e64340; background: #fff; border-radius: 999rpx; padding: 4rpx 20rpx; font-size: 24rpx; }
.interact { display: flex; flex-direction: column; height: 400rpx; border-bottom: 1rpx solid #eee; }
.danmaku { flex: 1; padding: 16rpx 24rpx; }
.d-item { margin-bottom: 8rpx; font-size: 26rpx; }
.d-user { color: #ff9800; margin-right: 8rpx; }
.d-text { color: #333; }
.actions { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 24rpx; }
.input { flex: 1; border: 1rpx solid #ddd; border-radius: 999rpx; padding: 12rpx 24rpx; font-size: 26rpx; }
.btn { background: #e64340; color: #fff; border-radius: 999rpx; padding: 12rpx 24rpx; font-size: 24rpx; }
.sys-tip { align-self: flex-start; margin: 12rpx 24rpx 0; background: rgba(0,0,0,.75); color: #fff; border-radius: 999rpx; padding: 8rpx 24rpx; font-size: 24rpx; }
.like-wrap { position: relative; }
.heart { position: absolute; bottom: 100%; left: 0; color: #ff5b8d; font-size: 32rpx; pointer-events: none; animation: heart-pop 1.2s ease-out forwards; }
@keyframes heart-pop {
  0% { transform: translateY(0) scale(.6); opacity: 1; }
  100% { transform: translateY(-140rpx) scale(1.3); opacity: 0; }
}
.shelf { padding: 24rpx; }
.p-item { display: flex; gap: 20rpx; background: #fff; border-radius: 12rpx; padding: 16rpx; margin-bottom: 16rpx; }
.p-img { width: 140rpx; height: 140rpx; border-radius: 8rpx; background: #eee; }
.p-name { flex: 1; font-size: 28rpx; }
.p-price { color: #e64340; font-weight: 600; }
/* ---- 平台分发 ---- */
.pills { position: absolute; left: 0; right: 0; bottom: 88rpx; display: flex; gap: 12rpx; justify-content: center; z-index: 3; }
.pill { background: rgba(0,0,0,.55); color: #fff; border-radius: 999rpx; padding: 8rpx 24rpx; font-size: 24rpx; }
.pill.p-wechat_channels { background: #07c160; font-weight: 600; }
.no-live { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx; color: #fff; }
.no-live-cover { position: absolute; left: 0; top: 0; width: 100%; height: 100%; opacity: .55; }
.go-btn { position: relative; background: #07c160; color: #fff; border-radius: 999rpx; padding: 14rpx 44rpx; font-size: 28rpx; font-weight: 600; z-index: 1; }
.retry { position: absolute; left: 0; right: 0; bottom: 140rpx; text-align: center; color: #fff; font-size: 26rpx; z-index: 3; }
.sheet-mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0,0,0,.6); z-index: 99; display: flex; align-items: flex-end; }
.sheet { width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 32rpx; box-sizing: border-box; }
.sheet-head { display: flex; justify-content: space-between; align-items: center; }
.sheet-title { font-size: 30rpx; font-weight: 700; color: #333; }
.sheet-x { color: #999; font-size: 28rpx; padding: 8rpx; }
.sheet-name { display: block; margin: 24rpx 0 8rpx; font-size: 40rpx; font-weight: 700; color: #07c160; }
.sheet-steps { display: flex; flex-direction: column; gap: 8rpx; margin: 16rpx 0 24rpx; }
.sheet-steps text { color: #666; font-size: 26rpx; }
.sheet-btn { background: #07c160; color: #fff; text-align: center; border-radius: 12rpx; padding: 20rpx 0; font-size: 28rpx; font-weight: 700; }
</style>