<template>
  <view class="page">
    <!-- 顶部导航：支付档案 -->
    <view class="nav">
      <text class="nav-btn" @tap="go('/pages/payment/profile/index')">支付档案</text>
    </view>
    <view class="tabs">
      <text class="tab" :class="{ on: tab === 'mine' }" @tap="switchTab('mine')">本店方式</text>
      <text class="tab" :class="{ on: tab === 'pool' }" @tap="switchTab('pool')">全局方案池</text>
    </view>

    <template v-if="tab === 'mine'">
      <view class="hint">先配好支付方式（启用中），才可在「支付档案」引用。</view>
      <view class="card" v-for="p in items" :key="p.id">
        <view class="row">
          <view class="left">
            <text class="name">{{ p.name }}</text>
            <text class="code">{{ p.code }}</text>
          </view>
          <switch :checked="p.enabled" color="#ff6600" @change="toggle(p, $event)" />
        </view>
        <text class="desc">{{ p.description || '—' }}</text>
        <view class="ops">
          <text class="ed" @tap="openEdit(p)">编辑</text>
          <text class="del" @tap="onDel(p)">删除</text>
        </view>
      </view>
      <view v-if="!items.length" class="empty">暂无支付方式</view>
    </template>

    <template v-else>
      <view class="hint">全局方案由超级管理员维护，点击「引用到本店」生成独立实例后可编辑。</view>
      <view class="card" v-for="t in pool" :key="t.id">
        <view class="row">
          <view class="left">
            <text class="name">{{ t.name }}</text>
            <text class="code">{{ t.code }}</text>
          </view>
          <text class="copy" @tap="copy(t)">引用到本店</text>
        </view>
        <text class="desc">{{ t.description || '—' }}</text>
      </view>
      <view v-if="!pool.length" class="empty">暂无全局方案</view>
    </template>

    <view v-if="tab === 'mine' && editing" class="sheet-mask" @tap="editing = null">
      <view class="sheet" @tap.stop>
        <text class="st">编辑支付方式</text>
        <input class="ipt" v-model="form.name" placeholder="名称" />
        <input class="ipt" v-model="form.description" placeholder="描述" />
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
import { fetchPaymentMethods, setPaymentEnabled, updatePaymentMethod, deletePaymentMethod } from '../../../apis/payment';
import { fetchPaymentTemplates, createPaymentMethodFromTemplate } from '../../../apis/payment-template';

const tab = ref<'mine' | 'pool'>('mine');
const items = ref<any[]>([]);
const pool = ref<any[]>([]);
const editing = ref<any>(null);
const form = ref({ id: '', name: '', description: '' });

async function switchTab(t: 'mine' | 'pool') {
  tab.value = t;
  if (t === 'mine' && !items.value.length) items.value = await fetchPaymentMethods();
  if (t === 'pool') pool.value = await fetchPaymentTemplates();
}

onMounted(async () => { items.value = await fetchPaymentMethods(); });

async function copy(t: any) {
  try {
    await createPaymentMethodFromTemplate(t.id);
    uni.showToast({ title: '已引用到本店', icon: 'none' });
    tab.value = 'mine';
    items.value = await fetchPaymentMethods();
  } catch (e: any) {
    uni.showToast({ title: e?.message || '引用失败', icon: 'none' });
  }
}

async function toggle(p: any, e: any) {
  const enabled = Boolean(e.detail.value);
  try {
    await setPaymentEnabled(p.id, enabled);
    p.enabled = enabled;
  } catch (err: any) {
    uni.showToast({ title: err?.message || '操作失败', icon: 'none' });
  }
}

function openEdit(p: any) { editing.value = p; form.value = { id: p.id, name: p.name, description: p.description || '' }; }
function go(url: string) { uni.navigateTo({ url }); }
async function save() {
  try {
    await updatePaymentMethod(form.value.id, form.value.name, form.value.description);
    editing.value = null; items.value = await fetchPaymentMethods();
    uni.showToast({ title: '已保存', icon: 'none' });
  } catch (e: any) { uni.showToast({ title: e?.message || '保存失败', icon: 'none' }); }
}
function onDel(p: any) {
  uni.showModal({ title: '删除支付方式', content: `确认删除「${p.name}」？`, success: async (r) => {
    if (!r.confirm) return;
    try { await deletePaymentMethod(p.id); items.value = await fetchPaymentMethods(); uni.showToast({ title: '已删除', icon: 'none' }); }
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
  .copy { font-size: 26rpx; color: $pm-d1; font-weight: 600; }
  .hint { background: #fff7f0; border: 1px solid #ffe0c4; color: #b05000; font-size: 24rpx; border-radius: 16rpx; padding: 18rpx 22rpx; margin-bottom: 20rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 26rpx 30rpx 12rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .left { display: flex; flex-direction: column;
        .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
        .code { margin-top: 4rpx; font-size: 24rpx; color: $wa-muted; }
      }
    }
    .desc { display: block; margin-top: 12rpx; font-size: 24rpx; color: $wa-muted; }
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
  .save { background: $pm-d1; color: #fff; font-size: 30rpx; font-weight: 700; border-radius: 16rpx; line-height: 88rpx; }
}
</style>