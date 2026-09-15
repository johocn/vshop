<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">我的页装修</text>
        <text class="sub">保存到 pageProfileConfig，逐级覆盖模板/全局默认</text>
      </view>
      <view class="cell row-in">
        <text class="lbl">头像样式</text>
        <view class="seg">
          <text :class="{ on: f.avatarStyle === 'round' }" @tap="f.avatarStyle = 'round'">圆形</text>
          <text :class="{ on: f.avatarStyle === 'square' }" @tap="f.avatarStyle = 'square'">圆角方形</text>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="img-title">菜单项列表（icon / 标题 / 链接）</view>
      <view class="menu-row" v-for="(m, i) in f.menus" :key="i">
        <input class="inp" v-model="m.icon" placeholder="icon" />
        <input class="inp" v-model="m.title" placeholder="标题" />
        <input class="inp" v-model="m.url" placeholder="/pages/xxx/index" />
        <button class="del" @tap="f.menus.splice(i, 1)">删</button>
      </view>
      <button class="add" @tap="f.menus.push({ icon: '', title: '', url: '' })">+ 添加菜单项</button>
    </view>
    <button class="save" :disabled="saving" @tap="save">{{ saving ? '保存中…' : '保存' }}</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import { graphQlErrorMsg } from '../../../apis/client';

const f = ref({
  avatarStyle: 'round',
  menus: [] as Array<{ icon: string; title: string; url: string }>,
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
  const cfg = safeParse((ch.customFields as any).pageProfileConfig);
  if (cfg) {
    f.value = {
      avatarStyle: cfg.avatarStyle === 'square' ? 'square' : 'round',
      menus: Array.isArray(cfg.menus)
        ? cfg.menus.map((m: any) => ({ icon: m.icon ?? '', title: m.title ?? '', url: m.url ?? '' }))
        : [],
    };
  }
});

async function save() {
  saving.value = true;
  try {
    const menus = f.value.menus.filter((m) => m.title.trim() || m.url.trim());
    await updateChannelCustomFields(channelId, {
      pageProfileConfig: JSON.stringify({ version: 1, avatarStyle: f.value.avatarStyle, menus }),
    });
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
  .card { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 32rpx; margin-bottom: 24rpx; }
  .head { display: flex; align-items: baseline; justify-content: space-between; padding: 20rpx 0 8rpx;
    .title { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
    .sub { font-size: 22rpx; color: $wa-muted; }
  }
  .cell { display: flex; align-items: center; padding: 20rpx 0;
    .lbl { width: 180rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
    &.row-in { justify-content: space-between; }
    .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx;
      text { font-size: 24rpx; color: $wa-muted; padding: 8rpx 22rpx; border-radius: 999rpx;
        &.on { background: $wa-accent; color: #fff; }
      }
    }
  }
  .img-title { font-size: 28rpx; color: $wa-ink; padding: 24rpx 0 8rpx; }
  .menu-row { display: flex; gap: 12rpx; padding: 12rpx 0; align-items: center;
    .inp { flex: 1; min-width: 0; background: $wa-bg; border-radius: 8rpx; padding: 12rpx; font-size: 26rpx; }
    .del { color: #e6162d; font-size: 26rpx; }
  }
  .add { margin: 16rpx 0 24rpx; color: $wa-accent; font-size: 28rpx; }
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
