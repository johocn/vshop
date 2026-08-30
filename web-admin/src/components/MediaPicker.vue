<template>
  <view class="picker">
    <view class="tabs">
      <view
        class="tab"
        :class="{ on: tab === 'gallery' }"
        @tap="switchTab('gallery')"
      >图库</view>
      <view
        class="tab"
        :class="{ on: tab === 'upload' }"
        @tap="switchTab('upload')"
      >上传</view>
    </view>

    <!-- 图库模式 -->
    <view v-if="tab === 'gallery'" class="gallery">
      <scroll-view
        class="gallery-scroll"
        scroll-y
        :scroll-with-animation="true"
        @scrolltolower="loadMore"
      >
        <view class="hint">已选 {{ selectedIds.length }}/{{ max }}</view>
        <view class="grid">
          <view
            v-for="(it, i) in items"
            :key="it.id"
            class="cell"
            :class="{ on: isSelected(it.id) }"
            @tap="toggle(it)"
            @longpress="preview(i)"
          >
            <video
              v-if="isVideo(it)"
              class="thumb"
              :src="it.source"
              :data-mime="it.mimeType"
              :show-center-play-btn="false"
              object-fit="cover"
              controls
            />
            <image v-else class="thumb" :src="it.preview" mode="aspectFill" />
            <view
              v-if="isSelected(it.id)"
              class="mark"
              @tap.stop="remove(it.id)"
            >✓</view>
            <view
              class="zoom"
              @tap.stop="preview(i)"
            >⌕</view>
            <view class="del" @tap.stop="onDelete(it)">🗑</view>
          </view>
        </view>
        <view class="foot">
          <text v-if="loadingMore" class="tip">加载中…</text>
          <text v-else-if="!loadedAll" class="tip" @tap="loadMore">上拉加载更多</text>
          <text v-else class="tip">没有更多了</text>
        </view>
        <view v-if="!items.length && !loadingMore" class="empty">图库暂无资源</view>
      </scroll-view>
    </view>

    <!-- 上传模式 -->
    <view v-if="tab === 'upload'" class="upload">
      <view class="drop" @tap="chooseAndUpload">
        <text class="plus">＋</text>
        <text class="dt">{{ uploadText }}</text>
        <text class="ds">最多还可选 {{ max - selectedIds.length }} 个</text>
      </view>
      <view v-if="uploading" class="up-tip">上传中…</view>
      <view v-if="uploadedItems.length" class="grid up-grid">
        <view
          v-for="it in uploadedItems"
          :key="it.id"
          class="cell on"
          @tap="previewByList(uploadedItems, it.id)"
        >
          <video
            v-if="isVideo(it)"
            class="thumb"
            :src="it.source"
            :data-mime="it.mimeType"
            :show-center-play-btn="false"
            object-fit="cover"
            controls
          />
          <image v-else class="thumb" :src="it.preview" mode="aspectFill" />
          <view class="mark" @tap.stop="remove(it.id)">✓</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { fetchAssets, uploadAsset, deleteAsset, type AssetItem } from '../apis/asset';

const props = withDefaults(
  defineProps<{ max?: number; value?: string[]; mediaType?: 'image' | 'video' | 'mixed' }>(),
  {
    max: 9,
    value: () => [],
    mediaType: 'image',
  },
);
const emit = defineEmits<{ (e: 'change', ids: string[]): void }>();

const tab = ref<'gallery' | 'upload'>('gallery');
const items = ref<AssetItem[]>([]);
const uploadedItems = ref<AssetItem[]>([]);
const selectedIds = ref<string[]>([]);
const skip = ref(0);
const totalItems = ref(0);
const loadingMore = ref(false);
const loadedAll = ref(false);
const uploading = ref(false);

const uploadText = computed(() => {
  if (props.mediaType === 'video') return '点击选择视频上传';
  if (props.mediaType === 'mixed') return '点击选择图片/视频上传';
  return '点击选择图片上传';
});

function isVideo(it: AssetItem): boolean {
  return (it.mimeType || '').toLowerCase().startsWith('video');
}

// props.value 同步进来
function syncSelected() {
  selectedIds.value = [...(props.value || [])];
}
syncSelected();

function switchTab(t: 'gallery' | 'upload') {
  tab.value = t;
}

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id);
}

function emitChange() {
  emit('change', [...selectedIds.value]);
}

function maxReached(): boolean {
  return selectedIds.value.length >= props.max;
}

async function load(keep = false) {
  if (!keep) {
    skip.value = 0;
    loadedAll.value = false;
    items.value = [];
  } else {
    skip.value = items.value.length;
  }
  await loadMore();
}

