<template>
  <view class="page">
    <view class="toolbar"><button class="add" @tap="onAdd">＋ 新建分类</button></view>
    <view class="card" v-for="c in cats" :key="c.id">
      <view class="row">
        <text class="name">{{ c.name }}</text>
        <view class="ops">
          <text @tap="onMap(c)">归位映射</text>
          <text @tap="onEdit(c)">重命名</text>
          <text class="del" @tap="onDel(c)">删除</text>
        </view>
      </view>
    </view>
    <view v-if="!cats.length" class="empty">暂无分类</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import {
  fetchCollectionsOptimized, createTenantCollection, renameCollection, deleteCollectionById,
  saveCategoryMapping, type CategoryMapping,
} from '../../../apis/collection';

const cats = ref<any[]>([]);
const mapping = ref<CategoryMapping[]>([]);
async function reload() { cats.value = await fetchCollectionsOptimized(); }
onMounted(reload);

function promptName(title: string): Promise<string> {
  return new Promise((resolve) => {
    uni.showModal({ title, editable: true, success: (r) => resolve(r.confirm ? (r.content || '') : '') });
  });
}
async function onAdd() {
  const name = await promptName('新分类名称');
  if (!name) return;
  try { await createTenantCollection({ name }); await reload(); }
  catch (e: any) { uni.showToast({ title: e?.message || '创建失败', icon: 'none' }); }
}
// 归位映射：让用户输入该租户分类要映射到的平台分类 id，upsert 到 mapping 后写回当前租户渠道
function onMap(c: any) {
  const existing = mapping.value.find((m) => m.tenantCategory === c.name)?.collectionId || '';
  uni.showModal({
    title: `「${c.name}」归位映射`,
    editable: true,
    placeholderText: '输入平台分类 id',
    editableContent: existing,
    success: async (r) => {
      if (!r.confirm) return;
      const collectionId = (r.content || '').trim();
      if (!collectionId) return uni.showToast({ title: '请输入平台分类 id', icon: 'none' });
      const idx = mapping.value.findIndex((m) => m.tenantCategory === c.name);
      if (idx >= 0) mapping.value[idx] = { tenantCategory: c.name, collectionId };
      else mapping.value.push({ tenantCategory: c.name, collectionId });
      try {
        await saveCategoryMapping([...mapping.value]);
        uni.showToast({ title: '已保存映射', icon: 'success' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || '保存映射失败', icon: 'none' });
      }
    },
  });
}
async function onEdit(c: any) {
  const name = await promptName('重命名分类');
  if (!name) return;
  try { await renameCollection(c.id, name); await reload(); }
  catch (e: any) { uni.showToast({ title: e?.message || '失败', icon: 'none' }); }
}
function onDel(c: any) {
  uni.showModal({ title: '删除分类', content: `确定删除「${c.name}」？`, success: async (r) => {
    if (!r.confirm) return;
    try { await deleteCollectionById(c.id); await reload(); }
    catch (e: any) { uni.showToast({ title: e?.message || '删除失败', icon: 'none' }); }
  } });
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .toolbar .add { width: 240rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; margin-bottom: 24rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .name { font-size: 28rpx; color: $wa-ink; flex: 1; }
      .ops text { font-size: 26rpx; color: $wa-accent; margin-left: 30rpx; &.del { color: #e64340; } }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>