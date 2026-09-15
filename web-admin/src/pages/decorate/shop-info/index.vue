<template>
  <view class="page">
    <view class="card">
      <view class="cell">
        <text class="lbl">店铺名</text>
        <input v-model="f.shopName" placeholder="请输入店铺名" />
      </view>
      <view class="cell">
        <text class="lbl">客服电话</text>
        <input v-model="f.servicePhone" placeholder="请输入客服电话" />
      </view>
      <view class="cell col">
        <text class="lbl">店铺简介</text>
        <textarea v-model="f.shopIntro" placeholder="请输入店铺简介" />
      </view>
      <view class="cell">
        <text class="lbl">店铺 Logo</text>
        <input v-model="f.shopLogo" placeholder="图片上传见 Task 7，先填 URL" />
      </view>
      <view class="cell col">
        <text class="lbl">默认分享图</text>
        <MediaPicker :max="1" :value="shareImageIds" @change="onShareImageChange" />
        <text class="hint-inline">商品无主图时，微信转发的图片兜底。选图后点保存生效。</text>
      </view>
      <view class="cell row-in">
        <text class="lbl">税率方式</text>
        <view class="seg">
          <text :class="{ on: f.taxMode === 'inclusive' }" @tap="setTaxMode('inclusive')">含税价</text>
          <text :class="{ on: f.taxMode === 'zero' }" @tap="setTaxMode('zero')">零税率</text>
          <text :class="{ on: f.taxMode === 'exclusive' }" @tap="setTaxMode('exclusive')">不含税价</text>
        </view>
      </view>
      <view class="hint">含税价：录入价即价内含税（结算拆税展示但应付总额=录入价）；零税率：录入价即免税最终价，结算不拆税；不含税价：录入价为净价（净价×1.13=含税应付价，价税分离）。</view>
      <view class="cell row-in">
        <text class="lbl">详情页价格块样式</text>
        <view class="seg">
          <text :class="{ on: f.priceStyle === 'classic' }" @tap="setPriceStyle('classic')">经典</text>
          <text :class="{ on: f.priceStyle === 'jdA' }" @tap="setPriceStyle('jdA')">京东A</text>
          <text :class="{ on: f.priceStyle === 'jdB' }" @tap="setPriceStyle('jdB')">京东B</text>
        </view>
      </view>
      <view class="hint">详情页价格块版式：经典（跟随主题主色）；京东A（横幅促销价：现价+划线价+降价+标签）；京东B（深色价签条：整条京东红价签+白字现价+划线价）。注：京东A/B 固定走京东红 #E1251B，不随主题色。</view>
      <view class="cell row-in">
        <text class="lbl">详情页版式</text>
        <view class="seg">
          <text :class="{ on: f.layout === 'classic' }" @tap="setLayout('classic')">经典</text>
          <text :class="{ on: f.layout === 'floor' }" @tap="setLayout('floor')">楼层</text>
          <text :class="{ on: f.layout === 'dualBuy' }" @tap="setLayout('dualBuy')">双买</text>
          <text :class="{ on: f.layout === 'hotel' }" @tap="setLayout('hotel')">酒店</text>
        </view>
      </view>
      <view class="hint">详情页版式：经典 / 楼层 / 双买 / 酒店（酒店版式需商品变体已配置 hotelRoomConfig，否则回退经典版式）。</view>
    </view>
    <view class="card">
      <view class="img-title">风格模板（模板库选择，未选时用全局默认）</view>
      <view class="tpl-wrap">
        <view class="tpl" :class="{ added: !templateId }" @tap="templateId = ''">
          <text class="tpl-zh">不使用模板</text>
          <text class="tpl-en">global default</text>
          <text class="tpl-plus">{{ !templateId ? '✓' : '' }}</text>
        </view>
        <view
          class="tpl"
          :class="{ added: templateId === t.id }"
          v-for="t in enabledTemplates"
          :key="t.id"
          @tap="templateId = t.id"
        >
          <text class="tpl-zh">{{ t.name }}</text>
          <text class="tpl-en">{{ appLabel(t.app) }} · v{{ t.version }}</text>
          <text class="tpl-plus">{{ templateId === t.id ? '✓' : '' }}</text>
        </view>
      </view>
      <text v-if="!enabledTemplates.length" class="hint-inline">暂无启用中的模板，可先到「平台 → 风格模板库」新建。</text>
    </view>
    <view class="card">
      <view class="img-title">促销方案库（频道默认；商品可覆盖）</view>
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
        <input class="inp" v-model="s.code" placeholder="code，如 freeShip99" />
        <input class="inp" v-model="s.zh" placeholder="中文文案" />
        <input class="inp" v-model="s.en" placeholder="English" />
        <button class="del" @tap="promoSchemes.splice(i, 1)">删</button>
      </view>
      <button class="add" @tap="promoSchemes.push({ code: '', zh: '', en: '' })">+ 添加方案</button>
    </view>

    <view class="card">
      <view class="img-title">服务保障库（频道默认；商品可覆盖）</view>
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
        <input class="inp" v-model="s.code" placeholder="code，如 genuine" />
        <input class="inp" v-model="s.zh" placeholder="中文文案" />
        <input class="inp" v-model="s.en" placeholder="English" />
        <button class="del" @tap="serviceSchemes.splice(i, 1)">删</button>
      </view>
      <button class="add" @tap="serviceSchemes.push({ code: '', zh: '', en: '' })">+ 添加方案</button>
    </view>
    <button class="save" :disabled="saving" @tap="save">{{ saveText }}</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import { graphQlErrorMsg } from '../../../apis/client';
