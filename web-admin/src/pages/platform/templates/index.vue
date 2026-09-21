<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">{{ $t('platformTemplates.title') }}</text>
        <view class="head-ops">
          <text class="head-btn" @tap="onAdd">{{ $t('platformTemplates.add') }}</text>
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
        <text class="chip" :class="{ on: onlyEnabled }" @tap="onlyEnabled = !onlyEnabled">{{ $t('platformTemplates.onlyEnabled') }}</text>
      </view>
      <view class="item" v-for="t in filteredList" :key="t.id" @tap="onEdit(t)">
        <view class="info">
          <text class="name">{{ t.name }} <text class="code">v{{ t.version }}</text></text>
          <text class="sub">{{ appLabel(t.app) }} · {{ t.enabled ? $t('platformTemplates.enabled') : $t('platformTemplates.disabled') }} · {{ fmtTime(t.updatedAt) }}</text>
          <text class="preview" v-if="previewText(t)">{{ $t('platformTemplates.colorPrefix').replace('{value}', previewText(t)) }}</text>
          <text class="ref" v-if="refCount(t) > 0">{{ $t('platformTemplates.refCount').replace('{n}', refCount(t)) }}</text>
        </view>
        <switch :checked="t.enabled" color="#4f8cff" @change="onToggle(t, $event)" @click.stop />
        <text class="link copy" @tap.stop="onCopy(t)">{{ $t('platformTemplates.copy') }}</text>
        <text class="link" @tap.stop="onRemove(t)">{{ $t('platformTemplates.del') }}</text>
      </view>
      <view v-if="!filteredList.length" class="empty">{{ list.length ? $t('platformTemplates.noEnabled') : $t('platformTemplates.empty') }}</view>
      <view v-if="filteredList.length" class="count">{{ $t('platformTemplates.count').replace('{n}', filteredList.length) }}</view>
    </view>
  </view>

  <!-- 新建/编辑弹层表单 -->
  <view class="mask" v-if="showForm" @tap="showForm = false">
    <view class="pop" @tap.stop>
      <view class="pop-head">
        <text class="pop-title">{{ editingId ? $t('platformTemplates.editTitle') : $t('platformTemplates.newTitle') }}</text>
        <text class="pop-close" @tap="showForm = false">×</text>
      </view>
      <view class="tabs">
        <text class="tab" :class="{ on: tab === 'form' }" @tap="onTab('form')">{{ $t('platformTemplates.tabForm') }}</text>
        <text class="tab" :class="{ on: tab === 'versions' }" @tap="onTab('versions')">{{ $t('platformTemplates.tabVersions') }}</text>
        <text class="tab" :class="{ on: tab === 'preview' }" @tap="onTab('preview')">{{ $t('platformTemplates.tabPreview') }}</text>
      </view>
      <scroll-view scroll-y class="pop-body">
        <template v-if="tab === 'form'">
          <view class="field"><text class="label">{{ $t('platformTemplates.nameLabel') }} <text class="req">*</text></text><input class="input" v-model="form.name" :placeholder="$t('platformTemplates.namePh')" /></view>
          <view class="field">
            <text class="label">{{ $t('platformTemplates.appLabel') }} <text class="req">*</text></text>
            <view class="chips">
              <text v-for="a in APP_OPTS" :key="a.key" class="chip" :class="{ on: form.app === a.key, off: !!editingId }" @tap="editingId || (form.app = a.key)">{{ a.label }}</text>
            </view>
            <text v-if="editingId" class="tip">{{ $t('platformTemplates.appLockTip') }}</text>
          </view>
          <view class="field">
            <text class="label">{{ $t('platformTemplates.enableLabel') }}</text>
            <switch :checked="form.enabled" color="#4f8cff" @change="form.enabled = $event.detail.value" />
          </view>
          <view class="field">
            <text class="label">{{ $t('platformTemplates.paletteLabel') }}</text>
            <view class="chips">
              <text class="chip" :class="{ on: !paletteScheme }" @tap="pickPalette('')">{{ $t('platformTemplates.paletteNone') }}</text>
              <text
                v-for="(def, key) in paletteList"
                :key="key"
                class="chip"
                :class="{ on: paletteScheme === key }"
                @tap="pickPalette(String(key))"
              >{{ def.name }}</text>
            </view>
          </view>
          <view class="field"><text class="label">{{ $t('platformTemplates.primaryLabel') }}</text><input class="input" v-model="themeTokens.primaryColor" placeholder="#ff6600" @blur="syncThemeJson" /></view>
          <view class="field"><text class="label">{{ $t('platformTemplates.accentLabel') }}</text><input class="input" v-model="themeTokens.accentColor" placeholder="#fff3e6" @blur="syncThemeJson" /></view>
          <view class="field"><text class="label">{{ $t('platformTemplates.radiusLabel') }}</text><input class="input" v-model="themeTokens.radius" type="number" placeholder="8" @blur="syncThemeJson" /></view>
          <view class="field"><text class="label">{{ $t('platformTemplates.themeLabel') }}</text><textarea class="ta" v-model="form.themeJson" placeholder='{"primaryColor":"#ff6600","accentColor":"#fff3e6","radius":8}' /></view>
          <view class="field">
            <text class="label">{{ $t('platformTemplates.pagesPick') }}</text>
            <view class="chips">
              <text
                v-for="p in PAGE_OPTS"
                :key="p.key"
                class="chip"
                :class="{ on: curPage === p.key }"
                @tap="curPage = p.key"
              >{{ p.label }}</text>
            </view>
          </view>
          <view v-if="curPage === 'product'" class="field">
            <text class="label">{{ $t('platformTemplates.layoutLabel') }}</text>
            <view class="chips">
              <text
                v-for="l in LAYOUT_OPTS"
                :key="l.key"
                class="chip"
                :class="{ on: pagesObj.product?.layout === l.key }"
                @tap="setPageLayout(l.key)"
              >{{ l.label }}</text>
            </view>
          </view>
          <view class="field" v-if="curPage === 'product'">
            <text class="label">{{ $t('platformTemplates.blocksLabel') }}</text>
            <view class="blk" v-for="b in BLOCK_OPTS" :key="b.key">
              <text class="blk-name">{{ b.label }}</text>
              <switch :checked="pagesObj.product?.blocks?.[b.key]?.show !== false" color="#4f8cff" @change="togglePageBlock(b.key, ($event as any).detail.value)" />
            </view>
          </view>
          <view class="field"><text class="label">{{ $t('platformTemplates.pagesLabel') }}</text><textarea class="ta tall" v-model="form.pagesJson" placeholder='{"product":{"layout":"classic","blocks":{}},"home":{"sections":[]}}' /></view>
          <view class="guide">
            <view class="gl"><text class="glk">{{ $t('platformTemplates.pagesKey') }}</text> · product / home / category / cart / profile</view>
            <view class="gl"><text class="glk">{{ $t('platformTemplates.themeKey') }}</text> · primaryColor / accentColor / radius</view>
          </view>
          <view v-if="err" class="err">{{ err }}</view>
          <button class="btn" :disabled="saving" @tap="submit">{{ saving ? $t('platformTemplates.saving') : $t('platformTemplates.save') }}</button>
        </template>

        <!-- 历史版本 Tab -->
        <view v-else-if="tab === 'versions'" class="tabpane">
          <view v-if="!editingId" class="empty">{{ $t('platformTemplates.noHistoryNew') }}</view>
          <template v-else>
            <view v-if="versionsLoading" class="empty">{{ $t('platformTemplates.loading') }}</view>
            <view v-else-if="versionsErr" class="err">{{ versionsErr }}</view>
            <view v-else-if="!versions.length" class="empty">{{ $t('platformTemplates.noVersions') }}</view>
            <view v-for="v in versions" :key="v.id" class="vitem">
              <view class="vhead">
                <text class="vname">v{{ v.version }}</text>
                <text class="vsub">{{ fmtTime(v.createdAt) }}</text>
              </view>
              <text class="vnote">{{ v.note || $t('platformTemplates.noNote') }}</text>
              <view class="vops">
                <text class="vlink" @tap="showVerPreview(v)">{{ $t('platformTemplates.previewJson') }}</text>
                <text class="vlink danger" @tap="onRestore(v)">{{ $t('platformTemplates.restore') }}</text>
              </view>
            </view>
          </template>
        </view>

        <!-- 合并预览 Tab -->
        <view v-else class="tabpane">
          <view class="field">
            <text class="label">{{ $t('platformTemplates.previewApp') }}</text>
            <view class="chips">
              <text v-for="a in APP_OPTS" :key="a.key" class="chip" :class="{ on: mApp === a.key }" @tap="mApp = a.key">{{ a.label }}</text>
            </view>
          </view>
          <view class="field">
            <text class="label">{{ $t('platformTemplates.scenarioLabel') }}</text>
            <view class="chips">
              <text class="chip" :class="{ on: mScenario === 'none' }" @tap="mScenario = 'none'">{{ $t('platformTemplates.scenarioNone') }}</text>
              <text class="chip" :class="{ on: mScenario === 'custom' }" @tap="mScenario = 'custom'">{{ $t('platformTemplates.scenarioCustom') }}</text>
            </view>
          </view>
          <view class="field" v-if="mScenario === 'custom'">
            <text class="label">{{ $t('platformTemplates.overridesLabel') }}</text>
            <textarea class="ta" v-model="overridesJson" placeholder='{"primaryColor":"#123456","product":{"layout":"list"}}' />
          </view>
          <button class="btn" :disabled="previewLoading" @tap="genPreview">{{ previewLoading ? $t('platformTemplates.previewing') : $t('platformTemplates.genPreview') }}</button>
          <view v-if="previewErr" class="err">{{ previewErr }}</view>
          <view v-if="merged !== null" class="mp">
            <text class="mp-title">{{ $t('platformTemplates.mergedTitle') }}</text>
            <scroll-view scroll-y class="json-scroll tall"><text class="json">{{ mergedText }}</text></scroll-view>
            <text class="mp-title">{{ $t('platformTemplates.sourceTitle') }}</text>
            <view class="sk" v-for="(src, k) in sourceByKey" :key="k">
              <text class="skk">{{ k }}</text>
              <text class="sbadge" :class="'s' + src">{{ srcLabel(src) }}</text>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>

  <!-- 版本 JSON 预览弹层 -->
  <view class="mask" v-if="verPreview" @tap="verPreview = null">
    <view class="pop small" @tap.stop>
      <view class="pop-head">
        <text class="pop-title">{{ verPreview.title }}</text>
        <text class="pop-close" @tap="verPreview = null">×</text>
      </view>
      <scroll-view scroll-y class="json-scroll"><text class="json">{{ verPreview.text }}</text></scroll-view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { templateApi, type ShopTemplate, type TemplateVersion, type TemplateReference } from '../../../apis/template';
