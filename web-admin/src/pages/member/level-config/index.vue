<template>
  <view class="page">
    <!-- ① 等级档位与专属折扣（saveTiers 全量 upsert） -->
    <view class="sec-hd">{{ $t('memberLevelConfig.tiersSection') }}</view>
    <view class="card">
      <text class="tip">{{ $t('memberLevelConfig.tiersTip') }}</text>
      <view class="tier" v-for="(t, i) in tiers" :key="i">
        <view class="tier-hd">
          <text class="tier-tag">{{ tierTag(t, i) }}</text>
          <text class="tier-discount">{{ discountText(t.specialDiscountRate) }}</text>
        </view>
        <view class="field">
          <text class="label">{{ $t('memberLevelConfig.tierName') }}</text>
          <input class="ipt" v-model="t.name" :placeholder="$t('memberLevelConfig.phTierName')" />
        </view>
        <view class="pair">
          <view class="field">
            <text class="label">{{ $t('memberLevelConfig.threshold') }}</text>
            <input class="ipt" v-model="t.threshold" type="number" :placeholder="$t('memberLevelConfig.phThreshold')" />
          </view>
          <view class="field">
            <text class="label">{{ $t('memberLevelConfig.specialDiscount') }}</text>
            <input class="ipt" v-model="t.specialDiscountRate" type="number" :placeholder="$t('memberLevelConfig.phSpecialDiscount')" />
          </view>
        </view>
      </view>
      <view class="add" @tap="addTier">＋ {{ $t('memberLevelConfig.addTier') }}</view>
      <button class="btn main" :disabled="savingTiers" @tap="onSaveTiers">{{ $t('memberLevelConfig.saveTiers') }}</button>
    </view>

    <!-- ② 升级配置（updateLevelConfig） -->
    <view class="sec-hd">{{ $t('memberLevelConfig.configSection') }}</view>
    <view class="card">
      <template v-for="f in cfgFields" :key="f.key">
        <view class="field">
          <text class="label">{{ $t('memberLevelConfig.f.' + f.key) }}</text>
          <switch v-if="f.type === 'switch'" :checked="!!cfg[f.key]" @change="cfg[f.key] = $event.detail.value" color="#2563eb" />
          <input v-else class="ipt" v-model="cfg[f.key]" :type="f.type" />
        </view>
      </template>
      <text class="tip">{{ $t('memberLevelConfig.configTip') }}</text>
      <button class="btn main" :disabled="savingCfg" @tap="onSaveConfig">{{ $t('memberLevelConfig.saveConfig') }}</button>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import {
  fetchMemberTiers, saveTiers, fetchLevelConfig, updateLevelConfig,
  specialDiscountText, MemberTierInput,
} from '../../../apis/memberLevel';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

/* ---------------- ① 等级档位 ---------------- */
// 输入框绑定字符串，保存时转数字；其余比率字段服务端回传原值随全量保存带回
interface TierRow {
  tierLevel: number;
  name: string;
  threshold: string;
  specialDiscountRate: string;
  pointsMultiplier: number;
  redeemDiscountRate: number;
  redeemCapRatio: number;
}
const tiers = ref<TierRow[]>([]);
const savingTiers = ref(false);

const tierTag = (t: TierRow, i: number) =>
  locale.t('memberLevelConfig.tierNo').replace('{n}', String(t.tierLevel || i + 1));
const discountText = (rate: string | number) => specialDiscountText(rate);

function addTier() {
  const maxLevel = tiers.value.reduce((m, t) => Math.max(m, t.tierLevel || 0), 0);
  tiers.value.push({
    tierLevel: maxLevel + 1,
    name: '',
    threshold: '',
    specialDiscountRate: '',
    pointsMultiplier: 1000,
    redeemDiscountRate: 1000,
    redeemCapRatio: 500,
  });
}

function buildTiersInput(): MemberTierInput[] | string {
  const sorted = [...tiers.value].sort((a, b) => a.tierLevel - b.tierLevel);
  for (const t of sorted) {
    if (!t.name.trim()) return locale.t('memberLevelConfig.requireTierName');
  }
  return sorted.map((t) => {
    const rate = Math.round(Number(t.specialDiscountRate) || 0);
    return {
      tierLevel: t.tierLevel,
      name: t.name.trim(),
      threshold: Math.max(0, Math.round(Number(t.threshold) || 0)),
      // 千分比钳制到 0-1000（50 = 95 折，0 = 无折扣）
      specialDiscountRate: Math.min(1000, Math.max(0, rate)),
      pointsMultiplier: t.pointsMultiplier ?? 1000,
      redeemDiscountRate: t.redeemDiscountRate ?? 1000,
      redeemCapRatio: t.redeemCapRatio ?? 500,
    };
  });
}

async function onSaveTiers() {
  const input = buildTiersInput();
  if (typeof input === 'string') {
    uni.showToast({ title: input, icon: 'none' });
    return;
  }
  savingTiers.value = true;
  try {
    await saveTiers(input);
    uni.showToast({ title: locale.t('memberLevelConfig.saved') });
    await loadTiers();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('memberLevelConfig.saveFailed'), icon: 'none' });
  } finally {
    savingTiers.value = false;
  }
}

