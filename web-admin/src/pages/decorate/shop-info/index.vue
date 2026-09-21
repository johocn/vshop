<template>
  <view class="page">
    <view class="card">
      <view class="cell">
        <text class="lbl">{{ $t('decorateShopInfo.shopName') }}</text>
        <input v-model="f.shopName" :placeholder="$t('decorateShopInfo.shopNamePlaceholder')" />
      </view>
      <view class="cell">
        <text class="lbl">{{ $t('decorateShopInfo.servicePhone') }}</text>
        <input v-model="f.servicePhone" :placeholder="$t('decorateShopInfo.servicePhonePlaceholder')" />
      </view>
      <view class="cell col">
        <text class="lbl">{{ $t('decorateShopInfo.shopIntro') }}</text>
        <textarea v-model="f.shopIntro" :placeholder="$t('decorateShopInfo.shopIntroPlaceholder')" />
      </view>
      <view class="cell col">
        <text class="lbl">{{ $t('decorateShopInfo.shopLogo') }}</text>
        <image v-if="logoPreview" class="logo-pv" :src="logoPreview" mode="aspectFill" @tap="previewLogo" />
        <MediaPicker :max="1" :value="logoIds" @change="onLogoChange" />
        <text class="hint-inline">{{ $t('decorateShopInfo.shopLogoHint') }}</text>
      </view>
      <view class="cell col">
        <text class="lbl">{{ $t('decorateShopInfo.shareImage') }}</text>
        <MediaPicker :max="1" :value="shareImageIds" @change="onShareImageChange" />
        <text class="hint-inline">{{ $t('decorateShopInfo.shareImageHint') }}</text>
      </view>
      <view class="cell row-in">
        <text class="lbl">{{ $t('decorateShopInfo.taxMode') }}</text>
        <view class="seg">
          <text :class="{ on: f.taxMode === 'inclusive' }" @tap="setTaxMode('inclusive')">{{ $t('decorateShopInfo.taxInclusive') }}</text>
          <text :class="{ on: f.taxMode === 'zero' }" @tap="setTaxMode('zero')">{{ $t('decorateShopInfo.taxZero') }}</text>
          <text :class="{ on: f.taxMode === 'exclusive' }" @tap="setTaxMode('exclusive')">{{ $t('decorateShopInfo.taxExclusive') }}</text>
        </view>
      </view>
      <view class="hint">{{ $t('decorateShopInfo.taxModeHint') }}</view>
      <view class="cell row-in">
        <text class="lbl">{{ $t('decorateShopInfo.inventoryMode') }}</text>
        <view class="seg">
          <text :class="{ on: f.inventoryMode === 'simple' }" @tap="setInventoryMode('simple')">{{ $t('decorateShopInfo.inventorySimple') }}</text>
          <text :class="{ on: f.inventoryMode === 'odoo' }" @tap="setInventoryMode('odoo')">{{ $t('decorateShopInfo.inventoryOdoo') }}</text>
        </view>
      </view>
      <block v-if="f.inventoryMode === 'odoo'">
        <view class="cell">
          <text class="lbl">{{ $t('decorateShopInfo.odooBaseUrl') }}</text>
          <input v-model="f.odooBaseUrl" :placeholder="$t('decorateShopInfo.odooBaseUrlPlaceholder')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('decorateShopInfo.apiKey') }}</text>
          <input v-model="f.odooApiKey" :placeholder="$t('decorateShopInfo.apiKeyPlaceholder')" />
        </view>
        <view class="hint">{{ $t('decorateShopInfo.odooHint') }}</view>
      </block>
      <view class="cell row-in">
        <text class="lbl">{{ $t('decorateShopInfo.priceStyle') }}</text>
        <view class="seg">
          <text :class="{ on: f.priceStyle === 'classic' }" @tap="setPriceStyle('classic')">{{ $t('decorateShopInfo.priceClassic') }}</text>
          <text :class="{ on: f.priceStyle === 'jdA' }" @tap="setPriceStyle('jdA')">{{ $t('decorateShopInfo.priceJdA') }}</text>
          <text :class="{ on: f.priceStyle === 'jdB' }" @tap="setPriceStyle('jdB')">{{ $t('decorateShopInfo.priceJdB') }}</text>
        </view>
      </view>
      <view class="hint">{{ $t('decorateShopInfo.priceStyleHint') }}</view>
      <view class="cell row-in">
        <text class="lbl">{{ $t('decorateShopInfo.layoutLabel') }}</text>
        <view class="seg">
          <text :class="{ on: f.layout === 'classic' }" @tap="setLayout('classic')">{{ $t('decorateProduct.layoutClassic') }}</text>
          <text :class="{ on: f.layout === 'floor' }" @tap="setLayout('floor')">{{ $t('decorateProduct.layoutFloor') }}</text>
          <text :class="{ on: f.layout === 'dualBuy' }" @tap="setLayout('dualBuy')">{{ $t('decorateProduct.layoutDualBuy') }}</text>
          <text :class="{ on: f.layout === 'hotel' }" @tap="setLayout('hotel')">{{ $t('decorateProduct.layoutHotel') }}</text>
        </view>
      </view>
      <view class="hint">{{ $t('decorateShopInfo.layoutHint') }}</view>
      <view class="hint link" @tap="goDetailDecorate">{{ $t('decorateShopInfo.moreBlocks') }}</view>
    </view>
    <view class="card">
      <view class="img-title">{{ $t('decorateShopInfo.promoSchemesTitle') }}</view>
      <view class="tpl-wrap">
        <view
          class="tpl"
          :class="{ added: hasScheme(promoSchemes, t.code) }"
          v-for="t in PROMO_TEMPLATES"
          :key="t.code"
          @tap="addPromoTemplate(t)"
        >
          <text class="tpl-zh">{{ t.zh }}</text>
          <text class="tpl-en">{{ t.en }}</text>
          <text class="tpl-plus">{{ hasScheme(promoSchemes, t.code) ? '✓' : '＋' }}</text>
        </view>
      </view>
      <view class="scheme-row" v-for="(s, i) in promoSchemes" :key="i">
        <input class="inp" v-model="s.code" :placeholder="$t('decorateShopInfo.codePlaceholderFreeShip')" />
        <input class="inp" v-model="s.zh" :placeholder="$t('decorateShopInfo.zhPlaceholder')" />
        <input class="inp" v-model="s.en" :placeholder="$t('decorateShopInfo.enPlaceholder')" />
        <button class="del" @tap="promoSchemes.splice(i, 1)">{{ $t('decorateShopInfo.del') }}</button>
      </view>
      <button class="add" @tap="promoSchemes.push({ code: '', zh: '', en: '' })">{{ $t('decorateShopInfo.addScheme') }}</button>
    </view>

    <view class="card">
      <view class="img-title">{{ $t('decorateShopInfo.serviceSchemesTitle') }}</view>
      <view class="tpl-wrap">
        <view
          class="tpl"
          :class="{ added: hasScheme(serviceSchemes, t.code) }"
          v-for="t in SERVICE_TEMPLATES"
          :key="t.code"
          @tap="addServiceTemplate(t)"
        >
          <text class="tpl-zh">{{ t.zh }}</text>
          <text class="tpl-en">{{ t.en }}</text>
          <text class="tpl-plus">{{ hasScheme(serviceSchemes, t.code) ? '✓' : '＋' }}</text>
        </view>
      </view>
      <view class="scheme-row" v-for="(s, i) in serviceSchemes" :key="i">
        <input class="inp" v-model="s.code" :placeholder="$t('decorateShopInfo.codePlaceholderGenuine')" />
        <input class="inp" v-model="s.zh" :placeholder="$t('decorateShopInfo.zhPlaceholder')" />
        <input class="inp" v-model="s.en" :placeholder="$t('decorateShopInfo.enPlaceholder')" />
        <button class="del" @tap="serviceSchemes.splice(i, 1)">{{ $t('decorateShopInfo.del') }}</button>
      </view>
      <button class="add" @tap="serviceSchemes.push({ code: '', zh: '', en: '' })">{{ $t('decorateShopInfo.addScheme') }}</button>
    </view>
    <button class="save" :disabled="saving" @tap="save">{{ saveText }}</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import { graphQlErrorMsg } from '../../../apis/client';
