<template>
  <view class="page">
    <view class="topbar">
      <view class="tl">
        <text class="t">{{ tenant.name || tenant.code || locale.t('dashboard.workbench') }}</text>
        <text class="s" v-if="tenant.name && tenant.code">{{ locale.t('dashboard.codeOperating').replace('{code}', tenant.code) }}</text>
        <text class="s" v-else>{{ locale.t('dashboard.operating') }}</text>
      </view>
      <text class="menu" @tap="drawer = true">☰</text>
    </view>

    <view class="kpis">
      <view class="kpi" v-for="k in kpis" :key="k.label">
        <text class="v" :style="{ color: k.color }">{{ k.value }}</text>
        <text class="l">{{ locale.t(k.label) }}</text>
        <text class="d">{{ locale.t('dashboard.goProcess') }}</text>
      </view>
    </view>

    <view class="sec">
      <text class="sec-t">{{ locale.t('dashboard.frequentTitle') }} <text class="tag">{{ locale.t('dashboard.frequent') }}</text></text>
      <view class="grid">
        <view v-for="it in common" :key="it.label" class="act" @tap="go(it)">
          <view class="ic" :style="tierStyle(it.color, it.grad, 1)">{{ it.ic }}</view>
          <text class="nm">{{ locale.t(it.label) }}</text>
        </view>
      </view>
    </view>

    <view class="sec" v-for="g in groups" :key="g.domain">
      <text class="sec-t">{{ locale.t(g.domain) }}</text>
      <view class="tags">
        <text
          v-for="it in g.items"
          :key="it.label"
          class="tag"
          :style="tierStyle(g.color, g.grad, it.tier)"
          @tap="go(it)"
        >{{ locale.t(it.label) }}</text>
      </view>
    </view>

    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
    <Drawer :show="drawer" @close="drawer = false" />
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { D, tierStyle } from '../../theme';
import { useTenantStore } from '../../stores/tenantStore';
import { useAuthStore } from '../../stores/authStore';
import { useLocaleStore } from '../../stores/localeStore';
import { visibleMenus } from '../../constants/menus';
import { fetchHomeKpis } from '../../apis/stats';
import BottomBar from '../../components/BottomBar.vue';
import Drawer from '../../components/Drawer.vue';

const tenant = useTenantStore();
const auth = useAuthStore();
const locale = useLocaleStore();
const drawer = ref(false);
// 会话还原/刷新直入场景：name 未持久化，按当前 code 从店铺列表补回真实名称（编码始终保留）
onShow(() => {
  if (tenant.name === '' && tenant.code) {
    const ch = auth.channels.find((c: any) => c.code === tenant.code);
    if (ch?.name) tenant.selectCh(ch, ch.name);
  }
  loadKpis();
});
// 首页 KPI：今日销售额 / 待发货 / 库存预警（真实数据，加载失败保留 '—' 占位而非假装 0）
const kpis = ref([
  { label: 'dashboard.todayRevenue', value: '¥ —', color: D.d1.main },
  { label: 'dashboard.pendingShip', value: '—', color: D.d2.main },
  { label: 'menu.stockWarning', value: '—', color: D.warning },
]);
async function loadKpis() {
  try {
    const k = await fetchHomeKpis();
    kpis.value[0].value = '¥' + (k.revenue / 100).toFixed(2);
    kpis.value[1].value = String(k.toShip);
    kpis.value[2].value = String(k.lowStock);
  } catch (e) {
    console.error('loadKpis failed', e);
  }
}
const common = [
  { ic: '单', label: 'menu.order', url: '/pages/order/list/index', color: D.d2.main, grad: D.d2.grad },
  { ic: '＋', label: 'menu.productAdd', url: '/pages/product/create/index', color: D.d1.main, grad: D.d1.grad },
  { ic: '售', label: 'menu.afterSale', url: '/pages/after-sale/list/index', color: D.d2.main, grad: D.d2.grad },
  { ic: '类', label: 'menu.category', url: '/pages/product/categories/index', color: D.d1.main, grad: D.d1.grad },
  { ic: '库', label: 'menu.stock', url: '/pages/inventory/stock/index', color: D.d1.main, grad: D.d1.grad },
  { ic: '装', label: 'menu.decorate', url: '/pages/decorate/home/index', color: D.d4.main, grad: D.d4.grad },
  { ic: '书', label: 'menu.manual', action: 'manual', color: D.d6.main, grad: D.d6.grad },
];
// 全量功能目录（含平台组，按角色权限过滤），与右侧抽屉保持一致
const groups = computed(() => visibleMenus(auth));
function go(it: any) {
  if (it.action === 'manual') return openManual();
  if (it.action === 'switchStore') return uni.redirectTo({ url: '/pages/channel-select/index' });
  if (it.action === 'logout') return uni.redirectTo({ url: '/pages/login/index' });
  if (it.url) uni.navigateTo({ url: it.url });
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
.tags { display: flex; flex-wrap: wrap; gap: 14rpx; }
.tag { padding: 12rpx 22rpx; border-radius: 14rpx; font-size: 24rpx; font-weight: 500; white-space: nowrap; }
</style>