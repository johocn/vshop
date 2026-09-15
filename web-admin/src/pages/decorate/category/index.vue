<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">分类页装修</text>
        <text class="sub">保存到 pageCategoryConfig，逐级覆盖模板/全局默认</text>
      </view>
      <view class="cell">
        <text class="lbl">标题</text>
        <input v-model="f.title" placeholder="分类" />
      </view>
      <view class="cell">
        <text class="lbl">副标题</text>
        <input v-model="f.subtitle" placeholder="可选" />
      </view>
      <view class="cell">
        <text class="lbl">背景色</text>
        <input v-model="f.bgColor" placeholder="#ffffff" />
      </view>
      <view class="cell row-in">
        <text class="lbl">列表样式</text>
        <view class="seg">
          <text :class="{ on: f.listStyle === 'grid' }" @tap="f.listStyle = 'grid'">网格</text>
          <text :class="{ on: f.listStyle === 'list' }" @tap="f.listStyle = 'list'">列表</text>
        </view>
      </view>
      <view class="cell">
        <text class="lbl">楼层标题</text>
        <input v-model="f.floorTitle" placeholder="可选，展示在分类上方" />
      </view>
      <view class="cell">
        <text class="lbl">楼层副标题</text>
        <input v-model="f.floorSubtitle" placeholder="可选" />
      </view>
    </view>
    <button class="save" :disabled="saving" @tap="save">{{ saving ? '保存中…' : '保存' }}</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import { graphQlErrorMsg } from '../../../apis/client';

const f = ref({
  title: '分类',
  subtitle: '',
  bgColor: '#ffffff',
  listStyle: 'grid',
  floorTitle: '',
  floorSubtitle: '',
});
const saving = ref(false);
let channelId = '';

function safeParse(raw: string | undefined): any {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

onMounted(async () => {
  const ch = await fetchActiveChannel();
  channelId = ch.id;
  const cfg = safeParse((ch.customFields as any).pageCategoryConfig);
  if (cfg) {
    f.value = {
      title: cfg.title ?? f.value.title,
      subtitle: cfg.subtitle ?? '',
      bgColor: cfg.bgColor ?? '#ffffff',
      listStyle: cfg.listStyle === 'list' ? 'list' : 'grid',
      floorTitle: cfg.floorTitle ?? '',
      floorSubtitle: cfg.floorSubtitle ?? '',
    };
  }
});

async function save() {
  saving.value = true;
  try {
    await updateChannelCustomFields(channelId, { pageCategoryConfig: JSON.stringify({ version: 1, ...f.value }) });
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '保存失败'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 32rpx; }
  .head { display: flex; align-items: baseline; justify-content: space-between; padding: 20rpx 0 8rpx;
    .title { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
    .sub { font-size: 22rpx; color: $wa-muted; }
  }
  .cell { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $wa-rule;
    .lbl { width: 180rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
    input { flex: 1; font-size: 28rpx; }
    &.row-in { justify-content: space-between; }
    &:last-child { border-bottom: none; }
    .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx;
      text { font-size: 24rpx; color: $wa-muted; padding: 8rpx 22rpx; border-radius: 999rpx;
        &.on { background: $wa-accent; color: #fff; }
      }
    }
  }
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
