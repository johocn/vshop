<template>
  <view class="product-detail" v-if="product">
    <swiper class="product-detail__gallery" :indicator-dots="true" autoplay>
      <swiper-item v-for="asset in product.assets" :key="asset.id">
        <VImage :src="asset.preview" width="100%" height="750rpx" mode="aspectFit" />
      </swiper-item>
    </swiper>
    <view class="product-detail__info">
      <view class="price-row">
        <PriceTag :price="displayPrice" :large="true" />
        <text class="price-row__origin" v-if="originPrice">¥{{ originPrice }}</text>
        <text class="price-row__badge" v-if="isFlash">秒杀价</text>
        <text class="price-row__member" v-if="memberPriceLabel">{{ memberPriceLabel }}</text>
        <text class="price-row__member-ref" v-if="memberRefPrice">约¥{{ memberRefPrice }}</text>
      </view>
      <view class="price-note" @click="showPriceNote = true">
        <text class="price-note__text">价格说明</text>
        <text class="price-note__arrow">›</text>
      </view>
      <text class="product-detail__name">{{ product.name }}</text>

      <!-- 元信息行：分享/海报必做；销量/积分有数据才渲染 -->
      <view class="meta-row">
        <view class="meta-row__share" @click="shareNow">
          <text class="meta-row__icon">↗</text>
          <text class="meta-row__text">分享</text>
        </view>
        <view class="meta-row__share" @click="showPoster = true">
          <text class="meta-row__icon">▣</text>
          <text class="meta-row__text">海报</text>
        </view>
        <view class="meta-row__item" v-if="salesCountText">
          <text class="meta-row__text">{{ t('product.sold') }} {{ salesCountText }}</text>
        </view>
        <view class="meta-row__item" v-if="pointsText">
          <text class="meta-row__text">{{ pointsText }}</text>
        </view>
      </view>

      <!-- 已选规格入口 -->
      <view class="sku-entry" @click="openSku()">
        <text class="sku-entry__label">已选</text>
        <text class="sku-entry__value">{{ pickedSummary }} · 1 件</text>
        <text class="sku-entry__arrow">›</text>
      </view>
    </view>
    <!-- 超值加价购：券价随主订单结算 -->
    <view v-if="addonCoupons.length" class="addon-block">
      <view class="addon-block__head">
        <text class="addon-block__title">超值加价购</text>
        <text class="addon-block__sub">券价随订单一起结算</text>
      </view>
      <view
        v-for="b in addonCoupons"
        :key="'addon-' + b.id"
        class="addon-row"
        :class="{ 'addon-row--attached': isAddonAttached(b) }"
      >
        <view class="addon-row__left">
          <view class="addon-row__amount">
            <text v-if="addonType(b) === 'FIXED' || addonType(b) === 'FULL'" class="addon-row__cny">¥</text>
            <text class="addon-row__value">{{ addonAmount(b) }}</text>
            <text v-if="addonType(b) === 'PERCENT'" class="addon-row__cny">折</text>
          </view>
          <text class="addon-row__cond">{{ addonCondition(b) }}</text>
        </view>
        <view class="addon-row__mid">
          <view class="addon-row__name">
            <text>{{ b.promoTitle || b.template?.name }}</text>
            <text class="addon-row__tag">加价购</text>
          </view>
          <text class="addon-row__meta">{{ addonValidity(b) }}</text>
        </view>
        <button
          class="addon-row__btn"
          :class="{ 'addon-row__btn--on': isAddonAttached(b) }"
          :disabled="!!attachingTplId"
          @click="isAddonAttached(b) ? detachAddon(b) : attachAddon(b)"
        >
          <block v-if="isAddonAttached(b)">已换购<text class="addon-row__btn-sub">点击移除</text></block>
          <block v-else>+{{ yuan(b.template?.salePrice) }}元<text class="addon-row__btn-sub">立即换购</text></block>
        </button>
      </view>
    </view>
    <!-- 用户评价区：必须在详情富文本之前（对齐 usemall 05 → 06 顺序） -->
    <view v-if="reviewTotal > 0" class="review-block" @click="goReviewList">
      <view class="review-block__head">
        <text class="review-block__title">{{ t('review.title') }}（{{ reviewTotal }}）</text>
        <text class="review-block__more">{{ t('review.viewAll') }} ›</text>
      </view>
      <view class="review-block__summary">
        <text class="review-block__score">{{ reviewStats?.averageRating ?? 0 }} {{ t('review.scoreUnit') }}</text>
        <text class="review-block__sep">|</text>
        <text class="review-block__rate">{{ t('review.goodRate') }} {{ reviewStats?.goodRate ?? 0 }}%</text>
      </view>
      <ReviewItem
        v-for="r in previewReviews"
        :key="r.id"
        :review="r"
        :variant-map="variantTextMap"
        :max-images="3"
      />
    </view>
    <view class="product-detail__rich" v-if="mainVideo || descHtml || sellingPoint">
      <view v-if="mainVideo" class="rich__video">
        <video :src="mainVideo.source" controls class="rich__video-tag"></video>
      </view>
      <text v-if="sellingPoint" class="rich__sp">{{ sellingPoint }}</text>
      <MpHtml v-if="descHtml" :content="descHtml" class="rich__mp" />
    </view>
    <view class="product-detail__bar">
      <view class="bar-ico" @click="contactService"><text class="bar-ico__g">☎</text><text class="bar-ico__t">客服</text></view>
      <view class="bar-ico" @click="onFavorite"><text class="bar-ico__g" :class="{ 'bar-ico__g--fav': isFavorited }">{{ isFavorited ? '♥' : '♡' }}</text><text class="bar-ico__t">{{ isFavorited ? '已收藏' : '收藏' }}</text></view>
      <view class="bar-ico" @click="goCart"><text class="bar-ico__g">🛒</text><text class="bar-ico__t">购物车</text></view>
      <button class="product-detail__cart-btn" @click="openSku('cart')">加入购物车</button>
      <button class="product-detail__buy-btn" @click="openSku('buy')">立即购买</button>
    </view>

    <SkuSheet
      v-model:visible="showSku"
      :product="product"
      :activity-id="flashSaleActivityId"
      @action="onSkuAction"
    />

    <view v-if="showPriceNote" class="note-mask" @click.self="showPriceNote = false">
      <view class="note-sheet">
        <text class="note-sheet__title">价格说明</text>
        <text class="note-sheet__body">划线价为商品参考价，非原价；实际成交价以订单结算页为准。秒杀价仅在活动期间且订单已应用活动时生效。</text>
        <text class="note-sheet__ok" @click="showPriceNote = false">知道了</text>
      </view>
    </view>

    <ProductPoster v-if="showPoster" :product="product" @close="showPoster = false" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useProductShare } from '../../composables/useShare';
