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
        <textarea v-if="jsonOpen" class="ta tall" v-model="draftJson" @blur="syncFromJson" />
      </view>
      <view v-if="err" class="err">{{ err }}</view>
      <button class="btn" :disabled="saving" @tap="save">{{ saving ? $t('platformGlobalConfig.saving') : $t('platformGlobalConfig.save') }}</button>
    </view>

    <view class="card">
      <view class="row head">
        <text class="sec hot-sec">{{ $t('platformGlobalConfig.hotCitySection') }}</text>
        <text class="hot-badge">{{ $t('platformGlobalConfig.hotCityConfigured').replace('{n}', String(hotCities.length)) }}</text>
        <text class="hot-mgmt" @tap="openHotSheet">{{ $t('platformGlobalConfig.hotCityManage') }}</text>
      </view>
      <text class="muted">{{ $t('platformGlobalConfig.hotCityHint') }}</text>
      <view class="hot-pv" v-if="hotCities.length">
        <template v-for="(c, i) in hotPreview" :key="c.name">
          <text v-if="i" class="hot-pv-a">→</text>
          <text class="hot-pv-c">{{ c.name }}</text>
        </template>
        <text v-if="hotMore > 0" class="hot-pv-more">+{{ hotMore }}</text>
      </view>
    </view>

    <view class="card">
      <text class="sec">{{ $t('platformGlobalConfig.agreementSection') }}</text>
      <text class="muted">{{ $t('platformGlobalConfig.agreementHint') }}</text>
      <text v-if="agreementUpdatedAt" class="muted">{{ $t('platformGlobalConfig.agreementUpdatedAt').replace('{time}', agreementUpdatedAt) }}</text>
      <view class="ag-block">
        <text class="label">{{ $t('platformGlobalConfig.agreementService') }}</text>
        <LocaleTabs v-model="agreementService" multiline :rows="8" :max-bytes="32768" :placeholder="$t('platformGlobalConfig.agreementPlaceholder')" />
      </view>
      <view class="ag-block">
        <text class="label">{{ $t('platformGlobalConfig.agreementPrivacy') }}</text>
        <LocaleTabs v-model="agreementPrivacy" multiline :rows="8" :max-bytes="32768" :placeholder="$t('platformGlobalConfig.agreementPlaceholder')" />
      </view>
      <view v-if="agreementErr" class="err">{{ agreementErr }}</view>
      <button class="btn" :disabled="agreementSaving" @tap="saveAgreement">{{ agreementSaving ? $t('platformGlobalConfig.agreementSaving') : $t('platformGlobalConfig.agreementSave') }}</button>
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

    <view class="mask" v-if="showHotSheet" @tap="closeHotSheet">
      <view class="sheet" @tap.stop>
        <view class="sheet-grip"></view>
        <view class="row head">
          <text class="sec hot-sec">{{ $t('platformGlobalConfig.hotCityManageTitle') }}</text>
          <text class="sheet-done" :class="{ off: hotSaving }" @tap="doneHotSheet">{{ hotSaving ? $t('platformGlobalConfig.saving') : $t('platformGlobalConfig.hotCityDone') }}</text>
        </view>
        <scroll-view scroll-y class="hot-rows">
          <view class="hot-row" v-for="(c, i) in hotCities" :key="c.name">
            <view class="hot-line">
              <text class="hot-name" @tap="toggleHotEdit(i)">{{ c.name }}</text>
              <text class="hot-meta">{{ hotMeta(c) }}</text>
              <view class="hot-ops">
                <text class="hot-op" @tap="moveHot(i, -1)">↑</text>
                <text class="hot-op" @tap="moveHot(i, 1)">↓</text>
                <text class="hot-op" @tap="removeHot(i)">✕</text>
              </view>
            </view>
            <view v-if="editingHotIdx === i" class="hot-edit">
              <input class="in sm" type="text" :value="hotDraft.adcode" :placeholder="$t('platformGlobalConfig.hotCityAdcode')" @input="hotDraft.adcode = ($event as any).detail.value" />
              <input class="in sm" type="digit" :value="hotDraft.lat" :placeholder="$t('platformGlobalConfig.hotCityLat')" @input="hotDraft.lat = ($event as any).detail.value" />
              <input class="in sm" type="digit" :value="hotDraft.lng" :placeholder="$t('platformGlobalConfig.hotCityLng')" @input="hotDraft.lng = ($event as any).detail.value" />
            </view>
          </view>
        </scroll-view>
        <text class="muted hot-tip">{{ $t('platformGlobalConfig.hotCityExpandHint') }}</text>
        <text class="sec hot-sub">{{ $t('platformGlobalConfig.hotCityQuickAdd') }}</text>
        <view class="chips">
          <text v-for="c in hotLibraryLeft" :key="c.name" class="chip" @tap="addQuick(c)">{{ c.name }}</text>
        </view>
        <view class="chips" style="margin-top: 12rpx;">
          <text class="chip" :class="{ on: hotCustomOpen }" @tap="hotCustomOpen = !hotCustomOpen">{{ $t('platformGlobalConfig.hotCityCustom') }}</text>
        </view>
        <view v-if="hotCustomOpen" class="hot-cform">
          <input class="in sm" type="text" :value="hotCustom.name" :placeholder="$t('platformGlobalConfig.hotCityNameLabel')" @input="hotCustom.name = ($event as any).detail.value" />
          <input class="in sm" type="text" :value="hotCustom.adcode" :placeholder="$t('platformGlobalConfig.hotCityAdcode')" @input="hotCustom.adcode = ($event as any).detail.value" />
          <input class="in sm" type="digit" :value="hotCustom.lat" :placeholder="$t('platformGlobalConfig.hotCityLat')" @input="hotCustom.lat = ($event as any).detail.value" />
          <input class="in sm" type="digit" :value="hotCustom.lng" :placeholder="$t('platformGlobalConfig.hotCityLng')" @input="hotCustom.lng = ($event as any).detail.value" />
          <text class="hot-cadd" @tap="addCustom">{{ $t('platformGlobalConfig.hotCityAdd') }}</text>
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
import { HOT_CITY_LIBRARY, HOT_CITY_LIMIT, normalizeHotCities, coordError, type HotCity } from '../../../constants/hot-cities';
import { getByPath, setByPath } from '../../../utils/config-path';
import { cleanLocaleMap, localeMapBytes, type LocaleMap } from '../../../utils/i18n-map';
import LocaleTabs from '../../../components/LocaleTabs.vue';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const APP_OPTS = computed(() => [
  { key: 'nshop', label: locale.t('platformTemplates.appNshop') },
  { key: 'vshop', label: locale.t('platformTemplates.appVshop') },
]);