import { PROMO_TEMPLATES, SERVICE_TEMPLATES, upsertScheme, hasScheme } from '../../../constants/scheme-templates';
import { fetchAssets } from '../../../apis/asset';
import { useLocaleStore } from '../../../stores/localeStore';
import MediaPicker from '../../../components/MediaPicker.vue';

const locale = useLocaleStore();
const f = ref<{ shopName: string; shopLogo: string; shopIntro: string; servicePhone: string; taxMode: string; priceStyle: string; layout: string; inventoryMode: string; odooBaseUrl: string; odooApiKey: string }>({
  shopName: '', shopLogo: '', shopIntro: '', servicePhone: '', taxMode: 'inclusive', priceStyle: 'classic', layout: 'classic', inventoryMode: 'simple', odooBaseUrl: '', odooApiKey: '',
});
const shareImageIds = ref<string[]>([]);
const shareImageUrl = ref('');
const logoIds = ref<string[]>([]);
const logoPreview = ref('');

function onLogoChange(ids: string[]) {
  logoIds.value = ids;
  if (ids.length) {
    fetchAssets(1, 0, undefined, ids)
      .then((r) => { logoPreview.value = r.items[0]?.preview || ''; f.value.shopLogo = logoPreview.value; })
      .catch(() => {});
  } else {
    logoPreview.value = '';
    f.value.shopLogo = '';
  }
}

