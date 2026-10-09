<template>
  <view class="page">
    <view class="card">
      <!-- 编辑态：仅开放 Update 输入内的字段；status 由后端状态机维护，可手动纠偏 -->
      <view class="field" v-if="id">
        <text class="label">{{ $t('groupBuyEdit.statusLabel') }}</text>
        <picker :range="statusLabels" @change="onStatusChange">
          <view class="ipt vpicker">
            <text>{{ statusLabel(form.status) }}</text>
            <text class="caret">▾</text>
          </view>
        </picker>
      </view>

      <view class="field">
        <text class="label">{{ $t('groupBuyEdit.nameLabel') }}</text>
        <input class="ipt" v-model="form.name" :placeholder="$t('groupBuyEdit.phName')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('groupBuyEdit.descLabel') }}</text>
        <textarea class="area" v-model="form.description" :placeholder="$t('groupBuyEdit.phDesc')"></textarea>
      </view>

      <view class="pair">
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.targetLabel') }}</text>
          <input class="ipt" v-model="form.targetCount" type="number" :placeholder="$t('groupBuyEdit.phTarget')" />
        </view>
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.maxLabel') }} <text class="opt">{{ $t('groupBuyEdit.maxOpt') }}</text></text>
          <input class="ipt" v-model="form.maxCount" type="number" :placeholder="$t('groupBuyEdit.phMax')" />
        </view>
      </view>

      <view class="pair">
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.startAtLabel') }}</text>
          <picker mode="date" :value="form.startAt || ''" @change="form.startAt = $event.detail.value">
            <view class="ipt vpicker"><text>{{ form.startAt || $t('groupBuyEdit.chooseDate') }}</text><text class="caret">▾</text></view>
          </picker>
        </view>
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.endAtLabel') }}</text>
          <picker mode="date" :value="form.endAt || ''" @change="form.endAt = $event.detail.value">
            <view class="ipt vpicker"><text>{{ form.endAt || $t('groupBuyEdit.chooseDate') }}</text><text class="caret">▾</text></view>
          </picker>
        </view>
      </view>
      <text class="dtime-tip">{{ $t('groupBuyEdit.dateTip') }}</text>

      <view class="field">
        <text class="label">{{ $t('groupBuyEdit.priceLabel') }}</text>
        <input class="ipt" v-model="form.priceYuan" type="digit" :placeholder="$t('groupBuyEdit.phPrice')" />
        <text class="tip">{{ $t('groupBuyEdit.priceTip') }}</text>
      </view>
      <view class="field">
        <text class="label">{{ $t('groupBuyEdit.leaderDiscountLabel') }} <text class="opt">{{ $t('groupBuyEdit.zeroNone') }}</text></text>
        <input class="ipt" v-model="form.leaderDiscountYuan" type="digit" :placeholder="$t('groupBuyEdit.phLeaderDiscount')" />
        <text class="tip">{{ $t('groupBuyEdit.leaderDiscountTip') }}</text>
      </view>

      <!-- 创建期字段：仅新建时可设置 -->
      <template v-if="!id">
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.rewardLabel') }}</text>
          <picker :range="rewardLabels" @change="onRewardChange">
            <view class="ipt vpicker">
              <text>{{ rewardLabel(form.leaderRewardType) }}</text>
              <text class="caret">▾</text>
            </view>
          </picker>
        </view>
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.autoConfirmLabel') }}</text>
          <switch :checked="form.autoConfirm" @change="form.autoConfirm = $event.detail.value" color="#2f6bff" />
        </view>
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.allowJoinLabel') }}</text>
          <switch :checked="form.allowJoinAfterComplete" @change="form.allowJoinAfterComplete = $event.detail.value" color="#2f6bff" />
        </view>
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.productIdLabel') }}</text>
          <input class="ipt" v-model="form.productId" :placeholder="$t('groupBuyEdit.phProductId')" />
        </view>
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.variantIdLabel') }}</text>
          <input class="ipt" v-model="form.variantId" :placeholder="$t('groupBuyEdit.phVariantId')" />
          <text class="tip">{{ $t('groupBuyEdit.variantIdTip') }}</text>
        </view>
      </template>

      <!-- 编辑态：创建期字段只读展示（后端 Update 输入不含这些字段） -->
      <template v-if="id">
        <text class="locked-hd">{{ $t('groupBuyEdit.lockedSection') }}</text>
        <text class="locked-tip">{{ $t('groupBuyEdit.lockedTip') }}</text>
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.productIdLabel') }}</text>
          <view class="ipt readonly">{{ detail?.productId || '-' }}</view>
        </view>
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.variantIdLabel') }}</text>
          <view class="ipt readonly">{{ detail?.variantId || '-' }}</view>
        </view>
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.rewardLabel') }}</text>
          <view class="ipt readonly">{{ rewardLabel(detail?.leaderRewardType || 'discount') }}</view>
        </view>
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.autoConfirmLabel') }}</text>
          <view class="ipt readonly">{{ detail?.autoConfirm ? $t('groupBuyEdit.on') : $t('groupBuyEdit.off') }}</view>
        </view>
        <view class="field">
          <text class="label">{{ $t('groupBuyEdit.allowJoinLabel') }}</text>
          <view class="ipt readonly">{{ detail?.allowJoinAfterComplete ? $t('groupBuyEdit.on') : $t('groupBuyEdit.off') }}</view>
        </view>
      </template>
    </view>

    <view class="ops">
      <button class="btn ghost" @tap="goBack">{{ $t('groupBuyEdit.back') }}</button>
      <button class="btn main" @tap="onSave">{{ $t('groupBuyEdit.save') }}</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchGroupBuyActivity, createGroupBuyActivity, updateGroupBuyActivity,
  GroupBuyActivity, GroupBuyStatus, GroupBuyLeaderRewardType,
} from '../../../apis/groupBuy';
import { useLocaleStore } from '../../../stores/localeStore';
import { backToHome } from '../../../utils/h5Nav';

