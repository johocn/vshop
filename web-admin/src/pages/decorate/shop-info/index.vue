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
      <view class="cell row-in">
        <text class="lbl">启用含税价</text>
        <switch :checked="f.taxEnabled !== false" @change="onTaxToggle" />
      </view>
      <view class="hint">默认开启（商品价含税）。关闭后：C 端商品展示价与购物车结算价将直接使用后台录入的净价，不再加税率。</view>
      <view class="cell row-in">
        <text class="lbl">详情页价格块样式</text>
        <view class="seg">
          <text :class="{ on: f.priceStyle === 'classic' }" @tap="setPriceStyle('classic')">经典</text>
          <text :class="{ on: f.priceStyle === 'jdA' }" @tap="setPriceStyle('jdA')">京东A</text>
          <text :class="{ on: f.priceStyle === 'jdB' }" @tap="setPriceStyle('jdB')">京东B</text>
        </view>
      </view>
      <view class="hint">详情页价格块版式：经典（跟随主题主色）；京东A（横幅促销价：现价+划线价+降价+标签）；京东B（深色价签条：整条京东红价签+白字现价+划线价）。注：京东A/B 固定走京东红 #E1251B，不随主题色。</view>
    </view>
    <button class="save" @tap="save">保存</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';

const f = ref<{ shopName: string; shopLogo: string; shopIntro: string; servicePhone: string; taxEnabled?: boolean; priceStyle: string }>({
  shopName: '', shopLogo: '', shopIntro: '', servicePhone: '', taxEnabled: true, priceStyle: 'classic',
});
let channelId = '';
let rawDetailConfig = '';

function onTaxToggle(e: any) {
  f.value.taxEnabled = !!e.detail.value;
}

function setPriceStyle(s: string) {
  f.value.priceStyle = s;
}

onMounted(async () => {
  const ch = await fetchActiveChannel();
  channelId = ch.id;
  const cf = ch.customFields as any;
  rawDetailConfig = cf.detailConfig ?? '';
  let style = 'classic';
  if (rawDetailConfig) {
    try {
      const cfg = JSON.parse(rawDetailConfig);
      style = cfg?.blocks?.price?.style || 'classic';
    } catch { /* 坏 JSON 忽略，兜底 classic */ }
  }
  f.value = {
    shopName: cf.shopName ?? '',
    shopLogo: cf.shopLogo ?? '',
    shopIntro: cf.shopIntro ?? '',
    servicePhone: cf.servicePhone ?? '',
    taxEnabled: cf.taxEnabled !== false,
    priceStyle: style,
  };
});

async function save() {
  // 合并 price.style 进 detailConfig，保留原 detailConfig 其余字段
  const payload = { ...f.value } as any;
  delete payload.priceStyle;
  const cfg = rawDetailConfig ? safeParse(rawDetailConfig) : { version: 2, layout: 'classic', blocks: {} };
  cfg.blocks = cfg.blocks || {};
  cfg.blocks.price = cfg.blocks.price || {};
  cfg.blocks.price.style = f.value.priceStyle;
  payload.detailConfig = JSON.stringify(cfg);
  await updateChannelCustomFields(channelId, payload);
  uni.showToast({ title: '已保存', icon: 'success' });
}

function safeParse(raw: string): any {
  try { return JSON.parse(raw); } catch { return { version: 2, layout: 'classic', blocks: {} }; }
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
    &.row-in { justify-content: space-between; }
    &:last-child { border-bottom: none; }
    .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx;
      text { font-size: 24rpx; color: $wa-muted; padding: 8rpx 22rpx; border-radius: 999rpx; transition: background .2s, color .2s;
        &.on { background: $wa-accent; color: #fff; }
      }
    }
  }
  .hint { margin-top: 24rpx; font-size: 24rpx; color: $wa-muted; line-height: 1.6; padding: 0 8rpx; }
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
