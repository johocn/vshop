<template>
  <view class="page">
    <view class="tabs">
      <text v-for="t in tabs" :key="t.key" class="tab" :class="{ active: active === t.key }" @click="switchTab(t.key)">{{ t.label }}</text>
    </view>
    <view v-for="room in rooms" :key="room.id" class="card" @click="goRoom(room)">
      <image class="cover" :src="room.coverUrl" mode="aspectFill" />
      <view class="info">
        <text class="name">{{ room.name }}</text>
        <text class="streamer">{{ room.streamerName || t('liveList.streamerFallback') }} · {{ statusLabel(room) }}</text>
        <text class="meta">{{ t('liveList.meta', { views: room.viewCount, likes: room.likeCount }) }}</text>
      </view>
    </view>
    <view v-if="!rooms.length" class="empty">{{ t('liveList.empty') }}</view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getLiveRooms } from '../../api/queries/live';
import { useUIStore } from '../../stores/ui';

const { t } = useI18n();
const ui = useUIStore();
const tabs = computed(() => [
  { key: '', label: t('liveList.tabAll') },
  { key: 'live', label: t('liveList.tabLive') },
  { key: 'upcoming', label: t('liveList.tabUpcoming') },
  { key: 'replay', label: t('liveList.tabReplay') },
]);
const active = ref('');
const rooms = ref<any[]>([]);

function statusLabel(room: any) {
  if (room.status === 'live') return t('liveList.statusLive');
  if (room.status === 'ended') return t('liveList.statusReplay');
  return t('liveList.statusUpcoming');
}

async function switchTab(key: string) {
  active.value = key;
  await load();
}

async function load() {
  try {
    const res: any = await getLiveRooms(active.value);
    rooms.value = res?.liveRooms || [];
  } catch (e: any) {
    ui.showToast(e.message || t('liveList.loadFailed'), 'error');
  }
}

function goRoom(room: any) {
  uni.navigateTo({ url: `/pkg-promotion/pages/live-room?id=${room.id}` });
}

onMounted(load);
</script>

<style scoped>
.page { padding: 24rpx; }
.tabs { display: flex; gap: 24rpx; margin-bottom: 24rpx; }
.tab { padding: 8rpx 24rpx; border-radius: 999rpx; background: #f2f2f2; font-size: 28rpx; }
.tab.active { background: #e64340; color: #fff; }
.card { display: flex; gap: 20rpx; background: #fff; border-radius: 16rpx; padding: 20rpx; margin-bottom: 20rpx; }
.cover { width: 200rpx; height: 150rpx; border-radius: 12rpx; background: #eee; }
.info { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
.name { font-size: 30rpx; font-weight: 600; }
.streamer { font-size: 26rpx; color: #666; }
.meta { font-size: 24rpx; color: #999; }
.empty { text-align: center; color: #999; padding: 80rpx 0; }
</style>