function previewLogo() {
  if (logoPreview.value) uni.previewImage({ urls: [logoPreview.value] });
}
function goDetailDecorate() {
  uni.navigateTo({ url: '/pages/decorate/product/index' });
}

function onShareImageChange(ids: string[]) {
  shareImageIds.value = ids;
  if (ids.length) {
    fetchAssets(1, 0, undefined, ids)
      .then((r) => { shareImageUrl.value = r.items[0]?.preview || ''; })
      .catch(() => {});
  } else {
    shareImageUrl.value = '';
  }
}
let channelId = '';
let rawDetailConfig = '';
const promoSchemes = ref<Array<{ code: string; zh: string; en: string }>>([]);
const serviceSchemes = ref<Array<{ code: string; zh: string; en: string }>>([]);
const saving = ref(false);
const saveText = ref(locale.t('decorateShopInfo.save'));

function loadSchemeList(raw: string | undefined): Array<{ code: string; zh: string; en: string }> {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((s: any) => ({
      code: s.code ?? '',
      zh: s.text?.zh_Hans ?? '',
      en: s.text?.en ?? '',
    }));
  } catch {
    return [];
  }
}
function toSchemePayload(list: Array<{ code: string; zh: string; en: string }>): string {
  return JSON.stringify(
    list
      .filter((s) => s.code.trim())
      .map((s) => ({ code: s.code.trim(), text: { zh_Hans: s.zh.trim(), en: s.en.trim() } })),
  );
}

function setTaxMode(s: string) {
  f.value.taxMode = s;
}

function setInventoryMode(s: string) {
  f.value.inventoryMode = s;
}

function setPriceStyle(s: string) {
  f.value.priceStyle = s;
}

function setLayout(s: string) {
  f.value.layout = s;
}

function addPromoTemplate(t: { code: string; zh: string; en: string }) {
  promoSchemes.value = upsertScheme(promoSchemes.value, t);
}
function addServiceTemplate(t: { code: string; zh: string; en: string }) {
  serviceSchemes.value = upsertScheme(serviceSchemes.value, t);
}

onMounted(async () => {
  const ch = await fetchActiveChannel();
  channelId = ch.id;
  const cf = ch.customFields as any;
  rawDetailConfig = cf.detailConfig ?? '';
  promoSchemes.value = loadSchemeList(cf.promoSchemes);
  serviceSchemes.value = loadSchemeList(cf.serviceSchemes);
  let style = 'classic';
  let layout = 'classic';
  if (rawDetailConfig) {
    try {
      const cfg = JSON.parse(rawDetailConfig);
      style = cfg?.blocks?.price?.style || 'classic';
      layout = cfg?.layout || 'classic';
    } catch { /* 坏 JSON 忽略，兜底 classic */ }
  }
  f.value = {
    shopName: cf.shopName ?? '',
    shopLogo: cf.shopLogo ?? '',
    shopIntro: cf.shopIntro ?? '',
    servicePhone: cf.servicePhone ?? '',
    taxMode: cf.taxMode || 'inclusive',
    priceStyle: style,
    layout,
    inventoryMode: cf.inventoryMode || 'simple',
    odooBaseUrl: cf.odooBaseUrl ?? '',
    odooApiKey: cf.odooApiKey ?? '',
  };
  shareImageUrl.value = cf.shareImageUrl ?? '';
  logoPreview.value = cf.shopLogo ?? '';
});

