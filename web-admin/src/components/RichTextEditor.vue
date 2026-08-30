<template>
  <view class="rte">
    <view class="rte__mode">
      <!-- 可视化 / HTML 源码切换 -->
      <view
        v-for="m in ['visual','html']" :key="m"
        class="rte__mode-btn" :class="{ on: mode === m }"
        @click="mode = m"
      >{{ m === 'visual' ? '可视化' : 'HTML' }}</view>
    </view>
    <!-- 可视化模式：wangEditor 挂载点 -->
    <view v-if="mode === 'visual'">
      <view :id="toolbarId" class="rte__toolbar"></view>
      <view :id="editorId" class="rte__editor"></view>
    </view>
    <!-- HTML 源码模式：普通 textarea 编辑原始 HTML -->
    <textarea v-else v-model="srcHtml" class="rte__src" @blur="onSrcBlur"></textarea>
  </view>
</template>

<script lang="ts" setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { createEditor, createToolbar } from '@wangeditor/editor';
import '@wangeditor/editor/dist/css/style.css';
import { uploadAsset } from '../apis/asset';

type IDomEditorInstance = ReturnType<typeof createEditor>;

const props = withDefaults(defineProps<{ modelValue?: string }>(), { modelValue: '' });
const emit = defineEmits<{ (e: 'update:modelValue', html: string): void }>();

const editorId = 'rte-' + Math.random().toString(36).slice(2);
const toolbarId = 'rte-tb-' + Math.random().toString(36).slice(2);
const mode = ref<'visual' | 'html'>('visual');
const srcHtml = ref(props.modelValue || '');
const editorRef = ref<IDomEditorInstance | null>(null);
const compact = ref(window.innerWidth < 768);

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
  'uploadImage',
  'uploadVideo',
];
const MENUS_COMPACT = ['bold', 'underline', 'italic', 'color', 'fontSize', 'uploadImage', 'uploadVideo', 'undo', 'redo'];
const menus = () => (compact.value ? MENUS_COMPACT : MENUS_FULL);

// 切到 HTML 前，先同步一次 wangEditor 当前内容到 props（防止 Promise 异步未同步）
function syncCurrentHtml() {
  if (editorRef.value) emit('update:modelValue', editorRef.value.getHtml());
}

const uploadImage = (file: File, insertFn: (url: string, alt: string, href: string) => void) => {
  uploadAsset(file, file.name || 'img-' + Date.now())
    .then((a) => insertFn(a.source, '', a.source))
    .catch((e: any) => uni.showToast({ title: e?.message || '图片上传失败', icon: 'none' }));
};
const uploadVideo = (file: File, insertFn: (url: string, poster?: string) => void) => {
  uploadAsset(file, file.name || 'vid-' + Date.now())
    .then((a) => insertFn(a.source, a.source))
    .catch((e: any) => uni.showToast({ title: e?.message || '视频上传失败', icon: 'none' }));
};

function initEditor(html = props.modelValue || '') {
  if (!document.getElementById(editorId) || !document.getElementById(toolbarId)) return;
  const editor = createEditor({
    selector: '#' + editorId,
    html,
    config: {
      placeholder: '请输入商品描述…',
      MENU_CONF: {
        uploadImage: { customUpload: uploadImage },
        uploadVideo: { customUpload: uploadVideo },
      },
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

  &__toolbar {
    border-bottom: 1rpx solid $wa-rule;
  }

  &__editor {
    min-height: 320rpx;
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