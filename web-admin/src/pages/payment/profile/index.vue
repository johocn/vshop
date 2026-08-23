<template>
  <view class="page">
    <view class="toolbar"><button class="add" @tap="onCreate">＋ 新建支付档案</button></view>

    <!-- 内联编辑面板 -->
    <view v-if="creating || editing" class="panel">
      <view class="panel-title">{{ editing ? '编辑支付档案' : '新建支付档案' }}</view>

      <view class="field">
        <text class="label">名称</text>
        <input class="ipt" v-model="form.name" placeholder="如 全国标准支付" />
      </view>
      <view class="field">
        <text class="label">Code</text>
        <input class="ipt" v-model="form.code" placeholder="如 wechat" />
      </view>
      <view class="field">
        <text class="label">描述</text>
        <textarea class="area" v-model="form.description" placeholder="选填"></textarea>
      </view>

      <view class="field">
        <text class="label">支付方式</text>
        <button class="mini" @tap="onAddMethod">＋ 添加支付方式</button>
      </view>

      <view class="methods" v-for="(e, i) in methodEntries" :key="e.paymentMethodId">
        <view class="method-row">
          <text class="method-code">{{ e.code }}</text>
          <text class="method-del" @tap="onRemoveMethod(i)">移除</text>
        </view>

        <view class="entry-ops">
          <button class="mini" @tap="onConfigInstallment(i)">分期配置</button>
          <text v-if="e.options" class="options-preview">{{ optionsPreview(e.options) }}</text>
          <text v-else class="options-empty">未配置分期</text>
        </view>
      </view>

      <view class="field row">
        <text class="label">设为租户默认</text>
        <switch :checked="setDefault" @change="setDefault = $event.detail.value" color="#2563eb" style="transform: scale(0.8);" />
      </view>

      <view class="panel-ops">
        <button class="btn ghost" @tap="onClose">取消</button>
        <button class="btn main" @tap="onSave">保存</button>
      </view>
    </view>

    <view class="card" v-for="s in items" :key="s.id">
      <view class="row">
        <text class="name">{{ s.name }}</text>
        <text v-if="s.isTenantDefault" class="default-badge">默认</text>
        <text class="code">{{ s.code }}</text>
      </view>
      <text class="desc">{{ s.description || '—' }}</text>
      <view class="ops">
        <text @tap="onEdit(s)">编辑</text>
        <text v-if="!s.isTenantDefault" @tap="onSetDefault(s)">设为默认</text>
        <text class="del" @tap="onDel(s)">删除</text>
      </view>
    </view>
    <view v-if="!items.length" class="empty">暂无支付档案</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import {
  fetchPaymentProfiles, fetchPaymentMethods, createPaymentProfile,
  updatePaymentProfile, deletePaymentProfile, setTenantDefaultPaymentProfile,
  PaymentProfileItem,
} from '../../../apis/payment-profile';

interface MethodEntry {
  paymentMethodId: string;
  code: string;
  mode: string; // 'installment'
  options: Record<string, unknown> | null;
}

const items = ref<any[]>([]);
const methods = ref<{ id: string; code: string }[]>([]);

const creating = ref(false);
const editing = ref(false);
const editingId = ref<string | null>(null);
const setDefault = ref(false);

const form = ref({ name: '', code: '', description: '' });
const methodEntries = ref<MethodEntry[]>([]);

async function reload() {
  items.value = await fetchPaymentProfiles();
}
function loadMethods() {
  return fetchPaymentMethods().then((m) => { methods.value = m; });
}
onMounted(async () => {
  await Promise.all([reload(), loadMethods()]);
});

function onCreate() {
  creating.value = true;
  editing.value = false;
  editingId.value = null;
  form.value = { name: '', code: '', description: '' };
  methodEntries.value = [];
  setDefault.value = false;
}

function onEdit(s: PaymentProfileItem) {
  creating.value = false;
  editing.value = true;
  editingId.value = s.id;
  form.value = { name: s.name, code: s.code, description: s.description || '' };
  setDefault.value = false;
  const cfgs = (s.methodConfigs || []).reduce<Record<string, any>>((acc, c) => {
    acc[c.paymentMethodId] = c;
    return acc;
  }, {});
  methodEntries.value = (s.paymentMethods || []).map((m: { id: string; code: string }) => {
    const cfg = cfgs[m.id];
    return {
      paymentMethodId: m.id,
      code: m.code,
      mode: cfg?.mode || 'installment',
      options: cfg?.options ?? null,
    };
  });
}

function onClose() {
  creating.value = false;
  editing.value = false;
  editingId.value = null;
}

async function onAddMethod() {
  if (!methods.value.length) {
    uni.showToast({ title: '请先在「支付方式」页面配置支付方式', icon: 'none' });
    return;
  }
  const selected = new Set(methodEntries.value.map((e) => e.paymentMethodId));
  const avail = methods.value.filter((m) => !selected.has(m.id));
  if (!avail.length) {
    uni.showToast({ title: '已全部添加', icon: 'none' });
    return;
  }
  uni.showActionSheet({
    itemList: avail.map((m) => m.code),
    success: (res) => {
      const m = avail[res.tapIndex];
      if (!m) return;
      methodEntries.value.push({ paymentMethodId: m.id, code: m.code, mode: 'installment', options: null });
    },
    fail: () => {},
  });
}

