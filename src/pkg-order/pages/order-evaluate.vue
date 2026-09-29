<template>
  <view class="oe-page">
    <view v-if="!blocks.length && loaded" class="oe-empty">
      <EmptyState :text="t('review.reviewed')" />
    </view>

    <view v-for="(b, idx) in blocks" :key="b.lineId" class="oe-block">
      <text v-if="blocks.length > 1" class="oe-block__index">{{ t('review.goodsIndex', { n: idx + 1 }) }}</text>
      <view class="oe-goods">
        <VImage :src="b.image" width="140rpx" height="140rpx" />
        <view class="oe-goods__info">
          <text class="oe-goods__name">{{ b.name }}</text>
          <text v-if="b.spec" class="oe-goods__spec">{{ b.spec }}</text>
          <view class="oe-goods__bottom">
            <text class="oe-goods__price">¥{{ (b.price / 100).toFixed(2) }}</text>
            <text class="oe-goods__qty">x{{ b.quantity }}</text>
          </view>
        </view>
      </view>

      <view class="oe-rate">
        <text class="oe-rate__label">{{ t('review.scoreLabel') }}</text>
        <text class="oe-rate__hint">{{ ratingHint(b.rating) }}</text>
        <view class="oe-rate__stars">
          <text
            v-for="n in 5"
            :key="n"
            class="oe-rate__star"
            :class="{ active: n <= b.rating }"
            @click="b.rating = n"
          >★</text>
        </view>
      </view>

      <textarea
        v-model="b.content"
        class="oe-textarea"
        :maxlength="260"
        :placeholder="t('review.contentPlaceholder')"
      />

      <text class="oe-upload-label">{{ t('review.uploadHint') }}</text>
      <ImageUpload v-model="b.images" :max-count="6" />

      <view class="oe-anon">
        <text class="oe-anon__text">{{ t('review.publicProfile') }}</text>
        <switch :checked="!b.isAnonymous" color="#ff6600" @change="b.isAnonymous = !$event.detail.value" />
      </view>
    </view>

    <view v-if="blocks.length" class="oe-bar">
      <button class="oe-submit" :disabled="submitting" @click="onSubmit">
        {{ submitting ? t('review.submit') + '...' : t('review.submit') }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getOrderByCode } from '../../api/queries/order';
import { getMyReviews, createReview } from '../../api/queries/review';
import { useAuthStore } from '../../stores/auth';
import VImage from '../../components/VImage.vue';
import ImageUpload from '../../components/ImageUpload.vue';
import EmptyState from '../../components/EmptyState.vue';

interface Block {
    lineId: string;
    productId: string;
    variantId: string;
    name: string;
    spec: string;
    image: string;
    price: number;
    quantity: number;
    rating: number;
    content: string;
    images: string[];
    isAnonymous: boolean;
}

const { t } = useI18n();
const auth = useAuthStore();
const blocks = ref<Block[]>([]);
const loaded = ref(false);
const submitting = ref(false);

/** 星级 → 档位文案，与 usemall 一致：1 差评、2/3 中评、4/5 好评 */
function ratingHint(rating: number): string {
    if (rating <= 1) return t('review.bad');
    if (rating <= 3) return t('review.middle');
    return t('review.good');
}

onMounted(async () => {
    // 先解析 code，再判登录：要求登录时能把 code 带进 redirect，登录后回到本单
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    const code = page?.options?.code;
    if (!code) return;
    if (!auth.isLoggedIn) {
        auth.requireLogin('/pkg-order/pages/order-evaluate?code=' + code);
        return;
    }

    const orderRes: any = await getOrderByCode(code);
    const order = orderRes.orderByCode;
    if (!order) return;

    // 已评 orderLine 集合：myReviews 全量返回，用 orderLineId 建 Set
    const reviewed = new Set<string>();
    try {
        const myRes: any = await getMyReviews();
        for (const r of myRes.myReviews || []) {
            if (r.orderLineId && r.status !== 'deleted') reviewed.add(String(r.orderLineId));
        }
    } catch (e) {
        console.error(e);
    }

    blocks.value = (order.lines || [])
        .filter((line: any) => !reviewed.has(String(line.id)))
        .map((line: any) => ({
            lineId: String(line.id),
            productId: String(line.productVariant?.productId || ''),
            variantId: String(line.productVariant?.id || ''),
            name: line.productVariant?.name || '',
            spec: (line.productVariant?.options || []).map((o: any) => o.name).join(' / '),
            image: line.featuredAsset?.preview || '',
            price: line.unitPriceWithTax || 0,
            quantity: line.quantity || 1,
            rating: 5,
            content: '',
            images: [],
            isAnonymous: false,
        }))
        .filter((b: Block) => !!b.productId);
    loaded.value = true;
});