import { graphQlErrorMsg } from '../../../apis/client';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const APP_OPTS = [
  { key: 'nshop', label: 'nshop 商城' },
  { key: 'vshop', label: 'youshop 商城' },
] as const;

const PAGE_OPTS = [
  { key: 'product', label: '商品详情' },
  { key: 'home', label: '首页' },
  { key: 'category', label: '分类' },
  { key: 'cart', label: '购物车' },
  { key: 'profile', label: '我的' },
] as const;
const LAYOUT_OPTS = [
  { key: 'classic', label: '经典' },
  { key: 'floor', label: '楼层' },
  { key: 'dualBuy', label: '双通道' },
] as const;
const BLOCK_OPTS = [
  { key: 'gallery', label: '主图' },
  { key: 'price', label: '价格' },
  { key: 'promo', label: '促销' },
  { key: 'service', label: '服务' },
  { key: 'params', label: '参数' },
  { key: 'reviews', label: '评价' },
  { key: 'description', label: '详情' },
] as const;

const paletteList = ref<Record<string, { name: string; tokens: Record<string, any> }>>({});
const paletteScheme = ref('');
const themeTokens = ref<{ primaryColor: string; accentColor: string; radius: string }>({ primaryColor: '', accentColor: '', radius: '' });
const pagesObj = ref<Record<string, any>>({});
const curPage = ref<'product' | 'home' | 'category' | 'cart' | 'profile'>('product');
const jsonOpenForm = ref(false);