/* ---------------- ② 升级配置 ---------------- */
const cfgFields: Array<{ key: string; type: 'number' | 'text' | 'digit' | 'switch' }> = [
  { key: 'level1Threshold', type: 'number' },
  { key: 'level1Name', type: 'text' },
  { key: 'level2Threshold', type: 'number' },
  { key: 'level2Name', type: 'text' },
  { key: 'level3Threshold', type: 'number' },
  { key: 'level3Name', type: 'text' },
  { key: 'level4Threshold', type: 'number' },
  { key: 'level4Name', type: 'text' },
  { key: 'level5Threshold', type: 'number' },
  { key: 'level5Name', type: 'text' },
  { key: 'pointsEarnRatio', type: 'digit' },
  { key: 'pointsEarnOnShipping', type: 'switch' },
];
const cfg = ref<Record<string, string | boolean>>({
  level1Threshold: '', level1Name: '',
  level2Threshold: '', level2Name: '',
  level3Threshold: '', level3Name: '',
  level4Threshold: '', level4Name: '',
  level5Threshold: '', level5Name: '',
  pointsEarnRatio: '', pointsEarnOnShipping: false,
});
const savingCfg = ref(false);

async function onSaveConfig() {
  savingCfg.value = true;
  try {
    const c = cfg.value;
    await updateLevelConfig({
      level1Threshold: toInt(c.level1Threshold), level1Name: String(c.level1Name || '').trim(),
      level2Threshold: toInt(c.level2Threshold), level2Name: String(c.level2Name || '').trim(),
      level3Threshold: toInt(c.level3Threshold), level3Name: String(c.level3Name || '').trim(),
      level4Threshold: toInt(c.level4Threshold), level4Name: String(c.level4Name || '').trim(),
      level5Threshold: toInt(c.level5Threshold), level5Name: String(c.level5Name || '').trim(),
      pointsEarnRatio: Number(c.pointsEarnRatio) || 0,
      pointsEarnOnShipping: !!c.pointsEarnOnShipping,
    });
    uni.showToast({ title: locale.t('memberLevelConfig.saved') });
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('memberLevelConfig.saveFailed'), icon: 'none' });
  } finally {
    savingCfg.value = false;
  }
}

function toInt(v: string | boolean): number {
  return Math.max(0, Math.round(Number(v) || 0));
}

/* ---------------- 加载 ---------------- */
async function loadTiers() {
  const list = await fetchMemberTiers();
  tiers.value = list.map((t) => ({
    tierLevel: t.tierLevel,
    name: t.name || '',
    threshold: String(t.threshold ?? 0),
    specialDiscountRate: String(t.specialDiscountRate ?? 0),
    pointsMultiplier: t.pointsMultiplier,
    redeemDiscountRate: t.redeemDiscountRate,
    redeemCapRatio: t.redeemCapRatio,
  }));
}

async function loadConfig() {
  const lc = await fetchLevelConfig();
  cfg.value = {
    level1Threshold: String(lc.level1Threshold ?? 0), level1Name: lc.level1Name || '',
    level2Threshold: String(lc.level2Threshold ?? 0), level2Name: lc.level2Name || '',
    level3Threshold: String(lc.level3Threshold ?? 0), level3Name: lc.level3Name || '',
    level4Threshold: String(lc.level4Threshold ?? 0), level4Name: lc.level4Name || '',
    level5Threshold: String(lc.level5Threshold ?? 0), level5Name: lc.level5Name || '',
    pointsEarnRatio: String(lc.pointsEarnRatio ?? 1), pointsEarnOnShipping: !!lc.pointsEarnOnShipping,
  };
}

onMounted(async () => {
  try {
    await Promise.all([loadTiers(), loadConfig()]);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('memberLevelConfig.loadFailed'), icon: 'none' });
  }
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .sec-hd { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; margin: 8rpx 0 16rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .tip { display: block; margin-bottom: 16rpx; font-size: 22rpx; color: $wa-muted; }
    .tier { padding: 16rpx 0 4rpx; border-top: 1rpx dashed $wa-rule; margin-top: 16rpx;
      &:first-of-type { border-top: none; margin-top: 0; }
      .tier-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx;
        .tier-tag { font-size: 26rpx; font-weight: 600; color: $wa-ink; }
        .tier-discount { font-size: 22rpx; color: $wa-accent; } }
    }
    .field { margin-bottom: 20rpx;
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx; }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; box-sizing: border-box; width: 100%; } }
    .pair { display: flex; gap: 12rpx;
      .field { flex: 1; } }
    .add { text-align: center; font-size: 26rpx; color: $wa-accent; border: 1rpx dashed $wa-accent; border-radius: $wa-radius; padding: 16rpx 0; margin-bottom: 20rpx; }
    .btn { margin-top: 8rpx; font-size: 28rpx; border-radius: $wa-radius; line-height: 80rpx; }
    .main { background: $wa-accent; color: #fff; }
  }
}
</style>