function onRemoveMethod(i: number) {
  methodEntries.value.splice(i, 1);
}

function optionsPreview(options: Record<string, unknown>): string {
  const s = JSON.stringify(options);
  return s.length > 30 ? s.slice(0, 30) + '…' : s;
}

function onConfigInstallment(i: number) {
  const e = methodEntries.value[i];
  if (!e) return;
  const oldText = e.options ? JSON.stringify(e.options) : '{}';
  uni.showModal({
    title: `分期配置（${e.code}）`,
    editable: true,
    content: oldText,
    success: (r) => {
      if (!r.confirm) return;
      try {
        const parsed = JSON.parse(r.content);
        e.options = parsed;
        e.mode = 'installment';
      } catch (err) {
        uni.showToast({ title: 'JSON 无效', icon: 'none' });
      }
    },
  });
}

async function onSave() {
  if (!form.value.name.trim()) { uni.showToast({ title: '请填写名称', icon: 'none' }); return; }
  if (!form.value.code.trim()) { uni.showToast({ title: '请填写 Code', icon: 'none' }); return; }
  if (!methodEntries.value.length) { uni.showToast({ title: '请至少选择一个支付方式', icon: 'none' }); return; }

  const paymentMethodIds = methodEntries.value.map((e) => e.paymentMethodId);
  const methodConfigs = methodEntries.value.map((e) => ({
    paymentMethodId: e.paymentMethodId,
    mode: e.mode || 'installment',
    options: e.options ?? null,
  }));

  try {
    let id = editingId.value;
    if (creating.value || id == null) {
      id = await createPaymentProfile({
        name: form.value.name.trim(),
        code: form.value.code.trim(),
        description: form.value.description,
        paymentMethodIds,
        methodConfigs,
      });
    } else {
      await updatePaymentProfile(id, {
        name: form.value.name.trim(),
        code: form.value.code.trim(),
        description: form.value.description,
        paymentMethodIds,
        methodConfigs,
      });
    }
    if (setDefault.value && id) {
      await setTenantDefaultPaymentProfile(id);
    }
    creating.value = false;
    editing.value = false;
    editingId.value = null;
    await reload();
    uni.showToast({ title: '保存成功' });
  } catch (err: any) {
    uni.showToast({ title: err?.message || '保存失败', icon: 'none' });
  }
}

async function onSetDefault(s: PaymentProfileItem) {
  try {
    await setTenantDefaultPaymentProfile(s.id);
    await reload();
    uni.showToast({ title: '已设为默认' });
  } catch (err: any) {
    uni.showToast({ title: err?.message || '设置失败', icon: 'none' });
  }
}

function onDel(s: PaymentProfileItem) {
  uni.showModal({
    title: '删除',
    content: `删除「${s.name}」？`,
    success: async (r) => {
      if (!r.confirm) return;
      try { await deletePaymentProfile(s.id); await reload(); } catch (e: any) { uni.showToast({ title: e?.message || '删除失败', icon: 'none' }); }
    },
  });
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .toolbar .add { width: 260rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; margin-bottom: 24rpx; }

  .panel { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .panel-title { font-size: 30rpx; color: $wa-ink; font-weight: 600; margin-bottom: 20rpx; }
    .field { margin-bottom: 18rpx;
      &.row { display: flex; align-items: center; justify-content: space-between; }
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx; }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; }
      .area { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; width: 100%; height: 120rpx; box-sizing: border-box; }
    }
    .mini { display: inline-block; width: auto; margin: 8rpx 0 0; padding: 0 28rpx; line-height: 56rpx; font-size: 26rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius; }

    .methods { border: 1rpx solid $wa-rule; border-radius: $wa-radius; padding: 20rpx; margin-bottom: 16rpx;
      .method-row { display: flex; align-items: center; justify-content: space-between;
        .method-code { font-size: 28rpx; color: $wa-ink; font-weight: 500; }
        .method-del { font-size: 24rpx; color: #e64340; }
      }
      .entry-ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx dashed $wa-rule; display: flex; align-items: center; flex-wrap: wrap;
        .mini { margin: 0; }
        .options-preview { font-size: 22rpx; color: $wa-muted; margin-left: 16rpx; flex: 1; word-break: break-all; }
        .options-empty { font-size: 22rpx; color: $wa-muted; margin-left: 16rpx; }
      }
    }

    .panel-ops { display: flex; justify-content: flex-end; margin-top: 12rpx;
      .btn { flex: 1; margin: 0 8rpx; font-size: 28rpx; border-radius: $wa-radius; line-height: 72rpx; }
      .main { background: $wa-accent; color: #fff; }
      .ghost { background: $wa-bg; color: $wa-muted; }
    }
  }

  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .name { font-size: 28rpx; color: $wa-ink; flex: 1; font-weight: 500; }
      .code { font-size: 24rpx; color: $wa-muted; }
    }
    .default-badge { font-size: 22rpx; color: #fff; background: $wa-accent; border-radius: 20rpx; padding: 2rpx 16rpx; margin-right: 16rpx; }
    .desc { display: block; margin-top: 8rpx; font-size: 26rpx; color: $wa-muted; }
    .ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule;
      text { font-size: 26rpx; color: $wa-accent; margin-right: 32rpx;
        &.del { color: #e64340; }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>