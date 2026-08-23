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
            <image class="thumb" :src="it.preview" mode="aspectFill" />
            <view
              v-if="isSelected(it.id)"
              class="mark"
              @tap.stop="remove(it.id)"
            >✓</view>
            <view
              class="zoom"
              @tap.stop="preview(i)"
            >⌕</view>
          </view>
        </view>
        <view class="foot">
          <text v-if="loadingMore" class="tip">加载中…</text>
          <text v-else-if="!loadedAll" class="tip" @tap="loadMore">上拉加载更多</text>
          <text v-else class="tip">没有更多了</text>
        </view>
        <view v-if="!items.length && !loadingMore" class="empty">图库暂无图片</view>
      </scroll-view>
    </view>

    <!-- 上传模式 -->
    <view v-if="tab === 'upload'" class="upload">
      <view class="drop" @tap="chooseAndUpload">
        <text class="plus">＋</text>
        <text class="dt">点击选择图片上传</text>
        <text class="ds">最多还可选 {{ max - selectedIds.length }} 张</text>
      </view>
      <view v-if="uploading" class="up-tip">上传中…</view>
      <view v-if="uploadedItems.length" class="grid up-grid">
        <view
          v-for="it in uploadedItems"
          :key="it.id"
          class="cell on"
          @tap="previewByList(uploadedItems, it.id)"
        >
          <image class="thumb" :src="it.preview" mode="aspectFill" />
          <view class="mark" @tap.stop="remove(it.id)">✓</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchAssets, uploadAsset, type AssetItem } from '../apis/asset';

const props = withDefaults(defineProps<{ max?: number; value?: string[] }>(), {
  max: 9,
  value: () => [],
});
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

async function loadMore() {
  if (loadingMore.value || loadedAll.value) return;
  loadingMore.value = true;
  try {
    const s = items.value.length;
    const r = await fetchAssets(30, s);
    const seen = new Set(items.value.map((i) => i.id));
    const fresh = r.items.filter((i) => !seen.has(i.id));
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
    uni.showToast({ title: `最多选择 ${props.max} 张`, icon: 'none' });
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

function previewIndexItems(list: { preview: string }[], currentPreview: string) {
  const urls = list.map((i) => i.preview);
  const current = urls.indexOf(currentPreview);
  // @ts-expect-error 平台差异：不传 current 则从头预览
  uni.previewImage({ urls, current });
}

function preview(i: number) {
  const urls = items.value.map((x) => x.preview);
  uni.previewImage({ urls, current: urls[i] });
}

function previewByList(list: { preview: string }[], id: string) {
  const it = list.find((x) => (x as any).id === id);
  previewIndexItems(list, it ? it.preview : list[0].preview);
}

async function chooseAndUpload() {
  const remain = props.max - selectedIds.value.length;
  if (remain <= 0) {
    uni.showToast({ title: `最多选择 ${props.max} 张`, icon: 'none' });
    return;
  }
  uploading.value = true;
  try {
    const res = await uniChooseImage(remain);
    const tmp = res.tempFiles || [];
    for (const tf of tmp.slice(0, remain)) {
      const { file, name } = await toFile(tf);
      const asset = await uploadAsset(file, name);
      // 上传成功自动选中并追加到图库
      if (!selectedIds.value.includes(asset.id)) {
        selectedIds.value.push(asset.id);
      }
      items.value = [asset, ...items.value];
      uploadedItems.value = [asset, ...uploadedItems.value];
    }
    emitChange();
    if (selectedIds.value.length >= props.max) {
      uni.showToast({ title: '已达到上限', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e?.message || '上传失败', icon: 'none' });
  } finally {
    uploading.value = false;
  }
}

function uniChooseImage(count: number): Promise<UniApp.ChooseImageSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count,
      success: resolve,
      fail: reject,
    });
  });
}

async function toFile(tf: any): Promise<{ file: File; name: string }> {
  const fallbackName = 'photo-' + Date.now() + '.jpg';
  // 部分平台 chooseImage 直接返回 File 对象，优先使用
  const rawFile: File | undefined = tf?.file || tf?.originalFile;
  if (rawFile) {
    return { file: rawFile, name: rawFile.name || fallbackName };
  }
  const path: string = tf?.path || '';
  const mime =
    path.startsWith('data:')
      ? path.split(':')[1].split(';')[0]
      : imageMimeFromPath(path) ||
        (typeof tf?.type === 'string' && tf.type ? tf.type : 'image/jpeg');
  let url = path;
  if (url.startsWith('file://')) url = url.slice(7);
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const ext = (mime.split('/')[1] || 'jpg').replace('+', '');
  const name = 'photo-' + Date.now() + '.' + ext;
  return { file: new File([buf], name, { type: mime }), name };
}

function imageMimeFromPath(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  };
  return map[ext] || '';
}

async function refresh() {
  await load(false);
}

defineExpose({ refresh });

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