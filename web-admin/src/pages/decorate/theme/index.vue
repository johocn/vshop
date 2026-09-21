<template>
  <view class="page">
    <view class="tip">{{ $t('decorateTheme.tip') }}</view>

    <!-- 1. 目标端分段器 -->
    <view class="seg">
      <text :class="{ on: app === 'nshop' }" @tap="switchApp('nshop')">{{ $t('decorateTheme.appNshop') }}</text>
      <text :class="{ on: app === 'vshop' }" @tap="switchApp('vshop')">{{ $t('decorateTheme.appVshop') }}</text>
    </view>

    <!-- 2. 当前生效摘要卡 -->
    <view class="card summary">
      <view class="swatch-lg" :style="{ background: effectivePrimary || '#d4a574' }" />
      <view class="sum-info">
        <text class="sum-tpl">{{ templateName || $t('decorateTheme.noTemplate') }}</text>
        <text class="sum-sub">{{ $t('decorateTheme.effectivePrimary') }}: {{ effectivePrimary || '—' }}</text>
      </view>
      <text class="src-badge" :class="'s' + effectiveSource">{{ effectiveSource }}</text>
    </view>

    <!-- 3. 风格模板卡片网格 -->
    <view class="card">
      <view class="sec-title">{{ $t('decorateTheme.tplSection') }}</view>
      <view class="tpl-wrap">
        <view class="tpl" :class="{ added: !templateId }" @tap="templateId = ''">
          <text class="tpl-zh">{{ $t('decorateTheme.tplNone') }}</text>
          <text class="tpl-plus">{{ !templateId ? '✓' : '' }}</text>
        </view>
        <view
          class="tpl"
          :class="{ added: templateId === t.id }"
          v-for="t in enabledTemplates"
          :key="t.id"
          @tap="templateId = t.id"
        >
          <view class="tpl-sw" :style="{ background: t.primaryColor || '#ddd' }" />
          <view class="tpl-body">
            <text class="tpl-zh">{{ t.name }}</text>
            <text class="tpl-sub">{{ t.paletteName || $t('decorateTheme.custom') }} · v{{ t.version }}</text>
          </view>
          <text class="tpl-plus">{{ templateId === t.id ? '✓' : '' }}</text>
        </view>
      </view>
      <text v-if="!enabledTemplates.length" class="hint-inline">{{ $t('decorateTheme.tplEmpty') }}</text>
    </view>

    <!-- 4. 令牌覆盖（可选） -->
    <view class="card">
      <view class="sec-title">{{ $t('decorateTheme.tokenSection') }}</view>
      <view class="cell">
        <text class="lbl">{{ $t('decorateTheme.primaryColor') }}</text>
        <input v-model="ov.primaryColor" placeholder="#E1251B" @blur="validateTokens" />
      </view>
      <view class="cell">
        <text class="lbl">{{ $t('decorateTheme.accentColor') }}</text>
        <input v-model="ov.accentColor" placeholder="#FFF3E6" @blur="validateTokens" />
      </view>
      <view class="cell">
        <text class="lbl">{{ $t('decorateTheme.radius') }}</text>
        <input v-model="ov.radius" type="number" placeholder="8" @blur="validateTokens" />
      </view>
      <text class="hint-inline">{{ $t('decorateTheme.tokenHint') }}</text>
      <text v-if="tokenErr" class="err">{{ tokenErr }}</text>
    </view>

    <!-- 5. 旧版主题提示条 -->
    <view v-if="legacyThemeId" class="card legacy">
      <text class="legacy-title">{{ $t('decorateTheme.legacyTitle') }}</text>
      <text class="legacy-body">{{ $t('decorateTheme.legacyBody').replace('{id}', legacyThemeId) }}</text>
      <button class="legacy-btn" @tap="onMigrate">{{ $t('decorateTheme.legacyMigrate') }}</button>
    </view>

    <!-- 6. 合并结果预览 -->
    <view class="card">
      <view class="sec-title">{{ $t('decorateTheme.previewSection') }}</view>
      <view class="prev-row" v-for="k in previewKeys" :key="k">
        <text class="prev-k">{{ k }}</text>
        <text class="prev-v">{{ mergedTokens[k] ?? '—' }}</text>
        <text class="src-badge" :class="'s' + (previewSource[k] || 'L1')">{{ previewSource[k] || 'L1' }}</text>
      </view>
      <button class="btn ghost" :disabled="previewing" @tap="genPreview">{{ previewing ? $t('decorateTheme.previewing') : $t('decorateTheme.refreshPreview') }}</button>
    </view>

    <button class="save" :disabled="saving" @tap="save">{{ saving ? $t('decorateTheme.saving') : $t('decorateTheme.save') }}</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import { templateApi, type ShopTemplate } from '../../../apis/template';
