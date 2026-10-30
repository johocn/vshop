<template>
  <view class="as-detail" v-if="detail">
    <view class="section">
      <view class="hd">
        <text class="hd__state" :class="stateClass(detail.state)">{{ stateText(detail.state) }}</text>
        <text class="hd__amount">¥{{ (Number(detail.refundAmount || 0) / 100).toFixed(2) }}</text>
      </view>
      <text class="row">{{ t('afterSaleDetail.typeLabel') }}: {{ detail.type }}</text>
      <text class="row">{{ t('afterSaleDetail.reasonLabel') }}: {{ detail.reason }}</text>
      <text v-if="detail.description" class="row row--mute">{{ detail.description }}</text>
      <text v-if="detail.rejectReason" class="row row--bad">{{ t('afterSaleDetail.rejectReason') }}: {{ detail.rejectReason }}</text>
    </view>

    <view v-if="evidence.length" class="section">
      <text class="section__title">{{ t('afterSaleDetail.evidenceLbl') }}</text>
      <view class="grid">
        <image
          v-for="(url, i) in evidence"
          :key="url + i"
          class="grid__i"
          :src="url"
          mode="aspectFill"
          @tap="previewEvidence(url, i)"
        />
      </view>
      <text class="hint">{{ t('afterSaleDetail.evidenceTip') }}</text>
    </view>

    <view class="section">
      <text class="section__title">{{ t('afterSaleDetail.timelineLbl') }}</text>
      <view class="tl">
        <view v-for="(h, i) in timeline" :key="h.key" class="tl__i">
          <view class="tl__dot" :class="{ 'tl__dot--last': i === timeline.length - 1 }" />
          <view class="tl__bd">
            <text class="tl__t">{{ h.text }}</text>
            <text class="tl__time">{{ h.at }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="section">
      <text class="section__title">{{ t('afterSaleDetail.chatLbl') }}</text>
      <text v-if="!messages.length" class="hint">{{ t('afterSaleDetail.chatEmpty') }}</text>
      <view v-for="m in messages" :key="m.id" class="msg" :class="m.senderType === 'admin' ? 'msg--theirs' : 'msg--mine'">
        <text class="msg__who">{{ m.senderName || (m.senderType === 'admin' ? t('afterSaleDetail.merchant') : t('afterSaleDetail.me')) }}</text>
        <view class="msg__bubble">
          <text class="msg__text">{{ m.content }}</text>
          <view v-if="m.images && m.images.length" class="msg__imgs">
            <image
              v-for="(url, i) in m.images"
              :key="url + i"
              class="msg__img"
              :src="url"
              mode="aspectFill"
              @tap="previewEvidence(url, i, m.images)"
            />
          </view>
        </view>
      </view>
      <text v-if="detail.state === 'Closed'" class="hint">{{ t('afterSaleDetail.chatClosed') }}</text>
      <view v-else class="send">
        <input
          v-model="msgText"
          class="send__ipt"
          maxlength="200"
          :placeholder="t('afterSaleDetail.sendPh')"
          @confirm="sendMsg"
        />
        <button class="send__btn" :disabled="sending" @click="sendMsg">{{ sending ? t('afterSaleDetail.sending') : t('afterSaleDetail.send') }}</button>
      </view>
    </view>

    <view v-if="detail.state === 'Approved'" class="section">
      <text class="section__title">{{ t('afterSaleDetail.fillReturnShipping') }}</text>
      <input v-model="trackingNo" :placeholder="t('afterSaleDetail.trackingPh')" class="input" />
      <picker mode="selector" :range="carriers" @change="onCarrierChange">
        <view class="picker" :class="{ 'picker--ph': carrierIndex < 0 }">
          <text>{{ carrierIndex < 0 ? t('afterSale.carrierPlaceholder') : carriers[carrierIndex] }}</text>
          <text class="picker__arrow">></text>
        </view>
      </picker>
      <input v-if="isOtherCarrier" v-model="customCarrier" :placeholder="t('afterSaleDetail.carrierPh')" class="input" />
      <button @click="submitTracking" style="margin-top:20rpx;background:$brand-color;color:#fff;border:none;border-radius:$radius-md;">{{ t('common.submit') }}</button>
    </view>
    <view v-if="detail.state === 'Pending'" style="padding:20rpx;">
      <button @click="cancelReq" style="background:#fff;color:#999;border:1rpx solid #ddd;border-radius:$radius-md;">{{ t('afterSaleDetail.cancelApply') }}</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getGraphQLClient } from '../../api/client';
