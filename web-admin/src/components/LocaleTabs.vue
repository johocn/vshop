<template>
  <view class="loc">
    <view class="tabs">
      <text
        v-for="loc in LOCALES"
        :key="loc"
        class="tab"
        :class="{ on: loc === active, filled: has(loc) }"
        @tap="active = loc"
      >{{ locale.t('i18nEdit.locale_' + loc) }}</text>
    </view>
    <textarea
      v-if="multiline"
      class="area"
      :value="val"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :style="{ height: areaHeight }"
      @input="onInput"
    />
    <input v-else class="in" :value="val" :placeholder="placeholder" :maxlength="maxlength" @input="onInput" />
    <text v-if="err" class="err">{{ err }}</text>
    <text v-else-if="active !== 'zh-CN' && !has(active)" class="hint">{{ locale.t('i18nEdit.fallbackHint') }}</text>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { useLocaleStore } from '../stores/localeStore';
import { CONTENT_LOCALES, bytesOf, type LocaleMap } from '../utils/i18n-map';

const props = defineProps<{
  modelValue?: LocaleMap | null;
  placeholder?: string;
  /** textarea 形态（多行） */
  multiline?: boolean;
  /** textarea 高度（rpx），multiline 时生效 */
  rows?: number;
  /** 字符数上限，-1 不限制（uni textarea 默认 140，必须显式放开） */
  maxlength?: number;
  /** 单语言 UTF-8 字节上限，超出仅提示（阻断在保存方） */
  maxBytes?: number;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: LocaleMap): void }>();

const locale = useLocaleStore();
const LOCALES = CONTENT_LOCALES;
const active = ref<string>('zh-CN');

const val = computed(() => (props.modelValue ?? {})[active.value] ?? '');
const areaHeight = computed(() => (props.rows ? props.rows * 40 + 'rpx' : '320rpx'));
const err = ref('');

function has(loc: string): boolean {
  return !!(props.modelValue ?? {})[loc]?.trim();
}

function onInput(e: any) {
  const v = String(e?.detail?.value ?? '');
  const next: LocaleMap = { ...(props.modelValue ?? {}) };
  if (v) next[active.value] = v;
  else delete next[active.value];
  emit('update:modelValue', next);
  err.value = props.maxBytes && bytesOf(v) > props.maxBytes
    ? locale.t('i18nEdit.errTooLarge').replace('{n}', String(Math.round(props.maxBytes / 1024)))
    : '';
}
</script>
<style lang="scss" scoped>
.loc { display: flex; flex-direction: column; gap: 12rpx;
  .tabs { display: flex; flex-wrap: wrap; gap: 8rpx;
    .tab { font-size: 22rpx; color: $wa-muted; background: $wa-bg; border: 2rpx dashed #e5e7eb; border-radius: 999rpx; padding: 6rpx 18rpx;
      &.filled { border-style: solid; border-color: #dbe6fb; }
      &.on { color: #fff; background: $wa-accent; border-color: $wa-accent; } } }
  .in { box-sizing: border-box; width: 100%; height: 72rpx; background: $wa-bg; border-radius: $wa-radius; padding: 0 20rpx; font-size: 26rpx; color: $wa-ink; }
  .area { box-sizing: border-box; width: 100%; background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 26rpx; color: $wa-ink; line-height: 1.5; }
  .hint { font-size: 22rpx; color: $wa-muted; }
  .err { font-size: 22rpx; color: #dc2626; }
}
</style>
