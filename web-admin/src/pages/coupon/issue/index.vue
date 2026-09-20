<template>
  <view class="page">
    <!-- 1 选券 -->
    <text class="sec-title">{{ $t('couponIssue.secPickTemplate') }}</text>
    <view class="tpl" v-for="t in templates" :key="t.id" @tap="pick(t)">
      <view class="t-left">
        <text class="t-name">{{ t.name }}</text>
        <text class="t-meta">{{ couponTypeLabel(t.type) }} · {{ tplAmount(t) }} · {{ $t('couponIssue.perUserSuffix').replace('{n}', t.perUserLimit) }}</text>
      </view>
      <radio :checked="selTpl?.id === t.id" color="#2f6bff" />
    </view>
    <view v-if="!templates.length" class="empty">{{ $t('couponIssue.emptyTpl') }}</view>

    <!-- 2 选客户 -->
    <text class="sec-title">{{ $t('couponIssue.secPickCustomer').replace('{n}', selected.size) }}</text>
    <view class="search">
      <input v-model="kw" :placeholder="$t('couponIssue.searchPlaceholder')" confirm-type="search" @confirm="doSearch" />
      <text class="go" @tap="doSearch">{{ $t('couponIssue.search') }}</text>
      <text class="all" @tap="selectAll">{{ $t('couponIssue.allChannel') }}</text>
    </view>
    <view class="c-item" v-for="c in custList" :key="c.id" @tap="toggle(c)">
      <view class="c-left">
        <text class="c-name">{{ (c.firstName || '') + (c.lastName || '') || c.emailAddress }}</text>
        <text class="c-mail">{{ c.emailAddress }}</text>
      </view>
      <radio :checked="selected.has(c.id)" color="#2f6bff" />
    </view>
    <view v-if="!custList.length" class="empty">{{ $t('couponIssue.emptyCustomer') }}</view>

    <!-- 3 通知 -->
    <text class="sec-title">{{ $t('couponIssue.secNotify') }}</text>
    <view class="switch-row">
      <text>{{ $t('couponIssue.notifyLabel') }}</text>
      <switch :checked="notify" color="#2f6bff" @change="e => notify = e.detail.value" />
    </view>

    <!-- 4 确认 -->
    <text class="sec-title">{{ $t('couponIssue.secConfirm') }}</text>
    <view class="sum">{{ $t('couponIssue.confirmSummary').replace('{n}', selected.size) }}</view>
    <button class="btn" :disabled="!selTpl || !selected.size || busy" @tap="submit">{{ busy ? $t('couponIssue.issuing') : $t('couponIssue.confirm') }}</button>

    <!-- 结果 -->
    <view v-if="results.length" class="result">
      <text class="sec-title">{{ $t('couponIssue.resultTitle') }}</text>
      <view class="r-row" v-for="r in results" :key="r.customerId">
        <text class="r-cust">{{ selectedName(r.customerId) || r.customerId }}</text>
        <text :class="r.ok ? 'ok' : 'no'">{{ r.ok ? locale.t('couponIssue.resultSuccess').replace('{code}', r.code || '') : reasonLabel(r.reason) }}</text>
      </view>
      <text class="sec-title">{{ $t('couponIssue.resultSummary').replace('{ok}', okCount).replace('{fail}', results.length - okCount) }}</text>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  fetchCouponTemplates, searchChannelCustomers, grantCouponIssue,
  CouponTemplateItem, IssueCustomer, couponTypeLabel, fmtCNY,
} from '../../../apis/coupon';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const templates = ref<CouponTemplateItem[]>([]);
const selTpl = ref<CouponTemplateItem | null>(null);
const kw = ref('');
const custList = ref<IssueCustomer[]>([]);
const selected = ref<Map<string, IssueCustomer>>(new Map());
const notify = ref(true);
const busy = ref(false);
const results = ref<{ customerId: string; ok: boolean; code?: string | null; reason?: string | null }[]>([]);