const FIELDS = GLOBAL_CONFIG_FIELDS;
const TOKEN_FIELDS = FIELDS.filter((f) => f.path.startsWith('themeTokens.'));
const PRODUCT_FIELDS = FIELDS.filter((f) => f.path.startsWith('defaults.'));

const app = ref<'nshop' | 'vshop'>('nshop');
const tokens = ref<Record<string, string>>({ primaryColor: '#ff6600', accentColor: '#fff3e6', radius: '8' });
const defs = ref<Record<string, any>>({});
const jsonOpen = ref(false);
const draftJson = ref('{}');
const err = ref('');
const saving = ref(false);
const fieldErrors = ref<Record<string, string>>({});

/* ---------------- 热门城市（defaults.hotCities，独立编辑态，保存时并入 defaults） ---------------- */
const hotCities = ref<HotCity[]>([]);
const showHotSheet = ref(false);
const editingHotIdx = ref(-1);
const hotDraft = ref({ adcode: '', lat: '', lng: '' });
const hotCustomOpen = ref(false);
const hotCustom = ref({ name: '', adcode: '', lat: '', lng: '' });
const hotSaving = ref(false);
const hotLibraryLeft = computed(() => HOT_CITY_LIBRARY.filter((c) => !hotCities.value.some((h) => h.name === c.name)));
const hotPreview = computed(() => hotCities.value.slice(0, 5));
const hotMore = computed(() => hotCities.value.length - hotPreview.value.length);

