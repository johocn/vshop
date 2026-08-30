<template>
  <view v-show="visible" class="mlm__overlay" @tap="onClose">
    <view class="mlm__panel" @tap.stop>
      <view class="mlm__header">
        <text class="mlm__title">媒体库</text>
        <view class="mlm__header-actions">
          <view class="mlm__upload" @tap="chooseAndUpload">上传</view>
          <text class="mlm__refresh" @tap="refresh">⟳</text>
          <text class="mlm__close" @tap="onClose">×</text>
        </view>
      </view>

      <view class="mlm__search">
        <input
          v-model="searchKeyword"
          class="mlm__search-input"
          placeholder="搜索文件名 / 分类码"
          confirm-type="search"
          @confirm="doSearch"
        />
        <text v-if="searchKeyword" class="mlm__search-clear" @tap="clearSearch">×</text>
      </view>

      <!-- 分组多行标签过滤（按当前租户，普通用户则本人） -->
      <view class="mlm__filters">
        <view class="mlm__group-grid">
          <view class="mlm__chip" :class="{ on: !activeGroup && !activeTag }" @tap="selectTag('')">全部</view>
        </view>
        <view v-for="g in tagGroups" :key="g.key" class="mlm__group">
          <view class="mlm__group-head" :class="{ on: activeGroup === g.key }">
            <!-- 箭头：仅折叠，不与大分类冲突 -->
            <text class="mlm__group-arrow" @tap.stop="toggleGroup(g.key)">{{ collapsedGroups[g.key] ? '▸' : '▾' }}</text>
            <!-- 标题行：整组过滤（大分类） -->
            <view class="mlm__group-select" @tap="selectGroup(g.key)">
              <text class="mlm__group-title">{{ g.title }}</text>
              <text class="mlm__group-count">{{ g.count }}</text>
            </view>
          </view>
          <view v-if="!collapsedGroups[g.key]" class="mlm__group-grid">
            <view
              v-for="t in g.tags"
              :key="t.name"
              class="mlm__chip"
              :class="{ on: activeTag === t.name }"
              @tap="selectTag(t.name)"
            >{{ t.name }}<text class="mlm__chip-count">{{ t.count }}</text></view>
          </view>
        </view>
      </view>

      <scroll-view
        class="mlm__grid-scroll"
        scroll-y
        @scrolltolower="loadMore"
        @scroll="onGridScroll"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
      >
        <view class="mlm__pull-area" :style="{ transform: pullOffset ? `translateY(${pullOffset}px)` : '' }">
          <view v-if="pulling || refreshing" class="mlm__pull-hint" :class="{ releasing: pullOffset >= PULL_THRESHOLD }">
            {{ refreshing ? '刷新中…' : pullOffset >= PULL_THRESHOLD ? '释放刷新' : '下拉刷新' }}
          </view>
          <view class="mlm__grid">
            <view
              v-for="(it, i) in filteredItems"
              :key="it.id"
              class="mlm__cell"
              :class="{ on: isSelected(it.id) }"
              @tap="toggle(it)"
              @longpress="preview(filteredItems, i)"
            >
              <video
                v-if="isVideo(it)"
                class="mlm__cell-thumb"
                :src="it.source"
                :data-mime="it.mimeType"
                :show-center-play-btn="false"
                object-fit="cover"
                controls
              />
              <image v-else class="mlm__cell-thumb" :src="it.preview" mode="aspectFill" />
              <view v-if="isSelected(it.id)" class="mlm__mark" @tap.stop>✓</view>
              <view class="mlm__cell-del" @tap.stop="onDelete(it)">🗑</view>
              <view class="mlm__cell-meta">
                <text class="mlm__cell-name">{{ it.name }}</text>
                <view v-if="(it.assetTags || []).length" class="mlm__cell-tags">
                  <text v-for="tg in it.assetTags" :key="tg" class="mlm__cell-tag">{{ tg }}</text>
                </view>
              </view>
            </view>
          </view>
          <view v-if="uploading" class="mlm__tip">上传中…</view>
          <view v-else-if="loadingMore" class="mlm__tip">加载中…</view>
          <view v-else-if="!loadedAll" class="mlm__tip" @tap="loadMore">上拉加载更多</view>
          <view v-else-if="!filteredItems.length" class="mlm__empty">{{ activeTag ? '暂无【' + activeTag + '】图片' : activeGroup ? '该分组下暂无可选资源' : '媒体库暂无可选资源' }}</view>
          <view v-else class="mlm__tip">没有更多了</view>
        </view>
      </scroll-view>

      <!-- 底部操作条：已选 + 打标 + 确定 -->
      <view class="mlm__footer">
        <text class="mlm__picked">已选 {{ selected.length }}/{{ max }}</text>
        <view class="mlm__footer-actions">
          <view class="mlm__tag-main" :class="{ disabled: !selected.length }" @tap="openTagPanel">打标</view>
          <view class="mlm__confirm" @tap="confirm">确定</view>
        </view>
      </view>
    </view>

    <!-- 打标分类面板 -->
    <view v-if="panelVisible" class="mlm__panel-mask" @tap.stop="closePanel">
      <view class="mlm__tag-panel" @tap.stop>
        <view class="mlm__tag-panel-head">
          <text class="mlm__tag-panel-title">为已选 {{ selected.length }} 张图片打标</text>
          <text class="mlm__tag-panel-x" @tap="closePanel">×</text>
        </view>
        <view class="mlm__tag-panel-body">
          <view v-for="g in tagGroups" :key="g.key" class="mlm__panel-group">
            <text class="mlm__panel-group-title">{{ g.title }}</text>
            <view class="mlm__panel-chips">
              <view
                v-for="t in g.tags"
                :key="t.name"
                class="mlm__panel-chip"
                :class="{ on: selectedTags.includes(t.name) }"
                @tap="toggleTagOnSelected(t.name)"
              >{{ t.name }}<text v-if="hasTagOnSelected(t.name)" class="mlm__panel-chip-exists">已有</text></view>
            </view>
          </view>
          <view class="mlm__panel-add">
            <input v-model="tagInput" class="mlm__tag-input" placeholder="输入新分类码，回车添加" confirm-type="done" @confirm="addTag" />
            <view class="mlm__panel-add-btn" @tap="addTag">添加</view>
          </view>
        </view>
        <view class="mlm__panel-foot">
          <text class="mlm__panel-clear" @tap="clearPanelTags">清空</text>
          <text class="mlm__panel-count">已选 {{ selectedTags.length }} 个分类</text>
          <view class="mlm__panel-confirm" :class="{ disabled: !selectedTags.length }" @tap="confirmTags">确认</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import {
  fetchAssets,
  fetchAssetTags,
  setAssetTags,
  uploadAsset,
  deleteAsset,
  type AssetItem,
} from '../apis/asset';

