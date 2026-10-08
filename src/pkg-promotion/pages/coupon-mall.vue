<template>
  <view class="mall-page">
    <!-- 五 Tab：领券 / 购券 / 积分 / 兑换 / 卡包 -->
    <view class="mall-tabs">
      <text
        v-for="tb in TABS"
        :key="tb.key"
        class="tab"
        :class="{ active: tab === tb.key }"
        @click="switchTab(tb.key)"
      >{{ tb.label }}</text>
    </view>

    <!-- ① 领券中心 -->
    <view v-if="tab === 'claim'">
      <template v-if="centreCoupons.length">
        <view v-for="c in centreCoupons" :key="c.id" class="coupon-card">
          <view class="coupon-card__left" :class="{ 'coupon-card__left--disabled': !canClaim(c) }">
            <view class="coupon-card__amount-row">
              <text v-if="c.type === 'FIXED' || c.type === 'FULL'" class="coupon-card__symbol">¥</text>
              <text class="coupon-card__amount">{{ formatAmount(c) }}</text>
              <text class="coupon-card__unit">{{ formatUnit(c) }}</text>
            </view>
            <text class="coupon-card__left-tip">{{ typeTip(c.type) }}</text>
          </view>
          <view class="coupon-card__right">
            <view class="coupon-card__info">
              <view class="coupon-card__name-row">
                <text class="coupon-card__name">{{ c.name }}</text>
                <text class="coupon-card__scene-tag">{{ usageTag(c.usageScene) }}</text>
              </view>
              <text class="coupon-card__cond">{{ formatCondition(c) }} · {{ formatDateRange(c) }}</text>
              <view v-if="c.totalCount > 0" class="coupon-card__progress">
                <view class="coupon-card__progress-bar">
                  <view class="coupon-card__progress-inner" :style="{ width: progressPercent(c) + '%' }" />
                </view>
                <text class="coupon-card__progress-text">已领 {{ c.claimedCount || 0 }}/{{ c.totalCount }}</text>
              </view>
            </view>
            <button
              class="coupon-card__btn"
              :class="{ 'coupon-card__btn--disabled': !canClaim(c) }"
              :disabled="!canClaim(c) || !!claimingId"
              @click="claim(c)"
            >{{ claimBtnText(c) }}</button>
          </view>
        </view>
      </template>
      <EmptyState v-else-if="!loadingCentre" text="暂无可领取的优惠券" />
    </view>

    <!-- ② 购券（券商城） -->
    <view v-else-if="tab === 'sale'">
      <view v-if="!isLoggedIn" class="login-prompt" @click="goLogin">
        <text class="login-prompt__text">登录后可购买优惠券</text>
        <text class="login-prompt__btn">去登录</text>
      </view>
      <template v-else>
        <view class="scene-chips">
          <text
            class="chip"
            :class="{ active: saleScene === 'ONLINE' }"
            @click="switchSaleScene('ONLINE')"
          >线上专用</text>
          <text
            class="chip"
            :class="{ active: saleScene === 'IN_STORE' }"
            @click="switchSaleScene('IN_STORE')"
          >到店可用</text>
        </view>
        <template v-if="saleBundles.length || saleTemplates.length">
          <!-- 券包大卡 -->
          <view v-for="b in saleBundles" :key="'b-' + b.id" class="bundle-card">
            <view class="bundle-card__head">
              <view class="bundle-card__title-wrap">
                <text class="bundle-card__title">{{ b.name }}</text>
                <text class="bundle-card__sub">
                  {{ bundleTypeCount(b) }}类{{ bundleTotalQty(b) }}张
                  <text v-if="bundleSave(b) > 0"> · 合计可省¥{{ yuan(bundleSave(b)) }}</text>
                </text>
              </view>
              <text class="bundle-card__price">¥{{ yuan(b.salePrice) }}</text>
            </view>
            <view class="bundle-card__tags">
              <text v-for="it in bundleItems(b)" :key="it.id" class="bundle-card__tag">
                {{ it.template ? formatAmount(it.template) + formatUnit(it.template) : '券' }} ×{{ it.quantity }}
              </text>
            </view>
            <button
              class="bundle-card__btn"
              :disabled="!!buyingId"
              @click="startBuy({ kind: 'bundle', id: b.id, name: b.name, amount: b.salePrice })"
            >{{ buyingId === b.id ? '下单中…' : '立即购买' }}</button>
          </view>
          <!-- 单券卡 -->
          <view v-for="c in saleTemplates" :key="'t-' + c.id" class="coupon-card">
            <view class="coupon-card__left">
              <view class="coupon-card__amount-row">
                <text v-if="c.type === 'FIXED' || c.type === 'FULL'" class="coupon-card__symbol">¥</text>
                <text class="coupon-card__amount">{{ formatAmount(c) }}</text>
                <text class="coupon-card__unit">{{ formatUnit(c) }}</text>
              </view>
              <text class="coupon-card__left-tip">{{ typeTip(c.type) }}</text>
            </view>
            <view class="coupon-card__right">
              <view class="coupon-card__info">
                <view class="coupon-card__name-row">
                  <text class="coupon-card__name">{{ c.name }}</text>
                  <text class="coupon-card__scene-tag">{{ usageTag(c.usageScene) }}</text>
                </view>
                <text class="coupon-card__cond">{{ formatCondition(c) }} · {{ formatDateRange(c) }}</text>
              </view>
              <button
                class="coupon-card__btn"
                :disabled="!!buyingId"
                @click="startBuy({ kind: 'template', id: c.id, name: c.name, amount: c.salePrice })"
              >{{ buyingId === c.id ? '下单中…' : '买 ¥' + yuan(c.salePrice) }}</button>
            </view>
          </view>
        </template>
        <EmptyState v-else-if="!loadingSale" text="暂无可购优惠券" />
      </template>
    </view>

    <!-- ③ 积分兑换 -->
    <view v-else-if="tab === 'points'">
      <view v-if="!isLoggedIn" class="login-prompt" @click="goLogin">
        <text class="login-prompt__text">登录后可用积分兑换优惠券</text>
        <text class="login-prompt__btn">去登录</text>
      </view>
      <template v-else>
        <template v-if="pointsCoupons.length">
          <view v-for="c in pointsCoupons" :key="c.id" class="coupon-card">
            <view class="coupon-card__left">
              <view class="coupon-card__amount-row">
                <text v-if="c.type === 'FIXED' || c.type === 'FULL'" class="coupon-card__symbol">¥</text>
                <text class="coupon-card__amount">{{ formatAmount(c) }}</text>
                <text class="coupon-card__unit">{{ formatUnit(c) }}</text>
              </view>
              <text class="coupon-card__left-tip">{{ typeTip(c.type) }}</text>
            </view>
            <view class="coupon-card__right">
              <view class="coupon-card__info">
                <view class="coupon-card__name-row">
                  <text class="coupon-card__name">{{ c.name }}</text>
                  <text class="coupon-card__scene-tag">{{ usageTag(c.usageScene) }}</text>
                </view>
                <text class="coupon-card__cond">{{ formatCondition(c) }} · {{ formatDateRange(c) }}</text>
                <text class="coupon-card__points">{{ c.pointsPrice }} 积分</text>
              </view>
              <button
                class="coupon-card__btn"
                :disabled="!!exchangingId"
                @click="exchange(c)"
              >{{ exchangingId === c.id ? '兑换中…' : '积分兑换' }}</button>
            </view>
          </view>
        </template>
        <EmptyState v-else-if="!loadingPoints" text="暂无可兑换的优惠券" />
      </template>
    </view>

    <!-- ④ 兑换码 -->
    <view v-else-if="tab === 'code'" class="mall-redeem">
      <view v-if="!isLoggedIn" class="login-prompt" @click="goLogin">
        <text class="login-prompt__text">请先登录后使用兑换码</text>
        <text class="login-prompt__btn">去登录</text>
      </view>
      <template v-else>
        <text class="mall-redeem__tip">输入兑换码，券将发放到您的卡包</text>
        <view class="mall-redeem__row">
          <input v-model="redeemCode" placeholder="请输入兑换码" class="input" />
          <button
            class="mall-redeem__btn"
            :disabled="!redeemCode.trim() || redeeming"
            @click="redeem"
          >{{ redeeming ? '兑换中…' : '兑换' }}</button>
        </view>
      </template>
    </view>

    <!-- ⑤ 我的卡包 -->
    <view v-else>
      <view v-if="!isLoggedIn" class="login-prompt" @click="goLogin">
        <text class="login-prompt__text">请先登录查看您的优惠券</text>
        <text class="login-prompt__btn">去登录</text>
      </view>
      <template v-else>
        <view class="wallet-subtabs">
          <text
            v-for="w in (['unused', 'used', 'expired', 'returned'] as WalletKey[])"
            :key="w"
            class="subtab"
            :class="{ active: walletTab === w }"
            @click="walletTab = w"
          >{{ WALLET_LABELS[w] }}</text>
        </view>
        <view class="scene-chips">
          <text
            v-for="s in (['ALL', 'ONLINE', 'IN_STORE'] as SceneKey[])"
            :key="s"
            class="chip"
            :class="{ active: walletScene === s }"
            @click="walletScene = s"
          >{{ s === 'ALL' ? '全部' : s === 'ONLINE' ? '线上专用' : '到店可用' }}</text>
        </view>
        <template v-if="sceneFilteredCoupons.length">
          <view
            v-for="mc in visibleCoupons"
            :key="mc.id"
            class="coupon-card"
            :class="{ 'coupon-card--disabled': mc.status !== 'UNUSED' }"
          >
            <!-- 临期角标 -->
            <view v-if="walletTab === 'unused' && isExpiring(mc)" class="coupon-card__expiring">
              <text>剩{{ remainingDays(mc) }}天</text>
            </view>
            <view class="coupon-card__left">
              <view class="coupon-card__amount-row">
                <text v-if="myType(mc) === 'FIXED' || myType(mc) === 'FULL'" class="coupon-card__symbol">¥</text>
                <text class="coupon-card__amount">{{ formatAmount(mc.template || {}) }}</text>
                <text class="coupon-card__unit">{{ formatUnit(mc.template || {}) }}</text>
              </view>
              <text class="coupon-card__left-tip">{{ typeTip(myType(mc)) }}</text>
            </view>
            <view class="coupon-card__right">
              <view class="coupon-card__info">
                <view class="coupon-card__name-row">
                  <text class="coupon-card__name">{{ mc.template?.name || '优惠券' }}</text>
                  <text class="coupon-card__scene-tag">{{ usageTag(mc.template?.usageScene) }}</text>
                </view>
                <text class="coupon-card__cond">{{ formatCondition(mc.template || {}) }}</text>
                <text class="coupon-card__code">券码：{{ mc.code }}</text>
                <text class="coupon-card__date">{{ formatDateRange(mc.template || {}) }}</text>
              </view>
              <view v-if="mc.status === 'UNUSED' && isStoreCoupon(mc.template?.usageScene)" class="coupon-card__actions">
                <button class="coupon-card__btn coupon-card__btn--outline" @click.stop="goShowCode(mc)">出示券码</button>
              </view>
            </view>
            <view v-if="mc.status !== 'UNUSED'" class="coupon-card__stamp">
              <text>{{ mc.status === 'USED' ? '已使用' : mc.status === 'EXPIRED' ? '已过期' : mc.status === 'RETURNED' ? '已退回' : mc.status }}</text>
            </view>
          </view>
        </template>
        <EmptyState v-else-if="!loadingWallet" :text="walletEmptyText" />
      </template>
    </view>

    <!-- 支付方式弹层 -->
    <view v-if="paySheet" class="pay-mask" @click.self="closePaySheet">
      <view class="pay-sheet">
        <text class="pay-sheet__title">确认支付</text>
        <text class="pay-sheet__desc">{{ buyName }} · ¥{{ yuan(buyAmount) }}</text>
        <view
          class="pay-option"
          :class="{ 'pay-option--active': payMode === 'WECHAT' }"
          @click="payMode = 'WECHAT'"
        >
          <view class="pay-option__radio" :class="{ 'pay-option__radio--active': payMode === 'WECHAT' }" />
          <text class="pay-option__name">微信支付</text>
          <text class="pay-option__sub">推荐</text>
        </view>
        <view
          class="pay-option"
          :class="{ 'pay-option--active': payMode === 'BALANCE' }"
          @click="payMode = 'BALANCE'"
        >
          <view class="pay-option__radio" :class="{ 'pay-option__radio--active': payMode === 'BALANCE' }" />
          <text class="pay-option__name">余额支付</text>
        </view>
        <view class="pay-sheet__actions">
          <button class="pay-sheet__btn pay-sheet__btn--ghost" :disabled="paying" @click="closePaySheet">取消</button>
          <button class="pay-sheet__btn" :disabled="paying" @click="confirmPay">
            {{ paying ? '支付中…' : '¥' + yuan(buyAmount) + ' 支付' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
    getCouponCentre,
    getMyCoupons,
    getCouponSaleCatalogue,
    getMyCouponSaleOrders,
    getPointsMallTemplates,
} from '../../api/queries/coupon';
import {
    claimCoupon,
    redeemCouponByCode,
    exchangeCouponWithPoints,
    createCouponSaleOrder,
    createWechatCouponPayment,
    payCouponSaleWithBalance,
    cancelCouponSaleOrder,
    couponErrorMessage,
} from '../../api/mutations/coupon';
import { useUIStore } from '../../stores/ui';
import { useAuthStore } from '../../stores/auth';
import { handlePayment } from '../../composables/usePayment';
import { getPlatform } from '../../utils/platform';
import EmptyState from '../../components/EmptyState.vue';
import { useShare } from '../../composables/useShare';

const ui = useUIStore();
const auth = useAuthStore();
useShare({
    title: '券商城 - 领券购券一站搞定',
    path: '/pkg-promotion/pages/coupon-mall',
});

const isLoggedIn = computed(() => !!auth.token);

type TabKey = 'claim' | 'sale' | 'points' | 'code' | 'wallet';
type WalletKey = 'unused' | 'used' | 'expired' | 'returned';
type SceneKey = 'ALL' | 'ONLINE' | 'IN_STORE';

const TABS: { key: TabKey; label: string }[] = [
    { key: 'claim', label: '领券' },
    { key: 'sale', label: '购券' },
    { key: 'points', label: '积分' },
    { key: 'code', label: '兑换' },
    { key: 'wallet', label: '卡包' },
];

const WALLET_LABELS: Record<WalletKey, string> = {
    unused: '未使用',
    used: '已使用',
    expired: '已过期',
    returned: '已退回',
};

const STATUS_MAP: Record<WalletKey, string> = {
    unused: 'UNUSED',
    used: 'USED',
    expired: 'EXPIRED',
    returned: 'RETURNED',
};

const tab = ref<TabKey>('claim');

// ── 领券中心 ──
const centreCoupons = ref<any[]>([]);
const loadingCentre = ref(false);
const claimingId = ref('');

// ── 我的券 ──
const myCoupons = ref<any[]>([]);
const loadingWallet = ref(false);
const walletTab = ref<WalletKey>('unused');
const walletScene = ref<SceneKey>('ALL');

// ── 券商城 ──
const saleTemplates = ref<any[]>([]);
const saleBundles = ref<any[]>([]);
const saleScene = ref<'ONLINE' | 'IN_STORE'>('ONLINE');
const loadingSale = ref(false);
const buyingId = ref('');

// ── 积分商城 ──
const pointsCoupons = ref<any[]>([]);
const loadingPoints = ref(false);
const exchangingId = ref('');

// ── 兑换码 ──
const redeemCode = ref('');
const redeeming = ref(false);

// ── 支付弹层 ──
const paySheet = ref(false);
const payMode = ref<'WECHAT' | 'BALANCE'>('WECHAT');
const pendingOrder = ref<any>(null);
const buyName = ref('');
const buyAmount = ref(0);
const paying = ref(false);

const EXPIRING_DAYS = 7;

// ─────────────────────────────────────────────────────────────
// 数据加载
// ─────────────────────────────────────────────────────────────

async function loadCentre() {
    loadingCentre.value = true;
    try {
        const res: any = await getCouponCentre();
        centreCoupons.value = res.couponCentre || [];
        // 领券中心需 myCoupons 判断 perUserLimit 已领数
        if (isLoggedIn.value && myCoupons.value.length === 0) await loadMy();
    } catch (e: any) {
        ui.showToast(couponErrorMessage(e));
    }
    loadingCentre.value = false;
}

async function loadMy() {
    loadingWallet.value = true;
    try {
        const res: any = await getMyCoupons();
        myCoupons.value = (res.myCoupons || []).map((c: any) => ({
            ...c,
            status: (c.status || '').toUpperCase(),
        }));
    } catch (e: any) {
        if (isAuthError(e)) {
            auth.logout();
            ui.showToast('登录已过期，请重新登录');
        } else {
            ui.showToast(couponErrorMessage(e));
        }
    }
    loadingWallet.value = false;
}

async function loadSale() {
    loadingSale.value = true;
    try {
        const res: any = await getCouponSaleCatalogue(saleScene.value);
        saleTemplates.value = res.couponSaleCatalogue?.templates || [];
        saleBundles.value = res.couponSaleCatalogue?.bundles || [];
    } catch (e: any) {
        ui.showToast(couponErrorMessage(e));
    }
    loadingSale.value = false;
}

async function loadPoints() {
    loadingPoints.value = true;
    try {
        const res: any = await getPointsMallTemplates();
        pointsCoupons.value = res.pointsMallTemplates || [];
    } catch (e: any) {
        ui.showToast(couponErrorMessage(e));
    }
    loadingPoints.value = false;
}

function switchTab(t: TabKey) {
    tab.value = t;
    if (t === 'claim' && centreCoupons.value.length === 0) loadCentre();
    if (t === 'sale' && isLoggedIn.value && saleTemplates.value.length === 0 && saleBundles.value.length === 0) loadSale();
    if (t === 'points' && isLoggedIn.value && pointsCoupons.value.length === 0) loadPoints();
    if (t === 'wallet') loadMy();
}

function switchSaleScene(s: 'ONLINE' | 'IN_STORE') {
    if (saleScene.value === s) return;
    saleScene.value = s;
    loadSale();
}

function goLogin() {
    uni.navigateTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-promotion/pages/coupon-mall') });
}

/** 检测 GraphQL 错误是否为认证失败（token 过期/无效） */
function isAuthError(e: any): boolean {
    const msg = (e?.message || '').toLowerCase();
    const errors = e?.response?.errors || e?.errors || [];
    return msg.includes('not currently authorized') ||
        msg.includes('forbidden') ||
        msg.includes('unauthorized') ||
        errors.some((er: any) => er?.extensions?.code === 'FORBIDDEN' || er?.extensions?.code === 'UNAUTHORIZED');
}

// ─────────────────────────────────────────────────────────────
// 领取 / 兑换码 / 积分兑换
// ─────────────────────────────────────────────────────────────

function heldCount(templateId: string): number {
    return myCoupons.value.filter(
        (mc: any) => mc.templateId === templateId &&
            !['RETURNED', 'INVALID', 'EXPIRED'].includes(mc.status),
    ).length;
}

function canClaim(c: any): boolean {
    if (c.totalCount && c.claimedCount != null && c.claimedCount >= c.totalCount) return false;
    if (c.perUserLimit > 0 && heldCount(c.id) >= c.perUserLimit) return false;
    return true;
}

function claimBtnText(c: any): string {
    if (c.totalCount && c.claimedCount != null && c.claimedCount >= c.totalCount) return '已抢完';
    if (c.perUserLimit > 0 && heldCount(c.id) >= c.perUserLimit) return '已领取';
    return '立即领取';
}

function progressPercent(c: any): number {
    if (!c.totalCount) return 0;
    return Math.min(100, Math.round(((c.claimedCount || 0) / c.totalCount) * 100));
}

async function claim(c: any) {
    if (!isLoggedIn.value) { goLogin(); return; }
    if (claimingId.value || !canClaim(c)) return;
    claimingId.value = c.id;
    try {
        await claimCoupon(c.id);
        ui.showToast('领取成功', 'success');
        c.claimedCount = (c.claimedCount || 0) + 1;
        await loadMy();
    } catch (e: any) {
        if (isAuthError(e)) {
            auth.logout();
            ui.showToast('登录已过期，请重新登录');
        } else {
            ui.showToast(couponErrorMessage(e));
        }
    }
    claimingId.value = '';
}

async function redeem() {
    const code = redeemCode.value.trim();
    if (!code || !isLoggedIn.value) { if (!isLoggedIn.value) goLogin(); return; }
    if (redeeming.value) return;
    redeeming.value = true;
    try {
        await redeemCouponByCode(code);
        ui.showToast('兑换成功', 'success');
        redeemCode.value = '';
        await loadMy();
        walletTab.value = 'unused';
        walletScene.value = 'ALL';
        tab.value = 'wallet';
    } catch (e: any) {
        if (isAuthError(e)) {
            auth.logout();
            ui.showToast('登录已过期，请重新登录');
        } else {
            ui.showToast(couponErrorMessage(e));
        }
    }
    redeeming.value = false;
}

async function exchange(c: any) {
    if (!isLoggedIn.value) { goLogin(); return; }
    if (exchangingId.value) return;
    exchangingId.value = c.id;
    try {
        await exchangeCouponWithPoints(c.id);
        ui.showToast('兑换成功', 'success');
        await loadMy();
        walletTab.value = 'unused';
        walletScene.value = 'ALL';
        tab.value = 'wallet';
    } catch (e: any) {
        if (isAuthError(e)) {
            auth.logout();
            ui.showToast('登录已过期，请重新登录');
        } else {
            ui.showToast(couponErrorMessage(e));
        }
    }
    exchangingId.value = '';
}

// ─────────────────────────────────────────────────────────────
// 券商城购买 + 支付
// ─────────────────────────────────────────────────────────────

/** 券包内券模板映射（items 仅含 templateId） */
const templateById = computed<Record<string, any>>(() => {
    const map: Record<string, any> = {};
    for (const tpl of saleTemplates.value) map[tpl.id] = tpl;
    return map;
});

function bundleItems(b: any) {
    return (b.items || []).map((it: any) => ({
        ...it,
        template: templateById.value[it.templateId] || null,
    }));
}

function bundleTypeCount(b: any): number {
    return new Set((b.items || []).map((i: any) => i.templateId)).size;
}

function bundleTotalQty(b: any): number {
    return (b.items || []).reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);
}