const hotMeta = (c: HotCity) => {
  const parts: string[] = [];
  if (c.adcode) parts.push(c.adcode);
  if (typeof c.lat === 'number' && typeof c.lng === 'number') parts.push(`${c.lat}, ${c.lng}`);
  return parts.join(' · ');
};

/**
 * 设计口径：themeTokens 与 defaults 合成同一份编辑态（draft），结构化表单与 JSON 框
 * 是这份编辑态的两个视图 —— 改任一边立即同步另一边。JSON 框在高级模式下是完整编辑态，
 * themeTokens / defaults 缺哪个就以空对象覆盖哪个。
 */

/** themeTokens 的可编辑键：JSON 并入时只认这三项，其余键不参与表单往返 */
const TOKEN_KEYS = ['primaryColor', 'accentColor', 'radius'] as const;

/** 结构化字段的合并根：themeTokens + defaults 一条记录，路径前缀已含二者 */
const draft = computed<Record<string, any>>(() => ({ themeTokens: tokens.value, defaults: defs.value }));

const readField = (f: ConfigField) => getByPath(draft.value, f.path);

/** 编辑态的完整 JSON 形态：JSON 高级编辑框与结构化表单共用同一份编辑态 */
function syncToJson() {
  draftJson.value = JSON.stringify({ themeTokens: tokens.value, defaults: defs.value }, null, 2);
}

/** 把 JSON 里的 themeTokens 并入令牌：只覆盖 TOKEN_KEYS 中出现的键，值统一成字符串（与输入框态一致），缺键沿用当前编辑态 */
function mergeTokensFromJson(raw: unknown) {
  const t = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const next: Record<string, string> = { ...tokens.value };
  for (const k of TOKEN_KEYS) {
    if (t[k] !== undefined) next[k] = String(t[k]);
  }
  tokens.value = next;
}