import { templateApi, type ShopTemplate } from '../../../apis/template';
import { PROMO_TEMPLATES, SERVICE_TEMPLATES, upsertScheme, hasScheme } from '../../../constants/scheme-templates';
import { fetchAssets } from '../../../apis/asset';
import MediaPicker from '../../../components/MediaPicker.vue';

const f = ref<{ shopName: string; shopLogo: string; shopIntro: string; servicePhone: string; taxMode: string; priceStyle: string; layout: string }>({
  shopName: '', shopLogo: '', shopIntro: '', servicePhone: '', taxMode: 'inclusive', priceStyle: 'classic', layout: 'classic',
});
const shareImageIds = ref<string[]>([]);
const shareImageUrl = ref('');
const templateId = ref('');
const templateList = ref<ShopTemplate[]>([]);
const enabledTemplates = computed(() => templateList.value.filter((t) => t.enabled));

function appLabel(a: string): string {
  return a === 'vshop' ? 'vshop' : 'nshop';
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
const saveText = ref('保存');

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
  templateId.value = cf.templateId ?? '';
  promoSchemes.value = loadSchemeList(cf.promoSchemes);
  serviceSchemes.value = loadSchemeList(cf.serviceSchemes);
  templateApi.list().then((list) => { templateList.value = list; }).catch(() => {});
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
  };
  shareImageUrl.value = cf.shareImageUrl ?? '';
});

async function save() {
  if (saving.value) return;
  saving.value = true;
  saveText.value = '正在保存…';
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
  payload.templateId = templateId.value || null;
  payload.promoSchemes = toSchemePayload(promoSchemes.value);
  payload.serviceSchemes = toSchemePayload(serviceSchemes.value);
  try {
    await updateChannelCustomFields(channelId, payload);
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '保存失败'), icon: 'none' });
  } finally {
    saving.value = false;
    saveText.value = '保存';
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
    &.row-in { justify-content: space-between; }
    &:last-child { border-bottom: none; }
    .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx;
      text { font-size: 24rpx; color: $wa-muted; padding: 8rpx 22rpx; border-radius: 999rpx; transition: background .2s, color .2s;
        &.on { background: $wa-accent; color: #fff; }
      }
    }
  }
  .hint { margin-top: 24rpx; font-size: 24rpx; color: $wa-muted; line-height: 1.6; padding: 0 8rpx; }
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