import { getProduct } from '../../api/queries/product';
import { getMyMemberPrice } from '../../api/queries/member-price';
import { toggleProductFavorite, getProductFavoriteMeta } from '../../api/queries/points-mall';
import { getProductCoupons } from '../../api/queries/coupon';
import { addItemToOrder } from '../../api/mutations/cart';
import { applyFlashSale } from '../../api/mutations/promotion';
import {
    attachCouponToOrder,
    detachCouponFromOrder,
    templateHasChannel,
    couponErrorMessage,
} from '../../api/mutations/coupon';
import { useCartStore } from '../../stores/cart';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { useTenantStore } from '../../stores/tenant';
import { getActiveOrder } from '../../api/queries/order';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import SkuSheet from '../../components/SkuSheet.vue';
import ProductPoster from '../../components/product-poster/product-poster.vue';
import { pickTranslation } from '../../utils/locale';
import { stripHtmlToText, buildShareMeta, sanitizeRichHtml } from '../../utils/html';
import MpHtml from 'mp-html/dist/uni-app/components/mp-html/mp-html.vue';
import ReviewItem from '../../components/ReviewItem.vue';
import { useI18n } from 'vue-i18n';
import { getProductReviews, getReviewStats } from '../../api/queries/review';

const product = ref<any>(null);
const { t } = useI18n();
const isFavorited = ref(false);
const favoriteCount = ref(0);
const previewReviews = ref<any[]>([]);
const reviewTotal = ref(0);
const reviewStats = ref<any>(null);
const selectedOptions = ref<Record<string, string>>({});
const cart = useCartStore();
const auth = useAuthStore();
const ui = useUIStore();
const tenant = useTenantStore();
const showPoster = ref(false);
const showSku = ref(false);
const showPriceNote = ref(false);
const skuIntent = ref<'cart' | 'buy'>('cart');
const flashSaleActivityId = ref('');