const locale = useLocaleStore();

const id = ref<string | null>(null);
const detail = ref<GroupBuyActivity | null>(null);

const STATUS_KEY: Record<GroupBuyStatus, string> = {
  active: 'groupBuyEdit.statusActive',
  completed: 'groupBuyEdit.statusCompleted',
  expired: 'groupBuyEdit.statusExpired',
};
const statusLabel = (s?: GroupBuyStatus) => (s ? locale.t(STATUS_KEY[s] || s) : '-');
const statusKeys: GroupBuyStatus[] = ['active', 'completed', 'expired'];
const statusLabels = statusKeys.map((k) => locale.t(STATUS_KEY[k]));

const REWARD_KEY: Record<GroupBuyLeaderRewardType, string> = {
  discount: 'groupBuyEdit.rewardDiscount',
  cashback: 'groupBuyEdit.rewardCashback',
  free: 'groupBuyEdit.rewardFree',
};
const rewardLabel = (t: string) => locale.t(REWARD_KEY[t as GroupBuyLeaderRewardType] || t);
const rewardKeys: GroupBuyLeaderRewardType[] = ['discount', 'cashback', 'free'];
const rewardLabels = rewardKeys.map((k) => locale.t(REWARD_KEY[k]));

const form = ref({
  status: 'active' as GroupBuyStatus,
  name: '',
  description: '',
  targetCount: '',
  maxCount: '',
  startAt: '',
  endAt: '',
  priceYuan: '',
  leaderDiscountYuan: '',
  leaderRewardType: 'discount' as GroupBuyLeaderRewardType,
  autoConfirm: true,
  allowJoinAfterComplete: false,
  productId: '',
  variantId: '',
});

function onStatusChange(e: any) { form.value.status = statusKeys[e.detail.value]; }
function onRewardChange(e: any) { form.value.leaderRewardType = rewardKeys[e.detail.value]; }

function toInt(s: string): number { return Math.max(0, Math.round(Number(s) || 0)); }

/** 日期选择器取当天整段（与优惠券编辑页同口径）：开始日 0 点起、结束日 23:59:59 止 */
function buildInput(): Record<string, unknown> {
  const f = form.value;
  const model: Record<string, unknown> = {
    name: f.name.trim(),
    description: f.description.trim(),
    targetCount: toInt(f.targetCount),
    groupPrice: Math.max(1, Math.round((Number(f.priceYuan) || 0) * 100)),
    leaderDiscount: Math.max(0, Math.round((Number(f.leaderDiscountYuan) || 0) * 100)),
  };
  const max = f.maxCount.trim();
  if (max && Number(max) > 0) model.maxCount = toInt(max);
  if (f.startAt) model.startAt = `${f.startAt}T00:00:00.000Z`;
  if (f.endAt) model.endAt = `${f.endAt}T23:59:59.999Z`;
  if (id.value) {
    model.status = f.status;
  } else {
    model.leaderRewardType = f.leaderRewardType;
    model.autoConfirm = f.autoConfirm;
    model.allowJoinAfterComplete = f.allowJoinAfterComplete;
    model.productId = f.productId.trim();
    model.variantId = f.variantId.trim();
  }
  return model;
}