function writeField(f: ConfigField, v: unknown) {
  if (f.path.startsWith('themeTokens.')) {
    tokens.value = setByPath({ themeTokens: tokens.value }, f.path, v).themeTokens;
  } else {
    defs.value = setByPath({ defaults: defs.value }, f.path, v).defaults;
  }
  syncToJson();
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

/** 逃生口：JSON 手改在失焦时并入编辑态（坏 JSON / 非对象保持表单值不变，保存时由 save() 统一报错） */
function syncFromJson() {
  const text = draftJson.value.trim();
  if (!text) return;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return;
  const root = v as Record<string, unknown>;
  mergeTokensFromJson(root.themeTokens);
  if (root.defaults && typeof root.defaults === 'object' && !Array.isArray(root.defaults)) {
    defs.value = root.defaults as Record<string, any>;
  }
  syncToJson();
  fieldErrors.value = {};
}

function switchApp(a: string) {
  app.value = a as 'nshop' | 'vshop';
  load();
}

// 协议文案卡：五语言编辑，保存合并进 defaults.agreement（C 端按语言读取，未填语言回退 zh-CN）
const AGREEMENT_MAX_BYTES = 32 * 1024;
const agreementService = ref<LocaleMap>({});
const agreementPrivacy = ref<LocaleMap>({});
const agreementSaving = ref(false);
const agreementErr = ref('');
const agreementUpdatedAt = computed(() => {
  const t = (defs.value?.agreement as any)?.updatedAt;
  return typeof t === 'string' ? t.slice(0, 10) : '';
});

async function saveAgreement() {
  agreementErr.value = '';
  if (localeMapBytes(agreementService.value) > AGREEMENT_MAX_BYTES || localeMapBytes(agreementPrivacy.value) > AGREEMENT_MAX_BYTES) {
    agreementErr.value = locale.t('platformGlobalConfig.errTooLarge');
    return;
  }
  agreementSaving.value = true;
  try {
    const prevAgreement = (defs.value?.agreement && typeof defs.value.agreement === 'object' ? defs.value.agreement : {}) as Record<string, any>;
    const agreement = {
      ...prevAgreement,
      service: cleanLocaleMap(agreementService.value),
      privacy: cleanLocaleMap(agreementPrivacy.value),
      updatedAt: new Date().toISOString(),
    };
    await templateApi.updateGlobalConfig({
      app: app.value,
      themeTokens: {
        primaryColor: String(tokens.value.primaryColor ?? '').trim(),
        accentColor: String(tokens.value.accentColor ?? '').trim(),
        radius: Number(tokens.value.radius) || 8,
      },
      defaults: { ...defs.value, agreement, hotCities: hotCities.value },
    });
    defs.value = { ...defs.value, agreement };
    uni.showToast({ title: locale.t('platformGlobalConfig.agreementSaved'), icon: 'success' });
  } catch (e: any) {
    agreementErr.value = graphQlErrorMsg(e, locale.t('platformGlobalConfig.saveFailed'));
  } finally {
    agreementSaving.value = false;
  }
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
    // 热门城市走独立编辑态（弹层），从 defs 剥离使 JSON 高级框保持精简；保存时再并入 defaults
    hotCities.value = normalizeHotCities(defs.value.hotCities);
    if (defs.value.hotCities !== undefined) delete defs.value.hotCities;
    const ag = (defs.value.agreement && typeof defs.value.agreement === 'object' ? defs.value.agreement : null) as Record<string, any> | null;
    agreementService.value = cleanLocaleMap(ag?.service as LocaleMap | null);
    agreementPrivacy.value = cleanLocaleMap(ag?.privacy as LocaleMap | null);
    syncToJson();
    fieldErrors.value = {};
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformGlobalConfig.loadFailed')), icon: 'none' });
  }
}