let pendingAction: 'cart' | 'buy' | null = null;
let offLogin: (() => void) | null = null;

const selectedVariant = computed(() => {
    if (!product.value?.variants?.length) return null;
    const opts = Object.values(selectedOptions.value);
    return product.value.variants.find((v: any) =>
        v.options?.every((o: any) => opts.includes(o.id))
    ) || product.value.variants[0];
});

const sellingPoint = computed(() => (product.value?.customFields?.sellingPoint as string) ?? '');
// 商品描述来自后台富文本：渲染前白名单净化，防存储型 XSS（mp-html H5 走 innerHTML）
const descHtml = computed(() => sanitizeRichHtml(pickTranslation(product.value?.translations || [])));
const mainVideo = computed(() => {
    const vid = product.value?.customFields?.videoAssetId;
    if (!vid) return null;
    return (product.value?.assets || []).find((a: any) => String(a.id) === String(vid)) || null;
});

const isFlash = computed(() => !!flashSaleActivityId.value);

const displayPrice = computed(() => selectedVariant.value?.priceWithTax || 0);

/** 划线原价：秒杀时同 variant 的常规价；取不到或低于现价则不显示 */
const originPrice = computed(() => {
    const p = selectedVariant.value?.priceWithTax;
    if (!isFlash.value || !Number.isFinite(p)) return '';
    return (p / 100).toFixed(2);
});

// ── 会员价标签（仅展示）：登录后按等级×分类命中 MemberPriceRule；不改价格链路 ──
const memberPrice = ref<{ applied: boolean; discountPercent: number | null } | null>(null);

/** discountPercent 语义：95 = 95 折 → 展示「会员9.5折」 */
const memberPriceLabel = computed(() => {
    const dp = memberPrice.value;
    if (!dp?.applied || !dp.discountPercent || dp.discountPercent >= 100) return '';
    const zhe = dp.discountPercent / 10;
    const zheText = zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1);
    return `会员${zheText}折`;
});

/** 折后参考价（当前变体价 × 折扣，向下取整到分），仅参考、以结算页为准 */
const memberRefPrice = computed(() => {
    const dp = memberPrice.value;
    const p = displayPrice.value;
    if (!dp?.applied || !dp.discountPercent || !Number.isFinite(p)) return '';
    return (Math.floor((p * dp.discountPercent) / 100) / 100).toFixed(2);
});

/** 拉取失败/未登录静默降级：标签不渲染，不阻塞商品主内容 */
async function loadMemberPrice() {
    const pid = product.value?.id;
    if (!pid || !auth.isLoggedIn) {
        memberPrice.value = null;
        return;
    }
    try {
        const list = await getMyMemberPrice([String(pid)]);
        memberPrice.value = list[0] ?? null;
    } catch (e) {
        memberPrice.value = null;
    }
}

/** 降级：无数据源则不渲染 */
const salesCountText = computed(() => {
    const n = (product.value as any)?.customFields?.salesCount;
    return Number.isFinite(Number(n)) && Number(n) > 0 ? String(n) : '';
});
const pointsText = computed(() => {
    const n = (product.value as any)?.customFields?.pointsReward;
    return Number.isFinite(Number(n)) && Number(n) > 0 ? t('product.pointsReward', { n }) : '';
});

const pickedSummary = computed(() => {
    const names = (product.value?.optionGroups || [])
        .map((g: any) => (g.options || []).find((o: any) => o.id === selectedOptions.value[g.id])?.name)
        .filter(Boolean);
    if (names.length) return names.join(' / ');
    // 单规格商品（无规格组）没有「未选」状态：与 SkuSheet.pickedText 同口径，取当前变体名
    if (!(product.value?.optionGroups || []).length) return selectedVariant.value?.name || '请选择规格';
    return '请选择规格';
});

