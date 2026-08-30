<template>
  <view v-show="visible" class="mlm__overlay" @tap="onClose">
    <view class="mlm__panel" @tap.stop>
      <view class="mlm__header">
        <text class="mlm__title">媒体库</text>
        <view class="mlm__header-actions">
          <view class="mlm__upload" @tap="chooseAndUpload">上传</view>
          <text class="mlm__close" @tap="onClose">×</text>
        </view>
      </view>

      <view class="mlm__search">
        <input
          v-model="searchKeyword"
          class="mlm__search-input"
          placeholder="搜索文件名"
          confirm-type="search"
          @confirm="doSearch"
        />
        <text v-if="searchKeyword" class="mlm__search-clear" @tap="clearSearch">×</text>
      </view>

      <scroll-view class="mlm__grid-scroll" scroll-y @scrolltolower="loadMore">
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
            <text class="mlm__cell-name">{{ it.name }}</text>
          </view>
        </view>
        <view v-if="uploading" class="mlm__tip">上传中…</view>
        <view v-else-if="loadingMore" class="mlm__tip">加载中…</view>
        <view v-else-if="!loadedAll" class="mlm__tip" @tap="loadMore">上拉加载更多</view>
        <view v-else-if="!filteredItems.length" class="mlm__empty">媒体库暂无可选资源</view>
        <view v-else class="mlm__tip">没有更多了</view>
      </scroll-view>

      <view class="mlm__footer">
        <text class="mlm__picked">已选 {{ selected.length }}/{{ max }}</text>
        <view class="mlm__confirm" @tap="confirm">确定</view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import { fetchAssets, uploadAsset, deleteAsset, type AssetItem } from '../apis/asset';

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
      if (!allItems.value.length) load(false);
    }
  },
);

const filteredItems = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase();
  return allItems.value.filter(
    (it) => typeMatch(it) && (!kw || !it.name || it.name.toLowerCase().includes(kw)),
  );
});

async function loadMore() {
  if (loadingMore.value || loadedAll.value) return;
  loadingMore.value = true;
  try {
    const s = allItems.value.length;
    const r = await fetchAssets(30, s);
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
  return new Promise((resolve, reject) =>
    uni.chooseMedia({ count: remain, mediaType: ['image', 'video'], success: (r) => resolve(r.tempFiles || []), fail: reject }),
  );
}

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

function confirm() {
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

  &__grid-scroll {
    flex: 1;
    padding: 20rpx;
    box-sizing: border-box;
    min-height: 0;
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

  &__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18rpx 28rpx;
    background: $wa-card;
    border-top: 1rpx solid $wa-rule;
  }
  &__picked {
    font-size: 24rpx;
    color: $wa-muted;
  }
  &__confirm {
    background: $wa-accent;
    color: #fff;
    padding: 10rpx 40rpx;
    border-radius: 999rpx;
    font-size: 26rpx;
  }
}
</style>