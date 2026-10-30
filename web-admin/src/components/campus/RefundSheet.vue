<template>
  <view v-if="open" class="mask" @tap.self="close">
    <view class="sheet">
      <view class="sheet__hd">
        <text class="sheet__t">{{ $t('campusRefundSheet.title') }}</text>
        <text class="sheet__x" @tap="close">✕</text>
      </view>
      <text class="sheet__sub">{{ target?.code }} · {{ placeText }}</text>
      <view class="sheet__kpis">
        <text>{{ $t('campusRefundSheet.total') }} ¥{{ fenToYuanFixed(target?.total ?? 0) }}</text>
        <text>{{ $t('campusRefundSheet.done') }} ¥{{ fenToYuanFixed(target?.refundAmount ?? 0) }}</text>
        <text class="max">{{ $t('campusRefundSheet.refundable') }} ¥{{ fenToYuanFixed(target?.refundable ?? 0) }}</text>
      </view>
      <text class="sheet__hint">{{ $t('campusRefundSheet.hint') }}</text>
      <text class="sheet__label">{{ $t('campusRefundSheet.amountLabel') }}</text>
      <view class="amount-row">
        <input v-model="yuan" class="sheet__input" type="digit" :placeholder="$t('campusRefundSheet.amountPh')" />
        <text class="all-btn" @tap="fillFull">{{ $t('campusRefundSheet.all') }}</text>
      </view>
      <text class="sheet__label">{{ $t('campusRefundSheet.reasonLabel') }}</text>
      <textarea
        v-model="reason"
        class="sheet__area"
        :maxlength="200"
        :placeholder="$t('campusRefundSheet.reasonPh')"
      />
      <view class="sheet__ops">
        <button class="sheet__save" :disabled="busy" @tap="submit">{{ $t('campusRefundSheet.submit') }}</button>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { campusMerchantRefundOrder, type CampusMerchantRefundResult, type MerchantCompletedOrder } from '../../apis/campus';
import { fenToYuanFixed } from '../../utils/money';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';

/** 退款面板（§76 共用）：对账页与工作台同一份校验 + 同一 mutation，避免两套口径 */
const props = defineProps<{ open: boolean; target: MerchantCompletedOrder | null }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'done', result: CampusMerchantRefundResult): void;
}>();

const locale = useLocaleStore();
const yuan = ref('');
const reason = ref('');
const busy = ref(false);

const placeText = computed(() => {
  const t = props.target;
  if (!t) return '';
  const zone = t.zone ? `${t.zone} ` : '';
  return `${zone}${t.building || locale.t('campusRefundSheet.noBuilding')}`;
});

/** 每次打开都清空上次输入，避免误用旧金额/原因 */
watch(() => props.open, open => {
  if (open) {
    yuan.value = '';
    reason.value = '';
  }
});

function close(): void {
  if (busy.value) return;
  emit('close');
}

/** 全额退款：填入剩余可退金额（元） */
function fillFull(): void {
  yuan.value = fenToYuanFixed(props.target?.refundable ?? 0);
}

/** 提交：本地校验 → 二次确认 → 请求（金额转分，与后端口径一致） */
function submit(): void {
  const max = props.target?.refundable ?? 0;
  const fen = Math.round(Number(yuan.value || 0) * 100);
  if (!Number.isFinite(fen) || fen <= 0) {
    uni.showToast({ title: locale.t('campusRefundSheet.amountBad'), icon: 'none' });
    return;
  }
  if (fen > max) {
    uni.showToast({ title: locale.t('campusRefundSheet.amountOver'), icon: 'none' });
    return;
  }
  const trimmed = reason.value.trim();
  if (!trimmed) {
    uni.showToast({ title: locale.t('campusRefundSheet.reasonEmpty'), icon: 'none' });
    return;
  }
  uni.showModal({
    title: locale.t('campusRefundSheet.confirmTitle'),
    content: locale.t('campusRefundSheet.confirmBody').replace('{amount}', fenToYuanFixed(fen)),
    success: res => {
      if (res.confirm) void doRefund(fen, trimmed);
    },
  });
}

async function doRefund(fen: number, text: string): Promise<void> {
  const target = props.target;
  if (!target || busy.value) return;
  busy.value = true;
  try {
    const r = await campusMerchantRefundOrder(target.id, fen, text);
    emit('done', r);
    uni.showToast({
      title: locale.t('campusRefundSheet.ok').replace('{amount}', fenToYuanFixed(r.amount)),
      icon: 'none',
    });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusRefundSheet.fail')), icon: 'none' });
  } finally {
    busy.value = false;
  }
}
</script>

<style lang="scss" scoped>
.mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 300;
  display: flex; align-items: flex-end;
}
.sheet { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; padding: 28rpx 32rpx 40rpx;
  box-sizing: border-box;
  &__hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
  &__t { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
  &__x { font-size: 32rpx; color: $wa-muted; padding: 4rpx 8rpx; }
  &__sub { display: block; font-size: 26rpx; color: $wa-ink; margin-bottom: 12rpx; }
  &__kpis { display: flex; align-items: center; gap: 24rpx; font-size: 22rpx; color: $wa-muted;
    background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; margin-bottom: 16rpx;
    .max { color: #1a7f37; font-weight: 600; }
  }
  &__hint { display: block; font-size: 22rpx; color: $wa-muted; line-height: 1.5; margin-bottom: 16rpx; }
  &__label { display: block; font-size: 24rpx; color: $wa-ink; margin-bottom: 10rpx; }
  &__input { height: 72rpx; background: $wa-bg; border-radius: $wa-radius; padding: 0 20rpx;
    font-size: 28rpx; box-sizing: border-box; }
  &__area { width: 100%; height: 140rpx; background: $wa-bg; border-radius: $wa-radius;
    padding: 16rpx 20rpx; font-size: 26rpx; box-sizing: border-box; }
  &__ops { display: flex; align-items: center; gap: 20rpx; margin-top: 24rpx; }
  &__save { flex: 1; margin: 0; height: 76rpx; line-height: 76rpx; background: $wa-accent;
    color: #fff; font-size: 28rpx; border-radius: $wa-radius; border: none;
    &[disabled] { opacity: .6; }
  }
}
.amount-row { display: flex; align-items: center; gap: 12rpx; margin-bottom: 20rpx;
  .sheet__input { flex: 1; }
  .all-btn { flex: none; font-size: 24rpx; color: $wa-accent; background: $wa-bg;
    border-radius: 999rpx; padding: 12rpx 24rpx;
  }
}
</style>