const okCount = computed(() => results.value.filter(r => r.ok).length);

function tplAmount(t: CouponTemplateItem): string {
  if (t.type === 'FREE_SHIPPING') return locale.t('couponIssue.valueFreeShipping');
  if (t.type === 'PERCENT') return locale.t('couponIssue.valuePercent').replace('{d}', String(t.discountValue / 10));
  return '¥' + fmtCNY(t.discountValue);
}
function pick(t: CouponTemplateItem) { selTpl.value = t; }

async function doSearch() {
  const r = await searchChannelCustomers(kw.value);
  custList.value = r.items;
}
async function selectAll() {
  const r = await searchChannelCustomers('', 500, 0);
  custList.value = r.items;
}
function toggle(c: IssueCustomer) {
  const m = selected.value;
  if (m.has(c.id)) m.delete(c.id); else m.set(c.id, c);
  selected.value = new Map(m);
}
function selectedName(id: string) { return selected.value.get(id)?.emailAddress || ''; }
function reasonLabel(r: string | null): string {
  const keys: Record<string, string> = {
    SOLD_OUT: 'reasonSoldOut', PER_USER_LIMIT: 'reasonPerUserLimit', CUSTOMER_NOT_FOUND: 'reasonCustomerNotFound',
    CUSTOMER_NOT_IN_CHANNEL: 'reasonNotInChannel', ERROR: 'reasonError',
  };
  const k = keys[r || ''];
  return k ? locale.t(`couponIssue.${k}`) : (r || locale.t('couponIssue.failed'));
}
async function submit() {
  if (!selTpl.value || !selected.value.size) return;
  busy.value = true;
  results.value = [];
  try {
    results.value = await grantCouponIssue(selTpl.value.id, [...selected.value.keys()], notify.value);
  } finally { busy.value = false; }
}

onShow(async () => {
  const r = await fetchCouponTemplates({ skip: 0, take: 100 });
  templates.value = r.items.filter(t => t.enabled);
});
</script>
<style lang="scss" scoped>
.page { padding: 24rpx 28rpx 60rpx; }
.sec-title { display: block; margin: 28rpx 0 12rpx; font-size: 26rpx; color: #606a78; font-weight: 600; }
.tpl, .c-item { display: flex; align-items: center; justify-content: space-between; background: #fff; border: 1rpx solid #e5e8ef; border-radius: 12rpx; padding: 22rpx 24rpx; margin-bottom: 14rpx; }
.t-name { font-size: 28rpx; font-weight: 600; display: block; }
.t-meta { font-size: 22rpx; color: #606a78; margin-top: 6rpx; display: block; }
.c-name { font-size: 26rpx; display: block; }
.c-mail { font-size: 22rpx; color: #606a78; }
.search { display: flex; align-items: center; gap: 16rpx; margin-bottom: 20rpx; }
.search input { flex: 1; background: #fff; border: 1rpx solid #e5e8ef; border-radius: 10rpx; padding: 14rpx 20rpx; font-size: 26rpx; }
.go, .all { color: #2f6bff; font-size: 26rpx; }
.switch-row { display: flex; align-items: center; justify-content: space-between; background: #fff; border: 1rpx solid #e5e8ef; border-radius: 12rpx; padding: 20rpx 24rpx; font-size: 26rpx; }
.sum { font-size: 26rpx; color: #1a1f2b; margin-bottom: 16rpx; }
.btn { background: #2f6bff; color: #fff; border-radius: 40rpx; margin-top: 8rpx; }
.btn[disabled] { opacity: .5; }
.result .r-row { display: flex; justify-content: space-between; padding: 16rpx 0; border-bottom: 1rpx dashed #eee; font-size: 24rpx; }
.r-cust { max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ok { color: #22a06b; } .no { color: #e64340; }
.empty { text-align: center; color: #aaa; padding: 40rpx 0; font-size: 26rpx; }
</style>