<template>
  <view class="page">
    <!-- 1 选券 -->
    <text class="sec-title">① 选择券模板</text>
    <view class="tpl" v-for="t in templates" :key="t.id" @tap="pick(t)">
      <view class="t-left">
        <text class="t-name">{{ t.name }}</text>
        <text class="t-meta">{{ couponTypeLabel(t.type) }} · {{ tplAmount(t) }} · 限{{ t.perUserLimit }}张/人</text>
      </view>
      <radio :checked="selTpl?.id === t.id" color="#2f6bff" />
    </view>
    <view v-if="!templates.length" class="empty">暂无可用券模板</view>

    <!-- 2 选客户 -->
    <text class="sec-title">② 选择客户（已选 {{ selected.size }}）</text>
    <view class="search">
      <input v-model="kw" placeholder="姓名/手机号/邮箱" confirm-type="search" @confirm="doSearch" />
      <text class="go" @tap="doSearch">搜索</text>
      <text class="all" @tap="selectAll">全部本渠道</text>
    </view>
    <view class="c-item" v-for="c in custList" :key="c.id" @tap="toggle(c)">
      <view class="c-left">
        <text class="c-name">{{ (c.firstName || '') + (c.lastName || '') || c.emailAddress }}</text>
        <text class="c-mail">{{ c.emailAddress }}</text>
      </view>
      <radio :checked="selected.has(c.id)" color="#2f6bff" />
    </view>
    <view v-if="!custList.length" class="empty">输入关键词搜索本渠道客户</view>

    <!-- 3 通知 -->
    <text class="sec-title">③ 发券通知</text>
    <view class="switch-row">
      <text>发券后发站内消息</text>
      <switch :checked="notify" color="#2f6bff" @change="e => notify = e.detail.value" />
    </view>

    <!-- 4 确认 -->
    <text class="sec-title">④ 确认发券</text>
    <view class="sum">将向 {{ selected.size }} 人发放 {{ selected.size }} 张券（每人 1 张）</view>
    <button class="btn" :disabled="!selTpl || !selected.size || busy" @tap="submit">{{ busy ? '发券中…' : '确认发券' }}</button>

    <!-- 结果 -->
    <view v-if="results.length" class="result">
      <text class="sec-title">发券结果</text>
      <view class="r-row" v-for="r in results" :key="r.customerId">
        <text class="r-cust">{{ selectedName(r.customerId) || r.customerId }}</text>
        <text :class="r.ok ? 'ok' : 'no'">{{ r.ok ? ('成功 ' + r.code) : reasonLabel(r.reason) }}</text>
      </view>
      <text class="sec-title">成功 {{ okCount }} / 失败 {{ results.length - okCount }}</text>
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
  if (t.type === 'FREE_SHIPPING') return '免邮';
  if (t.type === 'PERCENT') return (t.discountValue / 10) + '折';
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
  return ({ SOLD_OUT: '券已领完', PER_USER_LIMIT: '已达每人限领', CUSTOMER_NOT_FOUND: '客户不存在', CUSTOMER_NOT_IN_CHANNEL: '非本渠道客户', ERROR: '发券异常' } as Record<string, string>)[r || ''] || (r || '失败');
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