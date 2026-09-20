<template>
  <view class="page">
    <ImagePicker :max="999" :value="selSet" @change="onSelect" />

    <view v-if="selected.length" class="grid">
      <view
        v-for="(it, i) in selected"
        :key="it.id"
        class="grid__cell"
        @tap="toggle(it.id)"
      >
        <image class="grid__thumb" :src="it.source || it.preview" mode="aspectFill" />
        <view class="grid__badge">{{ i + 1 }}</view>
        <view class="grid__del" @tap.stop="toggle(it.id)">×</view>
      </view>
    </view>

    <view v-if="selected.length" class="bar">
      <text class="bar__count">已选 {{ selected.length }} 张</text>
      <view class="bar__btn copy" @tap="copyUrls">复制 URL</view>
      <view class="bar__btn clear" @tap="clear">清空</view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import ImagePicker from '../../../components/ImagePicker.vue';
import { fetchAssets, type AssetItem } from '../../../apis/asset';

// 选中项资源对象（ImagePicker 回调仅给 id，需按 id 预取 source/preview）
const selected = ref<AssetItem[]>([]);
// 供 ImagePicker 触发区同步展示已选
const selSet = computed(() => selected.value.map((a) => a.id));

// 媒体库确认：按 id 预取资源对象，超出取量的回退到已缓存映射
async function onSelect(ids: string[]) {
  if (!ids.length) {
    selected.value = [];
    return;
  }
  try {
    const r = await fetchAssets(ids.length, 0, undefined, ids);
    const m = new Map(r.items.map((a) => [a.id, a]));
    selected.value = ids.map((id) => m.get(id)).filter((a): a is AssetItem => !!a);
  } catch (e) {
    selected.value = [];
    uni.showToast({ title: '加载资源失败', icon: 'none' });
  }
}

// 点击缩略图切换选中/取消
function toggle(id: string) {
  selected.value = selected.value.filter((a) => a.id !== id);
}

function clear() {
  selected.value = [];
}

function copyUrls() {
  const list = selected.value.map((a) => a.source || a.preview).filter(Boolean);
  if (!list.length) {
    uni.showToast({ title: '暂无链接', icon: 'none' });
    return;
  }
  uni.setClipboardData({
    data: list.join('\n'),
    success: () => uni.showToast({ title: '已复制 URL', icon: 'none' }),
  });
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 160rpx;
  box-sizing: border-box;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 24rpx;

  &__cell {
    position: relative;
    width: 160rpx;
    height: 120rpx;
    border-radius: $wa-radius;
    overflow: hidden;
    border: 1rpx solid $wa-rule;
    box-sizing: border-box;
  }

  &__thumb {
    width: 100%;
    height: 100%;
    display: block;
  }

  &__badge {
    position: absolute;
    top: 4rpx;
    left: 4rpx;
    min-width: 30rpx;
    height: 30rpx;
    line-height: 30rpx;
    text-align: center;
    font-size: 22rpx;
    color: #fff;
    background: $wa-accent;
    border-radius: 50%;
    box-sizing: border-box;
    padding: 0 6rpx;
  }

  &__del {
    position: absolute;
    top: 4rpx;
    right: 4rpx;
    width: 34rpx;
    height: 34rpx;
    line-height: 34rpx;
    text-align: center;
    font-size: 28rpx;
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
    border-radius: 50%;
  }
}

.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  background: $wa-card;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.06);
  z-index: 10;

  &__count {
    font-size: 26rpx;
    color: $wa-ink;
    margin-right: auto;
  }

  &__btn {
    margin-left: 20rpx;
    padding: 12rpx 28rpx;
    border-radius: $wa-radius;
    font-size: 26rpx;
    color: #fff;

    &.copy {
      background: $wa-accent;
    }

    &.clear {
      background: $wa-muted;
    }
  }
}
</style>