/** 分组成员常量（覆盖 PRESET_ASSET_TAGS 全部预设） */
const TAG_GROUPS = [
  { key: 'product', title: '商品图', tags: ['主图', '白底图', '细节图', '场景图', '实拍图', '规格图', '商详图'] },
  { key: 'rich', title: '富媒体', tags: ['商品视频', '实拍视频'] },
  { key: 'marketing', title: '营销', tags: ['首页Banner', '活动海报', '广告图'] },
  { key: 'shop', title: '店铺', tags: ['店铺装修', '分类图标', '品牌图'] },
  { key: 'qual', title: '资质', tags: ['资质证书', '检测报告', '授权书', '说明书'] },
  { key: 'common', title: '通用', tags: ['轮播图'] },
];

/** 预设常用分类（运营可点选打标，也可自由输入新分类码） */
const PRESET_ASSET_TAGS: string[] = TAG_GROUPS.flatMap((g) => g.tags);

const props = withDefaults(
  defineProps<{
    visible: boolean;
    max?: number;
    mediaType?: 'image' | 'video' | 'mixed';
    value?: string[];
  }>(),
  {
    max: 9,
    mediaType: 'mixed',
    value: () => [],
  },
);
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void; (e: 'confirm', assets: AssetItem[]): void }>();

const allItems = ref<AssetItem[]>([]);
const selected = ref<AssetItem[]>([]);
const loadedAll = ref(false);
const loadingMore = ref(false);
const uploading = ref(false);
const searchKeyword = ref('');

// 分类标签状态
const availableTags = ref<Array<{ name: string; count: number }>>([]);
const activeTag = ref(''); // 小分类 = 具体标签
const activeGroup = ref(''); // 大分类 = 组 key（product/rich/.../custom）
const selectedTags = ref<string[]>([]);
const tagInput = ref('');
const tagSaving = ref(false);