/** 券包「合计可省」：包内 FIXED/FULL 面额×张数 之和 − 售价（>0 才展示） */
function bundleSave(b: any): number {
    let save = 0;
    for (const it of bundleItems(b)) {
        const tpl = it.template;
        if (!tpl) continue;
        if (tpl.type === 'FIXED' || tpl.type === 'FULL') save += (tpl.discountValue || 0) * (it.quantity || 0);
    }
    const net = save - (b.salePrice || 0);
    return net > 0 ? net : 0;
}

/** 分 → 元（去尾零） */
function yuan(cents: number): string {
    return ((cents || 0) / 100).toFixed((cents || 0) % 100 === 0 ? 0 : 2);
}

async function startBuy(target: { kind: 'bundle' | 'template'; id: string; name: string; amount: number }) {
    if (!isLoggedIn.value) { goLogin(); return; }
    if (buyingId.value) return;
    buyingId.value = target.id;
    try {
        const res: any = await createCouponSaleOrder(
            target.kind === 'bundle' ? { bundleId: target.id } : { templateId: target.id },
        );
        const order = res.createCouponSaleOrder;
        pendingOrder.value = order;
        buyName.value = target.name;
        buyAmount.value = order?.amount ?? target.amount;
        payMode.value = 'WECHAT';
        paySheet.value = true;
    } catch (e: any) {
        if (isAuthError(e)) {
            auth.logout();
            ui.showToast('登录已过期，请重新登录');
        } else {
            ui.showToast(couponErrorMessage(e));
        }
    }
    buyingId.value = '';
}

