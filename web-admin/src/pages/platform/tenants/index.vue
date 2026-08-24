<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">租户列表</text>
        <text class="head-btn" @tap="onCreate">＋新建租户</text>
      </view>
      <view class="item" v-for="t in tenants" :key="t.id">
        <view class="info">
          <text class="name">{{ t.name }}</text>
          <text class="sub">#{{ t.tenantNo ?? '—' }} · {{ t.code }} · {{ t.isOfficial ? '官方自营' : '第三方' }}</text>
        </view>
        <switch :checked="t.enabled" color="#4f8cff" @change="onToggle(t, $event)" />
        <text class="link" @tap="goDetail(t)">管理 ›</text>
      </view>
      <view v-if="!tenants.length" class="empty">暂无租户</view>
    </view>
  </view>

  <view class="mask" v-if="showCreate" @tap="showCreate = false">
    <view class="pop" @tap.stop>
      <text class="pop-title">新建租户</text>
      <view class="field">
        <text class="label">店铺名 <text class="req">*</text></text>
        <input class="input" v-model="form.name" placeholder="必填，将作为租户显示名" />
      </view>
      <view class="field row">
        <text class="label">租户编号</text>
        <text class="auto-val">自动生成（t+顺序号）</text>
      </view>
      <view class="field row">
        <text class="label">官方自营</text>
        <switch :checked="form.isOfficial" color="#4f8cff" @change="form.isOfficial = $event.detail.value" />
      </view>
      <view class="actions">
        <button class="btn ghost" @tap="showCreate = false">取消</button>
        <button class="btn" @tap="submitCreate">创建</button>
      </view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchTenants, setTenantEnabled, createTenant, type TenantItem } from '../../../apis/tenant-admin';
import { graphQlErrorMsg } from '../../../apis/client';

const tenants = ref<TenantItem[]>([]);
const showCreate = ref(false);
const form = ref({ name: '', isOfficial: false });

async function load() {
  const res = await fetchTenants();
  tenants.value = res.items;
}
function onToggle(t: TenantItem, e: any) {
  const enabled = e.detail.value as boolean;
  uni.showModal({
    title: enabled ? '启用租户' : '停用租户',
    content: `确定${enabled ? '启用' : '停用'}「${t.name}」？停用后该租户所有后台人员无法登录（C端不受影响）。`,
    success: async (r) => {
      if (!r.confirm) return load();
      try {
        await setTenantEnabled(t.id, enabled);
        t.enabled = enabled;
        uni.showToast({ title: '已更新', icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: err?.message || '操作失败', icon: 'none' });
        load();
      }
    },
  });
}
function onCreate() { form.value = { name: '', isOfficial: false }; showCreate.value = true; }
async function submitCreate() {
  const name = form.value.name.trim();
  if (!name) { uni.showToast({ title: '请填写店铺名', icon: 'none' }); return; }
  try {
    await createTenant({ name, isOfficial: form.value.isOfficial });
    uni.showToast({ title: '已创建（编号自动生成）', icon: 'none' });
    showCreate.value = false;
    load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '创建失败'), icon: 'none' });
  }
}
function goDetail(t: TenantItem) {
  uni.navigateTo({ url: `/pages/platform/tenants/detail?id=${t.id}&name=${encodeURIComponent(t.name)}` });
}
onMounted(load);
</script>
<style lang="scss" scoped>
.page { padding: 24rpx; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.head-btn { flex: 0 0 auto; padding: 8rpx 26rpx; background: $pm-info; color: #fff; border-radius: 999rpx; font-size: 26rpx; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.info { flex: 1; }
.name { display: block; font-size: 28rpx; font-weight: 600; }
.sub { display: block; font-size: 22rpx; color: #999; margin-top: 6rpx; }
.link { color: $pm-info; font-size: 26rpx; }
.empty { text-align: center; color: #bbb; padding: 40rpx 0; font-size: 26rpx; }
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 600rpx; background: #fff; border-radius: 20rpx; padding: 40rpx; }
.pop-title { display: block; font-size: 32rpx; font-weight: 700; text-align: center; margin-bottom: 24rpx; }
.field { margin-bottom: 24rpx; }
.req { color: #e64340; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.input { border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 28rpx; }
.auto-val { color: #999; font-size: 26rpx; }
.row { display: flex; justify-content: space-between; align-items: center; }
.actions { display: flex; gap: 24rpx; margin-top: 8rpx; }
.btn { flex: 1; border-radius: 40rpx; font-size: 28rpx; background: #4f8cff; color: #fff; line-height: 2.4; }
.ghost { background: #f2f2f2; color: #666; }
</style>