async function loadPalettes() {
  try {
    paletteList.value = await templateApi.palettePresets();
  } catch {
    paletteList.value = {};
  }
}

function pickPalette(scheme: string) {
  paletteScheme.value = scheme;
  const def = scheme ? paletteList.value[scheme] : undefined;
  if (def) {
    themeTokens.value = {
      primaryColor: String(def.tokens.primaryColor ?? ''),
      accentColor: String(def.tokens.accentColor ?? ''),
      radius: String(def.tokens.radius ?? ''),
    };
  }
  syncThemeJson();
}

/** 表单 → JSON 串（theme）：scheme 与显式 token 并存 */
function syncThemeJson() {
  const theme: Record<string, any> = {};
  if (paletteScheme.value) theme.palette = { scheme: paletteScheme.value };
  const p = themeTokens.value.primaryColor.trim();
  const a = themeTokens.value.accentColor.trim();
  const r = themeTokens.value.radius.trim();
  if (p) theme.primaryColor = p;
  if (a) theme.accentColor = a;
  if (r) theme.radius = Number(r);
  form.value.themeJson = JSON.stringify(theme, null, 2);
}

/** JSON 串 → 表单（打开弹层时调用；冲突时以表单为准） */
function fillThemeForm(theme: Record<string, any> | null) {
  const t = theme ?? {};
  paletteScheme.value = (t.palette?.scheme as string) ?? '';
  themeTokens.value = {
    primaryColor: (t.primaryColor as string) ?? '',
    accentColor: (t.accentColor as string) ?? '',
    radius: t.radius !== undefined ? String(t.radius) : '',
  };
}