// 图库按类型过滤：仅展示与 mediaType 匹配的资源
function typeMatch(it: AssetItem): boolean {
  if (props.mediaType === 'mixed') return true;
  const m = (it.mimeType || '').toLowerCase();
  return props.mediaType === 'image' ? m.startsWith('image') : m.startsWith('video');
}

async function loadMore() {
  if (loadingMore.value || loadedAll.value) return;
  loadingMore.value = true;
  try {
    const s = items.value.length;
    const r = await fetchAssets(30, s);
    const seen = new Set(items.value.map((i) => i.id));
    const fresh = r.items.filter((i) => !seen.has(i.id) && typeMatch(i));
    items.value = items.value.concat(fresh);
    totalItems.value = r.totalItems;
    if (items.value.length >= r.totalItems || fresh.length === 0) loadedAll.value = true;
  } finally {
    loadingMore.value = false;
  }
}

function toggle(it: AssetItem) {
  const on = isSelected(it.id);
  if (!on && maxReached()) {
    uni.showToast({ title: `最多选择 ${props.max} 个`, icon: 'none' });
    return;
  }
  if (on) {
    selectedIds.value = selectedIds.value.filter((id) => id !== it.id);
  } else {
    selectedIds.value.push(it.id);
  }
  emitChange();
}

function remove(id: string) {
  selectedIds.value = selectedIds.value.filter((x) => x !== id);
  emitChange();
}

// 删除媒体库中的资源（含物理文件），删除后刷新列表
function onDelete(it: AssetItem) {
  uni.showModal({
    title: '删除资源',
    content: '确定删除这个资源？将同时删除媒体文件。若该资源正被商品/自提点等引用，删除后相关位置将无法显示。',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteAsset(it.id);
        selectedIds.value = selectedIds.value.filter((id) => id !== it.id);
        items.value = items.value.filter((x) => x.id !== it.id);
        uploadedItems.value = uploadedItems.value.filter((x) => x.id !== it.id);
        emitChange();
        await load(false); // 重新拉取，校正分页与总数
        uni.showToast({ title: '已删除', icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || '删除失败', icon: 'none' });
      }
    },
  });
}

function preview(i: number) {
  const urls = items.value.map((x) => x.preview);
  const it = items.value[i];
  if (it && isVideo(it)) {
    const sources = urls.map((u) => ({ url: u, type: 'video' as any }));
    // @ts-expect-error 平台差异：H5/App 支持 previewMedia 时不会报错
    uni.previewMedia({ sources, current: i });
  } else {
    uni.previewImage({ urls, current: urls[i] });
  }
}

function previewByList(list: AssetItem[], id: string) {
  const it = list.find((x) => x.id === id) || list[0];
  if (it && isVideo(it)) {
    const sources = list.map((u) => ({ url: u.preview, type: 'video' as any }));
    // @ts-expect-error 平台差异：H5/App 支持 previewMedia 时不会报错
    uni.previewMedia({ sources, current: Math.max(0, list.indexOf(it)) });
  } else {
    const urls = list.map((u) => u.preview);
    uni.previewImage({ urls, current: it ? it.preview : urls[0] });
  }
}

function uniChooseImage(count: number): Promise<UniApp.ChooseImageSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({ count, success: resolve, fail: reject });
  });
}

function uniChooseVideo(): Promise<any> {
  return new Promise((resolve, reject) => {
    uni.chooseVideo({ success: resolve, fail: reject });
  });
}

function uniChooseMedia(count: number): Promise<any> {
  return new Promise((resolve, reject) => {
    uni.chooseMedia({ count, mediaType: ['image', 'video'], success: resolve, fail: reject });
  });
}

// 按 mediaType 选择资源：image/video/mixed 分别走不同系统选择器
async function chooseFiles(remain: number): Promise<any[]> {
  if (props.mediaType === 'image') {
    const r = await uniChooseImage(remain);
    return r.tempFiles || [];
  }
  if (props.mediaType === 'video') {
    const r = await uniChooseVideo();
    return r ? [r] : [];
  }
  const r = await uniChooseMedia(remain);
  return r.tempFiles || [];
}