// 分组折叠状态
const collapsedGroups = ref<Record<string, boolean>>({});

// 打标面板
const panelVisible = ref(false);

// 下拉刷新
const PULL_THRESHOLD = 60;
const pullOffset = ref(0);
const refreshing = ref(false);
const pulling = ref(false);
let touchStartY = 0;

function isVideo(it: AssetItem): boolean {
  return (it.mimeType || '').toLowerCase().startsWith('video');
}

function isSelected(id: string): boolean {
  return selected.value.some((x) => x.id === id);
}

function typeMatch(it: AssetItem): boolean {
  if (props.mediaType === 'mixed') return true;
  const m = (it.mimeType || '').toLowerCase();
  return props.mediaType === 'image' ? m.startsWith('image') : m.startsWith('video');
}

// 打开时以 props.value 预选（MediaPicker 场景复用已选；富文本场景传空即新选）
watch(
  () => props.visible,
  (v) => {
    if (v) {
      const m = new Map(allItems.value.map((x) => [x.id, x]));
      selected.value = (props.value || [])
        .map((id) => m.get(id))
        .filter((a): a is AssetItem => !!a);
      searchKeyword.value = '';
      selectedTags.value = [];
      panelVisible.value = false;
      loadTags();
      if (!allItems.value.length) load(false);
    }
  },
);

const tagCountMap = ref<Record<string, number>>({});
async function loadTags() {
  try {
    availableTags.value = await fetchAssetTags();
    const m: Record<string, number> = {};
    for (const t of availableTags.value) m[t.name] = t.count;
    tagCountMap.value = m;
  } catch (e: any) {
    availableTags.value = [];
    tagCountMap.value = {};
  }
}

// 分组多行网格：预设在前按组分、额外非预设归入「自定义」
const tagGroups = computed(() => {
  const groups = TAG_GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    count: g.tags.reduce((sum, n) => sum + (tagCountMap.value[n] ?? 0), 0),
    tags: g.tags.map((n) => ({ name: n, count: tagCountMap.value[n] ?? 0 })),
  }));
  const seen = new Set(PRESET_ASSET_TAGS);
  const extras = availableTags.value
    .map((t) => t.name)
    .filter((n) => !seen.has(n) && (seen.add(n), true))
    .map((n) => ({ name: n, count: tagCountMap.value[n] ?? 0 }));
  if (extras.length) {
    groups.push({
      key: 'custom',
      title: '自定义',
      count: extras.reduce((s, t) => s + t.count, 0),
      tags: extras,
    });
  }
  return groups;
});

const filteredItems = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase();
  return allItems.value.filter(
    (it) =>
      typeMatch(it) &&
      (!activeTag.value || (it.assetTags || []).includes(activeTag.value)) &&
      (!kw || !it.name || it.name.toLowerCase().includes(kw)),
  );
});

function selectTag(tag: string) {
  // 「全部」= 清空两级过滤
  if (tag === '') {
    activeGroup.value = '';
    activeTag.value = '';
    load(false);
    return;
  }
  // 小分类：组内 chip 天然属当前组；再点一次取消（单标）
  activeTag.value = activeTag.value === tag ? '' : tag;
  load(false);
}

// 二级过滤的加载参数映射：
// - 小分类：tags = [activeTag]（单标收窄）
// - 大分类：tags = 该组全部标签（自定义组为其额外标签）
// - 无筛选：null（不强加 tags）
const filterTags = computed<string[] | null>(() => {
  if (activeTag.value) return [activeTag.value];
  if (activeGroup.value) {
    const g = tagGroups.value.find((x) => x.key === activeGroup.value);
    if (g && g.tags.length) return g.tags.map((t) => t.name);
  }
  return null;
});

// 大分类：整组过滤
function selectGroup(key: string) {
  // 已是该组则取消（回到全部），否则设为该组并清空小分类
  activeGroup.value = activeGroup.value === key ? '' : key;
  activeTag.value = '';
  load(false);
}

function toggleGroup(key: string) {
  collapsedGroups.value[key] = !collapsedGroups.value[key];
}

function toggleTagOnSelected(tag: string) {
  const idx = selectedTags.value.indexOf(tag);
  if (idx >= 0) selectedTags.value = selectedTags.value.filter((t) => t !== tag);
  else selectedTags.value = [...selectedTags.value, tag];
}