function fillPagesForm(pages: Record<string, any> | null) {
  pagesObj.value = pages && typeof pages === 'object' ? JSON.parse(JSON.stringify(pages)) : {};
}

function setPageLayout(key: string) {
  pagesObj.value.product = pagesObj.value.product ?? {};
  pagesObj.value.product.layout = key;
  syncPagesJson();
}

function togglePageBlock(key: string, on: boolean) {
  pagesObj.value.product = pagesObj.value.product ?? {};
  pagesObj.value.product.blocks = pagesObj.value.product.blocks ?? {};
  pagesObj.value.product.blocks[key] = { ...(pagesObj.value.product.blocks[key] ?? {}), show: on };
  syncPagesJson();
}

function syncPagesJson() {
  form.value.pagesJson = JSON.stringify(pagesObj.value, null, 2);
}

const app = ref<'nshop' | 'vshop'>('nshop');
const onlyEnabled = ref(false);
const list = ref<ShopTemplate[]>([]);
const showForm = ref(false);
const editingId = ref('');
const saving = ref(false);
const err = ref('');

// 弹层 Tab 与引用/版本/合并预览状态
const tab = ref<'form' | 'versions' | 'preview'>('form');
const refMap = ref<Record<string, TemplateReference[]>>({});
const versions = ref<TemplateVersion[]>([]);
const versionsLoaded = ref(false);
const versionsLoading = ref(false);
const versionsErr = ref('');
const verPreview = ref<{ title: string; text: string } | null>(null);
const mApp = ref<'nshop' | 'vshop'>('nshop');
const mScenario = ref<'none' | 'custom'>('none');
const overridesJson = ref('');
const previewLoading = ref(false);
const previewErr = ref('');
const merged = ref<any>(null);
const sourceByKey = ref<Record<string, string>>({});

const mergedText = computed(() => {
  if (merged.value === null || merged.value === undefined) return '';
  return JSON.stringify(merged.value, null, 2);
});

const filteredList = computed(() => (onlyEnabled.value ? list.value.filter((t) => t.enabled) : list.value));

const form = ref({
  name: '',
  app: 'nshop' as 'nshop' | 'vshop',
  enabled: true,
  themeJson: '',
  pagesJson: '',
});

function appLabel(a: string): string {
  return a === 'vshop' ? 'youshop 商城' : 'nshop 商城';
}

function fmtTime(s: string): string {
  if (!s) return '';
  return s.replace('T', ' ').slice(0, 16);
}

function previewText(t: ShopTemplate): string {
  const c = t.theme?.primaryColor;
  return c ? c : '';
}

function switchApp(a: 'nshop' | 'vshop') {
  app.value = a;
  load();
}

onLoad(async () => {
  await loadPalettes();
  await load();
});
async function load() {
  try {
    list.value = await templateApi.list(app.value);
    await loadRefs();
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformTemplates.loadFailed')), icon: 'none' });
  }
}

/** 并行加载各模板引用店铺数（单个失败不影响列表） */
async function loadRefs() {
  const settled = await Promise.allSettled(list.value.map((t) => templateApi.references(t.id)));
  const m: Record<string, TemplateReference[]> = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') m[list.value[i].id] = r.value;
  });
  refMap.value = m;
}

function refCount(t: ShopTemplate): number {
  return refMap.value[t.id]?.length ?? 0;
}

