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
  saveCategoryMapping, fetchPlatformCollections, buildCollectionTree, type CategoryMapping,
} from '../../../apis/collection';

const cats = ref<any[]>([]);
const mapping = ref<CategoryMapping[]>([]);
const platTree = ref<Array<{ id: string; name: string; depth: number }>>([]);
const mappingLoadState = ref<'idle' | 'loading' | 'error'>('idle');

async function reload() {
  cats.value = await fetchCollectionsOptimized();
}
onMounted(() => { reload(); ensurePlatformTree(); });

// 平台（默认租户）分类下拉：懒加载一次
async function ensurePlatformTree() {
  if (platTree.value.length || mappingLoadState.value !== 'idle') return;
  mappingLoadState.value = 'loading';
  try {
    platTree.value = buildCollectionTree(await fetchPlatformCollections());
    mappingLoadState.value = 'ready';
  } catch {
    mappingLoadState.value = 'error';
  }
}

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

// 归位映射：从「平台（默认租户）分类」下拉选择，映射到当前租户分类（tenantCategory）
function onMap(c: any) {
  if (mappingLoadState.value === 'error' || !platTree.value.length) {
    uni.showModal({
      title: '提示',
      content: mappingLoadState.value === 'error'
        ? '未能加载平台分类下拉，请稍后重试'
        : '平台分类为空，无法选择',
      showCancel: false,
    });
    if (mappingLoadState.value === 'error') ensurePlatformTree();
    return;
  }
  const labels = platTree.value.map((p) => p.name.trim());
  uni.showActionSheet({
    itemList: ['（取消）', ...labels],
    success: async (r: any) => {
      if (r.tapIndex === 0) return;
      const chosen = platTree.value[r.tapIndex - 1];
      if (!chosen) return;
      const record = { tenantCategory: c.name, collectionId: String(chosen.id) };
      const mi = mapping.value.findIndex((m) => m.tenantCategory === c.name);
      if (mi >= 0) mapping.value[mi] = record;
      else mapping.value.push(record);
      try {
        await saveCategoryMapping([...mapping.value]);
        uni.showToast({ title: `已映射到「${chosen.name.trim()}」`, icon: 'success' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || '保存映射失败', icon: 'none' });
      }
    },
    fail: () => {},
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