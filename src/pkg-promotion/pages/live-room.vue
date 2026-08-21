<template>
  <view class="page">
    <!-- 播放区 -->
    <view class="player">
      <video
        v-if="canPlay"
        :id="'player-' + roomId"
        class="video"
        :src="playUrl || ''"
        controls
        autoplay
        :object-fit="'contain'"
      />
      <view v-else class="no-live">
        <text>{{ room.status === 'ended' ? '直播已结束' : '直播未开始' }}</text>
      </view>
      <view class="head">
        <text class="h-name">{{ room.name }}</text>
        <text class="h-status">{{ statusLabel }}</text>
      </view>
    </view>

    <!-- 互动：弹幕 + 点赞 + 关注 -->
    <view class="interact">
      <scroll-view scroll-y class="danmaku">
        <view v-for="(d, i) in danmakuList" :key="i" class="d-item">
          <text class="d-user">{{ d.user }}:</text>
          <text class="d-text">{{ d.text }}</text>
        </view>
      </scroll-view>
      <view class="actions">
        <input v-model="inputText" class="input" placeholder="说点什么…" confirm-type="send" @confirm="sendDanmaku" />
        <text class="btn" @click="sendDanmaku">发送</text>
        <text class="btn" @click="sendLike">赞 {{ likeCount }}</text>
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
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
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
let ws: WebSocket | null = null;

const products = computed(() => room.value?.products || []);
const canPlay = computed(() => !!(playUrl.value && room.value.status === 'live'));
const statusLabel = computed(() => {
  if (room.value.status === 'live') return '直播中';
  if (room.value.status === 'ended') return '已结束';
  return '预告';
});

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
  try {
    ws = new WebSocket(wsUrl.value);
    ws.onopen = () => ws!.send(JSON.stringify({ type: 'join', ticket: wsTicket.value }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'welcome') {
        danmakuList.value = msg.history || [];
        likeCount.value = msg.likes ?? likeCount.value;
      } else if (msg.type === 'danmaku') {
        danmakuList.value.push(msg);
        if (danmakuList.value.length > 50) danmakuList.value.splice(0, danmakuList.value.length - 50);
      } else if (msg.type === 'likes') {
        likeCount.value = msg.count;
      }
    };
  } catch (e) { /* ws 失败不影响页面 */ }
}

function sendDanmaku() {
  const text = inputText.value.trim();
  if (!text || !ws) return;
  ws.send(JSON.stringify({ type: 'danmaku', text }));
  inputText.value = '';
}

function sendLike() {
  if (!ws) return;
  ws.send(JSON.stringify({ type: 'like' }));
}

function sendFollow() {
  if (!ws) return;
  ws.send(JSON.stringify({ type: 'follow' }));
  ui.showToast('关注成功', 'success');
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
onUnmounted(() => { ws?.close(); });
</script>

<style scoped>
.page { padding-bottom: env(safe-area-inset-bottom); }
.player { position: relative; background: #000; height: 420rpx; }
.video { width: 100%; height: 100%; }
.no-live { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #fff; }
.head { position: absolute; left: 0; right: 0; bottom: 0; padding: 16rpx 24rpx; display: flex; justify-content: space-between; background: linear-gradient(transparent, rgba(0,0,0,.6)); }
.h-name { color: #fff; font-size: 30rpx; font-weight: 600; }
.h-status { color: #e64340; background: #fff; border-radius: 999rpx; padding: 4rpx 20rpx; font-size: 24rpx; }
.interact { display: flex; flex-direction: column; height: 400rpx; border-bottom: 1rpx solid #eee; }
.danmaku { flex: 1; padding: 16rpx 24rpx; }
.d-item { margin-bottom: 8rpx; font-size: 26rpx; }
.d-user { color: #ff9800; margin-right: 8rpx; }
.d-text { color: #333; }
.actions { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 24rpx; }
.input { flex: 1; border: 1rpx solid #ddd; border-radius: 999rpx; padding: 12rpx 24rpx; font-size: 26rpx; }
.btn { background: #e64340; color: #fff; border-radius: 999rpx; padding: 12rpx 24rpx; font-size: 24rpx; }
.shelf { padding: 24rpx; }
.p-item { display: flex; gap: 20rpx; background: #fff; border-radius: 12rpx; padding: 16rpx; margin-bottom: 16rpx; }
.p-img { width: 140rpx; height: 140rpx; border-radius: 8rpx; background: #eee; }
.p-name { flex: 1; font-size: 28rpx; }
.p-price { color: #e64340; font-weight: 600; }
</style>