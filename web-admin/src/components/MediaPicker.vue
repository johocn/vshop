<template>
  <view class="mp">
    <!-- 触发区：展示已选缩略图 + 添加按钮，点击打开媒体库弹层 -->
    <view class="mp__trigger">
      <view
        v-for="it in selectedDocs"
        :key="it.id"
        class="mp__cell"
        @tap="preview([it])"
      >
        <image class="mp__thumb" :src="it.preview" mode="aspectFill" />
        <view class="mp__cell-del" @tap.stop="remove(it.id)">×</view>
      </view>
      <view class="mp__add" @tap="open_visible = true">
        <text class="mp__add-plus">＋</text>
        <text class="mp__add-text">{{ triggerText }}</text>
        <text class="mp__add-count">已选 {{ selectedIds.length }}/{{ max }}</text>
      </view>
    </view>

    <MediaLibraryModal
      v-model:visible="open_visible"
      :max="max"
      :media-type="mediaType"
      :value="selectedIds"
      @confirm="onConfirm"
    />
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted } from 'vue';
import { fetchAssets, type AssetItem } from '../apis/asset';
import MediaLibraryModal from './MediaLibraryModal.vue';

const props = withDefaults(
  defineProps<{ max?: number; value?: string[]; mediaType?: 'image' | 'video' | 'mixed' }>(),
  {
    max: 9,
    value: () => [],
    mediaType: 'image',
  },
);
const emit = defineEmits<{ (e: 'change', ids: string[]): void }>();

const open_visible = ref(false);
const allItems = ref<AssetItem[]>([]); // 供触发区预览解析已选资源对象
const selectedIds = ref<string[]>([]);

function syncSelected() {
  selectedIds.value = [...(props.value || [])];
}
syncSelected();

const triggerText = computed(() => {
  if (props.mediaType === 'video') return '添加视频';
  if (props.mediaType === 'mixed') return '添加图片/视频';
  return '添加图片';
});

const selectedDocs = computed<AssetItem[]>(() => {
  const m = new Map(allItems.value.map((a) => [a.id, a]));
  return selectedIds.value.map((id) => m.get(id)).filter((a): a is AssetItem => !!a);
});

function remove(id: string) {
  selectedIds.value = selectedIds.value.filter((x) => x !== id);
  emitChange();
}

function preview(list: AssetItem[]) {
  if (!list.length) return;
  const urls = list.map((u) => u.source || u.preview);
  uni.previewImage({ urls, current: 0 });
}

function emitChange() {
  emit('change', [...selectedIds.value]);
}

// 媒体库确认：全量替换已选并上报
function onConfirm(assets: AssetItem[]) {
  selectedIds.value = assets.map((a) => a.id);
  emitChange();
}

async function refresh() {
  await fetchAssets(30, 0);
}

function getSelectedAssets(): AssetItem[] {
  const m = new Map(allItems.value.map((a) => [a.id, a]));
  return selectedIds.value.map((id) => m.get(id)).filter((a): a is AssetItem => !!a);
}

defineExpose({ refresh, getSelectedAssets });

onMounted(() => {
  loadSelected();
});

// 已选资源可能不在最近 take 条内（多租户/历史图），须按 id 精确预取，
// 否则编辑回填时缩略图不显示、保存时又被媒体库的确定动作丢掉。
async function loadSelected() {
  const ids = selectedIds.value.filter(Boolean);
  if (!ids.length) return;
  try {
    const r = await fetchAssets(10, 0, undefined, ids);
    if (!r.items.length) return;
    const m = new Map(allItems.value.map((a) => [a.id, a]));
    for (const a of r.items) m.set(a.id, a);
    allItems.value = Array.from(m.values());
  } catch (e) {
    // 预取失败不阻断编辑，缩略图缺失时用户仍可在媒体库手动重选
  }
}

watch(
  () => props.value,
  () => {
    syncSelected();
    loadSelected();
  },
);
</script>

<style lang="scss" scoped>
.mp {
  &__trigger {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }
  &__cell {
    position: relative;
    width: 160rpx;
    height: 120rpx;
    border-radius: $wa-radius;
    overflow: hidden;
    border: 1rpx solid $wa-rule;
    box-sizing: border-box;
  }
  &__thumb {
    width: 100%;
    height: 100%;
    display: block;
  }
  &__cell-del {
    position: absolute;
    top: 4rpx;
    right: 4rpx;
    width: 34rpx;
    height: 34rpx;
    line-height: 34rpx;
    text-align: center;
    font-size: 28rpx;
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
    border-radius: 50%;
  }
  &__add {
    width: 160rpx;
    height: 120rpx;
    border: 2rpx dashed $wa-rule;
    border-radius: $wa-radius;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: $wa-muted;
    box-sizing: border-box;
  }
  &__add-plus {
    font-size: 44rpx;
    line-height: 1;
    color: $wa-accent;
  }
  &__add-text {
    font-size: 22rpx;
    margin-top: 6rpx;
    color: $wa-ink;
  }
  &__add-count {
    font-size: 20rpx;
    margin-top: 4rpx;
  }
}
</style>