/** 微信回调异步结算：短轮询确认已支付（最多 5 次 × 1.2s） */
async function waitForPaid(saleOrderId: string): Promise<void> {
    for (let i = 0; i < 5; i++) {
        try {
            const res: any = await getMyCouponSaleOrders();
            const found = (res.myCouponSaleOrders || []).find((o: any) => o.id === saleOrderId);
            if (found && found.status === 'PAID') return;
        } catch {
            // 忽略轮询异常，继续重试
        }
        await new Promise((r) => setTimeout(r, 1200));
    }
}

async function onPaid() {
    paySheet.value = false;
    pendingOrder.value = null;
    ui.showToast('支付成功', 'success');
    await loadMy();
    tab.value = 'wallet';
    walletTab.value = 'unused';
    walletScene.value = 'ALL';
}

async function confirmPay() {
    const order = pendingOrder.value;
    if (!order || paying.value) return;
    paying.value = true;
    try {
        if (payMode.value === 'BALANCE') {
            await payCouponSaleWithBalance(order.id);
            await onPaid();
        } else {
            const tradeType = getPlatform() === 'mp-weixin' ? 'JSAPI' : 'H5';
            // openid 由服务端客户档案推导（第三参可选），前端不再传
            const res: any = await createWechatCouponPayment(order.id, tradeType);
            const pay = res.createWechatCouponPayment?.pay;
            if (!pay || (!pay.payUrl && !pay.paySign)) {
                ui.showToast('支付通道暂不可用，请改用余额支付');
                return;
            }
            const result = await handlePayment('wechatpay', pay);
            if (!result.success) {
                ui.showToast(result.message || '支付未完成', 'error');
                return;
            }
            await waitForPaid(order.id);
            await onPaid();
        }
    } catch (e: any) {
        if (isAuthError(e)) {
            auth.logout();
            ui.showToast('登录已过期，请重新登录');
        } else {
            ui.showToast(couponErrorMessage(e));
        }
    }
    paying.value = false;
}