async function save() {
  if (saving.value) return;
  saving.value = true;
  saveText.value = locale.t('decorateShopInfo.saving');
  // 合并 price.style 与 layout 进 detailConfig，保留原 detailConfig 其余字段
  const payload = { ...f.value } as any;
  delete payload.priceStyle;
  delete payload.layout;
  const cfg = rawDetailConfig ? safeParse(rawDetailConfig) : { version: 2, layout: 'classic', blocks: {} };
  cfg.blocks = cfg.blocks || {};
  cfg.blocks.price = cfg.blocks.price || {};
  cfg.blocks.price.style = f.value.priceStyle;
  cfg.layout = f.value.layout;
  payload.detailConfig = JSON.stringify(cfg);
  payload.shareImageUrl = shareImageUrl.value || null;
  payload.promoSchemes = toSchemePayload(promoSchemes.value);
  payload.serviceSchemes = toSchemePayload(serviceSchemes.value);
  try {
    await updateChannelCustomFields(channelId, payload);
    uni.showToast({ title: locale.t('decorateShopInfo.saved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('decorateShopInfo.saveFailed')), icon: 'none' });
  } finally {
    saving.value = false;
    saveText.value = locale.t('decorateShopInfo.save');
  }
}

function safeParse(raw: string): any {
  try { return JSON.parse(raw); } catch { return { version: 2, layout: 'classic', blocks: {} }; }
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 32rpx; }
  .cell { display: flex; align-items: center; padding: 28rpx 0; border-bottom: 1rpx solid $wa-rule;
    .lbl { width: 180rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
    input { flex: 1; font-size: 28rpx; }
    &.col { flex-direction: column; align-items: flex-start;
      .lbl { width: auto; margin-bottom: 16rpx; }
      textarea { width: 100%; height: 160rpx; font-size: 28rpx; }
    }
    .logo-pv { width: 160rpx; height: 160rpx; border-radius: 16rpx; margin-bottom: 16rpx; background: $wa-bg; }
    &.row-in { justify-content: space-between; }
    &:last-child { border-bottom: none; }
    .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx;
      text { font-size: 24rpx; color: $wa-muted; padding: 8rpx 22rpx; border-radius: 999rpx; transition: background .2s, color .2s;
        &.on { background: $wa-accent; color: #fff; }
      }
    }
  }
  .hint { margin-top: 24rpx; font-size: 24rpx; color: $wa-muted; line-height: 1.6; padding: 0 8rpx; }
  .hint.link { color: $wa-accent; }
  .chips { display: flex; flex-wrap: wrap; gap: 12rpx; padding: 16rpx 0 0; }
  .chip { flex: 0 0 auto; padding: 6rpx 22rpx; border: 1px solid $wa-rule; border-radius: 999rpx; font-size: 24rpx; color: $wa-muted; background: $wa-card; }
  .chip.on { background: $wa-accent; border-color: $wa-accent; color: #fff; }
  .hint-inline { display: block; margin-top: 12rpx; font-size: 22rpx; color: $wa-muted; }
  .img-title { font-size: 28rpx; color: $wa-ink; padding: 24rpx 0 8rpx; }
  .scheme-row { display: flex; gap: 12rpx; padding: 12rpx 0; align-items: center;
    .inp { flex: 1; min-width: 0; background: $wa-bg; border-radius: 8rpx; padding: 12rpx; font-size: 26rpx; }
    .del { color: #e6162d; font-size: 26rpx; }
  }
  .tpl-wrap { display: flex; flex-wrap: wrap; gap: 16rpx; padding: 16rpx 0 8rpx; }
  .tpl {
    display: inline-flex; align-items: center; gap: 8rpx;
    border: 1rpx solid $wa-rule; border-radius: 999rpx;
    padding: 8rpx 22rpx; font-size: 26rpx; color: $wa-ink;
    background: $wa-card;
    .tpl-en { font-size: 22rpx; color: $wa-muted; }
    .tpl-plus { color: $wa-accent; font-size: 26rpx; }
    &.added { background: rgba(255, 102, 0, 0.08); color: $wa-ink; border-color: $wa-accent; border-style: solid; }
    &.added .tpl-plus { color: $wa-accent; }
  }
  .add { margin: 16rpx 0 24rpx; color: $wa-accent; font-size: 28rpx; }
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
