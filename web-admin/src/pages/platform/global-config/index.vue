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
      <textarea
        class="ta tall"
        v-model="defaultsJson"
        placeholder='{ "product": { "layout": "classic", "blocks": {} }, "home": { "sections": [] } }'
      />
      <view v-if="err" class="err">{{ err }}</view>
      <button class="btn" :disabled="saving" @tap="save">{{ saving ? $t('platformGlobalConfig.saving') : $t('platformGlobalConfig.save') }}</button>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { templateApi } from '../../../apis/template';
import { graphQlErrorMsg } from '../../../apis/client';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const APP_OPTS = [
  { key: 'nshop', label: 'nshop 商城' },
  { key: 'vshop', label: 'vshop 商城' },
] as const;

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
    defaultsJson.value = cfg?.defaults ? JSON.stringify(cfg.defaults, null, 2) : '{}';
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformGlobalConfig.loadFailed')), icon: 'none' });
  }
}

async function save() {
  err.value = '';
  let defaults: Record<string, any> = {};
  const text = defaultsJson.value.trim();
  if (text) {
    try {
      const v = JSON.parse(text);
      if (v === null || typeof v !== 'object') throw new Error('bad');
      defaults = v;
    } catch {
      err.value = locale.t('platformGlobalConfig.invalidDefaults');
      return;
    }
  }
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
.err { color: #e64340; font-size: 24rpx; margin-bottom: 16rpx; }
.btn { border-radius: 40rpx; font-size: 28rpx; background: #4f8cff; color: #fff; line-height: 2.4; margin-top: 8rpx; }
.btn[disabled] { opacity: .6; }
</style>