<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusMerchantAfterSales.loading') }}</view>
    <template v-else>
      <!-- 概览（§81）：待处理数不受分页/筛选影响，供商家一眼看清有多少单等处理 -->
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusMerchantAfterSales.title') }}</text>
          <view class="pill"><text>{{ pillText }}</text></view>
        </view>
        <!-- §84 状态筛选：退款失败置顶，超过一屏可横向滚动 -->
        <scroll-view scroll-x class="flt" :show-scrollbar="false">
          <view class="flt__row">
            <text
              v-for="f in filters"
              :key="f.key"
              class="flt__i"
              :class="{ on: stateFilter === f.key }"
              @tap="stateFilter = f.key"
            >
              {{ $t(f.label) }}
            </text>
          </view>
        </scroll-view>
        <text class="tip">{{ $t('campusMerchantAfterSales.tip') }}</text>
        <!-- 售后管理三入口（§100）：操作审计 / 值班排班 / 补偿挽留方案 -->
        <view class="ops-entry">
          <text class="oe-i" @tap="goOps('audit')">{{ $t('campusAfterSalesOps.entryAudit') }}</text>
          <text class="oe-i" @tap="goOps('duty')">{{ $t('campusAfterSalesOps.entryDuty') }}</text>
          <text class="oe-i" @tap="goOps('plan')">{{ $t('campusAfterSalesOps.entryPlan') }}</text>
        </view>
      </view>

      <view v-if="!filtered.length" class="hint empty">
        {{ $t('campusMerchantAfterSales.emptyFilter') }}
      </view>
      <view v-else class="list">
        <view v-for="r in filtered" :key="r.id" class="as" @tap="openDetail(r)">
          <view class="a-head">
            <text class="a-code">{{ r.orderCode }}</text>
            <text class="a-amount">¥{{ fenToYuanFixed(r.refundAmount) }}</text>
            <text class="a-state" :class="stateClass(r.state)">{{ stateText(r.state) }}</text>
          </view>
          <view class="a-sub">
            <text class="a-type">{{ typeText(r.type) }}</text>
            <text class="a-cust">{{ r.customerName || $t('campusMerchantAfterSales.anonCustomer') }}</text>
            <text class="a-time">{{ timeText(r.createdAt) }}</text>
          </view>
          <text class="a-reason">{{ r.reason }}</text>
          <text v-if="r.description" class="a-desc">{{ r.description }}</text>
          <view v-if="r.evidenceImages.length || r.messageCount" class="a-meta">
            <text v-if="r.evidenceImages.length" class="a-meta-i">
              {{ $t('campusMerchantAfterSales.evidence').replace('{n}', String(r.evidenceImages.length)) }}
            </text>
            <text v-if="r.messageCount" class="a-meta-i">
              {{ $t('campusMerchantAfterSales.msgCount').replace('{n}', String(r.messageCount)) }}
            </text>
          </view>
          <text v-if="r.rejectReason" class="a-reject">
            {{ $t('campusMerchantAfterSales.rejectReasonLbl') }}：{{ r.rejectReason }}
          </text>
          <text v-if="r.refundedAt" class="a-refunded">
            {{ $t('campusMerchantAfterSales.refundedTip').replace('{t}', timeText(r.refundedAt)) }}
          </text>
          <view v-if="r.state === 'Pending'" class="a-ops">
            <text class="op-reject" @tap.stop="openReject(r)">{{ $t('campusMerchantAfterSales.btnReject') }}</text>
            <button class="op-approve" :disabled="busyId === r.id" @tap.stop="approve(r)">
              {{ $t('campusMerchantAfterSales.btnApprove') }}
            </button>
          </view>
          <!-- §84 退款失败：置顶告警 + 一键重试（失败原因在详情面板） -->
          <view v-else-if="r.state === 'RefundFailed'" class="a-ops">
            <text class="op-fail">{{ $t('campusMerchantAfterSales.retryFailHint') }}</text>
            <button class="op-retry" :disabled="busyId === r.id" @tap.stop="retryRefund(r)">
              {{ $t('campusMerchantAfterSales.retryBtn') }}
            </button>
          </view>
          <text v-else class="a-detail">{{ $t('campusMerchantAfterSales.detailTapHint') }} ›</text>
        </view>
      </view>
    </template>

    <!-- §82 详情面板：凭证大图 / 状态时间线 / 协商对话 / 快捷回复 -->
    <view v-if="detailOpen" class="panel">
      <view class="panel__hd">
        <view class="panel__hd-l">
          <text class="panel__code">{{ detail?.request.orderCode || '' }}</text>
          <text class="panel__amount">¥{{ fenToYuanFixed(detail?.request.refundAmount ?? 0) }}</text>
        </view>
        <text class="panel__x" @tap="closeDetail">✕</text>
      </view>
      <scroll-view scroll-y class="panel__body" :show-scrollbar="false">
        <view v-if="detailLoading" class="hint">{{ $t('campusMerchantAfterSales.loading') }}</view>
        <template v-else-if="detail">
          <view class="p-block">
            <view class="p-row">
              <text class="p-state" :class="stateClass(detail.request.state)">{{ stateText(detail.request.state) }}</text>
              <text class="p-type">{{ typeText(detail.request.type) }}</text>
            </view>
            <text class="p-line">
              {{ detail.request.customerName || $t('campusMerchantAfterSales.anonCustomer') }}
              · {{ timeText(detail.request.createdAt) }}
            </text>
            <text class="p-line">{{ $t('campusMerchantAfterSales.reasonLbl') }}：{{ detail.request.reason }}</text>
            <text v-if="detail.request.description" class="p-line mute">{{ detail.request.description }}</text>
            <text v-if="detail.request.rejectReason" class="p-line bad">
              {{ $t('campusMerchantAfterSales.rejectReasonLbl') }}：{{ detail.request.rejectReason }}
            </text>
            <text v-if="detail.request.refundedAt" class="p-line ok">
              {{ $t('campusMerchantAfterSales.refundedTip').replace('{t}', timeText(detail.request.refundedAt)) }}
            </text>
            <text v-if="detail.refundError" class="p-line bad">
              {{ $t('campusMerchantAfterSales.stFailed') }}：{{ detail.refundError }}
            </text>
          </view>

          <view v-if="detail.request.evidenceImages.length" class="p-block">
            <text class="p-title">{{ $t('campusMerchantAfterSales.detailEvidence') }}</text>
            <view class="p-grid">
              <image
                v-for="(url, i) in detail.request.evidenceImages"
                :key="url + i"
                class="p-grid__i"
                :src="url"
                mode="aspectFill"
                @tap="previewEvidence(url, i)"
              />
            </view>
            <text class="p-hint">{{ $t('campusMerchantAfterSales.detailEvidenceTip') }}</text>
          </view>

          <view class="p-block">
            <text class="p-title">{{ $t('campusMerchantAfterSales.detailTimeline') }}</text>
            <view class="p-tl">
              <view v-for="(h, i) in timeline" :key="h.key" class="p-tl__i">
                <view class="p-tl__dot" :class="{ last: i === timeline.length - 1 }" />
                <view class="p-tl__bd">
                  <text class="p-tl__t">{{ h.text }}</text>
                  <text class="p-tl__time">{{ timeText(h.at) }}</text>
                </view>
              </view>
            </view>
          </view>

          <view class="p-block">
            <text class="p-title">
              {{ $t('campusMerchantAfterSales.detailChat') }}
              <text class="p-count">{{ detail.messages.length }}</text>
            </text>
            <text v-if="!detail.messages.length" class="p-hint">{{ $t('campusMerchantAfterSales.detailChatEmpty') }}</text>
            <view v-for="m in detail.messages" :key="m.id" class="msg" :class="m.senderType === 'admin' ? 'mine' : 'theirs'">
              <text class="msg__who">{{ m.senderName || (m.senderType === 'admin' ? $t('campusMerchantAfterSales.chatMerchant') : $t('campusMerchantAfterSales.anonCustomer')) }} · {{ timeText(m.createdAt) }}</text>
              <view class="msg__bubble">
                <text class="msg__text">{{ m.content }}</text>
                <view v-if="m.images.length" class="msg__imgs">
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
          </view>
        </template>
      </scroll-view>

      <view class="panel__ft">
        <template v-if="canReply">
          <input
            v-model="replyText"
            class="panel__ipt"
            maxlength="200"
            :placeholder="$t('campusMerchantAfterSales.detailSendPh')"
            @confirm="sendReply"
          />
          <button class="panel__send" :disabled="sending" @tap="sendReply">
            {{ sending ? $t('campusMerchantAfterSales.detailSending') : $t('campusMerchantAfterSales.detailSend') }}
          </button>
        </template>
        <text v-else class="panel__ro">{{ $t('campusMerchantAfterSales.detailReadonly') }}</text>
      </view>
    </view>

    <!-- 驳回：理由必填（顾客在 C 端可见，并可据此申诉） -->
    <view v-if="rejectTarget" class="mask" @tap.self="closeReject">
      <view class="sheet">
        <view class="sheet__hd">
          <text class="sheet__t">{{ $t('campusMerchantAfterSales.rejectTitle') }}</text>
          <text class="sheet__x" @tap="closeReject">✕</text>
        </view>
        <text class="sheet__sub">{{ rejectTarget.orderCode }} · ¥{{ fenToYuanFixed(rejectTarget.refundAmount) }}</text>
        <text class="sheet__hint">{{ $t('campusMerchantAfterSales.rejectHint') }}</text>
        <input
          v-model="rejectReason"
          class="sheet__input"
          maxlength="200"
          :placeholder="$t('campusMerchantAfterSales.rejectPh')"
        />
        <view class="sheet__ops">
          <text class="sheet__clear" @tap="closeReject">{{ $t('campusMerchantAfterSales.cancel') }}</text>
          <button class="sheet__save" :disabled="rejectBusy" @tap="submitReject">
            {{ $t('campusMerchantAfterSales.rejectSubmit') }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import {
  campusMerchantAfterSales,
  campusMerchantAfterSalesApprove,
  campusMerchantAfterSalesDetail,
  campusMerchantAfterSalesReject,
  campusMerchantAfterSalesReply,
  campusMerchantAfterSalesRetryRefund,
  type MerchantAfterSalesDetail,
  type MerchantAfterSalesList,
  type MerchantAfterSalesRow,
} from '../../apis/campus';
import { fenToYuanFixed } from '../../utils/money';
import { formatDateTime } from '../../utils/inventoryFormat';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const locale = useLocaleStore();
const loading = ref(true);
/** §84 状态筛选（服务端一次拉全量，前端按状态过滤；退款失败永久置顶） */
type StateFilter = 'all' | 'Pending' | 'Refunded' | 'Rejected' | 'RefundFailed';
const stateFilter = ref<StateFilter>('all');
const filters: Array<{ key: StateFilter; label: string }> = [
  { key: 'all', label: 'campusMerchantAfterSales.fltAll' },
  { key: 'Pending', label: 'campusMerchantAfterSales.fltPending' },
  { key: 'Refunded', label: 'campusMerchantAfterSales.fltRefunded' },
  { key: 'Rejected', label: 'campusMerchantAfterSales.fltRejected' },
  { key: 'RefundFailed', label: 'campusMerchantAfterSales.fltFailed' },
];
const data = ref<MerchantAfterSalesList | null>(null);
const busyId = ref('');
const rejectTarget = ref<MerchantAfterSalesRow | null>(null);
const rejectReason = ref('');
const rejectBusy = ref(false);
/** §82 详情面板：详情数据、输入框、发送态 */
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<MerchantAfterSalesDetail | null>(null);
const replyText = ref('');
const sending = ref(false);

/** 可回复：待处理 / 顾客申诉（已退款、已驳回、已关闭均只读） */
const canReply = computed(() => {
  const st = detail.value?.request.state ?? '';
  return st === 'Pending' || st === 'Appealed';
});

/** 状态时间线：首条为顾客提交，其余按插件状态流转历史 */
const timeline = computed(() => {
  const rows = detail.value?.stateHistory ?? [];
  const head = detail.value
    ? [{ key: 'submit', text: locale.t('campusMerchantAfterSales.tlSubmit'), at: detail.value.request.createdAt }]
    : [];
  return [
    ...head,
    ...rows.map((h, i) => ({
      key: `${h.toState}-${i}`,
      text: `${h.fromState ? stateText(h.fromState) + ' → ' : ''}${stateText(h.toState)}`,
      at: h.createdAt,
    })),
  ];
});

const items = computed(() => data.value?.items ?? []);
const filtered = computed(() => {
  const list = stateFilter.value === 'all'
    ? items.value
    : items.value.filter(r => r.state === stateFilter.value);
  // 退款失败单始终排最前，避免被已处理记录淹没
  return [...list].sort(
    (a, b) => Number(b.state === 'RefundFailed') - Number(a.state === 'RefundFailed'),
  );
});
const pillText = computed(() => {
  const pending = data.value?.pendingCount ?? 0;
  if (!pending) return locale.t('campusMerchantAfterSales.pillNone');
  return locale.t('campusMerchantAfterSales.pillPending').replace('{n}', String(pending));
});

function timeText(raw?: string | null): string {
  const s = formatDateTime(raw);
  return s ? s.slice(6) : '';
}

function stateText(state: string): string {
  const map: Record<string, string> = {
    Pending: locale.t('campusMerchantAfterSales.stPending'),
    Refunded: locale.t('campusMerchantAfterSales.stRefunded'),
    Rejected: locale.t('campusMerchantAfterSales.stRejected'),
    RefundFailed: locale.t('campusMerchantAfterSales.stFailed'),
    Appealed: locale.t('campusMerchantAfterSales.stAppealed'),
    Closed: locale.t('campusMerchantAfterSales.stClosed'),
    Received: locale.t('campusMerchantAfterSales.stReceived'),
    Approved: locale.t('campusMerchantAfterSales.stApproved'),
  };
  return map[state] ?? state;
}

function stateClass(state: string): string {
  if (state === 'Pending') return 'wait';
  if (state === 'RefundFailed') return 'bad';
  if (state === 'Refunded') return 'ok';
  return 'mute';
}

function typeText(type: string): string {
  const map: Record<string, string> = {
    refund_only: locale.t('campusMerchantAfterSales.typeRefundOnly'),
    return_refund: locale.t('campusMerchantAfterSales.typeReturn'),
    exchange: locale.t('campusMerchantAfterSales.typeExchange'),
  };
  return map[type] ?? type;
}

async function reload(): Promise<void> {
  const initial = !data.value;
  if (initial) loading.value = true;
  try {
    data.value = await campusMerchantAfterSales(null);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchantAfterSales.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

/** 同意：仅退款单由后端链式退款到账，前端只需确认一次（金额写进弹窗避免误点） */
function approve(r: MerchantAfterSalesRow): void {
  uni.showModal({
    title: locale.t('campusMerchantAfterSales.approveTitle'),
    content: locale.t('campusMerchantAfterSales.approveBody')
      .replace('{code}', r.orderCode)
      .replace('{amount}', fenToYuanFixed(r.refundAmount)),
    confirmText: locale.t('campusMerchantAfterSales.btnApprove'),
    cancelText: locale.t('campusMerchantAfterSales.cancel'),
    success: async res => {
      if (!res.confirm) return;
      busyId.value = r.id;
      try {
        const updated = await campusMerchantAfterSalesApprove(r.id);
        uni.showToast({
          title: updated.state === 'Refunded'
            ? locale.t('campusMerchantAfterSales.toastApproved')
            : locale.t('campusMerchantAfterSales.toastApprovePending'),
          icon: 'none',
        });
        await reload();
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchantAfterSales.approveFailed')), icon: 'none' });
      } finally {
        busyId.value = '';
      }
    },
  });
}

/** §84 退款失败重试：确认后调后端重试，成功即刷新（后端 30 秒内同单只放行一次，连点会被挡） */
function retryRefund(r: MerchantAfterSalesRow): void {
  uni.showModal({
    title: locale.t('campusMerchantAfterSales.retryTitle'),
    content: locale.t('campusMerchantAfterSales.retryBody')
      .replace('{code}', r.orderCode)
      .replace('{amount}', fenToYuanFixed(r.refundAmount)),
    confirmText: locale.t('campusMerchantAfterSales.retryBtn'),
    cancelText: locale.t('campusMerchantAfterSales.cancel'),
    success: async res => {
      if (!res.confirm) return;
      busyId.value = r.id;
      try {
        const updated = await campusMerchantAfterSalesRetryRefund(r.id);
        uni.showToast({
          title: updated.state === 'Refunded'
            ? locale.t('campusMerchantAfterSales.toastRetryOk')
            : locale.t('campusMerchantAfterSales.toastRetryPending'),
          icon: 'none',
        });
        await reload();
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchantAfterSales.retryFailed')), icon: 'none' });
      } finally {
        busyId.value = '';
      }
    },
  });
}

/** §82 打开详情面板：先占位再拉数据，失败也保持面板可关闭 */
async function openDetail(r: MerchantAfterSalesRow): Promise<void> {
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = null;
  replyText.value = '';
  try {
    detail.value = await campusMerchantAfterSalesDetail(r.id);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchantAfterSales.detailLoadFailed')), icon: 'none' });
    detailOpen.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail(): void {
  if (sending.value) return;
  detailOpen.value = false;
  detail.value = null;
  replyText.value = '';
}

/** §100 售后管理三入口：审计日志 / 值班排班 / 补偿方案（同一页按 tab 切换） */
function goOps(tab: 'audit' | 'duty' | 'plan'): void {
  uni.navigateTo({ url: `/pages/campus/after-sales-ops?tab=${tab}` });
}

/** 凭证/对话图片看原图 */
function previewEvidence(url: string, index: number, urls?: string[]): void {
  const list = urls?.length ? urls : detail.value?.request.evidenceImages ?? [url];
  uni.previewImage({ urls: list, current: list[index] ?? url });
}

/** 发送协商留言：成功后本地追加气泡，并把列表卡「留言 n 条」+1 */
async function sendReply(): Promise<void> {
  const target = detail.value;
  if (!target || sending.value) return;
  const content = replyText.value.trim();
  if (!content) {
    uni.showToast({ title: locale.t('campusMerchantAfterSales.detailRequired'), icon: 'none' });
    return;
  }
  sending.value = true;
  try {
    const msg = await campusMerchantAfterSalesReply(target.request.id, content);
    target.messages.push(msg);
    target.messageTotal += 1;
    target.request.messageCount += 1;
    const row = data.value?.items.find(i => i.id === target.request.id);
    if (row) row.messageCount += 1;
    replyText.value = '';
    uni.showToast({ title: locale.t('campusMerchantAfterSales.detailSent'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchantAfterSales.detailSendFailed')), icon: 'none' });
  } finally {
    sending.value = false;
  }
}

function openReject(r: MerchantAfterSalesRow): void {
  rejectTarget.value = r;
  rejectReason.value = '';
}

function closeReject(): void {
  if (rejectBusy.value) return;
  rejectTarget.value = null;
  rejectReason.value = '';
}

async function submitReject(): Promise<void> {
  const target = rejectTarget.value;
  if (!target) return;
  const reason = rejectReason.value.trim();
  if (!reason) {
    uni.showToast({ title: locale.t('campusMerchantAfterSales.rejectRequired'), icon: 'none' });
    return;
  }
  rejectBusy.value = true;
  try {
    await campusMerchantAfterSalesReject(target.id, reason);
    uni.showToast({ title: locale.t('campusMerchantAfterSales.toastRejected'), icon: 'none' });
    rejectTarget.value = null;
    rejectReason.value = '';
    await reload();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchantAfterSales.rejectFailed')), icon: 'none' });
  } finally {
    rejectBusy.value = false;
  }
}

onMounted(() => {
  void reload();
});
onPullDownRefresh(async () => {
  await reload();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .hint.empty { padding: 60rpx 32rpx; line-height: 1.6; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .head { display: flex; align-items: center; gap: 16rpx;
      .title { flex: 1; font-size: 30rpx; color: $wa-ink; font-weight: 700; }
    }
    .pill { padding: 8rpx 24rpx; border-radius: 999rpx; background: $wa-rule;
      text { font-size: 22rpx; color: $wa-muted; font-weight: 600; }
    }
    .flt { margin: 20rpx 0 8rpx; white-space: nowrap;
      &__row { display: flex; gap: 12rpx; }
      &__i { flex: none; font-size: 22rpx; color: $wa-muted;
        padding: 10rpx 20rpx; border-radius: 999rpx; background: $wa-bg;
        &.on { background: $wa-accent; color: #fff; font-weight: 600; }
      }
    }
    .tip { display: block; margin-top: 12rpx; font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
    .ops-entry { display: flex; gap: 12rpx; margin-top: 16rpx;
      .oe-i { flex: 1; text-align: center; font-size: 22rpx; color: $wa-accent;
        background: $wa-bg; border-radius: 999rpx; padding: 10rpx 0; }
    }
  }
  .list { display: flex; flex-direction: column; gap: 16rpx;
    .as { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx;
      display: flex; flex-direction: column; gap: 12rpx;
      .a-head { display: flex; align-items: center; gap: 12rpx;
        .a-code { flex: 1; font-size: 28rpx; color: $wa-ink; font-weight: 700; }
        .a-amount { font-size: 30rpx; color: #d4380d; font-weight: 700; }
        .a-state { font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
          &.wait { color: #fa8c16; background: #fff7e6; }
          &.bad { color: #d4380d; background: #fdecec; }
          &.ok { color: #237804; background: #f6ffed; }
          &.mute { color: #8c8c8c; background: $wa-rule; }
        }
      }
      .a-sub { display: flex; align-items: center; gap: 12rpx;
        .a-type { font-size: 22rpx; color: #1677ff; background: #eaf3ff;
          border-radius: 999rpx; padding: 4rpx 16rpx; }
        .a-cust { flex: 1; font-size: 24rpx; color: $wa-muted; }
        .a-time { font-size: 22rpx; color: $wa-muted; }
      }
      .a-reason { font-size: 26rpx; color: $wa-ink; line-height: 1.5; }
      .a-desc { font-size: 24rpx; color: $wa-muted; line-height: 1.5; }
      .a-meta { display: flex; gap: 16rpx;
        .a-meta-i { font-size: 22rpx; color: $wa-muted; }
      }
      .a-reject { font-size: 24rpx; color: #d4380d; line-height: 1.5; }
      .a-refunded { font-size: 22rpx; color: #237804; }
      .a-detail { font-size: 22rpx; color: $wa-muted; text-align: right; }
      .a-ops { display: flex; align-items: center; gap: 20rpx; margin-top: 4rpx;
        .op-reject { flex: none; font-size: 26rpx; color: $wa-muted;
          border: 1.5px solid $wa-rule; border-radius: 999rpx; padding: 10rpx 32rpx; }
        .op-approve { flex: 1; margin: 0; height: 68rpx; line-height: 68rpx; background: $wa-accent;
          color: #fff; font-size: 26rpx; border-radius: 999rpx; border: none;
          &[disabled] { opacity: .6; }
        }
        .op-fail { flex: 1; font-size: 24rpx; color: #d4380d; line-height: 1.4; }
        .op-retry { flex: none; margin: 0; height: 68rpx; line-height: 68rpx; padding: 0 32rpx;
          background: #d4380d; color: #fff; font-size: 26rpx; border-radius: 999rpx; border: none;
          &[disabled] { opacity: .6; }
        }
      }
    }
  }
}
.panel { position: fixed; left: 0; right: 0; bottom: 0; top: var(--window-top, 0); z-index: 320; background: $wa-bg; display: flex; flex-direction: column;
  &__hd { display: flex; align-items: center; gap: 16rpx; padding: 24rpx 32rpx; background: $wa-card;
    border-bottom: 1px solid $wa-rule;
    &-l { flex: 1; display: flex; align-items: baseline; gap: 16rpx; }
  }
  &__code { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
  &__amount { font-size: 30rpx; color: #d4380d; font-weight: 700; }
  &__x { font-size: 32rpx; color: $wa-muted; padding: 4rpx 8rpx; }
  &__body { flex: 1; height: 0; padding: 24rpx 32rpx; box-sizing: border-box; }
  &__ft { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 32rpx 32rpx;
    background: $wa-card; border-top: 1px solid $wa-rule; }
  &__ipt { flex: 1; height: 76rpx; background: $wa-bg; border-radius: $wa-radius;
    padding: 0 20rpx; font-size: 26rpx; box-sizing: border-box; }
  &__send { flex: none; margin: 0; height: 72rpx; line-height: 72rpx; padding: 0 32rpx;
    background: $wa-accent; color: #fff; font-size: 26rpx; border-radius: 999rpx; border: none;
    &[disabled] { opacity: .6; }
  }
  &__ro { flex: 1; text-align: center; font-size: 24rpx; color: $wa-muted; padding: 12rpx 0; }
  .p-block { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 16rpx;
    display: flex; flex-direction: column; gap: 12rpx;
    .p-row { display: flex; align-items: center; gap: 12rpx; }
    .p-state { font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
      &.wait { color: #fa8c16; background: #fff7e6; }
      &.bad { color: #d4380d; background: #fdecec; }
      &.ok { color: #237804; background: #f6ffed; }
      &.mute { color: #8c8c8c; background: $wa-rule; }
    }
    .p-type { font-size: 22rpx; color: #1677ff; background: #eaf3ff; border-radius: 999rpx; padding: 4rpx 16rpx; }
    .p-line { font-size: 24rpx; color: $wa-ink; line-height: 1.5;
      &.mute { color: $wa-muted; }
      &.bad { color: #d4380d; }
      &.ok { color: #237804; }
    }
    .p-title { font-size: 26rpx; font-weight: 600; color: $wa-ink; display: flex; align-items: center; gap: 10rpx; }
    .p-count { font-size: 20rpx; color: $wa-muted; background: $wa-bg; border-radius: 999rpx; padding: 2rpx 14rpx; font-weight: 400; }
    .p-hint { font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
    .p-grid { display: flex; flex-wrap: wrap; gap: 12rpx;
      &__i { width: 152rpx; height: 152rpx; border-radius: 12rpx; background: $wa-bg; }
    }
    .p-tl { display: flex; flex-direction: column; gap: 4rpx;
      &__i { display: flex; gap: 16rpx; padding-bottom: 16rpx; position: relative; }
      &__dot { flex: none; width: 16rpx; height: 16rpx; margin-top: 8rpx; border-radius: 50%;
        background: $wa-rule;
        &.last { background: $wa-accent; }
      }
      &__bd { flex: 1; display: flex; flex-direction: column; gap: 4rpx; }
      &__t { font-size: 24rpx; color: $wa-ink; }
      &__time { font-size: 22rpx; color: $wa-muted; }
    }
    .msg { display: flex; flex-direction: column; gap: 6rpx; margin-top: 8rpx;
      &.mine { align-items: flex-end; }
      &.theirs { align-items: flex-start; }
      &__who { font-size: 20rpx; color: $wa-muted; }
      &__bubble { max-width: 84%; background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx;
        display: flex; flex-direction: column; gap: 10rpx; }
      &.mine &__bubble { background: #eaf3ff; }
      &__text { font-size: 24rpx; color: $wa-ink; line-height: 1.55; word-break: break-all; }
      &__imgs { display: flex; gap: 10rpx; }
      &__img { width: 120rpx; height: 120rpx; border-radius: 10rpx; }
    }
  }
}

.mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 300;
  display: flex; align-items: flex-end; }
.sheet { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; padding: 28rpx 32rpx 40rpx;
  box-sizing: border-box;
  &__hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
  &__t { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
  &__x { font-size: 32rpx; color: $wa-muted; padding: 4rpx 8rpx; }
  &__sub { display: block; font-size: 26rpx; color: $wa-ink; margin-bottom: 8rpx; }
  &__hint { display: block; font-size: 22rpx; color: $wa-muted; line-height: 1.5; margin-bottom: 16rpx; }
  &__input { height: 72rpx; background: $wa-bg; border-radius: $wa-radius; padding: 0 20rpx;
    font-size: 28rpx; box-sizing: border-box; }
  &__ops { display: flex; align-items: center; gap: 20rpx; margin-top: 24rpx; }
  &__clear { flex: none; font-size: 24rpx; color: $wa-muted; padding: 12rpx 8rpx; }
  &__save { flex: 1; margin: 0; height: 76rpx; line-height: 76rpx; background: $wa-accent;
    color: #fff; font-size: 28rpx; border-radius: $wa-radius; border: none;
    &[disabled] { opacity: .6; }
  }
}
</style>
