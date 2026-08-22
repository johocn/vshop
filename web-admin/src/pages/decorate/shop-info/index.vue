<template>
  <view class="page">
    <view class="card">
      <view class="cell">
        <text class="lbl">店铺名</text>
        <input v-model="f.shopName" placeholder="请输入店铺名" />
      </view>
      <view class="cell">
        <text class="lbl">客服电话</text>
        <input v-model="f.servicePhone" placeholder="请输入客服电话" />
      </view>
      <view class="cell col">
        <text class="lbl">店铺简介</text>
        <textarea v-model="f.shopIntro" placeholder="请输入店铺简介" />
      </view>
      <view class="cell">
        <text class="lbl">店铺 Logo</text>
        <input v-model="f.shopLogo" placeholder="图片上传见 Task 7，先填 URL" />
      </view>
    </view>
    <button class="save" @tap="save">保存</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';

const f = ref({ shopName: '', shopLogo: '', shopIntro: '', servicePhone: '' });
let channelId = '';

onMounted(async () => {
  const ch = await fetchActiveChannel();
  channelId = ch.id;
  const cf = ch.customFields as any;
  f.value = {
    shopName: cf.shopName ?? '',
    shopLogo: cf.shopLogo ?? '',
    shopIntro: cf.shopIntro ?? '',
    servicePhone: cf.servicePhone ?? '',
  };
});

async function save() {
  await updateChannelCustomFields(channelId, f.value);
  uni.showToast({ title: '已保存', icon: 'success' });
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 32rpx; }
  .cell { display: flex; align-items: center; padding: 28rpx 0; border-bottom: 1rpx solid $wa-rule;
    .lbl { width: 180rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
    input { flex: 1; font-size: 28rpx; }
    &.col { flex-direction: column; align-items: flex-start;
      .lbl { width: auto; margin-bottom: 16rpx; }
      textarea { width: 100%; height: 160rpx; font-size: 28rpx; }
    }
    &:last-child { border-bottom: none; }
  }
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