/** variantId → 规格文案（如「红色 / L」），供 ReviewItem 展示规格行 */
const variantTextMap = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const v of product.value?.variants || []) {
        map[String(v.id)] = (v.options || []).map((o: any) => o.name).join(' / ');
    }
    return map;
});

function openSku(intent: 'cart' | 'buy' = 'cart') {
    skuIntent.value = intent;
    showSku.value = true;
}

async function onSkuAction(payload: { action: 'cart' | 'buy'; variantId: string; quantity: number }) {
    showSku.value = false;
    if (payload.action === 'buy' && !auth.isLoggedIn) {
        pendingAction = 'buy';
        uni.navigateTo({ url: '/pages/login/index' });
        return;
    }
    await addVariant(payload.variantId, payload.quantity);
    if (payload.action === 'buy') {
        uni.navigateTo({ url: '/pkg-order/pages/checkout' });
    }
}

/** 加购 + 秒杀活动落单（活动价必须由后端应用，前端不自行算折扣） */
async function addVariant(variantId: string, quantity: number) {
    try {
        await addItemToOrder(variantId, quantity);
        if (flashSaleActivityId.value) {
            await applyFlashSale(flashSaleActivityId.value);
        }
        const res: any = await getActiveOrder();
        if (res.activeOrder) cart.setOrder(res.activeOrder);
        ui.showToast('已加入购物车', 'success');
    } catch (e: any) {
        ui.showToast(e.message);
    }
}

function contactService() {
    ui.showToast('客服功能敬请期待');
}
/** 收藏元信息（进入页面静默拉取，失败不阻塞商品主内容） */
async function loadFavoriteMeta() {
    const pid = product.value?.id;
    if (!pid) return;
    try {
        const r: any = await getProductFavoriteMeta(String(pid));
        favoriteCount.value = r?.productFavoriteMeta?.favoriteCount ?? 0;
        isFavorited.value = !!r?.productFavoriteMeta?.myFavorited;
    } catch (e) { /* 静默 */ }
}

async function onFavorite() {
    if (!product.value?.id) return;
    if (!auth.isLoggedIn) {
        uni.showToast({ title: '请先登录', icon: 'none' });
        uni.navigateTo({ url: '/pages/login/index' });
        return;
    }
    const pid = String(product.value.id);
    const next = !isFavorited.value;
    // 乐观更新，失败回滚
    isFavorited.value = next;
    favoriteCount.value = Math.max(0, favoriteCount.value + (next ? 1 : -1));
    try {
        const r: any = await toggleProductFavorite(pid);
        isFavorited.value = !!r?.toggleProductFavorite?.favorited;
        favoriteCount.value = r?.toggleProductFavorite?.favoriteCount ?? favoriteCount.value;
        uni.showToast({ title: next ? '收藏成功' : '已取消收藏', icon: 'none' });
    } catch (e: any) {
        isFavorited.value = !next;
        favoriteCount.value = Math.max(0, favoriteCount.value + (next ? -1 : 1));
        uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || '操作失败', icon: 'none' });
    }
}
function goCart() {
    uni.switchTab({ url: '/pages/cart/index' });
}
function shareNow() {
    ui.showToast('请点击右上角分享');
}

onMounted(async () => {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    const slug = page?.options?.slug;
    flashSaleActivityId.value = String(page?.options?.flashSaleActivityId || '');
    if (!slug) return;
    try {
        const res: any = await getProduct(slug);
        product.value = res.product;
        // Auto-select first options
        if (product.value?.optionGroups) {
            product.value.optionGroups.forEach((g: any) => {
                if (g.options?.length > 0) selectedOptions.value[g.id] = g.options[0].id;
            });
        }
    } catch (e) { console.error(e); }
    loadFavoriteMeta();
    await loadReviews();
    loadAddons();
    loadMemberPrice();
    // WeChat share
    if (product.value) {
      const meta = buildShareMeta({
        productName: product.value.name || '',
        featureImage: product.value.featuredAsset?.preview || '',
        assetsImages: (product.value.assets || []).map((a: any) => a.preview).filter(Boolean),
        textDescription: stripHtmlToText(pickTranslation(product.value.translations || [])),
        shareImageUrl: tenant.shareImageUrl || '',
        shopName: tenant.shopName || '',
        shopIntro: tenant.shopIntro || '',
        origin: window.location.origin,
        defaultImage: '/static/share-default.jpg',
        defaultTitle: 'Youshop - 精选好物',
        defaultDesc: '精选好物推荐',
      });
      useProductShare(meta.title, slug, meta.imgUrl, meta.desc);
    }
});

