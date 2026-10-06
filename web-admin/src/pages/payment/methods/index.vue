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

    <view v-if="editing" class="sheet-mask" @tap="editing = null">
      <scroll-view class="sheet" scroll-y @tap.stop>
        <text class="st">{{ $t('paymentMethod.editMethodTitle') }}</text>
        <input class="ipt" v-model="form.name" :placeholder="$t('paymentMethod.phName')" />
        <input class="ipt" v-model="form.description" :placeholder="$t('paymentMethod.phDesc')" />
        <template v-if="editingWx">
          <text class="sec">{{ $t('paymentMethod.wxSection') }}</text>
          <text class="tip">{{ $t('paymentMethod.wxSecretTip') }}</text>
          <input class="ipt" v-model="wxForm.appId" :placeholder="ph('appId')" />
          <input class="ipt" v-model="wxForm.mchId" :placeholder="ph('mchId')" />
          <input class="ipt" v-model="wxForm.serialNo" :placeholder="ph('serialNo')" />
          <input class="ipt" v-model="wxForm.tradeType" :placeholder="ph('tradeType')" />
          <input class="ipt" v-model="wxForm.notifyUrl" :placeholder="ph('notifyUrl')" />
          <textarea class="tarea" v-model="wxForm.apiKey" :placeholder="ph('apiKey')" />
          <textarea class="tarea" v-model="wxForm.privateKey" :placeholder="ph('privateKey')" />
          <textarea class="tarea" v-model="wxForm.publicKey" :placeholder="ph('publicKey')" />
        </template>
        <button class="save" @tap="save">{{ $t('paymentMethod.save') }}</button>
      </scroll-view>
    </view>
    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchPaymentMethods, setPaymentEnabled, updatePaymentMethod, deletePaymentMethod, updatePaymentMethodArgs } from '../../../apis/payment';
import { fetchPaymentTemplates, createPaymentMethodFromTemplate } from '../../../apis/payment-template';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const tab = ref<'mine' | 'pool'>('mine');
const items = ref<any[]>([]);
const pool = ref<any[]>([]);
const editing = ref<any>(null);
const form = ref({ id: '', name: '', description: '' });

// 微信支付凭证编辑（handler.code === 'wechatpay' 的方法）
const WX_ARGS = ['appId', 'mchId', 'publicKey', 'privateKey', 'apiKey', 'serialNo', 'tradeType', 'notifyUrl'];
const editingWx = ref(false);
const origArgs = ref<Record<string, string>>({});
const wxForm = ref<Record<string, string>>({});

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

function openEdit(p: any) {
  editing.value = p; form.value = { id: p.id, name: p.name, description: p.description || '' };
  editingWx.value = p.handler?.code === 'wechatpay';
  origArgs.value = {};
  for (const n of WX_ARGS) origArgs.value[n] = p.handler?.args?.find((a: any) => a.name === n)?.value || '';
  wxForm.value = { appId: '', mchId: '', serialNo: '', tradeType: '', notifyUrl: '', apiKey: '', privateKey: '', publicKey: '' };
}
function go(url: string) { uni.navigateTo({ url }); }
// 敏感/普通字段占位：已配置 →「留空保持不变」；未配置 → 提示输入
function ph(name: string): string {
  const labels: Record<string, string> = {
    appId: 'appId（公众号/小程序 AppID）', mchId: '商户号 mchId', serialNo: '证书序列号 serialNo',
    tradeType: '交易类型 tradeType', notifyUrl: '回调地址 notifyUrl', apiKey: 'APIv3 密钥（32 位）',
    privateKey: '商户私钥 apiclient_key.pem（PEM 全文）', publicKey: '微信平台公钥（PEM 全文）',
  };
  const label = locale.t(`paymentMethod.wx_${name}`) !== `paymentMethod.wx_${name}`
    ? locale.t(`paymentMethod.wx_${name}`) : (labels[name] || name);
  return origArgs.value[name] ? `${label} · ${locale.t('paymentMethod.wxSecretConfigured')}` : label;
}
async function save() {
  try {
    await updatePaymentMethod(form.value.id, form.value.name, form.value.description);
    if (editingWx.value) {
      const args = WX_ARGS
        .map((name) => {
          let v = (wxForm.value[name] || '').trim();
          if (!v) v = origArgs.value[name] || (name === 'tradeType' ? 'JSAPI' : '');
          return v ? { name, value: v } : null;
        })
        .filter(Boolean) as { name: string; value: string }[];
      await updatePaymentMethodArgs(form.value.id, 'wechatpay', args);
    }
    editing.value = null; items.value = await fetchPaymentMethods();
    uni.showToast({ title: locale.t('paymentMethod.saved'), icon: 'none' });
  } catch (e: any) { uni.showToast({ title: e?.message || locale.t('paymentMethod.saveFailed'), icon: 'none' });
  }
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
.sheet { width: 100%; max-height: 82vh; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 40rpx 32rpx calc(env(safe-area-inset-bottom) + 40rpx);
  .st { font-size: 32rpx; font-weight: 700; color: $wa-ink; display: block; margin-bottom: 24rpx; }
  .sec { display: block; margin: 20rpx 0 8rpx; font-size: 26rpx; font-weight: 600; color: $wa-ink; }
  .tip { display: block; margin-bottom: 16rpx; font-size: 22rpx; color: $wa-muted; }
  .ipt { background: #f5f5f5; border-radius: 14rpx; padding: 22rpx 24rpx; font-size: 28rpx; margin-bottom: 20rpx; }
  .tarea { width: 100%; box-sizing: border-box; background: #f5f5f5; border-radius: 14rpx; padding: 22rpx 24rpx; font-size: 24rpx; min-height: 120rpx; margin-bottom: 20rpx; }
  .save { background: $pm-d1; color: #fff; font-size: 30rpx; font-weight: 700; border-radius: 16rpx; line-height: 88rpx; margin-top: 8rpx; }
}
</style>