function addTag() {
  const t = tagInput.value.trim();
  if (!t) return;
  if (!selectedTags.value.includes(t)) selectedTags.value = [...selectedTags.value, t];
  tagInput.value = '';
}

// 已选图片中是否已有该标签（用于面板「已有」态）
function hasTagOnSelected(tag: string): boolean {
  return selected.value.some((x) => (x.assetTags || []).includes(tag));
}

// ---- 下拉刷新手势 ----
const gridScrollTop = ref(0);
function onGridScroll(e: any) {
  gridScrollTop.value = e.detail?.scrollTop || 0;
}
function onTouchStart(e: any) {
  touchStartY = e.touches[0].clientY;
  pulling.value = true;
}
function onTouchMove(e: any) {
  if (!pulling.value) return;
  if (gridScrollTop.value > 0) {
    pullOffset.value = 0;
    return;
  }
  const delta = e.touches[0].clientY - touchStartY;
  if (delta <= 0) {
    pullOffset.value = 0;
    return;
  }
  pullOffset.value = Math.round(Math.min(delta, 120) * 0.5);
}
function onTouchEnd() {
  pulling.value = false;
  if (pullOffset.value >= PULL_THRESHOLD) refresh();
  pullOffset.value = 0;
}

async function refresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    allItems.value = [];
    loadedAll.value = false;
    await loadMore();
    await loadTags();
  } finally {
    refreshing.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value || loadedAll.value) return;
  loadingMore.value = true;
  try {
    const s = allItems.value.length;
    const r = await fetchAssets(30, s, filterTags.value ?? undefined);
    const seen = new Set(allItems.value.map((i) => i.id));
    const fresh = r.items.filter((i) => !seen.has(i.id));
    allItems.value = allItems.value.concat(fresh);
    if (allItems.value.length >= r.totalItems || fresh.length === 0) loadedAll.value = true;
  } finally {
    loadingMore.value = false;
  }
}

async function load(keep = false) {
  if (!keep) {
    allItems.value = [];
    loadedAll.value = false;
  }
  await loadMore();
}

function doSearch() {
  // 搜索为响应式 client 过滤（filteredItems），无需额外请求
}
function clearSearch() {
  searchKeyword.value = '';
}

function toggle(it: AssetItem) {
  const idx = selected.value.findIndex((x) => x.id === it.id);
  if (idx >= 0) {
    selected.value = selected.value.filter((x) => x.id !== it.id);
  } else {
    if (selected.value.length >= props.max) {
      uni.showToast({ title: `最多选择 ${props.max} 个`, icon: 'none' });
      return;
    }
    selected.value.push(it);
  }
}

function onDelete(it: AssetItem) {
  uni.showModal({
    title: '删除资源',
    content: '确定删除这个资源？将同时删除媒体文件。若该资源正被商品/自提点等引用，删除后相关位置将无法显示。',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteAsset(it.id);
        selected.value = selected.value.filter((x) => x.id !== it.id);
        allItems.value = allItems.value.filter((x) => x.id !== it.id);
        await load(false);
        await loadTags();
        uni.showToast({ title: '已删除', icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || '删除失败', icon: 'none' });
      }
    },
  });
}

function preview(list: AssetItem[], index = 0) {
  const flat = list.filter(Boolean);
  if (!flat.length) return;
  const videoTarget = flat.find((x) => isVideo(x));
  if (videoTarget) {
    const sources = flat.map((u) => ({ url: u.source, type: 'video' as any }));
    // @ts-expect-error 平台差异：H5/App 支持 previewMedia 时不会报错
    uni.previewMedia({ sources, current: Math.max(0, flat.indexOf(videoTarget)) });
  } else {
    const urls = flat.map((u) => u.source || u.preview);
    uni.previewImage({ urls, current: urls[index] ?? urls[0] });
  }
}

function chooseFiles(remain: number): Promise<any[]> {
  if (props.mediaType === 'image') {
    return new Promise((resolve, reject) =>
      uni.chooseImage({ count: remain, success: (r) => resolve(r.tempFiles || []), fail: reject }),
    );
  }
  if (props.mediaType === 'video') {
    return new Promise((resolve, reject) =>
      uni.chooseVideo({ success: (r) => resolve([r]), fail: reject }),
    );
  }
  // H5 不支持 uni.chooseMedia（混合选图/视频会静默无反应），改用原生 file input
  // #ifdef H5
  return chooseFilesMixedH5(remain);
  // #endif
  // #ifndef H5
  return new Promise((resolve, reject) =>
    uni.chooseMedia({ count: remain, mediaType: ['image', 'video'], success: (r) => resolve(r.tempFiles || []), fail: reject }),
  );
  // #endif
}