onMounted(async () => {
    offLogin = auth.onLogin(async () => {
        loadMemberPrice();
        if (pendingAction === 'cart') {
            pendingAction = null;
            if (selectedVariant.value) await addVariant(selectedVariant.value.id, 1);
        } else if (pendingAction === 'buy') {
            pendingAction = null;
            if (selectedVariant.value) await addVariant(selectedVariant.value.id, 1);
            uni.navigateTo({ url: '/pkg-order/pages/checkout' });
        } else {
            try {
                const res: any = await getActiveOrder();
                if (res.activeOrder) cart.setOrder(res.activeOrder);
            } catch (e) {}
        }
    });
});

/** 评价区：两个查询并行；任一失败或 totalItems === 0 → 整块不渲染，不阻塞商品主内容 */
async function loadReviews() {
    const pid = product.value?.id;
    if (!pid) return;
    const [listRes, statsRes] = await Promise.allSettled([
        getProductReviews(String(pid), { take: 2 }),
        getReviewStats(String(pid)),
    ]);
    if (listRes.status !== 'fulfilled') return;
    const list: any = listRes.value;
    reviewTotal.value = list.productReviews?.totalItems || 0;
    previewReviews.value = list.productReviews?.items || [];
    if (reviewTotal.value === 0) return;
    if (statsRes.status === 'fulfilled') reviewStats.value = (statsRes.value as any).reviewStats;
}

function goReviewList() {
    if (!product.value?.slug) return;
    uni.navigateTo({ url: '/pkg-product/pages/evaluate?slug=' + product.value.slug });
}

// ── 超值加价购：券价随主订单结算（attachCouponToOrder） ──
const addonBindings = ref<any[]>([]);
const attachingTplId = ref('');
const attachedTplIds = ref<Set<string>>(new Set());

/** 加价购可售券：渠道含 SALE 且 salePrice>0；排除纯到店券（到店券不可线上加购） */
const addonCoupons = computed(() =>
    addonBindings.value.filter(
        (b: any) =>
            b.enabled && !!b.template &&
            templateHasChannel(b.template, 'SALE') &&
            (b.template.salePrice ?? 0) > 0 &&
            String(b.template.usageScene || 'ONLINE').toUpperCase() !== 'IN_STORE',
    ),
);

/** 加载失败静默降级：加价购块不渲染，不阻塞商品主内容 */
async function loadAddons() {
    const pid = product.value?.id;
    if (!pid) return;
    try {
        const res: any = await getProductCoupons(String(pid));
        addonBindings.value = res.productCoupons || [];
    } catch (e) {}
}

function isAddonAttached(b: any): boolean {
    return attachedTplIds.value.has(b.template?.id);
}

/** 取活动订单 id；未登录/无活动订单返回 null */
async function ensureOrderId(): Promise<string | null> {
    try {
        const res: any = await getActiveOrder();
        if (res.activeOrder) {
            cart.setOrder(res.activeOrder);
            return res.activeOrder.id;
        }
    } catch (e) {}
    return null;
}

async function attachAddon(b: any) {
    const tplId = b.template?.id;
    if (!tplId || attachingTplId.value) return;
    if (!auth.isLoggedIn) {
        uni.navigateTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-product/pages/detail?slug=' + (product.value?.slug || '')) });
        return;
    }
    attachingTplId.value = tplId;
    try {
        const orderId = await ensureOrderId();
        if (!orderId) {
            ui.showToast('请先将商品加入购物车');
            return;
        }
        await attachCouponToOrder(orderId, tplId);
        const next = new Set(attachedTplIds.value);
        next.add(tplId);
        attachedTplIds.value = next;
        ui.showToast('已加入订单，随单结算', 'success');
    } catch (e: any) {
        ui.showToast(couponErrorMessage(e));
    }
    attachingTplId.value = '';
}