function refShopsText(t: ShopTemplate): string {
  return (refMap.value[t.id] ?? []).map((r) => r.channelName).join('、');
}

function fillForm(t: ShopTemplate) {
  form.value = {
    name: t.name,
    app: t.app,
    enabled: t.enabled,
    themeJson: t.theme ? JSON.stringify(t.theme, null, 2) : '',
    pagesJson: t.pages ? JSON.stringify(t.pages, null, 2) : '',
  };
}

function resetMeta() {
  tab.value = 'form';
  versions.value = [];
  versionsLoaded.value = false;
  versionsErr.value = '';
  verPreview.value = null;
  mScenario.value = 'none';
  overridesJson.value = '';
  previewErr.value = '';
  merged.value = null;
  sourceByKey.value = {};
}

function onAdd() {
  editingId.value = '';
  err.value = '';
  form.value = {
    name: '',
    app: app.value,
    enabled: true,
    themeJson: '{\n  "primaryColor": "#ff6600",\n  "accentColor": "#fff3e6",\n  "radius": 8\n}',
    pagesJson: '{\n  "product": { "layout": "classic", "blocks": {} },\n  "home": { "sections": [] }\n}',
  };
  fillThemeForm(JSON.parse(form.value.themeJson));
  fillPagesForm(JSON.parse(form.value.pagesJson));
  resetMeta();
  mApp.value = app.value;
  showForm.value = true;
}

function onEdit(t: ShopTemplate) {
  editingId.value = t.id;
  err.value = '';
  fillForm(t);
  fillThemeForm(t.theme);
  fillPagesForm(t.pages);
  resetMeta();
  mApp.value = t.app;
  showForm.value = true;
}

function onTab(t: 'form' | 'versions' | 'preview') {
  tab.value = t;
  if (t === 'versions' && editingId.value && !versionsLoaded.value) loadVersions();
}

async function loadVersions() {
  if (!editingId.value) return;
  versionsLoading.value = true;
  versionsErr.value = '';
  try {
    versions.value = await templateApi.versions(editingId.value);
    versionsLoaded.value = true;
  } catch (e: any) {
    versionsErr.value = graphQlErrorMsg(e, locale.t('platformTemplates.versionsFailed'));
  } finally {
    versionsLoading.value = false;
  }
}

function showVerPreview(v: TemplateVersion) {
  verPreview.value = {
    title: locale.t('platformTemplates.verTitle').replace('{version}', String(v.version)),
    text: JSON.stringify({ theme: v.theme, pages: v.pages }, null, 2),
  };
}

function onRestore(v: TemplateVersion) {
  if (!editingId.value) return;
  uni.showModal({
    title: locale.t('platformTemplates.restoreTitle'),
    content: locale.t('platformTemplates.restoreContent')
      .replace('{version}', String(v.version))
      .replace('{time}', fmtTime(v.createdAt)),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        const tpl = await templateApi.restore(editingId.value, v.version);
        uni.showToast({ title: locale.t('platformTemplates.restored').replace('{version}', String(v.version)), icon: 'none' });
        versionsLoaded.value = false;
        await loadVersions();
        fillForm(tpl);
        await load();
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformTemplates.restoreFailed')), icon: 'none' });
      }
    },
  });
}

function srcLabel(src: string): string {
  if (src === 'L1') return locale.t('platformTemplates.srcL1');
  if (src === 'L2') return locale.t('platformTemplates.srcL2');
  if (src === 'L3') return locale.t('platformTemplates.srcL3');
  return src || '?';
}

async function genPreview() {
  previewErr.value = '';
  let overrides: any | undefined;
  if (mScenario.value === 'custom') {
    const text = overridesJson.value.trim();
    if (text) {
      try {
        overrides = JSON.parse(text);
      } catch {
        previewErr.value = locale.t('platformTemplates.invalidOverrides');
        return;
      }
    } else {
      overrides = undefined;
    }
  }
  previewLoading.value = true;
  try {
    const r = await templateApi.mergedPreview(mApp.value, editingId.value || undefined, overrides);
    merged.value = r.merged;
    sourceByKey.value = r.sourceByKey ?? {};
  } catch (e: any) {
    previewErr.value = graphQlErrorMsg(e, locale.t('platformTemplates.previewFailed'));
  } finally {
    previewLoading.value = false;
  }
}

