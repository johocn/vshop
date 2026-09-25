<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">{{ $t('platformGlobalConfig.title') }}</text>
        <view class="head-ops">
          <text class="head-btn" @tap="load">{{ $t('platformGlobalConfig.refresh') }}</text>
        </view>
      </view>
      <view class="chips">
        <text
          v-for="a in APP_OPTS"
          :key="a.key"
          class="chip"
          :class="{ on: app === a.key }"
          @tap="switchApp(a.key)"
        >{{ a.label }}</text>
      </view>
      <view class="hint">{{ $t('platformGlobalConfig.hint') }}</view>

      <view class="img-title">{{ $t('platformGlobalConfig.themeTokens') }}</view>
      <view class="field" v-for="f in TOKEN_FIELDS" :key="f.path">
        <text class="label">{{ $t('platformGlobalConfig.' + f.labelKey) }}</text>
        <input
          class="in"
          :type="f.kind === 'number' ? 'number' : 'text'"
          :value="String(readField(f) ?? '')"
          @input="onFieldInput(f, ($event as any).detail.value)"
          @blur="checkField(f)"
        />
        <text v-if="fieldErrors[f.path]" class="err">{{ $t('platformGlobalConfig.err_' + fieldErrors[f.path]) }}</text>
      </view>

      <view class="img-title">{{ $t('platformGlobalConfig.productDefaults') }}</view>
      <view class="field" v-for="f in PRODUCT_FIELDS" :key="f.path">
        <view v-if="f.kind === 'boolean'" class="blk">
          <text class="blk-name">{{ $t('platformGlobalConfig.' + f.labelKey) }}</text>
          <switch :checked="!!readField(f)" color="#4f8cff" @change="writeField(f, ($event as any).detail.value)" />
        </view>
        <view v-else>
          <text class="label">{{ $t('platformGlobalConfig.' + f.labelKey) }}</text>
          <view class="chips">
            <text
              v-for="o in f.options"
              :key="o"
              class="chip"
              :class="{ on: readField(f) === o }"
              @tap="writeField(f, o)"
            >{{ $t('platformGlobalConfig.layout_' + o) }}</text>
          </view>
        </view>
        <text v-if="fieldErrors[f.path]" class="err">{{ $t('platformGlobalConfig.err_' + fieldErrors[f.path]) }}</text>
      </view>
      <text class="hint">{{ $t('platformGlobalConfig.otherPagesHint') }}</text>

      <view class="field">
        <view class="chips">
          <text class="chip" :class="{ on: jsonOpen }" @tap="jsonOpen = !jsonOpen">{{ $t('platformGlobalConfig.advancedJson') }}</text>
        </view>
        <textarea v-if="jsonOpen" class="ta tall" v-model="defaultsJson" @blur="syncFromJson" />
      </view>
      <view v-if="err" class="err">{{ err }}</view>
      <button class="btn" :disabled="saving" @tap="save">{{ saving ? $t('platformGlobalConfig.saving') : $t('platformGlobalConfig.save') }}</button>
    </view>

    <view class="card">
      <text class="sec">{{ $t('platformGlobalConfig.mergedPreview') }}</text>
      <text class="muted">{{ $t('platformGlobalConfig.mergedHint') }}</text>
      <view class="chips">
        <text class="chip" @tap="genPreview">{{ $t('platformGlobalConfig.previewNow') }}</text>
        <text class="chip" :class="{ on: previewOn }" @tap="previewOn = !previewOn">
          {{ previewOn ? $t('platformGlobalConfig.hideSources') : $t('platformGlobalConfig.showSources') }}
        </text>
      </view>
      <text v-if="previewErr" class="err">{{ previewErr }}</text>
      <pre v-if="previewText" class="json">{{ previewText }}</pre>
      <view v-if="previewOn && previewSources.length" class="srcs">
        <view class="src" v-for="s in previewSources" :key="s.key">
          <text class="k">{{ s.key }}</text>
          <text class="v" :class="'src-' + s.source">{{ s.source }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { templateApi } from '../../../apis/template';
import { graphQlErrorMsg } from '../../../apis/client';
import { GLOBAL_CONFIG_FIELDS, validateField, type ConfigField } from '../../../constants/config-schema';
import { getByPath, setByPath } from '../../../utils/config-path';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const APP_OPTS = [
  { key: 'nshop', label: 'nshop 商城' },
  { key: 'vshop', label: 'youshop 商城' },
] as const;

const FIELDS = GLOBAL_CONFIG_FIELDS;
const TOKEN_FIELDS = FIELDS.filter((f) => f.path.startsWith('themeTokens.'));
const PRODUCT_FIELDS = FIELDS.filter((f) => f.path.startsWith('defaults.'));

const app = ref<'nshop' | 'vshop'>('nshop');
const tokens = ref<Record<string, string>>({ primaryColor: '#ff6600', accentColor: '#fff3e6', radius: '8' });
const defs = ref<Record<string, any>>({});
const jsonOpen = ref(false);
const defaultsJson = ref('{}');
const err = ref('');
const saving = ref(false);
const fieldErrors = ref<Record<string, string>>({});

/** 结构化字段的合并根：themeTokens + defaults 一条记录，路径前缀已含二者 */
const draft = computed<Record<string, any>>(() => ({ themeTokens: tokens.value, defaults: defs.value }));

const readField = (f: ConfigField) => getByPath(draft.value, f.path);

function syncToJson() {
  defaultsJson.value = JSON.stringify(defs.value, null, 2);
}

function writeField(f: ConfigField, v: unknown) {
  if (f.path.startsWith('themeTokens.')) {
    tokens.value = setByPath({ themeTokens: tokens.value }, f.path, v).themeTokens;
  } else {
    defs.value = setByPath({ defaults: defs.value }, f.path, v).defaults;
    syncToJson();
  }
  checkField(f);
}

function onFieldInput(f: ConfigField, v: string) {
  writeField(f, v);
}

function checkField(f: ConfigField): boolean {
  const code = validateField(f, readField(f));
  fieldErrors.value = { ...fieldErrors.value, [f.path]: code ?? '' };
  return !code;
}

/** 逃生口：JSON 手改后合并回表单（以表单为准，冲突时表单值胜出） */
function syncFromJson() {
  const text = defaultsJson.value.trim();
  if (!text) return;
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) defs.value = v;
  } catch {
    /* 坏 JSON 保持表单值不变，保存时由 save() 统一报错 */
  }
}