async function detachAddon(b: any) {
    const tplId = b.template?.id;
    if (!tplId) return;
    try {
        const orderId = await ensureOrderId();
        if (!orderId) return;
        await detachCouponFromOrder(orderId, tplId);
        const next = new Set(attachedTplIds.value);
        next.delete(tplId);
        attachedTplIds.value = next;
        ui.showToast('已移除加价购券', 'success');
    } catch (e: any) {
        ui.showToast(couponErrorMessage(e));
    }
}

/** 分 → 元（去尾零） */
function yuan(cents: any): string {
    const n = Number(cents) || 0;
    return (n / 100).toFixed(n % 100 === 0 ? 0 : 2);
}

function addonType(b: any): string {
    return b.template?.type || 'FIXED';
}

function addonAmount(b: any): string {
    const tpl = b.template || {};
    if (tpl.type === 'FREE_SHIPPING') return '免邮';
    if (tpl.type === 'PERCENT') {
        const zhe = (tpl.discountValue || 0) / 10;
        return zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1);
    }
    return ((tpl.discountValue || 0) / 100).toString();
}

function addonCondition(b: any): string {
    const tpl = b.template || {};
    const minSpend = tpl.minSpend ? tpl.minSpend / 100 : 0;
    if (tpl.type === 'FREE_SHIPPING') return '免配送费';
    if (!minSpend) return '无门槛';
    return `满${minSpend}可用`;
}

function addonValidity(b: any): string {
    const tpl = b.template || {};
    if (tpl.endsAt) return `有效期至 ${String(tpl.endsAt).slice(0, 10)}`;
    if (tpl.validDays) return `领取后${tpl.validDays}天有效`;
    return '';
}

onUnmounted(() => {
    if (offLogin) offLogin();
});
</script>

