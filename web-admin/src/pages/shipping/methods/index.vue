<template>
  <view class="page">
    <!-- 顶部导航：配送档案 / 自提点 -->
    <view class="nav">
      <text class="nav-btn" @tap="go('/pages/shipping/profile/index')">配送档案</text>
      <text class="nav-btn" @tap="go('/pages/pickup/index')">自提点</text>
    </view>
    <view class="tabs">
      <text class="tab" :class="{ on: tab === 'mine' }" @tap="switchTab('mine')">本店方式</text>
      <text class="tab" :class="{ on: tab === 'pool' }" @tap="switchTab('pool')">全局方案池</text>
    </view>

    <!-- 本店方式 -->
    <template v-if="tab === 'mine'">
      <view class="hint">先配好配送方式（启用中），才可在「配送档案」引用。</view>
      <view class="card" v-for="s in items" :key="s.id">
        <view class="row">
          <view class="left"><text class="name">{{ s.name }}</text><text class="code">{{ s.code }}</text></view>
          <switch :checked="s.enabled" color="#ff6600" @change="toggle(s, $event)" />
        </view>
        <text class="desc">{{ s.description || '—' }}</text>
        <text v-if="isFixedFee(s.calcCode)" class="fee">{{ s.shippingPrice > 0 ? `固定运费 ${fen2yuan(s.shippingPrice)} 元` : '免运费' }}</text>
        <view class="ops">
          <text class="ed" @tap="openEdit(s)">编辑</text>
          <text class="del" @tap="onDel(s)">删除</text>
        </view>
      </view>
      <view v-if="!items.length" class="empty">暂无配送方式</view>
    </template>

    <!-- 全局方案池 -->
    <template v-else>
      <view class="hint">全局方案由超级管理员维护，左滑/点击「引用到本店」生成独立实例后可编辑。</view>
      <view class="card" v-for="t in pool" :key="t.id">
        <view class="row">
          <view class="left"><text class="name">{{ t.name }}</text><text class="code">{{ t.code }}</text></view>
          <text class="copy" @tap="copy(t)">引用到本店</text>
        </view>
        <text class="desc">{{ t.description || '—' }}</text>
        <view class="ops" v-if="auth.isSuperAdmin">
          <text class="cfg" @tap="config(t)">区域与运费</text>
        </view>
      </view>
      <view v-if="!pool.length" class="empty">暂无全局方案</view>
    </template>

    <view v-if="tab === 'mine' && editing" class="sheet-mask" @tap="editing = null">
      <view class="sheet" @tap.stop>
        <text class="st">编辑配送方式</text>
        <input class="ipt" v-model="form.name" placeholder="名称" />
        <input class="ipt" v-model="form.description" placeholder="描述" />
        <input v-if="isFixedFee(editing.calcCode)" class="ipt" type="number" v-model="form.shippingPrice" placeholder="固定运费（分，0=免费）" />
        <template v-if="isStorePickup(editing.calcCode)"><text class="ftip">门店自提免运费</text></template>
        <template v-else-if="isMail(editing.calcCode)"><text class="ftip">运费公式请在全局方案「区域与运费」中配置</text></template>
        <button class="save" @tap="save">保存</button>
      </view>
    </view>
    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchShippingMethods, setShippingEnabled, updateShippingMethod, deleteShippingMethod, updateShippingMethodShippingPrice } from '../../../apis/shipping';
import { fetchShippingTemplates, createShippingMethodFromTemplate } from '../../../apis/shipping-template';
import { useAuthStore } from '../../../stores/authStore';

// 自提/同城 = 固定运费可配；门店自提 = 免费；其余 = 快递公式（模板级配置）
const FIXED_FEE_CALCS = ['pickup-point-calculator', 'employee-pickup-calculator', 'local-delivery-calculator'];
const isFixedFee = (code: string) => FIXED_FEE_CALCS.includes(code);
const isStorePickup = (code: string) => code === 'store-pickup-calculator';
const isMail = (code: string) => !!code && !isFixedFee(code) && !isStorePickup(code);
const fen2yuan = (fen: number) => ((Number(fen) || 0) / 100).toFixed(2);

const tab = ref<'mine' | 'pool'>('mine');
const items = ref<any[]>([]);
const pool = ref<any[]>([]);
const editing = ref<any>(null);
const form = ref({ id: '', name: '', description: '', shippingPrice: '0' });
const auth = useAuthStore();

async function switchTab(t: 'mine' | 'pool') {
  tab.value = t;
  if (t === 'mine' && !items.value.length) items.value = await fetchShippingMethods();
  if (t === 'pool') pool.value = await fetchShippingTemplates();
}

