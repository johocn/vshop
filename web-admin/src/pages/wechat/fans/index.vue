<template>
  <view class="page">
    <view class="hint">{{ $t('wechatOps.fansHint') }}</view>
    <view class="card head">
      <text>{{ $t('wechatOps.fansTotal') }}：{{ total }}</text>
      <text class="refresh" @tap="load(true)">{{ $t('wechatOps.refresh') }}</text>
    </view>
    <view class="card" v-for="(o, i) in openids" :key="i">
      <text class="openid">{{ o }}</text>
    </view>
    <view v-if="!openids.length && !loading" class="empty">{{ $t('wechatOps.fansEmpty') }}</view>
    <view v-if="hasMore" class="more" @tap="loadMore">{{ $t('wechatOps.loadMore') }}</view>
    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchWechatFans } from '../../../apis/wechat';

const openids = ref<string[]>([]);
const total = ref(0);
const nextOpenid = ref('');
const hasMore = ref(false);
const loading = ref(false);

function toast(title: string) { uni.showToast({ title, icon: 'none' }); }

async function load(reset: boolean) {
  loading.value = true;
  try {
    const res = await fetchWechatFans(reset ? '' : nextOpenid.value);
    total.value = res?.total || 0;
    const list = res?.data?.openid || [];
    nextOpenid.value = res?.next_openid || '';
    hasMore.value = !!res?.next_openid && list.length > 0;
    openids.value = reset ? list : [...openids.value, ...list];
  } catch (e: any) {
    toast('拉取失败：' + String(e?.message || e));
  } finally { loading.value = false; }
}
function loadMore() { load(false); }

onMounted(() => load(true));
</script>

<style scoped>
.page { padding: 24rpx; }
.hint { font-size: 24rpx; color: #999; margin-bottom: 20rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.head { display: flex; justify-content: space-between; align-items: center; font-size: 28rpx; font-weight: 600; }
.refresh { font-size: 26rpx; color: #07c160; font-weight: 400; }
.openid { font-size: 24rpx; color: #333; word-break: break-all; }
.empty { text-align: center; color: #999; font-size: 26rpx; padding: 60rpx 0; }
.more { text-align: center; color: #07c160; font-size: 26rpx; padding: 24rpx 0; }
</style>
