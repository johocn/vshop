<template>
  <view class="page">
    <view class="topbar">
      <view class="tl">
        <text class="t">{{ tenant.name || '工作台' }}</text>
        <text class="s">经营中</text>
      </view>
      <text class="menu" @tap="drawer = true">☰</text>
    </view>

    <view class="kpis">
      <view class="kpi" v-for="k in kpis" :key="k.label">
        <text class="v" :style="{ color: k.color }">{{ k.value }}</text>
        <text class="l">{{ k.label }}</text>
        <text class="d">去处理 ›</text>
      </view>
    </view>

    <view class="sec">
      <text class="sec-t">🗂 常用功能 <text class="tag">高频</text></text>
      <view class="grid">
        <view v-for="it in common" :key="it.label" class="act" @tap="go(it)">
          <view class="ic" :style="tierStyle(it.color, it.grad, 1)">{{ it.ic }}</view>
          <text class="nm">{{ it.label }}</text>
        </view>
      </view>
    </view>

    <view class="sec">
      <text class="sec-t">⚙ 履约 / 配置</text>
      <view class="row">
        <view class="pill" v-for="p in fulfill" :key="p.label" @tap="go(p)">
          <view class="ic" :style="{ background: D.d3.main + '22', color: D.d3.main }">{{ p.ic }}</view>
          <view class="tx"><text class="b">{{ p.label }}</text><text class="s">前提配置</text></view>
          <text class="chev">›</text>
        </view>
      </view>
    </view>

    <view class="sec">
      <text class="sec-t">📦 商品 <text class="tag b">次频</text></text>
      <view class="grid">
        <view v-for="it in subfreq" :key="it.label" class="act" @tap="go(it)">
          <view class="ic" :style="{ background: D.d3.main + '22', color: D.d3.main }">{{ it.ic }}</view>
          <text class="nm">{{ it.label }}</text>
        </view>
      </view>
    </view>

    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
    <Drawer :show="drawer" @close="drawer = false" />
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { D, tierStyle } from '../../theme';
import { useTenantStore } from '../../stores/tenantStore';
import BottomBar from '../../components/BottomBar.vue';
import Drawer from '../../components/Drawer.vue';

const tenant = useTenantStore();
const drawer = ref(false);
const kpis = [
  { label: '今日销售额', value: '¥ —', color: D.d1.main },
  { label: '待发货', value: '0', color: D.d2.main },
  { label: '库存预警', value: '0', color: D.warning },
];
const common = [
  { ic: '单', label: '订单', url: '/pages/order/list/index', color: D.d2.main, grad: D.d2.grad },
  { ic: '＋', label: '新增商品', url: '/pages/product/create/index', color: D.d1.main, grad: D.d1.grad },
  { ic: '售', label: '售后', url: '/pages/after-sale/list/index', color: D.d2.main, grad: D.d2.grad },
  { ic: '类', label: '分类', url: '/pages/product/categories/index', color: D.d1.main, grad: D.d1.grad },
  { ic: '库', label: '库存', url: '/pages/inventory/stock/index', color: D.d1.main, grad: D.d1.grad },
  { ic: '装', label: '装修', url: '/pages/decorate/home/index', color: D.d4.main, grad: D.d4.grad },
  { ic: '书', label: '使用手册', action: 'manual', color: D.d6.main, grad: D.d6.grad },
];
const fulfill = [
  { ic: '配', label: '配送方式', url: '/pages/shipping/methods/index' },
  { ic: '付', label: '支付方式', url: '/pages/payment/methods/index' },
];
const subfreq = [
  { ic: '商', label: '商品列表', url: '/pages/product/list/index' },
  { ic: '图', label: '图片库', url: '/pages/media/library/index' },
];
function go(it: any) {
  if (it.action === 'manual') return openManual();
  uni.navigateTo({ url: it.url });
}
// 公开手册：独立新窗口打开，无需登录鉴权
function openManual() {
  const base = (location.pathname.match(/^.*\/guanli\/?/) || ['/guanli/'])[0].replace(/\/$/, '');
  const url = location.origin + base + '/static/manual/index.html';
  window.open(url, '_blank');
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 24rpx 160rpx; }
.topbar { display: flex; align-items: center; justify-content: space-between; background: #fff; border-radius: 20rpx; padding: 26rpx 28rpx; margin-bottom: 20rpx;
  .tl { .t { font-size: 34rpx; font-weight: 800; color: $wa-ink; } .s { display: block; font-size: 20rpx; color: $pm-success; margin-top: 4rpx; } }
  .menu { font-size: 36rpx; color: $wa-ink; }
}
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16rpx; margin-bottom: 24rpx;
  .kpi { background: #fff; border-radius: 20rpx; padding: 22rpx 12rpx 18rpx; text-align: center; box-shadow: 0 2rpx 6rpx rgba(0,0,0,.04);
    .v { font-size: 36rpx; font-weight: 800; line-height: 1; }
    .l { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 10rpx; }
    .d { display: block; font-size: 18rpx; color: #bbb; margin-top: 4rpx; }
  }
}
.sec { margin-bottom: 24rpx;
  .sec-t { font-size: 28rpx; font-weight: 700; color: $wa-ink; margin: 0 8rpx 16rpx; display: flex; align-items: center; gap: 10rpx;
    .tag { font-size: 20rpx; color: $pm-d1; font-weight: 600; &.b { color: $pm-d3; } }
  }
}
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16rpx;
  .act { background: #fff; border-radius: 18rpx; padding: 22rpx 6rpx 18rpx; display: flex; flex-direction: column; align-items: center; gap: 12rpx; box-shadow: 0 2rpx 6rpx rgba(0,0,0,.04);
    .ic { width: 68rpx; height: 68rpx; border-radius: 20rpx; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 32rpx; font-weight: 700; }
    .nm { font-size: 22rpx; color: $wa-ink; font-weight: 600; }
  }
}
.row { display: flex; gap: 16rpx;
  .pill { flex: 1; background: #fff; border-radius: 18rpx; padding: 22rpx; display: flex; align-items: center; gap: 16rpx; box-shadow: 0 2rpx 6rpx rgba(0,0,0,.04);
    .ic { width: 60rpx; height: 60rpx; border-radius: 16rpx; display: flex; align-items: center; justify-content: center; font-size: 28rpx; font-weight: 700; }
    .tx { flex: 1; .b { font-size: 26rpx; color: $wa-ink; font-weight: 600; display: block; } .s { font-size: 20rpx; color: $pm-d3; } }
    .chev { color: #ccc; }
  }
}
</style>