onMounted(async () => { items.value = await fetchShippingMethods(); });

async function toggle(s: any, e: any) {
  const enabled = Boolean(e.detail.value);
  try {
    await setShippingEnabled(s.id, enabled);
    s.enabled = enabled;
  } catch (err: any) {
    uni.showToast({ title: err?.message || '操作失败', icon: 'none' });
  }
}

async function copy(t: any) {
  try {
    await createShippingMethodFromTemplate(t.id);
    uni.showToast({ title: '已引用到本店', icon: 'none' });
    tab.value = 'mine';
    items.value = await fetchShippingMethods();
  } catch (e: any) {
    uni.showToast({ title: e?.message || '引用失败', icon: 'none' });
  }
}

function config(t: any) {
  uni.navigateTo({ url: `/pages/shipping/method-config/index?id=${t.id}` });
}

function openEdit(s: any) { editing.value = s; form.value = { id: s.id, name: s.name, description: s.description || '', shippingPrice: String(s.shippingPrice || 0) }; }
function go(url: string) { uni.navigateTo({ url }); }
async function save() {
  try {
    await updateShippingMethod(form.value.id, form.value.name, form.value.description);
    if (isFixedFee(editing.value?.calcCode)) {
      await updateShippingMethodShippingPrice(form.value.id, Number(form.value.shippingPrice) || 0);
    }
    editing.value = null; items.value = await fetchShippingMethods();
    uni.showToast({ title: '已保存', icon: 'none' });
  } catch (e: any) { uni.showToast({ title: e?.message || '保存失败', icon: 'none' }); }
}
function onDel(s: any) {
  uni.showModal({ title: '删除配送方式', content: `确认删除「${s.name}」？`, success: async (r) => {
    if (!r.confirm) return;
    try { await deleteShippingMethod(s.id); items.value = await fetchShippingMethods(); uni.showToast({ title: '已删除', icon: 'none' }); }
    catch (e: any) { uni.showToast({ title: e?.message || '删除失败', icon: 'none' }); }
  }});
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .nav { display: flex; gap: 20rpx; margin-bottom: 20rpx;
    .nav-btn { flex: 1; text-align: center; font-size: 26rpx; color: $pm-d1; font-weight: 600; background: #fff; border: 1px solid $pm-d1; border-radius: 14rpx; padding: 20rpx 0; }
  }
  .tabs { display: flex; background: $wa-card; border-radius: $wa-radius; padding: 8rpx; margin-bottom: 20rpx;
    .tab { flex: 1; text-align: center; font-size: 28rpx; color: $wa-muted; padding: 18rpx 0; border-radius: 14rpx;
      &.on { background: $pm-d1; color: #fff; font-weight: 600; }
    }
  }
  .hint { background: #fff7f0; border: 1px solid #ffe0c4; color: #b05000; font-size: 24rpx; border-radius: 16rpx; padding: 18rpx 22rpx; margin-bottom: 20rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 26rpx 30rpx 12rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .left { display: flex; flex-direction: column; .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; } .code { font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; } }
      .copy { font-size: 26rpx; color: $pm-d1; font-weight: 600; }
    }
    .desc { display: block; margin-top: 12rpx; font-size: 24rpx; color: $wa-muted; }
    .fee { display: inline-block; margin-top: 12rpx; font-size: 24rpx; color: $wa-accent; background: #fff1e6; border-radius: 12rpx; padding: 4rpx 16rpx; }
    .ops { display: flex; justify-content: flex-end; gap: 40rpx; margin-top: 12rpx;
      .cfg { font-size: 26rpx; color: $pm-info; }
    }
    .ops { display: flex; justify-content: flex-end; gap: 40rpx; margin-top: 16rpx; padding-top: 16rpx; border-top: 1px solid $wa-rule; padding-bottom: 12rpx;
      .ed { font-size: 26rpx; color: $pm-info; } .del { font-size: 26rpx; color: $pm-danger; }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
.sheet-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 90; display: flex; align-items: flex-end; }
.sheet { width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 40rpx 32rpx calc(env(safe-area-inset-bottom) + 40rpx);
  .st { font-size: 32rpx; font-weight: 700; color: $wa-ink; display: block; margin-bottom: 24rpx; }
  .ipt { background: #f5f5f5; border-radius: 14rpx; padding: 22rpx 24rpx; font-size: 28rpx; margin-bottom: 20rpx; }
  .ftip { display: block; font-size: 22rpx; color: $wa-muted; margin: -10rpx 0 20rpx; padding-left: 4rpx; }
  .save { background: $pm-d1; color: #fff; font-size: 30rpx; font-weight: 700; border-radius: 16rpx; line-height: 88rpx; }
}
</style>