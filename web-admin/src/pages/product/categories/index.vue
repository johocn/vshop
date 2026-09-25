<template>
  <view class="page">
    <view class="toolbar"><button class="add" @tap="onAdd">{{ locale.t('productCategories.newCard') }}</button></view>
    <view class="card" v-for="c in rows" :key="c.id">
      <view class="row" :style="{ paddingLeft: c.depth * 28 + 'rpx' }">
        <text class="pick" @tap="togglePick(c.id)">{{ picked.has(String(c.id)) ? '☑' : '☐' }}</text>
        <text class="caret" v-if="c.children.length" :title="locale.t('category.collapse')" @tap="toggle(c.id)">{{ collapsed.has(c.id) ? '▸' : '▾' }}</text>
        <text class="caret" v-else>·</text>
        <text class="name">{{ c.name }}</text>
        <text class="muted" v-if="c.children.length">{{ c.children.length }}</text>
        <view class="ops">
          <text @tap="onMoveUp(c)">↑</text>
          <text @tap="onMoveDown(c)">↓</text>
          <text :title="locale.t('category.reparent')" @tap="onReparent(c)">↳</text>
          <text @tap="onMap(c)">{{ locale.t('productCategories.mapBack') }}</text>
          <text @tap="onEdit(c)">{{ locale.t('productCategories.rename') }}</text>
          <text class="del" @tap="onDel(c)">{{ locale.t('productCategories.del') }}</text>
        </view>
      </view>
    </view>
    <view v-if="!rows.length" class="empty">{{ locale.t('productCategories.empty') }}</view>
    <view class="bulk" v-if="picked.size">
      <text class="muted">{{ picked.size }}</text>
      <text class="act" @tap="bulkIcon">{{ $t('category.bulkIcon') }}</text>
      <text class="act" @tap="bulkMove">{{ $t('category.bulkMove') }}</text>
      <text class="act" @tap="bulkDelete">{{ $t('category.bulkDelete') }}</text>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import {
  fetchCollectionsOptimized, createTenantCollection, moveCollection, renameCollection, deleteCollectionById,
  saveCategoryMapping, fetchPlatformCollections, buildCollectionTree,
  buildCollectionTreeNodes, flattenCollectionTree,
  setCollectionIcon, pickDeletableCollections,
  type CategoryMapping, type CollectionItem, type CollectionTreeNode,
} from '../../../apis/collection';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const cats = ref<CollectionItem[]>([]);
const collapsed = ref<Set<string>>(new Set());
const mapping = ref<CategoryMapping[]>([]);
const platTree = ref<Array<{ id: string; name: string; depth: number }>>([]);
const mappingLoadState = ref<'idle' | 'loading' | 'error'>('idle');
const picked = ref<Set<string>>(new Set());

const tree = computed(() => buildCollectionTreeNodes(cats.value));
const rows = computed(() => flattenCollectionTree(tree.value, collapsed.value));
/** id → 商品数（productVariantCount），用于批量删的空分类预判 */
const productCountById = computed(() => {
  const m = new Map<string, number>();
  for (const c of cats.value) m.set(String(c.id), c.productVariantCount ?? 0);
  return m;
});

function togglePick(id: string) {
  const s = new Set(picked.value);
  if (s.has(String(id))) s.delete(String(id)); else s.add(String(id));
  picked.value = s;
}

/** 当前勾选（仍存在于列表中的）分类 */
function pickedTargets(): CollectionItem[] {
  return cats.value.filter((c) => picked.value.has(String(c.id)));
}

function toggle(id: string) {
  const s = new Set(collapsed.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  collapsed.value = s;
}

/** id → 节点 的扁平索引，覆盖任意深度（父节点不一定在根数组里） */
function indexNodes(nodes: CollectionTreeNode[], into = new Map<string, CollectionTreeNode>()) {
  for (const n of nodes) {
    into.set(String(n.id), n);
    indexNodes(n.children, into);
  }
  return into;
}
const nodeIndex = computed(() => indexNodes(tree.value));

async function runMove(id: string, parentId: string | null, index: number) {
  try {
    await moveCollection(id, parentId, index);
    await reload();
  } catch {
    uni.showToast({ title: locale.t('category.moveFail'), icon: 'none' });
  }
}

/** 同父级内上/下移：把 index 与相邻兄弟交换后调 moveCollection */
async function swapSibling(node: CollectionTreeNode, dir: -1 | 1) {
  const pid = node.parentId == null ? null : String(node.parentId);
  const siblings = pid ? (nodeIndex.value.get(pid)?.children ?? []) : tree.value;
  const i = siblings.findIndex((s) => String(s.id) === String(node.id));
  const j = i + dir;
  if (i < 0 || j < 0 || j >= siblings.length) return;
  await runMove(node.id, pid, j);
}
function onMoveUp(n: CollectionTreeNode) { void swapSibling(n, -1); }
function onMoveDown(n: CollectionTreeNode) { void swapSibling(n, 1); }

/** 改父级：下拉选目标父分类（含「顶层」） */
function onReparent(n: CollectionTreeNode) {
  const options = [{ id: '', name: locale.t('category.topLevel') },
    ...flattenCollectionTree(tree.value, new Set()).filter((x) => String(x.id) !== String(n.id))
      .map((x) => ({ id: String(x.id), name: '　'.repeat(x.depth) + x.name }))];
  uni.showActionSheet({
    itemList: options.map((o) => o.name),
    success: (r: any) => {
      const target = options[r.tapIndex];
      if (!target) return;
      void runMove(n.id, target.id || null, 0);
    },
  });
}

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
  const name = await promptName(locale.t('productCategories.newNameTitle'));
  if (!name) return;
  try { await createTenantCollection({ name }); await reload(); }
  catch (e: any) { uni.showToast({ title: e?.message || locale.t('productCategories.createFailed'), icon: 'none' }); }
}