async function chooseAndUpload() {
  const remain = props.max - selectedIds.value.length;
  if (remain <= 0) {
    uni.showToast({ title: `最多选择 ${props.max} 个`, icon: 'none' });
    return;
  }
  uploading.value = true;
  try {
    const res = await chooseFiles(remain);
    const tmp = Array.isArray(res) ? res : (res.tempFiles || []);
    for (const tf of tmp.slice(0, remain)) {
      const { file, name } = await toFile(tf);
      const asset = await uploadAsset(file, name);
      // 上传成功自动选中
      if (!selectedIds.value.includes(asset.id)) {
        selectedIds.value.push(asset.id);
      }
      uploadedItems.value = [asset, ...uploadedItems.value];
    }
    emitChange();
    // 上传成功后重置分页并强制从服务器刷新图库，确保新资源出现在图库列表
    await load(false);
    if (selectedIds.value.length >= props.max) {
      uni.showToast({ title: '已达到上限', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e?.message || '上传失败', icon: 'none' });
  } finally {
    uploading.value = false;
  }
}

async function toFile(tf: any): Promise<{ file: File; name: string }> {
  const fallbackName = 'media-' + Date.now() + '.bin';
  // 部分平台 chooseMedia/chooseImage 直接返回 File 对象，优先使用
  const rawFile: File | undefined = tf?.file || tf?.originalFile;
  if (rawFile) {
    return { file: rawFile, name: rawFile.name || fallbackName };
  }
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

async function refresh() {
  await load(false);
}

// 把当前已选 id 解析为完整资源对象（含 preview/source），供调用方回填 URL 等
function getSelectedAssets(): AssetItem[] {
  const byId = new Map<string, AssetItem>();
  for (const a of items.value) byId.set(a.id, a);
  for (const a of uploadedItems.value) byId.set(a.id, a);
  return selectedIds.value
    .map((id) => byId.get(id))
    .filter((a): a is AssetItem => !!a);
}

defineExpose({ refresh, getSelectedAssets });

onMounted(() => {
  load(false);
});
</script>

<style lang="scss" scoped>
.picker {
  background: $wa-bg;
  border-radius: $wa-radius;
  overflow: hidden;

  .tabs {
    display: flex;
    gap: 24rpx;
    padding: 20rpx 24rpx 8rpx;
    .tab {
      padding: 10rpx 28rpx;
      font-size: 28rpx;
      color: $wa-muted;
      background: $wa-card;
      border-radius: $wa-radius;
      border: 1rpx solid $wa-rule;
      &.on {
        color: #fff;
        background: $wa-accent;
        border-color: $wa-accent;
        font-weight: 600;
      }
    }
  }

  .hint {
    font-size: 24rpx;
    color: $wa-muted;
    padding: 8rpx 4rpx 16rpx;
  }

  .gallery-scroll {
    height: 70vh;
    padding: 0 24rpx;
    box-sizing: border-box;
  }

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
    .cell {
      position: relative;
      width: calc((100% - 5 * 12rpx) / 6);
      border-radius: $wa-radius;
      overflow: hidden;
      background: $wa-card;
      border: 2rpx solid transparent;
      box-sizing: border-box;
      &.on {
        border-color: $wa-accent;
      }
      .thumb {
        width: 100%;
        height: 120rpx;
        display: block;
      }
      .mark {
        position: absolute;
        top: 6rpx;
        right: 6rpx;
        width: 34rpx;
        height: 34rpx;
        line-height: 34rpx;
        text-align: center;
        font-size: 24rpx;
        border-radius: 50%;
        color: #fff;
        background: $wa-accent;
      }
      .zoom {
        position: absolute;
        left: 6rpx;
        bottom: 6rpx;
        width: 34rpx;
        height: 34rpx;
        line-height: 34rpx;
        text-align: center;
        font-size: 30rpx;
        color: #fff;
        background: rgba(0, 0, 0, 0.4);
        border-radius: 50%;
      }
      .del {
        position: absolute;
        right: 6rpx;
        bottom: 6rpx;
        width: 34rpx;
        height: 34rpx;
        line-height: 34rpx;
        text-align: center;
        font-size: 24rpx;
        color: #fff;
        background: rgba(220, 38, 38, 0.85);
        border-radius: 50%;
      }
    }
  }

  .foot {
    text-align: center;
    padding: 24rpx 0;
    .tip {
      font-size: 24rpx;
      color: $wa-muted;
    }
  }
  .empty {
    text-align: center;
    color: $wa-muted;
    font-size: 26rpx;
    padding: 80rpx 0;
  }

  .upload {
    padding: 24rpx;
    .drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 60rpx 0;
      background: $wa-card;
      border: 2rpx dashed $wa-rule;
      border-radius: $wa-radius;
      color: $wa-muted;
      .plus { font-size: 64rpx; color: $wa-accent; line-height: 1; }
      .dt { font-size: 28rpx; margin-top: 16rpx; color: $wa-ink; }
      .ds { font-size: 24rpx; margin-top: 8rpx; }
    }
    .up-tip { margin-top: 20rpx; text-align: center; font-size: 26rpx; color: $wa-accent; }
    .up-grid { margin-top: 20rpx; }
  }
}
</style>