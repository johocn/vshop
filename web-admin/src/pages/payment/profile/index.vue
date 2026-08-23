<template>
  <view class="page">
    <view class="toolbar"><button class="add" @tap="onAdd">＋ 新建支付档案</button></view>
    <view class="card" v-for="s in items" :key="s.id">
      <view class="row">
        <text class="name">{{ s.name }}</text>
        <text class="code">{{ s.code }}</text>
      </view>
      <text class="desc">{{ s.description || '—' }}</text>
      <view class="ops">
        <text @tap="onEdit(s)">编辑</text>
        <text class="del" @tap="onDel(s)">删除</text>
      </view>
    </view>
    <view v-if="!items.length" class="empty">暂无支付档案</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchPaymentProfiles, createPaymentProfile, updatePaymentProfile, deletePaymentProfile } from '../../../apis/payment-profile';

const items = ref<any[]>([]);
async function reload() { items.value = await fetchPaymentProfiles(); }
onMounted(reload);

function promptForm(edit?: any): Promise<any> {
  return new Promise((resolve) => {
    uni.showModal({ title: edit ? '编辑支付档案' : '新建支付档案', editable: true, placeholderText: '名称',
      success: async (r1) => {
        if (!r1.confirm || !r1.content) return resolve(null);
        const code = await new Promise<string>((res2) => uni.showModal({ title: 'Code', editable: true, placeholderText: edit?.code || '如 wechat', success: (r2) => res2(r2.confirm ? r2.content : (edit?.code || '')) }));
        const desc = await new Promise<string>((res3) => uni.showModal({ title: '描述', editable: true, placeholderText: edit?.description || '', success: (r3) => res3(r3.confirm ? r3.content : (edit?.description || '')) }));
        resolve({ name: r1.content, code, description: desc });
      },
    });
  });
}
async function onAdd() {
  const f = await promptForm();
  if (!f) return;
  try { await createPaymentProfile({ name: f.name, code: f.code, description: f.description, paymentMethodIds: [] }); await reload(); }
  catch (e: any) { uni.showToast({ title: e?.message || '创建失败', icon: 'none' }); }
}
async function onEdit(s: any) {
  const f = await promptForm(s);
  if (!f) return;
  try { await updatePaymentProfile(s.id, f); await reload(); }
  catch (e: any) { uni.showToast({ title: e?.message || '失败', icon: 'none' }); }
}
function onDel(s: any) {
  uni.showModal({ title: '删除', content: `删除「${s.name}」？`, success: async (r) => { if (!r.confirm) return; try { await deletePaymentProfile(s.id); await reload(); } catch (e: any) { uni.showToast({ title: e?.message || '删除失败', icon: 'none' }); } } });
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .toolbar .add { width: 260rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; margin-bottom: 24rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .name { font-size: 28rpx; color: $wa-ink; flex: 1; font-weight: 500; }
      .code { font-size: 24rpx; color: $wa-muted; }
    }
    .desc { display: block; margin-top: 8rpx; font-size: 26rpx; color: $wa-muted; }
    .ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule;
      text { font-size: 26rpx; color: $wa-accent; margin-right: 32rpx; &.del { color: #e64340; } }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>