<template>
  <view class="page">
    <view v-if="tabs.length > 1" class="tabs">
      <view
        v-for="t in tabs" :key="t.key"
        class="tab" :class="{ on: tab === t.key }" @tap="tab = t.key"
      >{{ $t(t.label) }}</view>
    </view>

    <!-- ===== 商家自助投放 ===== -->
    <block v-if="tab === 'mine'">
      <view class="card form">
        <text class="form-title">{{ $t('campusAds.createTitle') }}</text>
        <view class="cell">
          <text class="lbl">{{ $t('campusAds.slot') }}</text>
          <view class="seg">
            <view
              v-for="s in slots" :key="s.code"
              class="seg-item" :class="{ on: slot === s.code }" @tap="slot = s.code"
            >{{ s.name }}</view>
          </view>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusAds.title') }}</text>
          <input v-model="title" maxlength="40" :placeholder="$t('campusAds.titlePh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusAds.startDate') }}</text>
          <picker mode="date" :value="startDate" @change="onDate('start')">
            <text class="picker">{{ startDate }}</text>
          </picker>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusAds.endDate') }}</text>
          <picker mode="date" :value="endDate" @change="onDate('end')">
            <text class="picker">{{ endDate }}</text>
          </picker>
        </view>
        <view class="cell col">
          <text class="lbl">{{ $t('campusAds.imageUrl') }}</text>
          <view class="img-box">
            <input :key="'img' + pickSeq" v-model="imageUrl" :placeholder="$t('campusAds.imageUrlPh')" />
            <view class="img-row">
              <view class="pick-btn" @tap="mediaOpen = true">{{ $t('campusAds.pickImage') }}</view>
              <image v-if="imageUrl" class="preview" :src="imageUrl" mode="aspectFill" @tap="previewAd" />
            </view>
            <text class="pick-hint">{{ $t('campusAds.pickHint') }}</text>
          </view>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusAds.linkUrl') }}</text>
          <input v-model="linkUrl" :placeholder="$t('campusAds.linkUrlPh')" />
        </view>
        <view class="quote">
          <text class="q-lbl">{{ $t('campusAds.quote') }}</text>
          <text class="q-val">{{ quoteText }}</text>
        </view>
        <text class="form-hint">{{ $t('campusAds.quoteHint') }}</text>
        <button class="primary" :disabled="creating" @tap="submitCreate">
          {{ creating ? $t('campusAds.submitting') : $t('campusAds.createBtn') }}
        </button>
      </view>

      <view v-if="mineLoading && !mine.length" class="hint">{{ $t('campusAds.loading') }}</view>
      <view v-else-if="!mine.length" class="hint">{{ $t('campusAds.empty') }}</view>
      <view v-for="c in mine" :key="c.id" class="card">
        <view class="row head">
          <text class="name">{{ c.title }}</text>
          <text class="pill" :class="pillClass(c.status)">{{ statusLabel(c.status) }}</text>
        </view>
        <view class="meta">
          <text class="m tag">{{ slotName(c.slot) }}</text>
          <text class="m">{{ c.startDate }} ~ {{ c.endDate }}</text>
          <text class="m">{{ $t('campusAds.daysN').replace('{n}', String(c.days)) }}</text>
          <text class="m">{{ money(c.totalFen) }}</text>
        </view>
        <text v-if="c.reviewNote" class="content">{{ $t('campusAds.reviewNote') }}{{ c.reviewNote }}</text>
        <view v-if="c.payRef" class="reply">
          <text class="reply-lbl">{{ $t('campusAds.payRef') }}</text>
          <text class="reply-txt">{{ c.payRef }}</text>
          <text v-if="c.paidAt" class="time">{{ fullTime(c.paidAt) }}</text>
        </view>
        <view class="row foot">
          <text class="time">{{ fullTime(c.createdAt) }}</text>
          <button
            v-if="c.status === 'pendingPay'" class="act" :disabled="acting === c.id"
            @tap="payAd(c)"
          >{{ $t('campusAds.payBtn') }}</button>
          <button
            v-if="c.status === 'pendingPay' || c.status === 'pendingReview'"
            class="act ghost danger" :disabled="acting === c.id" @tap="cancelAd(c)"
          >{{ $t('campusAds.cancelBtn') }}</button>
        </view>
      </view>
    </block>

    <!-- ===== 平台审核 ===== -->
    <block v-if="tab === 'review'">
      <view class="filters">
        <view
          v-for="f in REVIEW_FILTERS" :key="f.key"
          class="chip" :class="{ on: reviewStatus === f.key }" @tap="setReviewStatus(f.key)"
        >{{ $t(f.label) }}</view>
      </view>
      <view v-if="reviewLoading && !review.length" class="hint">{{ $t('campusAds.loading') }}</view>
      <view v-else-if="!review.length" class="hint">{{ $t('campusAds.empty') }}</view>
      <view v-for="c in review" :key="c.id" class="card">
        <view class="row head">
          <text class="name">{{ c.title }}</text>
          <text class="pill" :class="pillClass(c.status)">{{ statusLabel(c.status) }}</text>
        </view>
        <view class="meta">
          <text class="m tag">{{ slotName(c.slot) }}</text>
          <text class="m">{{ c.startDate }} ~ {{ c.endDate }}</text>
          <text class="m">{{ $t('campusAds.daysN').replace('{n}', String(c.days)) }}</text>
          <text class="m">{{ money(c.totalFen) }}</text>
        </view>
        <text v-if="c.imageUrl" class="content">{{ $t('campusAds.imageUrl') }}：{{ c.imageUrl }}</text>
        <text v-if="c.linkUrl" class="content">{{ $t('campusAds.linkUrl') }}：{{ c.linkUrl }}</text>
        <view v-if="c.reviewNote" class="reply">
          <text class="reply-lbl">{{ $t('campusAds.reviewNote') }}</text>
          <text class="reply-txt">{{ c.reviewNote }}</text>
        </view>
        <view class="row foot">
          <text class="time">{{ fullTime(c.createdAt) }}</text>
          <template v-if="c.status === 'pendingReview'">
            <button class="act" @tap="openReview(c, true)">{{ $t('campusAds.approveBtn') }}</button>
            <button class="act ghost danger" @tap="openReview(c, false)">{{ $t('campusAds.rejectBtn') }}</button>
          </template>
        </view>
      </view>
    </block>

    <!-- 素材选择：复用媒体库（可直接上传或从已上传素材中选），回填图片 URL -->
    <MediaLibraryModal
      v-model:visible="mediaOpen"
      :max="1"
      media-type="image"
      @confirm="onPickAsset"
    />

    <!-- 审核弹框 -->
    <view v-if="reviewTarget" class="mask" @tap="reviewTarget = null">
      <view class="modal" @tap.stop>
        <text class="modal-title">
          {{ reviewApprove ? $t('campusAds.approveTitle') : $t('campusAds.rejectTitle') }}
        </text>
        <text class="modal-sub">{{ reviewTarget.title }}</text>
        <textarea v-model="reviewNote" class="ta" :placeholder="$t('campusAds.notePh')" />
        <view class="row modal-actions">
          <button class="act ghost" @tap="reviewTarget = null">{{ $t('campusAds.cancel') }}</button>
          <button class="act" :disabled="acting === reviewTarget.id" @tap="submitReview">
            {{ acting === reviewTarget.id ? $t('campusAds.submitting') : $t('campusAds.submit') }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
// P2-3 广告投放：商家自助下单/模拟支付/取消 + 平台审核（通过转投放中、驳回须填原因）。
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  campusAdCampaigns,
  campusAdSlots,
  campusMerchantAds,
  campusMerchantCancelAd,
  campusMerchantCreateAd,
  campusMerchantPayAd,
  campusReviewAd,
  type CampusAdCampaignRow,
  type CampusAdSlot,
} from '../../apis/campus';
import { graphQlErrorMsg } from '../../apis/client';
import type { AssetItem } from '../../apis/asset';
import MediaLibraryModal from '../../components/MediaLibraryModal.vue';
import { useAuthStore } from '../../stores/authStore';
import { useLocaleStore } from '../../stores/localeStore';
import { fenToYuanFixed } from '../../utils/money';