async function onSave() {
  const f = form.value;
  if (!f.name.trim()) { uni.showToast({ title: locale.t('groupBuyEdit.requireName'), icon: 'none' }); return; }
  if (!f.description.trim()) { uni.showToast({ title: locale.t('groupBuyEdit.requireDesc'), icon: 'none' }); return; }
  if (toInt(f.targetCount) < 2) { uni.showToast({ title: locale.t('groupBuyEdit.invalidTarget'), icon: 'none' }); return; }
  if (!f.startAt || !f.endAt) { uni.showToast({ title: locale.t('groupBuyEdit.requireDate'), icon: 'none' }); return; }
  if (f.startAt > f.endAt) { uni.showToast({ title: locale.t('groupBuyEdit.invalidDateRange'), icon: 'none' }); return; }
  if (!(Number(f.priceYuan) > 0)) { uni.showToast({ title: locale.t('groupBuyEdit.requirePrice'), icon: 'none' }); return; }
  if (!id.value) {
    if (!f.productId.trim()) { uni.showToast({ title: locale.t('groupBuyEdit.requireProduct'), icon: 'none' }); return; }
    if (!f.variantId.trim()) { uni.showToast({ title: locale.t('groupBuyEdit.requireVariant'), icon: 'none' }); return; }
  }
  try {
    if (id.value) {
      await updateGroupBuyActivity({ id: id.value, ...buildInput() } as any);
    } else {
      await createGroupBuyActivity(buildInput() as any);
    }
    uni.showToast({ title: locale.t('groupBuyEdit.saved') });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('groupBuyEdit.saveFailed'), icon: 'none' });
  }
}

async function loadAll() {
  if (!id.value) return;
  try {
    const c = await fetchGroupBuyActivity(id.value);
    if (!c) return;
    detail.value = c;
    form.value = {
      status: c.status,
      name: c.name || '',
      description: c.description || '',
      targetCount: String(c.targetCount ?? 2),
      maxCount: c.maxCount && c.maxCount > 0 ? String(c.maxCount) : '',
      startAt: c.startAt ? c.startAt.slice(0, 10) : '',
      endAt: c.endAt ? c.endAt.slice(0, 10) : '',
      priceYuan: c.groupPrice != null ? String(c.groupPrice / 100) : '',
      leaderDiscountYuan: String((c.leaderDiscount || 0) / 100),
      leaderRewardType: c.leaderRewardType || 'discount',
      autoConfirm: !!c.autoConfirm,
      allowJoinAfterComplete: !!c.allowJoinAfterComplete,
      productId: c.productId || '',
      variantId: c.variantId || '',
    };
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('groupBuyEdit.loadFailed'), icon: 'none' });
  }
}

onLoad((query: any) => {
  if (query?.id) id.value = query?.id as string;
});
onMounted(loadAll);

function goBack() { backToHome(); }
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .field { margin-bottom: 20rpx;
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx;
        .opt { font-size: 22rpx; color: #aaa; font-weight: 400; } }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; box-sizing: border-box; width: 100%;
        &.readonly { color: $wa-muted; } }
      .vpicker { display: flex; align-items: center; justify-content: space-between; }
      .caret { color: $wa-muted; font-size: 24rpx; }
      .tip { display: block; margin-top: 8rpx; font-size: 22rpx; color: $wa-muted; }
      .area { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; width: 100%; height: 120rpx; box-sizing: border-box; } }
    .pair { display: flex; gap: 12rpx;
      .field { flex: 1; margin-bottom: 0; } }
    .dtime-tip { display: block; margin: 6rpx 0 20rpx; font-size: 22rpx; color: $wa-muted; }
    .locked-hd { display: block; font-size: 24rpx; color: $wa-ink; font-weight: 600; padding: 8rpx 0 4rpx; border-top: 1rpx dashed $wa-rule; margin-top: 8rpx; }
    .locked-tip { display: block; font-size: 22rpx; color: $wa-muted; padding-bottom: 16rpx; } }
  .ops { display: flex; position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx; background: #fff; box-shadow: 0 -2rpx 12rpx rgba(0,0,0,.04);
    .btn { flex: 1; margin: 0 8rpx; font-size: 28rpx; border-radius: $wa-radius; line-height: 80rpx; }
    .main { background: $wa-accent; color: #fff; }
    .ghost { background: $wa-bg; color: $wa-muted; } }
}
</style>