// #ifdef H5
function chooseFilesMixedH5(_remain: number): Promise<any[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const files = Array.from((input.files || []) as FileList);
      document.body.removeChild(input);
      // 兼容 toFile：file 字段为真实 File，name/path/type 各路由兼容
      resolve(files.map((f) => ({ file: f, name: f.name, type: f.type, path: f.name })));
    });
    input.addEventListener('cancel', () => {
      document.body.removeChild(input);
      resolve([]);
    });
    input.click();
  });
}
// #endif

async function chooseAndUpload() {
  const remain = props.max - selected.value.length;
  if (remain <= 0) {
    uni.showToast({ title: `最多选择 ${props.max} 个`, icon: 'none' });
    return;
  }
  uploading.value = true;
  try {
    const files = await chooseFiles(remain);
    for (const tf of files.slice(0, remain)) {
      const { file, name } = await toFile(tf);
      const asset = await uploadAsset(file, name);
      if (!selected.value.some((x) => x.id === asset.id)) selected.value.push(asset);
    }
    await load(false);
    await loadTags();
  } catch (e: any) {
    uni.showToast({ title: e?.message || '上传失败', icon: 'none' });
  } finally {
    uploading.value = false;
  }
}

async function toFile(tf: any): Promise<{ file: File; name: string }> {
  const fallbackName = 'media-' + Date.now() + '.bin';
  const rawFile: File | undefined = tf?.file || tf?.originalFile;
  if (rawFile) return { file: rawFile, name: rawFile.name || fallbackName };
  const path: string = tf?.path || '';
  const mime =
    path.startsWith('data:')
      ? path.split(':')[1].split(';')[0]
      : imageMimeFromPath(path) ||
        (typeof tf?.type === 'string' && tf.type ? tf.type : 'application/octet-stream');
  let url = path;
  if (url.startsWith('file://')) url = url.slice(7);
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const ext = (mime.split('/')[1] || 'bin').replace('+', '');
  const name = 'media-' + Date.now() + '.' + ext;
  return { file: new File([buf], name, { type: mime }), name };
}

function imageMimeFromPath(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
    avi: 'video/x-msvideo', webm: 'video/webm',
  };
  return map[ext] || '';
}

// ---- 打标面板 ----
function openTagPanel() {
  if (!selected.value.length) {
    uni.showToast({ title: '请先选择图片', icon: 'none' });
    return;
  }
  panelVisible.value = true;
}
function closePanel() {
  panelVisible.value = false;
}
function clearPanelTags() {
  selectedTags.value = [];
}
async function confirmTags() {
  if (!selected.value.length) {
    closePanel();
    return;
  }
  if (!selectedTags.value.length) return;
  if (tagSaving.value) return;
  tagSaving.value = true;
  try {
    const ids = selected.value.map((x) => x.id);
    await setAssetTags(ids, selectedTags.value);
    closePanel();
    selectedTags.value = [];
    await loadTags();
    await load(false);
    uni.showToast({ title: '已打标', icon: 'none' });
  } catch (e: any) {
    uni.showToast({ title: e?.message || '打标失败', icon: 'none' });
  } finally {
    tagSaving.value = false;
  }
}

function confirm() {
  if (!selected.value.length) {
    uni.showToast({ title: '请先选择图片', icon: 'none' });
    return;
  }
  emit('confirm', [...selected.value]);
  onClose();
}
function onClose() {
  emit('update:visible', false);
}
</script>