type TabKey = 'mine' | 'review';

const REVIEW_FILTERS = [
  { key: '', label: 'campusAds.filterAll' },
  { key: 'pendingReview', label: 'campusAds.stPendingReview' },
  { key: 'running', label: 'campusAds.stRunning' },
  { key: 'finished', label: 'campusAds.stFinished' },
  { key: 'rejected', label: 'campusAds.stRejected' },
] as const;

const STATUS_LABEL: Record<string, string> = {
  pendingPay: 'campusAds.stPendingPay',
  pendingReview: 'campusAds.stPendingReview',
  running: 'campusAds.stRunning',
  finished: 'campusAds.stFinished',
  rejected: 'campusAds.stRejected',
  cancelled: 'campusAds.stCancelled',
};

const STATUS_PILL: Record<string, string> = {
  pendingPay: 'open',
  pendingReview: 'pending',
  running: 'approved',
  finished: 'closed',
  rejected: 'rejected',
  cancelled: 'closed',
};

const auth = useAuthStore();
const locale = useLocaleStore();

const canMerchant = computed(() => auth.hasPermission('CampusMerchant'));
const canConfig = computed(() => auth.hasPermission('CampusConfig'));

const tabs = computed(() => {
  const list: { key: TabKey; label: string }[] = [];
  if (canMerchant.value) list.push({ key: 'mine', label: 'campusAds.tabMine' });
  if (canConfig.value) list.push({ key: 'review', label: 'campusAds.tabReview' });
  return list;
});

