<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">风格模板库</text>
        <view class="head-ops">
          <text class="head-btn" @tap="onAdd">＋新建模板</text>
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
        <text class="chip" :class="{ on: onlyEnabled }" @tap="onlyEnabled = !onlyEnabled">仅看启用</text>
      </view>
      <view class="item" v-for="t in filteredList" :key="t.id" @tap="onEdit(t)">
        <view class="info">
          <text class="name">{{ t.name }} <text class="code">v{{ t.version }}</text></text>
          <text class="sub">{{ appLabel(t.app) }} · {{ t.enabled ? '启用' : '停用' }} · {{ fmtTime(t.updatedAt) }}</text>
          <text class="preview" v-if="previewText(t)">色 {{ previewText(t) }}</text>
          <text class="ref" v-if="refCount(t) > 0">引用 {{ refCount(t) }} 店</text>
        </view>
        <switch :checked="t.enabled" color="#4f8cff" @change="onToggle(t, $event)" @click.stop />
        <text class="link copy" @tap.stop="onCopy(t)">复制</text>
        <text class="link" @tap.stop="onRemove(t)">删除</text>
      </view>
      <view v-if="!filteredList.length" class="empty">{{ list.length ? '无启用中的模板' : '暂无模板，点击右上角新建' }}</view>
      <view v-if="filteredList.length" class="count">共 {{ filteredList.length }} 个模板</view>
    </view>
  </view>

  <!-- 新建/编辑弹层表单 -->
  <view class="mask" v-if="showForm" @tap="showForm = false">
    <view class="pop" @tap.stop>
      <view class="pop-head">
        <text class="pop-title">{{ editingId ? '编辑模板' : '新建模板' }}</text>
        <text class="pop-close" @tap="showForm = false">×</text>
      </view>
      <view class="tabs">
        <text class="tab" :class="{ on: tab === 'form' }" @tap="onTab('form')">配置</text>
        <text class="tab" :class="{ on: tab === 'versions' }" @tap="onTab('versions')">历史版本</text>
        <text class="tab" :class="{ on: tab === 'preview' }" @tap="onTab('preview')">合并预览</text>
      </view>
      <scroll-view scroll-y class="pop-body">
        <template v-if="tab === 'form'">
          <view class="field"><text class="label">名称 <text class="req">*</text></text><input class="input" v-model="form.name" placeholder="橙色经典" /></view>
          <view class="field">
            <text class="label">目标端 <text class="req">*</text></text>
            <view class="chips">
              <text v-for="a in APP_OPTS" :key="a.key" class="chip" :class="{ on: form.app === a.key, off: !!editingId }" @tap="editingId || (form.app = a.key)">{{ a.label }}</text>
            </view>
            <text v-if="editingId" class="tip">目标端创建后不可修改</text>
          </view>
          <view class="field">
            <text class="label">启用</text>
            <switch :checked="form.enabled" color="#4f8cff" @change="form.enabled = $event.detail.value" />
          </view>
          <view class="field"><text class="label">模板级主题 theme JSON</text><textarea class="ta" v-model="form.themeJson" placeholder='{"primaryColor":"#ff6600","accentColor":"#fff3e6","radius":8}' /></view>
          <view class="field"><text class="label">页面配置 pages JSON</text><textarea class="ta tall" v-model="form.pagesJson" placeholder='{"product":{"layout":"classic","blocks":{}},"home":{"sections":[]}}' /></view>
          <view class="guide">
            <view class="gl"><text class="glk">pages 键</text> · product / home / category / cart / profile</view>
            <view class="gl"><text class="glk">theme 键</text> · primaryColor / accentColor / radius</view>
          </view>
          <view v-if="err" class="err">{{ err }}</view>
          <button class="btn" :disabled="saving" @tap="submit">{{ saving ? '保存中…' : '保存' }}</button>
        </template>

        <!-- 历史版本 Tab -->
        <view v-else-if="tab === 'versions'" class="tabpane">
          <view v-if="!editingId" class="empty">新建中的模板暂无历史版本</view>
          <template v-else>
            <view v-if="versionsLoading" class="empty">加载中…</view>
            <view v-else-if="versionsErr" class="err">{{ versionsErr }}</view>
            <view v-else-if="!versions.length" class="empty">暂无历史版本，保存模板时自动生成快照</view>
            <view v-for="v in versions" :key="v.id" class="vitem">
              <view class="vhead">
                <text class="vname">v{{ v.version }}</text>
                <text class="vsub">{{ fmtTime(v.createdAt) }}</text>
              </view>
              <text class="vnote">{{ v.note || '（无备注）' }}</text>
              <view class="vops">
                <text class="vlink" @tap="showVerPreview(v)">预览 JSON</text>
                <text class="vlink danger" @tap="onRestore(v)">回滚</text>
              </view>
            </view>
          </template>
        </view>

        <!-- 合并预览 Tab -->
        <view v-else class="tabpane">
          <view class="field">
            <text class="label">预览端</text>
            <view class="chips">
              <text v-for="a in APP_OPTS" :key="a.key" class="chip" :class="{ on: mApp === a.key }" @tap="mApp = a.key">{{ a.label }}</text>
            </view>
          </view>
          <view class="field">
            <text class="label">覆盖场景</text>
            <view class="chips">
              <text class="chip" :class="{ on: mScenario === 'none' }" @tap="mScenario = 'none'">无覆盖（仅 L1+L2）</text>
              <text class="chip" :class="{ on: mScenario === 'custom' }" @tap="mScenario = 'custom'">输入覆盖 JSON（L3）</text>
            </view>
          </view>
          <view class="field" v-if="mScenario === 'custom'">
            <text class="label">店铺覆盖 overrides JSON</text>
            <textarea class="ta" v-model="overridesJson" placeholder='{"theme":{"primaryColor":"#123456"},"product":{"layout":"list"}}' />
          </view>
          <button class="btn" :disabled="previewLoading" @tap="genPreview">{{ previewLoading ? '预览中…' : '生成合并预览' }}</button>
          <view v-if="previewErr" class="err">{{ previewErr }}</view>
          <view v-if="merged !== null" class="mp">
            <text class="mp-title">merged（L1 全局 → L2 模板 → L3 店铺覆盖）</text>
            <scroll-view scroll-y class="json-scroll tall"><text class="json">{{ mergedText }}</text></scroll-view>
            <text class="mp-title">sourceByKey 键来源</text>
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