function tryParseJson(text: string, label: string): { ok: true; value: any } | { ok: false } {
  const v = text.trim();
  if (!v) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(v);
    if (parsed === null || typeof parsed !== 'object') {
      err.value = locale.t('platformTemplates.jsonObjInvalid').replace('{label}', label);
      return { ok: false };
    }
    return { ok: true, value: parsed };
  } catch {
    err.value = locale.t('platformTemplates.jsonInvalid').replace('{label}', label);
    return { ok: false };
  }
}

async function submit() {
  err.value = '';
  const name = form.value.name.trim();
  if (!name) { uni.showToast({ title: locale.t('platformTemplates.requireName'), icon: 'none' }); return; }
  const theme = tryParseJson(form.value.themeJson, 'theme');
  if (!theme.ok) return;
  const pages = tryParseJson(form.value.pagesJson, 'pages');
  if (!pages.ok) return;

  syncThemeJson();
  syncPagesJson();

  saving.value = true;
  try {
    if (editingId.value) {
      await templateApi.update(editingId.value, { name, theme: theme.value, pages: pages.value, enabled: form.value.enabled });
    } else {
      await templateApi.create({ name, app: form.value.app, theme: theme.value, pages: pages.value, enabled: form.value.enabled });
    }
    showForm.value = false;
    uni.showToast({ title: locale.t('platformTemplates.saved'), icon: 'none' });
    load();
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformTemplates.saveFailed')), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

function onToggle(t: ShopTemplate, e: any) {
  const enabled = e.detail.value as boolean;
  const action = enabled ? locale.t('platformTemplates.enableAction') : locale.t('platformTemplates.disableAction');
  let content = locale.t('platformTemplates.toggleContent').replace('{action}', action).replace('{name}', t.name);
  if (!enabled && refCount(t) > 0) {
    content = locale.t('platformTemplates.disableRefContent')
      .replace('{name}', t.name)
      .replace('{count}', String(refCount(t)))
      .replace('{shops}', refShopsText(t));
  }
  uni.showModal({
    title: enabled ? locale.t('platformTemplates.enableTplTitle') : locale.t('platformTemplates.disableTplTitle'),
    content,
    success: async (r) => {
      if (!r.confirm) return load();
      try {
        await templateApi.update(t.id, { enabled });
        t.enabled = enabled;
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformTemplates.opFailed')), icon: 'none' });
        load();
      }
    },
  });
}

function onCopy(t: ShopTemplate) {
  uni.showModal({
    title: locale.t('platformTemplates.copyTitle'),
    content: locale.t('platformTemplates.copyContent').replace('{name}', t.name),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await templateApi.copy(t.id);
        uni.showToast({ title: locale.t('platformTemplates.copied'), icon: 'none' });
        load();
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformTemplates.copyFailed')), icon: 'none' });
      }
    },
  });
}