import { updateReturnTracking, cancelAfterSalesRequest, addAfterSalesMessage, listAfterSalesMessages } from '../../api/mutations/after-sale';
import { CARRIERS, OTHER_CARRIER } from '../carriers';
import { useUIStore } from '../../stores/ui';
const { t } = useI18n();
const ui = useUIStore();
const detail = ref<any>(null);
const messages = ref<any[]>([]);
const msgText = ref('');
const sending = ref(false);
const trackingNo = ref('');
const carriers = CARRIERS;
const carrierIndex = ref(-1);
const customCarrier = ref('');
const isOtherCarrier = computed(() => carrierIndex.value >= 0 && carriers[carrierIndex.value] === OTHER_CARRIER);
let reqId = '';
/** 顾客上传的凭证图（插件字段可空） */
const evidence = computed<string[]>(() => (Array.isArray(detail.value?.evidenceImages) ? detail.value.evidenceImages : []));
function onCarrierChange(e: any) {
    const idx = Number(e?.detail?.value);
    carrierIndex.value = Number.isNaN(idx) ? -1 : idx;
}
/** 提交用的快递公司：选「其他」取自定义值，否则取所选项 */
const carrierValue = computed(() => {
    if (carrierIndex.value < 0) return '';
    return isOtherCarrier.value ? customCarrier.value.trim() : carriers[carrierIndex.value];
});
/** 状态名（未收录的状态直接回显枚举，不影响可读性） */
function stateText(state: string): string {
    const key = `afterSaleDetail.st${state}`;
    const text = t(key);
    return text === key ? state : text;
}
function stateClass(state: string): string {
    if (state === 'Pending' || state === 'Appealed') return 'wait';
    if (state === 'RefundFailed') return 'bad';
    if (state === 'Refunded' || state === 'Closed') return 'ok';
    return 'mute';
}
/** 时间线：首条为提交申请，其余按插件状态流转历史 */
const timeline = computed(() => {
    const rows = Array.isArray(detail.value?.history) ? detail.value.history : [];
    const head = detail.value ? [{ key: 'submit', text: t('afterSaleDetail.tlSubmit'), at: timeText(detail.value.createdAt) }] : [];
    return [
        ...head,
        ...rows.map((h: any, i: number) => ({
            key: `${h.toState}-${i}`,
            text: `${h.fromState ? stateText(h.fromState) + ' → ' : ''}${stateText(h.toState)}`,
            at: timeText(h.createdAt),
        })),
    ];
});
function timeText(raw?: string): string {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${String(d.getFullYear()).slice(2)}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function previewEvidence(url: string, index: number, urls?: string[]): void {
    const list = urls?.length ? urls : evidence.value;
    uni.previewImage({ urls: list.length ? list : [url], current: list[index] ?? url });
}
async function loadMessages(): Promise<void> {
    try {
        const res: any = await listAfterSalesMessages(reqId, 100);
        messages.value = res?.afterSalesMessages?.items ?? [];
    } catch {
        messages.value = [];
    }
}
onMounted(async () => {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    reqId = page?.options?.id || '';
    const client = getGraphQLClient();
    const res: any = await client.request(`query($id:ID!) { afterSalesRequest(id:$id) { id orderId state type reason description refundAmount evidenceImages rejectReason returnTrackingNo returnCarrier createdAt history { fromState toState createdAt } } }`, { id: reqId });
    detail.value = res.afterSalesRequest;
    await loadMessages();
});
/** 发送协商留言：售后单关闭后插件会拒绝，错误提示直接展示 */
async function sendMsg(): Promise<void> {
    const content = msgText.value.trim();
    if (!content || sending.value) {
        if (!content) ui.showToast(t('afterSaleDetail.sendRequired'), 'none');
        return;
    }
    sending.value = true;
    try {
        const res: any = await addAfterSalesMessage(reqId, content);
        if (res?.addAfterSalesMessage) messages.value.push(res.addAfterSalesMessage);
        msgText.value = '';
    } catch (e: any) {
        ui.showToast(t('afterSaleDetail.sendFailed'), 'none');
    } finally {
        sending.value = false;
    }
}
async function submitTracking() {
    await updateReturnTracking(reqId, trackingNo.value, carrierValue.value);
    ui.showToast(t('afterSaleDetail.submitted'), 'success');
}
async function cancelReq() {
    await cancelAfterSalesRequest(reqId);
    ui.showToast(t('afterSaleDetail.cancelled'), 'success');
    setTimeout(() => uni.navigateBack(), 1000);
}
</script>
<style lang="scss" scoped>
.as-detail { padding: 20rpx; }
.section { background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 16rpx; display: flex; flex-direction: column; gap: 8rpx;
  &__title { font-weight: bold; color: $brand-color; } }
.hd { display: flex; align-items: center; justify-content: space-between;
  &__state { font-size: 24rpx; border-radius: 999rpx; padding: 4rpx 16rpx; background: #f5f5f5; color: #999;
    &.wait { color: #fa8c16; background: #fff7e6; }
    &.bad { color: #d4380d; background: #fdecec; }
    &.ok { color: #237804; background: #f6ffed; } }
  &__amount { font-size: 32rpx; font-weight: bold; color: #d4380d; } }
.row { font-size: 26rpx; color: #333;
  &--mute { color: #999; }
  &--bad { color: #d4380d; } }
.hint { font-size: 22rpx; color: #999; }
.grid { display: flex; flex-wrap: wrap; gap: 12rpx;
  &__i { width: 150rpx; height: 150rpx; border-radius: 12rpx; background: #f5f5f5; } }
.tl { display: flex; flex-direction: column;
  &__i { display: flex; gap: 16rpx; padding-top: 12rpx; }
  &__dot { flex: none; width: 14rpx; height: 14rpx; margin-top: 8rpx; border-radius: 50%; background: #ddd;
    &--last { background: $brand-color; } }
  &__bd { flex: 1; display: flex; flex-direction: column; gap: 4rpx; }
  &__t { font-size: 24rpx; color: #333; }
  &__time { font-size: 20rpx; color: #999; } }
.msg { display: flex; flex-direction: column; gap: 6rpx; padding-top: 12rpx;
  &--mine { align-items: flex-end; }
  &--theirs { align-items: flex-start; }
  &__who { font-size: 20rpx; color: #999; }
  &__bubble { max-width: 84%; background: #f5f5f5; border-radius: 16rpx; padding: 14rpx 18rpx; display: flex; flex-direction: column; gap: 8rpx; }
  &--theirs &__bubble { background: #eaf3ff; }
  &__text { font-size: 24rpx; color: #333; line-height: 1.55; word-break: break-all; }
  &__imgs { display: flex; gap: 10rpx; }
  &__img { width: 110rpx; height: 110rpx; border-radius: 10rpx; } }
.send { display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx;
  &__ipt { flex: 1; height: 72rpx; background: #f5f5f5; border-radius: $radius-md; padding: 0 18rpx; font-size: 26rpx; box-sizing: border-box; }
  &__btn { flex: none; margin: 0; height: 66rpx; line-height: 66rpx; padding: 0 28rpx; background: $brand-color; color: #fff;
    font-size: 24rpx; border-radius: 999rpx; border: none;
    &[disabled] { opacity: .6; } } }
.input { height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; }
.picker { display: flex; justify-content: space-between; align-items: center; height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx;
  &--ph { color: #999; }
  &__arrow { color: #ccc; } }
</style>