import { graphQlErrorMsg } from '../../../apis/client';
import { isLegacyThemeId, buildThemeIdMigration } from '../../../constants/theme-migration';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const PREVIEW_KEYS = ['primaryColor', 'accentColor', 'radius'];

const app = ref<'nshop' | 'vshop'>('nshop');
const channelId = ref('');
const themeId = ref('');
const templateId = ref('');
const ov = ref<{ primaryColor: string; accentColor: string; radius: string }>({ primaryColor: '', accentColor: '', radius: '' });
const templates = ref<Array<ShopTemplate & { primaryColor?: string; paletteName?: string }>>([]);
const mergedTokens = ref<Record<string, any>>({});
const previewSource = ref<Record<string, string>>({});
const saving = ref(false);
const previewing = ref(false);
const tokenErr = ref('');

const legacyThemeId = computed(() => (isLegacyThemeId(themeId.value) ? themeId.value : ''));

/** 该端 enabled 且 app 匹配的模板（沿用「店铺覆盖页模板列表需过滤 app」规则） */
const enabledTemplates = computed(() => templates.value.filter((t) => t.enabled && t.app === app.value));

const templateName = computed(() => templates.value.find((t) => t.id === templateId.value)?.name ?? '');
const effectivePrimary = computed(() => mergedTokens.value.primaryColor ?? '');
const effectiveSource = computed(() => previewSource.value.primaryColor ?? 'L1');
const previewKeys = PREVIEW_KEYS;

onMounted(async () => {
  try {
    const ch = await fetchActiveChannel();
    channelId.value = ch.id;
    const cf = ch.customFields as any;
    themeId.value = cf.themeId || '';
    templateId.value = cf.templateId || '';
    const parsed = parseOverride(cf.themeTokensOverride);
    ov.value = {
      primaryColor: parsed?.primaryColor ?? '',
      accentColor: parsed?.accentColor ?? '',
      radius: parsed?.radius !== undefined ? String(parsed.radius) : '',
    };
    // 首次进页面即展开预览，避免「看合并结果」是假的
    await loadTemplates();
    await genPreview();
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('decorateTheme.loadFailed')), icon: 'none' });
  }
});

function parseOverride(raw: string | null | undefined): Record<string, any> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

async function loadTemplates() {
  const list = await templateApi.list(app.value);
  const presets = await templateApi.palettePresets();
  templates.value = list.map((t) => {
    const scheme = (t.theme as any)?.palette?.scheme as string | undefined;
    const def = scheme ? presets[scheme] : undefined;
    const explicit = (t.theme as any)?.primaryColor as string | undefined;
    return { ...t, primaryColor: explicit || def?.tokens?.primaryColor, paletteName: def?.name };
  });
}

function switchApp(a: 'nshop' | 'vshop') {
  app.value = a;
  templateId.value = '';
  mergedTokens.value = {};
  previewSource.value = {};
  loadTemplates().then(genPreview);
}

/** 空 = 不覆盖；只收三项合法值 */
function buildOverridePayload(): Record<string, any> {
  const out: Record<string, any> = {};
  const p = ov.value.primaryColor.trim();
  const a = ov.value.accentColor.trim();
  const r = ov.value.radius.trim();
  if (p) out.primaryColor = p;
  if (a) out.accentColor = a;
  if (r) out.radius = Number(r);
  return out;
}

function validateTokens(): boolean {
  tokenErr.value = '';
  const hex = /^#[0-9a-fA-F]{3,8}$/;
  if (ov.value.primaryColor.trim() && !hex.test(ov.value.primaryColor.trim())) {
    tokenErr.value = locale.t('decorateTheme.errPrimary');
    return false;
  }
  if (ov.value.accentColor.trim() && !hex.test(ov.value.accentColor.trim())) {
    tokenErr.value = locale.t('decorateTheme.errAccent');
    return false;
  }
  const r = Number(ov.value.radius);
  if (ov.value.radius.trim() && (Number.isNaN(r) || r < 0 || r > 64)) {
    tokenErr.value = locale.t('decorateTheme.errRadius');
    return false;
  }
  return true;
}

/** 合并结果预览：走真实后端合并链（含 L2 palette 展开） */
async function genPreview() {
  previewing.value = true;
  try {
    const r = await templateApi.mergedPreview(app.value, templateId.value || undefined, buildOverridePayload());
    mergedTokens.value = r.merged ?? {};
    previewSource.value = r.sourceByKey ?? {};
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('decorateTheme.previewFailed')), icon: 'none' });
  } finally {
    previewing.value = false;
  }
}