async function onSubmit() {
    if (submitting.value) return;
    // 1) 前端拦截必填（vendure createReview 的 assertContent 要求 content 非空）
    for (const b of blocks.value) {
        if (!b.content.trim()) {
            uni.showToast({ title: t('review.contentRequired'), icon: 'none' });
            return;
        }
    }
    // 2) 二次确认
    const confirmed = await new Promise<boolean>((resolve) => {
        uni.showModal({
            title: t('review.submit'),
            content: t('review.title'),
            success: (r: any) => resolve(!!r.confirm),
            fail: () => resolve(false),
        });
    });
    if (!confirmed) return;

    submitting.value = true;
    const attempted = blocks.value.length;
    const failed: Block[] = [];
    const errors: string[] = [];
    for (const b of blocks.value) {
        try {
            await createReview({
                productId: b.productId,
                orderLineId: b.lineId,
                variantId: b.variantId,
                rating: b.rating,
                content: b.content.trim(),
                images: b.images,
                isAnonymous: b.isAnonymous,
            });
        } catch (e: any) {
            // graphql-request 的 ClientError 把后端 UserInputError 放在 response.errors[0].message
            const msg = String(e?.response?.errors?.[0]?.message || e?.message || e);
            // 后端对「同一 orderLine 已评过」抛 UserInputError('You have already reviewed this order line')：
            // 视为已评，从待提交表单移除，不计入失败
            if (/already reviewed/i.test(msg)) continue;
            errors.push(msg);
            failed.push(b);
        }
    }
    submitting.value = false;

    if (failed.length) {
        blocks.value = failed;
        // 全部失败 → toast 后端错误原文；部分失败 → toast 失败条数（spec §5）
        const title = failed.length === attempted && errors.length
            ? errors[0]
            : t('review.partialFailed', { n: failed.length });
        uni.showToast({ title, icon: 'none' });
        return;
    }
    uni.showToast({ title: t('review.submitted'), icon: 'none' });
    setTimeout(() => uni.navigateBack(), 1200);
}
</script>

<style lang="scss" scoped>
.oe-page { padding: 20rpx 20rpx 140rpx; }
.oe-empty { padding-top: 120rpx; }
.oe-block { background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx;
    &__index { font-size: 24rpx; color: $text-color-secondary; display: block; margin-bottom: 12rpx; }
}
.oe-goods { display: flex; gap: 16rpx;
    &__info { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
    &__name { font-size: 26rpx; color: $text-color; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    &__spec { font-size: 22rpx; color: #999; margin-top: 4rpx; }
    &__bottom { display: flex; justify-content: space-between; align-items: center; }
    &__price { font-size: 28rpx; color: $price-color; }
    &__qty { font-size: 24rpx; color: #999; }
}
.oe-rate { display: flex; align-items: center; gap: 16rpx; margin-top: 20rpx;
    &__label { font-size: 26rpx; color: $text-color; }
    &__hint { font-size: 24rpx; color: $brand-color; }
    &__stars { display: flex; gap: 8rpx; margin-left: auto; }
    &__star { font-size: 40rpx; color: #ddd; &.active { color: $price-color; } }
}
.oe-textarea { width: 100%; min-height: 180rpx; margin-top: 16rpx; padding: 16rpx; font-size: 26rpx; background: #f7f7f7; border-radius: $radius-sm; box-sizing: border-box; }
.oe-upload-label { display: block; margin: 16rpx 0 8rpx; font-size: 24rpx; color: $text-color-secondary; }
.oe-anon { display: flex; align-items: center; justify-content: space-between; margin-top: 16rpx;
    &__text { font-size: 26rpx; color: $text-color; }
}
.oe-bar { position: fixed; left: 0; right: 0; bottom: 0; padding: 16rpx 20rpx calc(16rpx + env(safe-area-inset-bottom)); background: #fff; }
.oe-submit { width: 100%; height: 84rpx; font-size: 30rpx; border-radius: $radius-md; border: none; background: $brand-color; color: #fff; }
</style>