// 归位映射：从「平台（默认租户）分类」下拉选择，映射到当前租户分类（tenantCategory）
function onMap(c: any) {
  if (mappingLoadState.value === 'error' || !platTree.value.length) {
    uni.showModal({
      title: locale.t('productCategories.noticeTitle'),
      content: mappingLoadState.value === 'error'
        ? locale.t('productCategories.mapLoadFailed')
        : locale.t('productCategories.mapEmpty'),
      showCancel: false,
    });
    if (mappingLoadState.value === 'error') ensurePlatformTree();
    return;
  }
  const labels = platTree.value.map((p) => p.name.trim());
  uni.showActionSheet({
    itemList: [locale.t('productCategories.cancelOpt'), ...labels],
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
        uni.showToast({ title: locale.t('productCategories.mappedTo').replace('{name}', chosen.name.trim()), icon: 'success' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('productCategories.saveMapFailed'), icon: 'none' });
      }
    },
    fail: () => {},
  });
}
async function onEdit(c: any) {
  const name = await promptName(locale.t('productCategories.renameTitle'));
  if (!name) return;
  try { await renameCollection(c.id, name); await reload(); }
  catch (e: any) { uni.showToast({ title: e?.message || locale.t('productCategories.failed'), icon: 'none' }); }
}
function onDel(c: any) {
  uni.showModal({ title: locale.t('productCategories.deleteTitle'), content: locale.t('productCategories.deleteContent').replace('{name}', c.name), success: async (r) => {
    if (!r.confirm) return;
    try { await deleteCollectionById(c.id); await reload(); }
    catch (e: any) { uni.showToast({ title: e?.message || locale.t('productCategories.deleteFailed'), icon: 'none' }); }
  } });
}

// ── 批量操作 ──────────────────────────────────────────────
/** 批量设图标：弹输入框，留空表示清除图标 */
function bulkIcon() {
  const targets = pickedTargets();
  if (!targets.length) return;
  uni.showModal({
    title: locale.t('category.bulkIcon'),
    editable: true,
    success: async (r) => {
      if (!r.confirm) return;
      const icon = (r.content || '').trim() || null;
      try {
        for (const c of targets) await setCollectionIcon(c.id, icon);
        picked.value = new Set();
        await reload();
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('productCategories.failed'), icon: 'none' });
      }
    },
  });
}

/** 批量移动：选目标父分类（含「顶层」），勾选项不可作为目标 */
function bulkMove() {
  const targets = pickedTargets();
  if (!targets.length) return;
  const pickedIds = new Set(targets.map((c) => String(c.id)));
  const options = [{ id: '', name: locale.t('category.topLevel') },
    ...flattenCollectionTree(tree.value, new Set()).filter((x) => !pickedIds.has(String(x.id)))
      .map((x) => ({ id: String(x.id), name: '　'.repeat(x.depth) + x.name }))];
  uni.showActionSheet({
    itemList: options.map((o) => o.name),
    success: async (r: any) => {
      const target = options[r.tapIndex];
      if (!target) return;
      try {
        for (const c of targets) await moveCollection(c.id, target.id || null, 0);
        picked.value = new Set();
        await reload();
      } catch {
        uni.showToast({ title: locale.t('category.moveFail'), icon: 'none' });
      }
    },
    fail: () => {},
  });
}

/** 批量删除：仅空分类（无商品、无子分类）放行，其余提示原因 */
async function bulkDelete() {
  const targets = pickedTargets();
  if (!targets.length) return;
  const { ok, blocked } = pickDeletableCollections(targets, cats.value, productCountById.value);
  for (const b of blocked) {
    uni.showToast({
      title: locale.t(b.reason === 'hasChildren' ? 'category.blockedChildren' : 'category.blockedProducts')
        .replace('{name}', b.item.name),
      icon: 'none',
    });
  }
  try {
    for (const c of ok) await deleteCollectionById(c.id);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('productCategories.deleteFailed'), icon: 'none' });
  }
  picked.value = new Set();
  await reload();
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .toolbar .add { width: 240rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; margin-bottom: 24rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .pick { width: 40rpx; font-size: 30rpx; color: $wa-muted; text-align: center; }
      .caret { width: 40rpx; font-size: 28rpx; color: $wa-muted; text-align: center; }
      .name { font-size: 28rpx; color: $wa-ink; flex: 1; margin-left: 8rpx; }
      .muted { font-size: 24rpx; color: $wa-muted; margin: 0 16rpx; }
      .ops text { font-size: 26rpx; color: $wa-accent; margin-left: 30rpx; &.del { color: #e64340; } }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .bulk { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: space-around;
    background: $wa-card; padding: 24rpx 32rpx; box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.06);
    .muted { font-size: 26rpx; color: $wa-muted; }
    .act { font-size: 28rpx; color: $wa-accent; }
  }
}
</style>