async function onMigrate() {
  const mig = buildThemeIdMigration(themeId.value);
  const lines = mig.themeTokensOverride
    ? Object.entries(mig.themeTokensOverride).map(([k, v]) => `${k}: ${v}`).join('\n')
    : locale.t('decorateTheme.legacyNoMap');
  uni.showModal({
    title: locale.t('decorateTheme.legacyModalTitle'),
    content: locale.t('decorateTheme.legacyModalBody').replace('{map}', lines),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await updateChannelCustomFields(channelId.value, {
          themeId: null,
          themeTokensOverride: mig.themeTokensOverride ? JSON.stringify(mig.themeTokensOverride) : null,
        });
        themeId.value = '';
        if (mig.themeTokensOverride) {
          ov.value = {
            primaryColor: mig.themeTokensOverride.primaryColor ?? '',
            accentColor: mig.themeTokensOverride.accentColor ?? '',
            radius: mig.themeTokensOverride.radius !== undefined ? String(mig.themeTokensOverride.radius) : '',
          };
        }
        uni.showToast({ title: locale.t('decorateTheme.legacyMigrated'), icon: 'success' });
        await genPreview();
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, locale.t('decorateTheme.saveFailed')), icon: 'none' });
      }
    },
  });
}

async function save() {
  if (saving.value) return;
  if (!validateTokens()) return;
  saving.value = true;
  const payload = buildOverridePayload();
  try {
    await updateChannelCustomFields(channelId.value, {
      templateId: templateId.value || null,
      themeTokensOverride: Object.keys(payload).length ? JSON.stringify(payload) : null,
    });
    uni.showToast({ title: locale.t('decorateTheme.saved'), icon: 'success' });
    await genPreview();
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('decorateTheme.saveFailed')), icon: 'none' });
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .tip { font-size: 24rpx; color: $wa-muted; margin-bottom: 24rpx; }
  .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx; margin-bottom: 24rpx;
    text { flex: 1; text-align: center; font-size: 26rpx; color: $wa-muted; padding: 12rpx 0; border-radius: 999rpx; }
    text.on { background: $wa-accent; color: #fff; }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx; }
  .sec-title { font-size: 28rpx; font-weight: 700; color: $wa-ink; margin-bottom: 16rpx; }
  .summary { display: flex; align-items: center; gap: 20rpx;
    .swatch-lg { width: 72rpx; height: 72rpx; border-radius: 16rpx; flex: 0 0 auto; }
    .sum-info { flex: 1; min-width: 0; }
    .sum-tpl { display: block; font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .sum-sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; }
  }
  .src-badge { flex: 0 0 auto; font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 999rpx; background: $wa-rule; color: $wa-muted; }
  .src-badge.sL1 { background: #e8f1ff; color: #2f6fe0; }
  .src-badge.sL2 { background: #e8f9ee; color: #2fa35c; }
  .src-badge.sL3 { background: #fff3e0; color: #fa8c16; }
  .src-badge.sL4 { background: #f2f2f5; color: #666; }
  .tpl-wrap { display: flex; flex-direction: column; gap: 16rpx; }
  .tpl { display: flex; align-items: center; gap: 16rpx; border: 2rpx solid $wa-rule; border-radius: 12rpx;
    padding: 20rpx 24rpx; background: $wa-card;
    &.added { border-color: $wa-accent; background: rgba(255, 102, 0, 0.06); }
    .tpl-sw { width: 40rpx; height: 40rpx; border-radius: 8rpx; flex: 0 0 auto; }
    .tpl-body { flex: 1; min-width: 0; }
    .tpl-zh { display: block; font-size: 28rpx; color: $wa-ink; }
    .tpl-sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; }
    .tpl-plus { color: $wa-accent; font-size: 30rpx; }
  }
  .cell { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $wa-rule;
    .lbl { width: 220rpx; font-size: 26rpx; color: $wa-ink; flex-shrink: 0; }
    input { flex: 1; font-size: 28rpx; }
    &:last-child { border-bottom: none; }
  }
  .hint-inline { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 12rpx; }
  .err { display: block; font-size: 22rpx; color: #e6162d; margin-top: 8rpx; }
  .legacy { border: 2rpx solid #ffb020; background: #fffbf0;
    .legacy-title { display: block; font-size: 26rpx; font-weight: 600; color: #b45309; }
    .legacy-body { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; line-height: 1.6; }
    .legacy-btn { margin-top: 16rpx; font-size: 26rpx; background: #ffb020; color: #fff; border-radius: 999rpx; line-height: 2.2; }
  }
  .prev-row { display: flex; align-items: center; gap: 12rpx; padding: 12rpx 0; border-bottom: 1rpx dashed $wa-rule;
    .prev-k { flex: 1; font-size: 24rpx; color: $wa-ink; }
    .prev-v { font-size: 24rpx; color: $wa-muted; }
  }
  .btn.ghost { margin-top: 16rpx; background: transparent; border: 2rpx solid $wa-accent; color: $wa-accent; font-size: 26rpx; border-radius: 999rpx; line-height: 2.2; }
  .save { margin-top: 32rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