function switchApp(a: 'nshop' | 'vshop') {
  app.value = a;
  load();
}

onLoad(load);
async function load() {
  try {
    const cfg = await templateApi.globalConfig(app.value);
    if (cfg?.themeTokens) {
      tokens.value = {
        primaryColor: (cfg.themeTokens.primaryColor as string) ?? '#ff6600',
        accentColor: (cfg.themeTokens.accentColor as string) ?? '#fff3e6',
        radius: String(cfg.themeTokens.radius ?? 8),
      };
    }
    defs.value = cfg?.defaults && typeof cfg.defaults === 'object' ? cfg.defaults : {};
    defaultsJson.value = JSON.stringify(defs.value, null, 2);
    fieldErrors.value = {};
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformGlobalConfig.loadFailed')), icon: 'none' });
  }
}

async function save() {
  err.value = '';
  // 1) 结构化字段逐项校验：只标红出错项，保留其余编辑态
  const failed = FIELDS.filter((f) => validateField(f, readField(f)) !== null);
  fieldErrors.value = failed.reduce<Record<string, string>>((acc, f) => {
    acc[f.path] = validateField(f, readField(f))!;
    return acc;
  }, {});
  if (failed.length) {
    uni.showToast({
      title: locale.t('platformGlobalConfig.errFixFirst').replace('{n}', String(failed.length)),
      icon: 'none',
    });
    return;
  }
  // 2) JSON 高级模式下额外校验 JSON 文本本身，并把解析结果并入编辑态
  if (jsonOpen.value) {
    const text = defaultsJson.value.trim();
    if (text) {
      try {
        const v = JSON.parse(text);
        if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('bad');
        defs.value = v;
      } catch {
        err.value = locale.t('platformGlobalConfig.invalidDefaults');
        return;
      }
    }
  }
  saving.value = true;
  try {
    await templateApi.updateGlobalConfig({
      app: app.value,
      themeTokens: {
        primaryColor: String(tokens.value.primaryColor ?? '').trim(),
        accentColor: String(tokens.value.accentColor ?? '').trim(),
        radius: Number(tokens.value.radius) || 8,
      },
      defaults: { ...defs.value },
    });
    uni.showToast({ title: locale.t('platformGlobalConfig.saved'), icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformGlobalConfig.saveFailed')), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

const previewText = ref('');
const previewErr = ref('');
const previewOn = ref(false);
const previewSources = ref<Array<{ key: string; source: string }>>([]);

/** 用「当前编辑态」而非已保存态做预览 —— 这就是「改前可见」 */
async function genPreview() {
  previewErr.value = '';
  previewText.value = '';
  previewSources.value = [];
  try {
    const overrides = {
      themeTokens: tokens.value,
      defaults: defs.value,
    };
    const r = await templateApi.mergedPreview(app.value, undefined, overrides);
    previewText.value = JSON.stringify(r.merged, null, 2);
    previewSources.value = Object.entries(r.sourceByKey ?? {}).map(([key, source]) => ({
      key,
      source: String(source),
    }));
    previewOn.value = true;
  } catch (e: any) {
    previewErr.value = graphQlErrorMsg(e, locale.t('platformGlobalConfig.previewFailed'));
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.head-ops { display: flex; align-items: center; gap: 16rpx; }
.head-btn { flex: 0 0 auto; padding: 8rpx 26rpx; background: $pm-info; color: #fff; border-radius: 999rpx; font-size: 26rpx; }
.chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 8rpx; }
.chip { flex: 0 0 auto; padding: 6rpx 22rpx; border: 1px solid #eee; border-radius: 999rpx; font-size: 24rpx; color: #666; background: #fafafa; }
.chip.on { background: #4f8cff; border-color: #4f8cff; color: #fff; }
.hint { font-size: 22rpx; color: #999; line-height: 1.6; margin-bottom: 16rpx; }
.img-title { font-size: 28rpx; color: #333; padding: 16rpx 0 8rpx; }
.in { box-sizing: border-box; width: 100%; border: 1px solid #eee; border-radius: 12rpx; padding: 12rpx 20rpx; font-size: 26rpx; }
.ta { box-sizing: border-box; width: 100%; border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 24rpx; height: 180rpx; }
.ta.tall { height: 280rpx; margin-bottom: 16rpx; }
.blk { display: flex; align-items: center; justify-content: space-between; padding: 16rpx 0; border-bottom: 1px solid #f2f2f2; }
.blk-name { font-size: 26rpx; color: #333; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.field { margin-bottom: 24rpx; }
.err { color: #e64340; font-size: 24rpx; margin-bottom: 16rpx; }
.btn { border-radius: 40rpx; font-size: 28rpx; background: #4f8cff; color: #fff; line-height: 2.4; margin-top: 8rpx; }
.btn[disabled] { opacity: .6; }
.card + .card { margin-top: 24rpx; }
.sec { display: block; font-size: 28rpx; font-weight: 700; color: #333; margin-bottom: 8rpx; }
.muted { display: block; font-size: 22rpx; color: #999; line-height: 1.6; margin-bottom: 12rpx; }
.json { margin-top: 12rpx; padding: 16rpx 20rpx; background: #f7f8fa; border-radius: 12rpx; font-family: Consolas, Monaco, monospace; font-size: 22rpx; color: #333; white-space: pre-wrap; word-break: break-all; max-height: 640rpx; overflow: auto; }
.srcs { display: flex; flex-direction: column; margin-top: 12rpx; }
.src { display: flex; align-items: center; justify-content: space-between; padding: 8rpx 0; border-bottom: 1px solid #f2f2f2; }
.src .k { flex: 1; font-size: 24rpx; color: #666; margin-right: 16rpx; word-break: break-all; }
.src .v { flex: 0 0 auto; padding: 2rpx 16rpx; border-radius: 999rpx; font-size: 20rpx; color: #fff; }
.src-L1 { background: #4f8cff; }
.src-L2 { background: #f0a020; }
.src-L3 { background: #52c41a; }
</style>