<style lang="scss" scoped>
.mlm {
  &__overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__panel {
    width: 92%;
    max-width: 820px;
    max-height: 82vh;
    background: $wa-bg;
    border-radius: $wa-radius;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 22rpx 28rpx;
    background: $wa-card;
    border-bottom: 1rpx solid $wa-rule;
  }
  &__title {
    font-size: 32rpx;
    font-weight: 600;
    color: $wa-ink;
  }
  &__header-actions {
    display: flex;
    align-items: center;
    gap: 20rpx;
  }
  &__upload {
    background: $wa-accent;
    color: #fff;
    padding: 8rpx 26rpx;
    border-radius: 999rpx;
    font-size: 26rpx;
  }
  &__refresh {
    font-size: 34rpx;
    color: $wa-muted;
    padding: 0 6rpx;
  }
  &__close {
    font-size: 48rpx;
    color: $wa-muted;
    line-height: 1;
    padding: 0 4rpx;
  }

  &__search {
    position: relative;
    padding: 16rpx 20rpx;
    border-bottom: 1rpx solid $wa-rule;
  }
  &__search-input {
    width: 100%;
    height: 64rpx;
    border: 1rpx solid $wa-rule;
    border-radius: $wa-radius;
    background: $wa-card;
    padding: 0 48rpx 0 16rpx;
    font-size: 26rpx;
    box-sizing: border-box;
    color: $wa-ink;
  }
  &__search-clear {
    position: absolute;
    right: 36rpx;
    top: 50%;
    transform: translateY(-50%);
    font-size: 30rpx;
    color: $wa-muted;
    padding: 0 8rpx;
  }

  // 分组多行网格
  &__filters {
    max-height: 30vh;
    overflow-y: auto;
    padding: 2rpx 16rpx 8rpx;
    border-bottom: 1rpx solid $wa-rule;
    background: $wa-card;
    box-sizing: border-box;
  }
  &__group {
    margin-top: 6rpx;
  }
  &__group-head {
    display: flex;
    align-items: center;
    gap: 6rpx;
    padding: 2rpx 2rpx;
    &.on {
      .mlm__group-title {
        color: $wa-accent;
        font-weight: 700;
      }
      .mlm__group-select {
        background: rgba($wa-accent, 0.08);
      }
    }
  }
  &__group-select {
    display: flex;
    align-items: center;
    gap: 8rpx;
    padding: 4rpx 12rpx;
    border-radius: 999rpx;
  }
  &__group-arrow {
    font-size: 20rpx;
    color: $wa-muted;
    padding: 6rpx 12rpx;
  }
  &__group-title {
    font-size: 22rpx;
    font-weight: 600;
    color: $wa-ink;
  }
  &__group-count {
    font-size: 18rpx;
    color: $wa-muted;
  }
  &__group-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8rpx;
    padding: 2rpx 0 6rpx;
  }
  &__chip {
    display: inline-flex;
    align-items: center;
    gap: 4rpx;
    padding: 3rpx 12rpx;
    border-radius: 999rpx;
    font-size: 20rpx;
    color: $wa-ink;
    background: $wa-bg;
    border: 1rpx solid $wa-rule;
    &.on {
      color: $wa-accent;
      border-color: $wa-accent;
      background: rgba($wa-accent, 0.08);
    }
  }
  &__chip-count {
    font-size: 16rpx;
    color: $wa-muted;
    padding: 0 4rpx;
    border-radius: 999rpx;
    background: rgba(0, 0, 0, 0.06);
  }

  &__grid-scroll {
    flex: 1;
    padding: 20rpx;
    box-sizing: border-box;
    min-height: 0;
  }
  &__pull-hint {
    text-align: center;
    font-size: 24rpx;
    color: $wa-muted;
    padding: 6rpx 0 12rpx;
    &.releasing {
      color: $wa-accent;
    }
  }
  &__grid {
    display: flex;
    flex-wrap: wrap;
    gap: 14rpx;
  }
  &__cell {
    position: relative;
    width: calc(33.33% - 10rpx);
    border: 2rpx solid transparent;
    border-radius: $wa-radius;
    overflow: hidden;
    background: $wa-card;
    box-sizing: border-box;
    &.on {
      border-color: $wa-accent;
    }
  }
  &__cell-thumb {
    width: 100%;
    height: 160rpx;
    display: block;
  }
  &__mark {
    position: absolute;
    top: 6rpx;
    right: 6rpx;
    width: 36rpx;
    height: 36rpx;
    line-height: 36rpx;
    text-align: center;
    font-size: 26rpx;
    border-radius: 50%;
    color: #fff;
    background: $wa-accent;
    z-index: 2;
  }
  &__cell-del {
    position: absolute;
    right: 6rpx;
    bottom: 34rpx;
    width: 34rpx;
    height: 34rpx;
    line-height: 34rpx;
    text-align: center;
    font-size: 24rpx;
    color: #fff;
    background: rgba(220, 38, 38, 0.85);
    border-radius: 50%;
    z-index: 2;
  }
  &__cell-name {
    display: block;
    padding: 6rpx 8rpx 8rpx;
    font-size: 20rpx;
    color: $wa-muted;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__tip {
    text-align: center;
    padding: 24rpx 0;
    font-size: 24rpx;
    color: $wa-muted;
  }
  &__empty {
    text-align: center;
    padding: 80rpx 0;
    font-size: 26rpx;
    color: $wa-muted;
  }

  // 底部操作条
  &__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16rpx;
    padding: 18rpx 28rpx;
    background: $wa-card;
    border-top: 1rpx solid $wa-rule;
  }
  &__picked {
    font-size: 24rpx;
    color: $wa-muted;
  }
  &__footer-actions {
    display: flex;
    align-items: center;
    gap: 16rpx;
  }
  &__tag-main {
    background: $wa-card;
    color: $wa-ink;
    border: 1rpx solid $wa-rule;
    padding: 10rpx 32rpx;
    border-radius: 999rpx;
    font-size: 26rpx;
    &.disabled {
      opacity: 0.4;
      color: $wa-muted;
    }
  }
  &__confirm {
    background: $wa-accent;
    color: #fff;
    padding: 10rpx 40rpx;
    border-radius: 999rpx;
    font-size: 26rpx;
  }

  // 打标分类面板
  &__panel-mask {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1001;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: mlmFade 0.2s ease;
  }
  &__tag-panel {
    width: 90%;
    max-width: 760px;
    max-height: 76vh;
    background: $wa-bg;
    border-radius: $wa-radius;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: mlmSlideUp 0.22s ease;
  }
  &__tag-panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 22rpx 28rpx;
    background: $wa-card;
    border-bottom: 1rpx solid $wa-rule;
  }
  &__tag-panel-title {
    font-size: 28rpx;
    font-weight: 600;
    color: $wa-ink;
  }
  &__tag-panel-x {
    font-size: 44rpx;
    color: $wa-muted;
    line-height: 1;
    padding: 0 4rpx;
  }
  &__tag-panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 20rpx;
    box-sizing: border-box;
  }
  &__panel-group {
    margin-bottom: 16rpx;
  }
  &__panel-group-title {
    display: block;
    font-size: 22rpx;
    font-weight: 600;
    color: $wa-muted;
    margin-bottom: 10rpx;
  }
  &__panel-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }
  &__panel-chip {
    display: inline-flex;
    align-items: center;
    gap: 6rpx;
    padding: 8rpx 20rpx;
    border-radius: 999rpx;
    font-size: 22rpx;
    color: $wa-ink;
    background: $wa-card;
    border: 1rpx solid $wa-rule;
    &.on {
      color: $wa-accent;
      border-color: $wa-accent;
      background: rgba($wa-accent, 0.08);
    }
  }
  &__panel-chip-exists {
    font-size: 18rpx;
    color: $wa-success;
    background: rgba($wa-success, 0.1);
    padding: 0 6rpx;
    border-radius: 999rpx;
  }
  &__panel-add {
    display: flex;
    gap: 12rpx;
    margin-top: 6rpx;
  }
  &__tag-input {
    flex: 1;
    height: 64rpx;
    border: 1rpx solid $wa-rule;
    border-radius: $wa-radius;
    background: $wa-card;
    padding: 0 16rpx;
    font-size: 24rpx;
    box-sizing: border-box;
    color: $wa-ink;
  }
  &__panel-add-btn {
    background: $wa-card;
    color: $wa-ink;
    border: 1rpx solid $wa-rule;
    padding: 12rpx 28rpx;
    border-radius: 999rpx;
    font-size: 24rpx;
  }
  &__panel-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16rpx;
    padding: 18rpx 28rpx;
    background: $wa-card;
    border-top: 1rpx solid $wa-rule;
  }
  &__panel-clear {
    font-size: 24rpx;
    color: $wa-muted;
    padding: 10rpx 0;
  }
  &__panel-count {
    font-size: 24rpx;
    color: $wa-muted;
    flex: 1;
    text-align: center;
  }
  &__panel-confirm {
    background: $wa-accent;
    color: #fff;
    padding: 10rpx 44rpx;
    border-radius: 999rpx;
    font-size: 26rpx;
    &.disabled {
      opacity: 0.4;
    }
  }
}

@keyframes mlmFade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes mlmSlideUp {
  from { transform: translateY(40rpx); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>