const APP_OPTS = [
  { key: 'nshop', label: 'nshop 商城' },
  { key: 'vshop', label: 'vshop 商城' },
] as const;

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
  return a === 'vshop' ? 'vshop 商城' : 'nshop 商城';
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

onLoad(load);
async function load() {
  try {
    list.value = await templateApi.list(app.value);
    await loadRefs();
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, '加载失败'), icon: 'none' });
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
  resetMeta();
  mApp.value = app.value;
  showForm.value = true;
}

function onEdit(t: ShopTemplate) {
  editingId.value = t.id;
  err.value = '';
  fillForm(t);
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
    versionsErr.value = graphQlErrorMsg(e, '版本获取失败');
  } finally {
    versionsLoading.value = false;
  }
}

function showVerPreview(v: TemplateVersion) {
  verPreview.value = {
    title: `v${v.version} 配置快照`,
    text: JSON.stringify({ theme: v.theme, pages: v.pages }, null, 2),
  };
}

function onRestore(v: TemplateVersion) {
  if (!editingId.value) return;
  uni.showModal({
    title: '回滚版本',
    content: `确定回滚到 v${v.version}（${fmtTime(v.createdAt)}）？当前配置将被覆盖，当前状态会先自动存档。`,
    success: async (r) => {
      if (!r.confirm) return;
      try {
        const tpl = await templateApi.restore(editingId.value, v.version);
        uni.showToast({ title: `已回滚到 v${v.version}`, icon: 'none' });
        versionsLoaded.value = false;
        await loadVersions();
        fillForm(tpl);
        await load();
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, '回滚失败'), icon: 'none' });
      }
    },
  });
}

function srcLabel(src: string): string {
  if (src === 'L1') return 'L1 全局配置';
  if (src === 'L2') return 'L2 模板';
  if (src === 'L3') return 'L3 店铺覆盖';
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
        previewErr.value = '覆盖 JSON 不是合法 JSON';
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
    previewErr.value = graphQlErrorMsg(e, '合并预览失败');
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
      err.value = `${label} 必须为 JSON 对象`;
      return { ok: false };
    }
    return { ok: true, value: parsed };
  } catch {
    err.value = `${label} 不是合法 JSON`;
    return { ok: false };
  }
}

async function submit() {
  err.value = '';
  const name = form.value.name.trim();
  if (!name) { uni.showToast({ title: '名称必填', icon: 'none' }); return; }
  const theme = tryParseJson(form.value.themeJson, 'theme');
  if (!theme.ok) return;
  const pages = tryParseJson(form.value.pagesJson, 'pages');
  if (!pages.ok) return;

  saving.value = true;
  try {
    if (editingId.value) {
      await templateApi.update(editingId.value, { name, theme: theme.value, pages: pages.value, enabled: form.value.enabled });
    } else {
      await templateApi.create({ name, app: form.value.app, theme: theme.value, pages: pages.value, enabled: form.value.enabled });
    }
    showForm.value = false;
    uni.showToast({ title: '已保存', icon: 'none' });
    load();
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, '保存失败'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

function onToggle(t: ShopTemplate, e: any) {
  const enabled = e.detail.value as boolean;
  let content = `确定${enabled ? '启用' : '停用'}「${t.name}」？停用后该端 C 端回退到全局默认。`;
  if (!enabled && refCount(t) > 0) {
    content = `「${t.name}」已被 ${refCount(t)} 家店铺引用：${refShopsText(t)}。停用后这些店铺将回退到全局默认，确定停用？`;
  }
  uni.showModal({
    title: enabled ? '启用模板' : '停用模板',
    content,
    success: async (r) => {
      if (!r.confirm) return load();
      try {
        await templateApi.update(t.id, { enabled });
        t.enabled = enabled;
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, '操作失败'), icon: 'none' });
        load();
      }
    },
  });
}

function onCopy(t: ShopTemplate) {
  uni.showModal({
    title: '复制模板',
    content: `复制「${t.name}」为新模板（版本 +1）？`,
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await templateApi.copy(t.id);
        uni.showToast({ title: '已复制', icon: 'none' });
        load();
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, '复制失败'), icon: 'none' });
      }
    },
  });
}

function onRemove(t: ShopTemplate) {
  let content = `确定删除「${t.name}」？已引用该模板的店铺将回退到全局默认。`;
  if (refCount(t) > 0) {
    content = `「${t.name}」已被 ${refCount(t)} 家店铺引用：${refShopsText(t)}。删除后这些店铺将回退到全局默认，确定删除？`;
  }
  uni.showModal({
    title: '删除模板',
    content,
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await templateApi.remove(t.id);
        uni.showToast({ title: '已删除', icon: 'none' });
        load();
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, '删除失败'), icon: 'none' });
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