async function save() {
  err.value = '';
  // 1) 高级 JSON 模式：先并入编辑态（themeTokens + defaults），再做结构化校验
  if (jsonOpen.value) {
    const text = draftJson.value.trim();
    if (text) {
      let v: unknown;
      try {
        v = JSON.parse(text);
      } catch {
        err.value = locale.t('platformGlobalConfig.invalidJson');
        return;
      }
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        err.value = locale.t('platformGlobalConfig.invalidJson');
        return;
      }
      const root = v as Record<string, unknown>;
      mergeTokensFromJson(root.themeTokens);
      defs.value = root.defaults && typeof root.defaults === 'object' && !Array.isArray(root.defaults)
        ? (root.defaults as Record<string, any>)
        : {};
      syncToJson();
    }
  }
  // 2) 结构化字段逐项校验：只标红出错项，保留其余编辑态
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
  saving.value = true;
  try {
    await templateApi.updateGlobalConfig({
      app: app.value,
      themeTokens: {
        primaryColor: String(tokens.value.primaryColor ?? '').trim(),
        accentColor: String(tokens.value.accentColor ?? '').trim(),
        radius: Number(tokens.value.radius) || 8,
      },
      defaults: { ...defs.value, hotCities: hotCities.value },
    });
    uni.showToast({ title: locale.t('platformGlobalConfig.saved'), icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformGlobalConfig.saveFailed')), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

/* ---------------- 热门城市弹层（方案 C：编辑即时生效于编辑态，「完成」统一校验并保存） ---------------- */

function openHotSheet() {
  editingHotIdx.value = -1;
  hotCustomOpen.value = false;
  showHotSheet.value = true;
}

function closeHotSheet() {
  applyHotEdit(); // 尽力应用展开行草稿；未过校验的输入不生效（与 JSON 逃生口「坏值不并入」口径一致）
  showHotSheet.value = false;
}

/** 应用当前展开行的坐标草稿；失败 toast 并返回 false */
function applyHotEdit(): boolean {
  const i = editingHotIdx.value;
  if (i < 0 || !hotCities.value[i]) {
    editingHotIdx.value = -1;
    return true;
  }
  const code = coordError(hotDraft.value.lat, hotDraft.value.lng);
  if (code) {
    uni.showToast({ title: locale.t('platformGlobalConfig.hotCityErr_' + code), icon: 'none' });
    return false;
  }
  const adcode = hotDraft.value.adcode.trim();
  const lat = hotDraft.value.lat.trim() === '' ? undefined : Number(hotDraft.value.lat);
  const lng = hotDraft.value.lng.trim() === '' ? undefined : Number(hotDraft.value.lng);
  hotCities.value = hotCities.value.map((h, idx) =>
    idx === i ? { ...h, adcode: adcode || undefined, lat, lng } : h,
  );
  editingHotIdx.value = -1;
  return true;
}

function toggleHotEdit(i: number) {
  if (editingHotIdx.value === i) {
    applyHotEdit();
    return;
  }
  if (!applyHotEdit()) return; // 当前行校验未过，先修正再切换
  const c = hotCities.value[i];
  hotDraft.value = {
    adcode: c.adcode ?? '',
    lat: c.lat == null ? '' : String(c.lat),
    lng: c.lng == null ? '' : String(c.lng),
  };
  editingHotIdx.value = i;
}

/** 追加城市：去重 + 上限；成功返回 true */
function pushHot(item: HotCity): boolean {
  if (hotCities.value.some((h) => h.name === item.name)) {
    uni.showToast({ title: locale.t('platformGlobalConfig.hotCityErrDup'), icon: 'none' });
    return false;
  }
  if (hotCities.value.length >= HOT_CITY_LIMIT) {
    uni.showToast({
      title: locale.t('platformGlobalConfig.hotCityErrMax').replace('{n}', String(HOT_CITY_LIMIT)),
      icon: 'none',
    });
    return false;
  }
  hotCities.value = [...hotCities.value, { ...item }];
  return true;
}

function addQuick(item: HotCity) {
  if (!pushHot(item)) return;
  editingHotIdx.value = -1;
}

function addCustom() {
  const name = hotCustom.value.name.trim();
  if (!name) {
    uni.showToast({ title: locale.t('platformGlobalConfig.hotCityErrName'), icon: 'none' });
    return;
  }
  const code = coordError(hotCustom.value.lat, hotCustom.value.lng);
  if (code) {
    uni.showToast({ title: locale.t('platformGlobalConfig.hotCityErr_' + code), icon: 'none' });
    return;
  }
  const adcode = hotCustom.value.adcode.trim();
  const lat = hotCustom.value.lat.trim() === '' ? undefined : Number(hotCustom.value.lat);
  const lng = hotCustom.value.lng.trim() === '' ? undefined : Number(hotCustom.value.lng);
  if (!pushHot({ name, adcode: adcode || undefined, lat, lng })) return;
  hotCustom.value = { name: '', adcode: '', lat: '', lng: '' };
  hotCustomOpen.value = false;
}

function removeHot(i: number) {
  hotCities.value = hotCities.value.filter((_, idx) => idx !== i);
  if (editingHotIdx.value === i) editingHotIdx.value = -1;
  else if (editingHotIdx.value > i) editingHotIdx.value -= 1;
}

function moveHot(i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= hotCities.value.length) return;
  if (editingHotIdx.value === i && !applyHotEdit()) return;
  const next = [...hotCities.value];
  [next[i], next[j]] = [next[j], next[i]];
  hotCities.value = next;
  if (editingHotIdx.value === i) editingHotIdx.value = j;
  else if (editingHotIdx.value === j) editingHotIdx.value = i;
}

/** 弹层「完成」：应用行草稿 → 保存到后端（defaults 全量合并，含其他未保存编辑，与协议卡独立保存口径一致） */
async function doneHotSheet() {
  if (!applyHotEdit()) return;
  hotSaving.value = true;
  try {
    await templateApi.updateGlobalConfig({
      app: app.value,
      themeTokens: {
        primaryColor: String(tokens.value.primaryColor ?? '').trim(),
        accentColor: String(tokens.value.accentColor ?? '').trim(),
        radius: Number(tokens.value.radius) || 8,
      },
      defaults: { ...defs.value, hotCities: hotCities.value },
    });
    showHotSheet.value = false;
    uni.showToast({ title: locale.t('platformGlobalConfig.hotCitySaved'), icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformGlobalConfig.saveFailed')), icon: 'none' });
  } finally {
    hotSaving.value = false;
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
      defaults: { ...defs.value, hotCities: hotCities.value },
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
.ag-block { margin-bottom: 24rpx; }
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

/* 热门城市（摘要卡 + 底部弹层） */
.hot-sec { margin-bottom: 0; }
.hot-badge { flex: 0 0 auto; padding: 2rpx 18rpx; background: #eaf2ff; color: #1d5fd6; border-radius: 999rpx; font-size: 22rpx; }
.hot-mgmt { margin-left: auto; padding: 8rpx 26rpx; background: #4f8cff; color: #fff; border-radius: 999rpx; font-size: 24rpx; }
.hot-pv { display: flex; flex-wrap: wrap; align-items: center; gap: 8rpx; margin-top: 12rpx; }
.hot-pv-c { padding: 4rpx 18rpx; background: #f2f3f7; border-radius: 999rpx; font-size: 24rpx; color: #333; }
.hot-pv-a { font-size: 22rpx; color: #999; }
.hot-pv-more { font-size: 24rpx; color: #1d5fd6; font-weight: 600; }
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); z-index: 99; display: flex; align-items: flex-end; }
.sheet { width: 100%; max-height: 84vh; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 20rpx 24rpx 40rpx; box-sizing: border-box; display: flex; flex-direction: column; }
.sheet-grip { width: 64rpx; height: 8rpx; border-radius: 999rpx; background: #e5e6eb; margin: 0 auto 16rpx; }
.sheet-done { margin-left: auto; padding: 8rpx 30rpx; background: #4f8cff; color: #fff; border-radius: 999rpx; font-size: 26rpx; }
.sheet-done.off { opacity: .6; }
.hot-rows { max-height: 42vh; }
.hot-row { padding: 14rpx 0; border-bottom: 1px solid #f2f2f2; }
.hot-row:last-child { border-bottom: none; }
.hot-line { display: flex; align-items: center; gap: 12rpx; }
.hot-name { font-size: 26rpx; font-weight: 600; color: #1d5fd6; }
.hot-meta { margin-left: auto; font-family: Consolas, Monaco, monospace; font-size: 22rpx; color: #999; word-break: break-all; text-align: right; }
.hot-ops { display: flex; gap: 8rpx; flex: 0 0 auto; }
.hot-op { width: 44rpx; height: 44rpx; border-radius: 12rpx; background: #f5f6f8; color: #666; display: flex; align-items: center; justify-content: center; font-size: 24rpx; }
.hot-edit { display: flex; gap: 12rpx; margin-top: 12rpx; }
.hot-tip { margin-top: 8rpx; }
.hot-sub { padding: 16rpx 0 8rpx; }
.hot-cform { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 12rpx; }
.in.sm { box-sizing: border-box; width: calc((100% - 24rpx) / 3); border: 1px solid #eee; border-radius: 12rpx; padding: 10rpx 18rpx; font-size: 24rpx; }
.hot-cform .in.sm { width: calc((100% - 36rpx) / 2); }
.hot-cadd { padding: 10rpx 30rpx; background: #eaf2ff; border: 1px solid #4f8cff; color: #1d5fd6; border-radius: 999rpx; font-size: 24rpx; }
</style>