const tab = ref<TabKey>(canMerchant.value ? 'mine' : 'review');

function toast(title: string, ok = false): void {
  uni.showToast({ title, icon: ok ? 'success' : 'none' });
}

function money(fen: number): string {
  return `¥${fenToYuanFixed(fen)}`;
}

function statusLabel(s: string): string {
  const key = STATUS_LABEL[s];
  return key ? locale.t(key) : s;
}

function pillClass(s: string): string {
  return STATUS_PILL[s] ?? '';
}

function fullTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function todayStr(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ===== 广告位与报价 =====
const slots = ref<CampusAdSlot[]>([]);

function slotName(code: string): string {
  return slots.value.find((s) => s.code === code)?.name ?? code;
}

const slot = ref('homeBanner');
const title = ref('');
const startDate = ref(todayStr(1));
const endDate = ref(todayStr(3));
const imageUrl = ref('');
const linkUrl = ref('');
const creating = ref(false);
/** 素材选择：媒体库弹层开关（§90 上传/选图后回填 imageUrl） */
const mediaOpen = ref(false);
/** 选图后重建输入框，让 uni H5 input 以新值重挂载并隐藏 placeholder（避免只靠 DOM value 显示） */
const pickSeq = ref(0);

function onPickAsset(assets: AssetItem[]): void {
  const picked = assets[0];
  if (picked?.source) {
    imageUrl.value = picked.source;
    pickSeq.value += 1;
  }
  mediaOpen.value = false;
}

function previewAd(): void {
  if (imageUrl.value) uni.previewImage({ urls: [imageUrl.value], current: 0 });
}

function onDate(which: 'start' | 'end'): (e: any) => void {
  return (e: any) => {
    const v = String(e?.detail?.value ?? '');
    if (!v) return;
    if (which === 'start') startDate.value = v;
    else endDate.value = v;
  };
}

/** 与后端同口径：含首尾天数，1~90 天 */
const quote = computed(() => {
  const s = slots.value.find((x) => x.code === slot.value);
  const start = Date.parse(`${startDate.value}T00:00:00Z`);
  const end = Date.parse(`${endDate.value}T00:00:00Z`);
  if (!s || Number.isNaN(start) || Number.isNaN(end)) return null;
  const days = Math.round((end - start) / 86400_000) + 1;
  if (days < 1 || days > 90) return null;
  return { days, totalFen: s.unitPriceFen * days };
});

const quoteText = computed(() => {
  const q = quote.value;
  if (!q) return locale.t('campusAds.quoteBad');
  return locale
    .t('campusAds.quoteVal')
    .replace('{days}', String(q.days))
    .replace('{total}', fenToYuanFixed(q.totalFen));
});

async function loadSlots(): Promise<void> {
  try {
    slots.value = await campusAdSlots();
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusAds.loadFailed')));
  }
}

// ===== 商家侧投放单 =====
const mine = ref<CampusAdCampaignRow[]>([]);
const mineLoading = ref(false);
const acting = ref('');

async function loadMine(): Promise<void> {
  mineLoading.value = true;
  try {
    mine.value = await campusMerchantAds();
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusAds.loadFailed')));
  } finally {
    mineLoading.value = false;
  }
}

function replaceMine(updated: CampusAdCampaignRow): void {
  const i = mine.value.findIndex((x) => x.id === updated.id);
  if (i >= 0) mine.value[i] = updated;
}

async function submitCreate(): Promise<void> {
  if (creating.value) return;
  const t = title.value.trim();
  if (!t) {
    toast(locale.t('campusAds.needTitle'));
    return;
  }
  if (!quote.value) {
    toast(locale.t('campusAds.badRange'));
    return;
  }
  creating.value = true;
  try {
    const row = await campusMerchantCreateAd({
      slot: slot.value,
      title: t,
      startDate: startDate.value,
      endDate: endDate.value,
      imageUrl: imageUrl.value.trim() || null,
      linkUrl: linkUrl.value.trim() || null,
    });
    mine.value = [row, ...mine.value];
    title.value = '';
    imageUrl.value = '';
    linkUrl.value = '';
    toast(locale.t('campusAds.created'), true);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusAds.opFailed')));
  } finally {
    creating.value = false;
  }
}

async function payAd(c: CampusAdCampaignRow): Promise<void> {
  if (acting.value) return;
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('campusAds.payTitle'),
      content: locale.t('campusAds.payConfirm').replace('{total}', money(c.totalFen)),
      confirmText: locale.t('campusAds.payBtn'),
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  acting.value = c.id;
  try {
    replaceMine(await campusMerchantPayAd(c.id));
    toast(locale.t('campusAds.paid'), true);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusAds.opFailed')));
  } finally {
    acting.value = '';
  }
}

async function cancelAd(c: CampusAdCampaignRow): Promise<void> {
  if (acting.value) return;
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('campusAds.cancelTitle'),
      content: locale.t('campusAds.cancelConfirm'),
      confirmText: locale.t('campusAds.cancelBtn'),
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  acting.value = c.id;
  try {
    replaceMine(await campusMerchantCancelAd(c.id));
    toast(locale.t('campusAds.cancelled'), true);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusAds.opFailed')));
  } finally {
    acting.value = '';
  }
}

// ===== 平台审核 =====
const review = ref<CampusAdCampaignRow[]>([]);
const reviewStatus = ref('');
const reviewLoading = ref(false);

async function loadReview(): Promise<void> {
  if (reviewLoading.value) return;
  reviewLoading.value = true;
  try {
    review.value = await campusAdCampaigns(reviewStatus.value || null);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusAds.loadFailed')));
  } finally {
    reviewLoading.value = false;
  }
}

function setReviewStatus(s: string): void {
  if (reviewStatus.value === s) return;
  reviewStatus.value = s;
  review.value = [];
  void loadReview();
}

const reviewTarget = ref<CampusAdCampaignRow | null>(null);
const reviewApprove = ref(true);
const reviewNote = ref('');

function openReview(c: CampusAdCampaignRow, approve: boolean): void {
  reviewTarget.value = c;
  reviewApprove.value = approve;
  reviewNote.value = '';
}

async function submitReview(): Promise<void> {
  const c = reviewTarget.value;
  if (!c || acting.value) return;
  const note = reviewNote.value.trim();
  if (!reviewApprove.value && !note) {
    toast(locale.t('campusAds.needNote'));
    return;
  }
  acting.value = c.id;
  try {
    await campusReviewAd(c.id, reviewApprove.value, note || null);
    reviewTarget.value = null;
    toast(locale.t('campusAds.reviewDone'), true);
    await loadReview();
    if (canMerchant.value) await loadMine();
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusAds.opFailed')));
  } finally {
    acting.value = '';
  }
}

// ===== 初始化（access 就绪后按权限加载） =====
let guardTimer: ReturnType<typeof setTimeout> | null = null;

async function waitAccess(): Promise<void> {
  let tries = 0;
  while (!auth.access && auth.token && tries < 20) {
    await new Promise((r) => setTimeout(r, 300));
    tries += 1;
  }
}

onMounted(async () => {
  await waitAccess();
  if (!canMerchant.value && !canConfig.value) {
    uni.showToast({ title: locale.t('common.noPermission'), icon: 'none' });
    guardTimer = setTimeout(() => uni.navigateBack(), 800);
    return;
  }
  tab.value = canMerchant.value ? 'mine' : 'review';
  const jobs: Promise<void>[] = [loadSlots()];
  if (canMerchant.value) jobs.push(loadMine());
  if (canConfig.value) jobs.push(loadReview());
  await Promise.all(jobs);
});

onUnmounted(() => {
  if (guardTimer) clearTimeout(guardTimer);
  guardTimer = null;
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx; padding-bottom: 80rpx;
  .tabs { display: flex; gap: 12rpx; margin-bottom: 24rpx;
    .tab { flex: 1; text-align: center; background: $wa-card; border-radius: $wa-radius;
      padding: 18rpx 0; font-size: 26rpx; color: $wa-muted; border: 1.5px solid transparent;
      &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; } } }
  .filters { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 20rpx;
    .chip { padding: 10rpx 26rpx; border-radius: 999rpx; background: $wa-card;
      border: 1.5px solid $wa-rule; font-size: 24rpx; color: $wa-muted;
      &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; } } }
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; gap: 16rpx; }
    .head { .name { flex: 1; font-size: 28rpx; color: $wa-ink; font-weight: 700; } }
    .pill { font-size: 20rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
      color: $wa-muted; border: 1px solid $wa-rule;
      &.open { color: #c47b00; border-color: #ffd08a; background: #fff7e6; }
      &.pending { color: $wa-accent; border-color: $wa-accent; }
      &.approved { color: $wa-success; border-color: $wa-success; }
      &.closed { color: $wa-muted; border-color: $wa-rule; }
      &.rejected { color: $wa-danger; border-color: $wa-danger; } }
    .meta { display: flex; flex-wrap: wrap; gap: 16rpx; padding-top: 12rpx;
      .m { font-size: 22rpx; color: $wa-muted; }
      .tag { color: $wa-accent; border: 1px solid $wa-accent; border-radius: 6rpx; padding: 0 8rpx; } }
    .content { display: block; font-size: 24rpx; color: $wa-ink; padding-top: 12rpx; word-break: break-all; }
    .reply { margin-top: 14rpx; background: $wa-bg; border-left: 6rpx solid $wa-accent;
      border-radius: 8rpx; padding: 12rpx 16rpx;
      .reply-lbl { display: block; font-size: 22rpx; color: $wa-muted; }
      .reply-txt { display: block; font-size: 24rpx; color: $wa-ink; padding-top: 4rpx; word-break: break-all; }
      .time { display: block; font-size: 20rpx; color: $wa-muted; padding-top: 6rpx; } }
    .foot { padding-top: 16rpx; .time { flex: 1; font-size: 20rpx; color: $wa-muted; }
      .act { background: $wa-accent; color: #fff; font-size: 26rpx; border-radius: $wa-radius;
        padding: 0 28rpx; line-height: 60rpx; }
      .act.ghost { background: transparent; border: 1.5px solid $wa-rule; color: $wa-muted; }
      .act.ghost.danger { border-color: $wa-danger; color: $wa-danger; } }
    &.form { border: 1.5px solid $wa-accent; }
    .form-title { display: block; font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-bottom: 8rpx; }
    .form-hint { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; }
    .cell { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $wa-rule;
      .lbl { width: 170rpx; font-size: 26rpx; color: $wa-ink; flex-shrink: 0; }
      input { flex: 1; font-size: 26rpx; }
      .picker { flex: 1; font-size: 26rpx; color: $wa-ink; }
      &.col { align-items: flex-start;
        .img-box { flex: 1; min-width: 0;
          input { width: 100%; font-size: 24rpx; }
          .img-row { display: flex; align-items: center; gap: 12rpx; margin-top: 12rpx;
            .pick-btn { font-size: 24rpx; color: $wa-accent; border: 1.5px solid $wa-accent;
              border-radius: $wa-radius; padding: 10rpx 18rpx; flex-shrink: 0; }
            .preview { width: 120rpx; height: 90rpx; border-radius: $wa-radius;
              border: 1rpx solid $wa-rule; flex-shrink: 0; } }
          .pick-hint { display: block; font-size: 20rpx; color: $wa-muted; margin-top: 8rpx; } } }
      .seg { flex: 1; display: flex; gap: 12rpx;
        .seg-item { flex: 1; text-align: center; padding: 12rpx 0; border-radius: $wa-radius;
          background: $wa-bg; font-size: 24rpx; color: $wa-muted;
          &.on { background: $wa-accent; color: #fff; font-weight: 600; } } } }
    .quote { display: flex; align-items: baseline; gap: 16rpx; padding: 20rpx 0 0;
      .q-lbl { font-size: 24rpx; color: $wa-muted; }
      .q-val { flex: 1; text-align: right; font-size: 30rpx; color: $wa-accent; font-weight: 700; } }
    .primary { margin-top: 24rpx; background: $wa-accent; color: #fff; font-size: 28rpx;
      border-radius: $wa-radius; } }
  .mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, .45);
    display: flex; align-items: center; justify-content: center; padding: 48rpx; z-index: 99;
    .modal { width: 100%; background: $wa-card; border-radius: $wa-radius; padding: 32rpx;
      .modal-title { display: block; font-size: 30rpx; color: $wa-ink; font-weight: 600; }
      .modal-sub { display: block; font-size: 24rpx; color: $wa-muted; padding: 10rpx 0 20rpx; }
      .ta { width: 100%; height: 200rpx; background: $wa-bg; border-radius: 8rpx; padding: 16rpx;
        font-size: 26rpx; box-sizing: border-box; }
      .modal-actions { display: flex; margin-top: 24rpx; justify-content: flex-end;
        .act { background: $wa-accent; color: #fff; font-size: 26rpx; border-radius: $wa-radius;
          padding: 0 32rpx; line-height: 64rpx; margin: 0 0 0 16rpx; }
        .act.ghost { background: transparent; border: 1.5px solid $wa-rule; color: $wa-muted; } } } }
}
</style>
