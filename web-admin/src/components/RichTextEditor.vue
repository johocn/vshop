<template>
  <view class="rte">
    <view class="rte__mode">
      <!-- 可视化 / HTML 源码切换 -->
      <view
        v-for="m in ['visual','html']" :key="m"
        class="rte__mode-btn" :class="{ on: mode === m }"
        @click="mode = m"
      >{{ m === 'visual' ? '可视化' : 'HTML' }}</view>
      <view class="rte__library" @click="openLibrary('mixed')">媒体库</view>
    </view>
    <!-- 可视化模式：wangEditor 挂载点 -->
    <view v-if="mode === 'visual'">
      <view :id="toolbarId" class="rte__toolbar"></view>
      <view :id="editorId" class="rte__editor"></view>
    </view>
    <!-- HTML 源码模式：普通 textarea 编辑原始 HTML -->
    <textarea v-else v-model="srcHtml" class="rte__src" @blur="onSrcBlur"></textarea>

    <MediaLibraryModal
      v-model:visible="libraryVisible"
      :max="20"
      media-type="mixed"
      @confirm="onLibraryConfirm"
    />
  </view>
</template>

<script lang="ts" setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { createEditor, createToolbar } from '@wangeditor/editor';
import '@wangeditor/editor/dist/css/style.css';
import MediaLibraryModal from './MediaLibraryModal.vue';
import type { AssetItem } from '../apis/asset';

type IDomEditorInstance = ReturnType<typeof createEditor>;

const props = withDefaults(defineProps<{ modelValue?: string }>(), { modelValue: '' });
const emit = defineEmits<{ (e: 'update:modelValue', html: string): void }>();

const editorId = 'rte-' + Math.random().toString(36).slice(2);
const toolbarId = 'rte-tb-' + Math.random().toString(36).slice(2);
const mode = ref<'visual' | 'html'>('visual');
const srcHtml = ref(props.modelValue || '');
const editorRef = ref<IDomEditorInstance | null>(null);
const compact = ref(window.innerWidth < 768);
const libraryVisible = ref(false);

// 富文本图片/视频统一走「媒体库」（复用 strapi-backend 课程媒体组件交互：浮层 + 上传 + 搜索 + 网格）
const MENUS_FULL = [
  'undo',
  'redo',
  '|',
  'bold',
  'underline',
  'italic',
  'color',
  'fontSize',
  'headerSelect',
  'clearStyle',
  '|',
  'bulletedList',
  'numberedList',
  'todo',
  'blockquote',
  '|',
  'justifyLeft',
  'justifyCenter',
  'justifyRight',
  'indent',
  'divider',
  '|',
  'insertLink',
];
const MENUS_COMPACT = ['bold', 'underline', 'italic', 'color', 'fontSize', 'undo', 'redo'];
const menus = () => (compact.value ? MENUS_COMPACT : MENUS_FULL);

// 切到 HTML 前，先同步一次 wangEditor 当前内容到 props（防止 Promise 异步未同步）
function syncCurrentHtml() {
  if (editorRef.value) emit('update:modelValue', editorRef.value.getHtml());
}

function openLibrary(_t?: 'image' | 'video' | 'mixed') {
  // wangEditor 在编辑器失焦时会把最后光标保存进 currentRange，
  // 选图确认前需用 restoreSelection() 恢复，否则弹窗夺焦后
  // dangerouslyInsertHtml 因无活动选区而静默失败（图片完全插不进）。
  libraryVisible.value = true;
}

// 媒体库确认：图片用 insertImage，视频用 insertVideo 插入正文
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function onLibraryConfirm(assets: AssetItem[]) {
  const ed = editorRef.value;
  if (!ed) return;
  // 弹窗已夺焦，插入前先恢复编辑器失焦前保存的光标选区，
  // 使 dangerouslyInsertHtml 落在用户指定的光标处而非静默无效。
  ed.restoreSelection();
  for (const a of assets) {
    const url = a.source || a.preview;
    const mime = (a.mimeType || '').toLowerCase();
    // 本工程工具栏未启用 wangEditor 图片模块，editor 实例未挂载 insertImage/insertVideo。
    // 用通用 dangerouslyInsertHtml 在光标处插入 <img>/<video>（H5 contenteditable 通用能力）。
    const safeUrl = escapeAttr(url);
    const safeName = escapeAttr(a.name || '');
    if (mime.startsWith('video')) {
      ed.dangerouslyInsertHtml(`<video controls src="${safeUrl}"></video>`);
    } else {
      ed.dangerouslyInsertHtml(`<img src="${safeUrl}" alt="${safeName}">`);
    }
  }
}

function initEditor(html = props.modelValue || '') {
  if (!document.getElementById(editorId) || !document.getElementById(toolbarId)) return;
  const editor = createEditor({
    selector: '#' + editorId,
    html,
    config: {
      placeholder: '请输入商品描述…',
    },
    mode: 'default',
  });
  createToolbar({
    editor,
    selector: '#' + toolbarId,
    config: { toolbarKeys: menus() },
    mode: 'default',
  });
  editor.on('change', () => emit('update:modelValue', editor.getHtml()));
  editorRef.value = editor;
}

function destroyEditor() {
  if (editorRef.value) {
    editorRef.value.destroy();
    editorRef.value = null;
  }
}

// HTML 源码失焦：把源码写回可可视化重建的初始值
function onSrcBlur() {
  props.modelValue;
}

watch(
  mode,
  async (m) => {
    if (m === 'visual') {
      await nextTick();
      destroyEditor();
      initEditor(srcHtml.value);
      srcHtml.value = props.modelValue || '';
    } else {
      syncCurrentHtml();
      srcHtml.value = props.modelValue || '';
    }
  },
);

onMounted(() => {
  window.addEventListener('resize', onResize);
  nextTick(() => initEditor(props.modelValue || ''));
});
function onResize() {
  compact.value = window.innerWidth < 768;
}
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  destroyEditor();
});
</script>

<style lang="scss" scoped>
.rte {
  width: 100%;
  border: 1rpx solid $wa-rule;
  border-radius: $wa-radius;
  overflow: hidden;
  background: #fff;

  &__mode {
    display: flex;
    gap: 8rpx;
    padding: 8rpx 12rpx 0;
  }

  &__mode-btn {
    padding: 6rpx 16rpx;
    font-size: 24rpx;
    color: $wa-muted;
    border: 1rpx solid $wa-rule;
    border-radius: 6rpx;
    cursor: pointer;

    &.on {
      color: #fff;
      background: $wa-accent;
      border-color: $wa-accent;
    }
  }

  &__library {
    margin-left: auto;
    padding: 6rpx 16rpx;
    font-size: 24rpx;
    color: #fff;
    background: $wa-accent;
    border-radius: 6rpx;
    cursor: pointer;
  }

  &__toolbar {
    border-bottom: 1rpx solid $wa-rule;
  }

  &__editor {
    min-height: 320rpx;

    // 媒体库插入的 <img>/<video> 是 wangEditor 动态 DOM（无 scoped data 属性），
    // 需 :deep 穿透才能命中；限制最大宽度，避免超宽图片/视频撑破编辑区
    :deep(img),
    :deep(video) {
      max-width: 100%;
      height: auto;
    }
  }

  &__src {
    width: 100%;
    min-height: 320rpx;
    box-sizing: border-box;
    font-size: 26rpx;
    padding: 16rpx;
    font-family: monospace;
    color: $wa-ink;
  }
}
</style>