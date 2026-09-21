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
      <view class="cell">
        <text class="lbl">{{ $t('platformGlobalConfig.primaryColor') }}</text>
        <input v-model="tokens.primaryColor" placeholder="#ff6600" />
      </view>
      <view class="cell">
        <text class="lbl">{{ $t('platformGlobalConfig.accentColor') }}</text>
        <input v-model="tokens.accentColor" placeholder="#fff3e6" />
      </view>
      <view class="cell">
        <text class="lbl">{{ $t('platformGlobalConfig.radius') }}</text>
        <input v-model="tokens.radius" placeholder="8" type="number" />
      </view>

      <view class="img-title">{{ $t('platformGlobalConfig.defaultsTitle') }}</view>
      <view class="img-title">{{ $t('platformGlobalConfig.pageSection') }}</view>
      <view class="chips">
        <text
          v-for="p in PAGE_OPTS"
          :key="p.key"
          class="chip"
          :class="{ on: curPage === p.key }"
          @tap="curPage = p.key"
        >{{ p.label }}</text>
      </view>
      <view v-if="curPage === 'product'" class="field">
        <text class="label">{{ $t('platformGlobalConfig.layoutLabel') }}</text>
        <view class="chips">
          <text
            v-for="l in LAYOUT_OPTS"
            :key="l.key"
            class="chip"
            :class="{ on: defLayout === l.key }"
            @tap="setLayout(l.key)"
          >{{ l.label }}</text>
        </view>
      </view>
      <view class="field">
        <text class="label">{{ $t('platformGlobalConfig.blocksLabel') }}</text>
        <view class="blk" v-for="b in BLOCK_OPTS" :key="b.key">
          <text class="blk-name">{{ b.label }}</text>
          <switch :checked="isBlockOn(b.key)" color="#4f8cff" @change="toggleBlock(b.key, ($event as any).detail.value)" />
        </view>
      </view>
      <view class="field">
        <text class="label" @tap="jsonOpen = !jsonOpen">
          {{ jsonOpen ? $t('platformGlobalConfig.jsonCollapse') : $t('platformGlobalConfig.jsonExpand') }}
        </text>
        <textarea v-if="jsonOpen" class="ta tall" v-model="defaultsJson" @blur="syncFromJson" />
      </view>
      <view v-if="err" class="err">{{ err }}</view>
      <button class="btn" :disabled="saving" @tap="save">{{ saving ? $t('platformGlobalConfig.saving') : $t('platformGlobalConfig.save') }}</button>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { templateApi } from '../../../apis/template';
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

/** 与详情装修页块清单保持一致（ProductDetailRenderer 的块 key） */
const BLOCK_OPTS = [
  { key: 'gallery', label: '主图' },
  { key: 'price', label: '价格' },
  { key: 'promo', label: '促销' },
  { key: 'service', label: '服务' },
  { key: 'params', label: '参数' },
  { key: 'reviews', label: '评价' },
  { key: 'description', label: '详情' },
] as const;

const curPage = ref<'product' | 'home' | 'category' | 'cart' | 'profile'>('product');
const jsonOpen = ref(false);
const defs = ref<Record<string, any>>({});

const defLayout = computed(() => defs.value.product?.layout ?? 'classic');

function isBlockOn(key: string): boolean {
  const b = defs.value.product?.blocks?.[key];
  return b?.show !== false;
}

function toggleBlock(key: string, on: boolean) {
  defs.value.product = defs.value.product ?? {};
  defs.value.product.blocks = defs.value.product.blocks ?? {};
  defs.value.product.blocks[key] = { ...(defs.value.product.blocks[key] ?? {}), show: on };
  syncToJson();
}

function setLayout(key: string) {
  defs.value.product = defs.value.product ?? {};
  defs.value.product.layout = key;
  syncToJson();
}

function syncToJson() {
  defaultsJson.value = JSON.stringify(defs.value, null, 2);
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

const app = ref<'nshop' | 'vshop'>('nshop');
const tokens = ref<Record<string, string>>({ primaryColor: '#ff6600', accentColor: '#fff3e6', radius: '8' });
const defaultsJson = ref('{}');
const err = ref('');
const saving = ref(false);

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
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformGlobalConfig.loadFailed')), icon: 'none' });
  }
}

async function save() {
  err.value = '';
  if (jsonOpen.value) {
    const text = defaultsJson.value.trim();
    if (text) {
      try {
        const v = JSON.parse(text);
        if (v === null || typeof v !== 'object') throw new Error('bad');
      } catch {
        err.value = locale.t('platformGlobalConfig.invalidDefaults');
        return;
      }
    }
  }
  const defaults = { ...defs.value };
  saving.value = true;
  try {
    await templateApi.updateGlobalConfig({
      app: app.value,
      themeTokens: {
        primaryColor: tokens.value.primaryColor.trim(),
        accentColor: tokens.value.accentColor.trim(),
        radius: Number(tokens.value.radius) || 8,
      },
      defaults,
    });
    uni.showToast({ title: locale.t('platformGlobalConfig.saved'), icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformGlobalConfig.saveFailed')), icon: 'none' });
  } finally {
    saving.value = false;
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
.cell { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2;
  .lbl { width: 240rpx; font-size: 26rpx; color: #333; flex-shrink: 0; }
  input { flex: 1; font-size: 28rpx; }
}
.ta { box-sizing: border-box; width: 100%; border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 24rpx; height: 180rpx; }
.ta.tall { height: 280rpx; margin-bottom: 16rpx; }
.blk { display: flex; align-items: center; justify-content: space-between; padding: 16rpx 0; border-bottom: 1px solid #f2f2f2; }
.blk-name { font-size: 26rpx; color: #333; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.field { margin-bottom: 24rpx; }
.err { color: #e64340; font-size: 24rpx; margin-bottom: 16rpx; }
.btn { border-radius: 40rpx; font-size: 28rpx; background: #4f8cff; color: #fff; line-height: 2.4; margin-top: 8rpx; }
.btn[disabled] { opacity: .6; }
</style>