/** 关闭支付弹层：未支付则取消出售单，避免残留 PENDING */
async function closePaySheet() {
    const order = pendingOrder.value;
    paySheet.value = false;
    pendingOrder.value = null;
    if (order) {
        try {
            await cancelCouponSaleOrder(order.id);
        } catch {
            // 已支付/已取消时取消会失败，忽略
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 卡包：筛选 / 临期 / 出示券码
// ─────────────────────────────────────────────────────────────

const filteredMyCoupons = computed(() =>
    myCoupons.value.filter((c: any) => (c.status || '').toUpperCase() === STATUS_MAP[walletTab.value]),
);

/** 场景子筛：ONLINE→(ONLINE|ALL)；IN_STORE→(IN_STORE|ALL)；ALL→全部 */
function matchesScene(scene: string | null | undefined, key: SceneKey): boolean {
    const s = (scene || 'ONLINE').toUpperCase();
    if (key === 'ALL') return true;
    if (key === 'ONLINE') return s === 'ONLINE' || s === 'ALL';
    return s === 'IN_STORE' || s === 'ALL';
}

const sceneFilteredCoupons = computed(() =>
    filteredMyCoupons.value.filter((c: any) => matchesScene(c.template?.usageScene, walletScene.value)),
);

function couponExpiry(c: any): string | null {
    return c.expiredAt || c.template?.endsAt || null;
}

function remainingDays(c: any): number | null {
    const end = couponExpiry(c);
    if (!end) return null;
    const diff = new Date(end).getTime() - Date.now();
    if (Number.isNaN(diff)) return null;
    return Math.max(0, Math.ceil(diff / 86_400_000));
}

function isExpiring(c: any): boolean {
    const days = remainingDays(c);
    return days !== null && days <= EXPIRING_DAYS;
}

/** 未使用 tab 临期优先排序 */
const visibleCoupons = computed<any[]>(() => {
    const list = sceneFilteredCoupons.value;
    if (walletTab.value !== 'unused') return list;
    return [...list].sort((a: any, b: any) => {
        const da = remainingDays(a);
        const db = remainingDays(b);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
    });
});

const walletEmptyText = computed(() => {
    const map: Record<WalletKey, string> = {
        unused: '暂无可用优惠券',
        used: '暂无已使用优惠券',
        expired: '暂无已过期优惠券',
        returned: '暂无已退回优惠券',
    };
    return map[walletTab.value];
});

function isStoreCoupon(scene?: string): boolean {
    const s = (scene || '').toUpperCase();
    return s === 'IN_STORE' || s === 'ALL';
}

/** 打开券码出示页（复用已有 coupon-code 页） */
function goShowCode(mc: any) {
    const tpl = mc.template || {};
    const params = [
        `code=${encodeURIComponent(mc.code || '')}`,
        `name=${encodeURIComponent(tpl.name || '优惠券')}`,
        `type=${encodeURIComponent(tpl.type || 'FIXED')}`,
        `discountValue=${encodeURIComponent(tpl.discountValue?.toString() || '0')}`,
        `minSpend=${encodeURIComponent(tpl.minSpend?.toString() || '0')}`,
        `expiresAt=${encodeURIComponent(mc.expiredAt || tpl.endsAt || '')}`,
    ].join('&');
    uni.navigateTo({ url: `/pkg-promotion/pages/coupon-code?${params}` });
}

// ─────────────────────────────────────────────────────────────
// 展示格式化
// ─────────────────────────────────────────────────────────────

function myType(mc: any): string {
    return mc.template?.type || 'FIXED';
}

function typeTip(type?: string): string {
    if (type === 'FREE_SHIPPING') return '免配送费';
    if (type === 'FULL') return '直减';
    if (type === 'PERCENT') return '折扣';
    return '立减';
}

function formatAmount(c: any): string {
    if (c.type === 'FREE_SHIPPING') return '免配送费';
    if (c.type === 'PERCENT') {
        const zhe = (c.discountValue || 0) / 10;
        return zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1);
    }
    return ((c.discountValue || 0) / 100).toString();
}

function formatUnit(c: any): string {
    if (c.type === 'FREE_SHIPPING') return '';
    if (c.type === 'PERCENT') return '折';
    return '元';
}

function formatCondition(c: any): string {
    const minSpend = c.minSpend ? c.minSpend / 100 : 0;
    if (c.type === 'FREE_SHIPPING') return c.description || '免配送费';
    if (c.type === 'FULL') return '无门槛直减';
    if (!minSpend) return '无门槛';
    return `满${minSpend}元可用`;
}

function formatDateRange(c: any): string {
    const start = c.startsAt ? String(c.startsAt).slice(0, 10) : '';
    const end = c.endsAt ? String(c.endsAt).slice(0, 10) : '';
    if (start && end) return `${start} 至 ${end}`;
    if (end) return `至 ${end}`;
    return '';
}

/** 使用场景 tag 文案 */
function usageTag(scene?: string): string {
    const s = (scene || 'ONLINE').toUpperCase();
    if (s === 'IN_STORE') return '到店可用';
    if (s === 'ALL') return '通用';
    return '线上专用';
}

onMounted(loadCentre);
</script>

<style lang="scss" scoped>
.mall-page { padding: 20rpx; padding-bottom: 40rpx; }

.mall-tabs {
    display: flex; background: #fff; border-radius: $radius-md; margin-bottom: 20rpx; overflow: hidden;
    .tab {
        flex: 1; text-align: center; padding: 24rpx 0; font-size: 28rpx; color: #666;
        &.active { background: $brand-color; color: #fff; }
    }
}

.scene-chips {
    display: flex; gap: 16rpx; margin-bottom: 20rpx; padding: 0 4rpx;
    .chip {
        padding: 10rpx 30rpx; font-size: 26rpx; color: #666; background: #fff; border-radius: 30rpx;
        &.active { background: $brand-color; color: #fff; }
    }
}

.coupon-card {
    display: flex; background: #fff; border-radius: $radius-md; margin-bottom: 20rpx;
    overflow: hidden; position: relative;
    &--disabled { opacity: 0.65; }

    &__left {
        width: 200rpx; background: linear-gradient(135deg, $brand-color, #8a6fff);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 24rpx 0; color: #fff;
        &--disabled { background: linear-gradient(135deg, #bbb, #999); }
    }
    &__amount-row { display: flex; align-items: baseline; }
    &__symbol { font-size: 28rpx; font-weight: bold; }
    &__amount { font-size: 56rpx; font-weight: bold; line-height: 1; }
    &__unit { font-size: 24rpx; margin-left: 4rpx; }
    &__left-tip { font-size: 22rpx; margin-top: 10rpx; opacity: 0.9; }

    &__right {
        flex: 1; padding: 20rpx 24rpx; display: flex; flex-direction: column;
        justify-content: space-between; min-width: 0;
    }
    &__info { display: flex; flex-direction: column; }
    &__name-row { display: flex; align-items: center; gap: 10rpx; flex-wrap: wrap; }
    &__name { font-size: 30rpx; font-weight: bold; color: #333; }
    &__scene-tag {
        font-size: 18rpx; font-weight: bold; color: $brand-color;
        background: rgba($brand-color, 0.1); border-radius: 6rpx; padding: 2rpx 10rpx;
    }
    &__cond { font-size: 24rpx; color: #999; margin-top: 8rpx; }
    &__code { font-size: 22rpx; color: #666; margin-top: 6rpx; }
    &__date { font-size: 22rpx; color: #bbb; margin-top: 6rpx; }
    &__points { font-size: 26rpx; font-weight: bold; color: $brand-color; margin-top: 8rpx; }

    &__progress {
        display: flex; align-items: center; gap: 12rpx; margin-top: 10rpx;
    }
    &__progress-bar {
        flex: 1; height: 12rpx; background: #f0f0f0; border-radius: 6rpx; overflow: hidden;
    }
    &__progress-inner {
        height: 100%; background: linear-gradient(90deg, $brand-color, #ff9f43); border-radius: 6rpx;
    }
    &__progress-text { font-size: 20rpx; color: #bbb; white-space: nowrap; }

    &__btn {
        align-self: flex-end; background: $brand-color; color: #fff; border: none;
        font-size: 24rpx; padding: 8rpx 28rpx; border-radius: 30rpx; line-height: 1.6;
        &--disabled { background: #ccc; }
        &--outline {
            background: #fff; color: $brand-color;
            border: 1rpx solid $brand-color;
            &::after { border: none; }
        }
        &::after { border: none; }
        &[disabled] { opacity: 0.7; }
    }

    &__actions {
        margin-top: 10rpx;
        display: flex; justify-content: flex-end;
    }

    &__stamp {
        position: absolute; right: 36rpx; top: 50%;
        transform: translateY(-50%) rotate(-18deg);
        border: 4rpx solid #ff4d4f; color: #ff4d4f;
        padding: 6rpx 20rpx; border-radius: 8rpx;
        font-size: 28rpx; font-weight: bold; opacity: 0.75;
    }

    &__expiring {
        position: absolute; left: 0; top: 0; z-index: 1;
        background: #ff4d4f; color: #fff;
        font-size: 20rpx; font-weight: bold;
        padding: 4rpx 14rpx; border-radius: 0 0 12rpx 0;
    }
}

.bundle-card {
    background: #fff; border-radius: $radius-md; margin-bottom: 20rpx; padding: 24rpx;
    &__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16rpx; }
    &__title-wrap { min-width: 0; flex: 1; }
    &__title { font-size: 30rpx; font-weight: bold; color: #333; display: block; }
    &__sub { font-size: 22rpx; color: #999; margin-top: 6rpx; display: block; }
    &__price { font-size: 36rpx; font-weight: bold; color: $brand-color; white-space: nowrap; }
    &__tags { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 16rpx; }
    &__tag {
        font-size: 22rpx; color: #666; background: #f7f7f7;
        border-radius: 6rpx; padding: 6rpx 14rpx;
    }
    &__btn {
        margin-top: 20rpx; width: 100%; background: $brand-color; color: #fff; border: none;
        height: 72rpx; line-height: 72rpx; font-size: 28rpx; border-radius: 36rpx;
        &::after { border: none; }
        &[disabled] { opacity: 0.7; }
    }
}

.mall-redeem {
    background: #fff; padding: 30rpx; border-radius: $radius-md;
    &__tip { font-size: 26rpx; color: #999; margin-bottom: 20rpx; display: block; }
    &__row { display: flex; gap: 16rpx; }
    &__btn {
        background: $brand-color; color: #fff; border: none; border-radius: $radius-md;
        height: 80rpx; font-size: 28rpx; white-space: nowrap; padding: 0 36rpx;
        &[disabled] { opacity: 0.6; }
        &::after { border: none; }
    }
}

.input {
    flex: 1; height: 80rpx; border: 1rpx solid $border-color;
    border-radius: $radius-sm; padding: 0 20rpx; font-size: 28rpx;
}

.wallet-subtabs {
    display: flex; gap: 16rpx; margin-bottom: 16rpx; padding: 0 4rpx;
    .subtab {
        padding: 10rpx 30rpx; font-size: 26rpx; color: #666; background: #fff; border-radius: 30rpx;
        &.active { background: $brand-color; color: #fff; }
    }
}

.pay-mask {
    position: fixed; left: 0; right: 0; top: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.45); z-index: 999;
    display: flex; align-items: flex-end; justify-content: center;
}
.pay-sheet {
    width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 32rpx;
    padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
    &__title { font-size: 32rpx; font-weight: bold; color: #333; display: block; }
    &__desc { font-size: 26rpx; color: #999; margin-top: 8rpx; display: block; }
    &__actions { display: flex; gap: 20rpx; margin-top: 24rpx; }
    &__btn {
        flex: 1; height: 84rpx; line-height: 84rpx; border-radius: 42rpx;
        background: $brand-color; color: #fff; border: none; font-size: 30rpx;
        &--ghost { background: #f5f5f5; color: #666; }
        &::after { border: none; }
        &[disabled] { opacity: 0.7; }
    }
}
.pay-option {
    display: flex; align-items: center; gap: 16rpx;
    border: 1rpx solid $border-color; border-radius: $radius-md;
    padding: 24rpx; margin-top: 20rpx;
    &--active { border-color: $brand-color; }
    &__radio {
        width: 32rpx; height: 32rpx; border-radius: 50%;
        border: 4rpx solid $border-color; box-sizing: border-box;
        &--active { border-color: $brand-color; background: $brand-color; }
    }
    &__name { font-size: 28rpx; color: #333; font-weight: bold; flex: 1; }
    &__sub { font-size: 22rpx; color: #bbb; }
}

.login-prompt {
    display: flex; flex-direction: column; align-items: center;
    padding: 80rpx 40rpx; background: #fff; border-radius: $radius-md;
    &__text { font-size: 28rpx; color: #999; margin-bottom: 24rpx; }
    &__btn {
        background: $brand-color; color: #fff; border: none;
        border-radius: 40rpx; padding: 16rpx 60rpx; font-size: 28rpx;
        &::after { border: none; }
    }
}
</style>
