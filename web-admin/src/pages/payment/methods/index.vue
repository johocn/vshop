<template>
  <view class="page">
    <!-- 顶部导航：支付档案 -->
    <view class="nav">
      <text class="nav-btn" @tap="go('/pages/payment/profile/index')">{{ $t('paymentMethod.navProfile') }}</text>
    </view>
    <view class="tabs">
      <text class="tab" :class="{ on: tab === 'mine' }" @tap="switchTab('mine')">{{ $t('paymentMethod.tabMine') }}</text>
      <text class="tab" :class="{ on: tab === 'pool' }" @tap="switchTab('pool')">{{ $t('paymentMethod.tabPool') }}</text>
    </view>

    <template v-if="tab === 'mine'">
      <view class="hint">{{ $t('paymentMethod.hintMine') }}</view>
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
          <text class="ed" @tap="openEdit(p)">{{ $t('paymentMethod.edit') }}</text>
          <text class="del" @tap="onDel(p)">{{ $t('paymentMethod.del') }}</text>
        </view>
      </view>
      <view v-if="!items.length" class="empty">{{ $t('paymentMethod.emptyMine') }}</view>
    </template>

    <template v-else>
      <view class="hint">{{ $t('paymentMethod.hintPool') }}</view>
      <view class="card" v-for="t in pool" :key="t.id">
        <view class="row">
          <view class="left">
            <text class="name">{{ t.name }}</text>
            <text class="code">{{ t.code }}</text>
          </view>
          <text class="copy" @tap="copy(t)">{{ $t('paymentMethod.reference') }}</text>
        </view>
        <text class="desc">{{ t.description || '—' }}</text>
      </view>
      <view v-if="!pool.length" class="empty">{{ $t('paymentMethod.emptyPool') }}</view>
    </template>

    <view v-if="tab === 'mine' && editing" class="sheet-mask" @tap="editing = null">
      <view class="sheet" @tap.stop>
        <text class="st">{{ $t('paymentMethod.editMethodTitle') }}</text>
        <input class="ipt" v-model="form.name" :placeholder="$t('paymentMethod.phName')" />
        <input class="ipt" v-model="form.description" :placeholder="$t('paymentMethod.phDesc')" />
        <button class="save" @tap="save">{{ $t('paymentMethod.save') }}</button>
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
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

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
    uni.showToast({ title: locale.t('paymentMethod.referenced'), icon: 'none' });
    tab.value = 'mine';
    items.value = await fetchPaymentMethods();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('paymentMethod.referenceFailed'), icon: 'none' });
  }
}

async function toggle(p: any, e: any) {
  const enabled = Boolean(e.detail.value);
  try {
    await setPaymentEnabled(p.id, enabled);
    p.enabled = enabled;
  } catch (err: any) {
    uni.showToast({ title: err?.message || locale.t('paymentMethod.opFailed'), icon: 'none' });
  }
}

function openEdit(p: any) { editing.value = p; form.value = { id: p.id, name: p.name, description: p.description || '' }; }
function go(url: string) { uni.navigateTo({ url }); }
async function save() {
  try {
    await updatePaymentMethod(form.value.id, form.value.name, form.value.description);
    editing.value = null; items.value = await fetchPaymentMethods();
    uni.showToast({ title: locale.t('paymentMethod.saved'), icon: 'none' });
  } catch (e: any) { uni.showToast({ title: e?.message || locale.t('paymentMethod.saveFailed'), icon: 'none' }); }
}
function onDel(p: any) {
  uni.showModal({ title: locale.t('paymentMethod.delTitle'), content: locale.t('paymentMethod.delContent').replace('{name}', p.name), success: async (r) => {
    if (!r.confirm) return;
    try { await deletePaymentMethod(p.id); items.value = await fetchPaymentMethods(); uni.showToast({ title: locale.t('paymentMethod.deleted'), icon: 'none' }); }
    catch (e: any) { uni.showToast({ title: e?.message || locale.t('paymentMethod.delFailed'), icon: 'none' }); }
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