function onRemove(t: ShopTemplate) {
  let content = locale.t('platformTemplates.delContent').replace('{name}', t.name);
  if (refCount(t) > 0) {
    content = locale.t('platformTemplates.delRefContent')
      .replace('{name}', t.name)
      .replace('{count}', String(refCount(t)))
      .replace('{shops}', refShopsText(t));
  }
  uni.showModal({
    title: locale.t('platformTemplates.delTitle'),
    content,
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await templateApi.remove(t.id);
        uni.showToast({ title: locale.t('platformTemplates.deleted'), icon: 'none' });
        load();
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformTemplates.delFailed')), icon: 'none' });
      }
    },
  });
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.head-ops { display: flex; align-items: center; gap: 16rpx; }
.head-btn { flex: 0 0 auto; padding: 8rpx 26rpx; background: $pm-info; color: #fff; border-radius: 999rpx; font-size: 26rpx; }
.chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 12rpx; }
.chip { flex: 0 0 auto; padding: 6rpx 22rpx; border: 1px solid #eee; border-radius: 999rpx; font-size: 24rpx; color: #666; background: #fafafa; }
.chip.on { background: #4f8cff; border-color: #4f8cff; color: #fff; }
.chip.off { opacity: .5; }
.tip { display: block; font-size: 22rpx; color: #999; margin-top: 8rpx; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.info { flex: 1; min-width: 0; }
.name { display: block; font-size: 28rpx; font-weight: 600; }
.code { font-size: 22rpx; color: #999; font-weight: 400; margin-left: 8rpx; }
.sub { display: block; font-size: 22rpx; color: #999; margin-top: 6rpx; }
.preview { display: inline-block; font-size: 22rpx; color: #4f8cff; margin-top: 6rpx; }
.ref { display: inline-block; margin: 6rpx 0 0 12rpx; padding: 2rpx 16rpx; border-radius: 999rpx; background: #fff7e6; color: #fa8c16; font-size: 22rpx; }
.link { color: #e64340; font-size: 26rpx; }
.link.copy { color: #4f8cff; }
.tabs { display: flex; gap: 8rpx; margin-bottom: 8rpx; border-bottom: 1px solid #f2f2f2; }
.tab { padding: 12rpx 20rpx; font-size: 26rpx; color: #666; border-bottom: 4rpx solid transparent; margin-bottom: -1px; }
.tab.on { color: #4f8cff; font-weight: 600; border-color: #4f8cff; }
.tabpane { padding-bottom: 8rpx; }
.vitem { padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.blk { display: flex; align-items: center; justify-content: space-between; padding: 16rpx 0; border-bottom: 1px solid #f2f2f2; }
.blk-name { font-size: 26rpx; color: #333; }
.vhead { display: flex; align-items: baseline; gap: 12rpx; }
.vname { font-size: 28rpx; font-weight: 600; color: #4f8cff; }
.vsub { font-size: 22rpx; color: #999; }
.vnote { display: block; font-size: 24rpx; color: #666; margin: 8rpx 0; }
.vops { display: flex; gap: 28rpx; }
.vlink { font-size: 26rpx; color: #4f8cff; }
.vlink.danger { color: #e64340; }
.json-scroll { height: 520rpx; background: #f7f7f9; border-radius: 12rpx; padding: 16rpx 20rpx; }
.json-scroll.tall { height: 380rpx; }
.json { font-size: 22rpx; color: #333; font-family: monospace; word-break: break-all; white-space: pre-wrap; }
.mp { margin-top: 24rpx; border: 1px solid #eef; border-radius: 16rpx; padding: 20rpx; background: #fafbff; }
.mp-title { display: block; font-size: 24rpx; font-weight: 600; color: #333; margin: 16rpx 0 8rpx; }
.mp-title:first-child { margin-top: 0; }
.sk { display: flex; align-items: center; gap: 12rpx; padding: 8rpx 0; border-bottom: 1px dashed #eef; font-size: 24rpx; }
.skk { flex: 1; min-width: 0; word-break: break-all; color: #333; }
.sbadge { flex: 0 0 auto; padding: 2rpx 16rpx; border-radius: 999rpx; font-size: 22rpx; }
.sL1 { background: #e8f1ff; color: #2f6fe0; }
.sL2 { background: #e8f9ee; color: #2fa35c; }
.sL3 { background: #fff3e0; color: #fa8c16; }
.pop.small { width: 600rpx; }
.empty { text-align: center; color: #bbb; padding: 40rpx 0; font-size: 26rpx; }
.count { text-align: center; color: #999; font-size: 24rpx; padding: 20rpx 0 4rpx; }
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 640rpx; max-height: 82vh; background: #fff; border-radius: 20rpx; padding: 32rpx; display: flex; flex-direction: column; }
.pop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
.pop-title { font-size: 32rpx; font-weight: 700; }
.pop-close { font-size: 36rpx; color: #999; line-height: 1; padding: 8rpx; }
.pop-body { max-height: 64vh; }
.field { margin-bottom: 24rpx; }
.req { color: #e64340; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.input { box-sizing: border-box; width: 100%; border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 28rpx; }
.ta { box-sizing: border-box; width: 100%; border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 24rpx; height: 180rpx; }
.ta.tall { height: 260rpx; }
.guide { margin-bottom: 24rpx; padding: 20rpx; border: 1px dashed #d9e4ff; border-radius: 16rpx; background: #f7faff; }
.gl { font-size: 24rpx; color: #666; margin-bottom: 12rpx; }
.gl:last-child { margin-bottom: 0; }
.glk { color: #4f8cff; font-weight: 600; }
.err { color: #e64340; font-size: 24rpx; margin-bottom: 16rpx; }
.btn { border-radius: 40rpx; font-size: 28rpx; background: #4f8cff; color: #fff; line-height: 2.4; }
.btn[disabled] { opacity: .6; }
</style>