<style lang="scss" scoped>
.product-detail {
    padding-bottom: 120rpx;
    &__info { background: #fff; padding: 20rpx; }
    &__name { font-size: 32rpx; font-weight: bold; margin-top: 16rpx; display: block; }
    &__bar { position: fixed; bottom: 0; left: 0; right: 0; height: 100rpx; background: #fff; display: flex; gap: 16rpx; padding: 0 20rpx; align-items: center; box-shadow: $shadow; }
    &__cart-btn { flex: 1; height: 80rpx; background: $brand-color-light; color: $brand-color; font-size: 28rpx; border-radius: $radius-md; border: none; }
    &__buy-btn { flex: 1; height: 80rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; border: none; }
}
.price-row { display: flex; align-items: baseline; gap: 12rpx; }
.price-row__origin { font-size: 24rpx; color: #999; text-decoration: line-through; }
.price-row__badge { font-size: 20rpx; color: #fff; background: $price-color; border-radius: 8rpx; padding: 2rpx 10rpx; }
.price-row__member { font-size: 20rpx; color: $price-color; border: 1rpx solid $price-color; border-radius: 8rpx; padding: 0 10rpx; }
.price-row__member-ref { font-size: 22rpx; color: $price-color; }
.price-note { display: flex; align-items: center; gap: 6rpx; margin-top: 8rpx; &__text { font-size: 22rpx; color: #999; } &__arrow { font-size: 22rpx; color: #999; } }
.meta-row { display: flex; align-items: center; gap: 32rpx; margin-top: 16rpx; &__share { display: flex; align-items: center; gap: 6rpx; } &__item { display: flex; align-items: center; } &__icon { font-size: 26rpx; color: $text-color-secondary; } &__text { font-size: 24rpx; color: $text-color-secondary; } }
.sku-entry { display: flex; align-items: center; gap: 12rpx; margin-top: 20rpx; padding: 16rpx 0; border-top: 1rpx solid $border-color;
    &__label { font-size: 26rpx; color: $text-color-secondary; }
    &__value { flex: 1; font-size: 26rpx; color: $text-color; }
    &__arrow { font-size: 26rpx; color: #ccc; }
}
.product-detail__bar { justify-content: space-between; gap: 8rpx; }
.bar-ico { display: flex; flex-direction: column; align-items: center; width: 88rpx; &__g { font-size: 32rpx; &--fav { color: #ff4d4f; } } &__t { font-size: 20rpx; color: $text-color-secondary; } }
.note-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 210; display: flex; align-items: center; justify-content: center; }
.note-sheet { width: 620rpx; background: #fff; border-radius: $radius-md; padding: 32rpx; display: flex; flex-direction: column; gap: 20rpx;
    &__title { font-size: 30rpx; font-weight: bold; }
    &__body { font-size: 26rpx; color: $text-color-secondary; line-height: 1.6; }
    &__ok { text-align: center; color: $brand-color; font-size: 28rpx; padding-top: 8rpx; }
}
.product-detail__rich { margin-top: 16rpx; background: #fff; }
.addon-block {
    margin-top: 16rpx; background: #fff; padding: 20rpx;
    &__head { display: flex; align-items: baseline; gap: 12rpx; }
    &__title { font-size: 28rpx; font-weight: bold; color: $brand-color; }
    &__sub { font-size: 20rpx; color: #bbb; }
}
.addon-row {
    display: flex; align-items: stretch; margin-top: 16rpx;
    border: 1rpx dashed $border-color; border-radius: $radius-sm; overflow: hidden;
    &--attached { border: 1rpx solid #0f8a43; background: rgba(15, 138, 67, 0.06); }
    &__left {
        width: 160rpx; background: $brand-color; color: #fff;
        display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16rpx 0;
    }
    &__amount { display: flex; align-items: baseline; }
    &__cny { font-size: 22rpx; font-weight: bold; }
    &__value { font-size: 44rpx; font-weight: bold; line-height: 1; }
    &__cond { font-size: 18rpx; opacity: 0.9; margin-top: 4rpx; }
    &__mid { flex: 1; min-width: 0; padding: 14rpx 16rpx; display: flex; flex-direction: column; justify-content: center; gap: 6rpx; }
    &__name { font-size: 26rpx; font-weight: bold; color: $text-color; display: flex; align-items: center; gap: 10rpx; }
    &__tag { font-size: 18rpx; color: $brand-color; background: rgba(255, 102, 0, 0.08); border-radius: 6rpx; padding: 2rpx 10rpx; font-weight: normal; }
    &__meta { font-size: 20rpx; color: #999; }
    &__btn {
        width: 150rpx; border: none; background: $brand-color; color: #fff;
        font-size: 26rpx; font-weight: bold; line-height: 1.4; padding: 0; border-radius: 0;
        &::after { border: none; }
        &[disabled] { opacity: 0.7; }
        &--on { background: #f5f5f5; color: $text-color-secondary; border-left: 1rpx solid $border-color; }
    }
    &__btn-sub { display: block; font-size: 18rpx; font-weight: normal; opacity: 0.85; }
}
.rich__video { padding: 16rpx 0; }
.rich__video-tag { width: 100%; height: 380rpx; display: block; }
.rich__sp { display: block; padding: 0 20rpx 8rpx; font-size: 26rpx; color: $text-color-secondary; }
.rich__mp { padding: 0 20rpx 20rpx; }
.review-block { margin-top: 16rpx; background: #fff; padding: 20rpx;
    &__head { display: flex; align-items: center; justify-content: space-between; }
    &__title { font-size: 28rpx; font-weight: bold; color: $text-color; }
    &__more { font-size: 24rpx; color: $text-color-secondary; }
    &__summary { display: flex; align-items: center; gap: 12rpx; margin-top: 12rpx; padding-bottom: 8rpx; }
    &__score { font-size: 26rpx; color: $price-color; font-weight: bold; }
    &__sep { font-size: 22rpx; color: #ddd; }
    &__rate { font-size: 24rpx; color: $text-color-secondary; }
}
</style>
