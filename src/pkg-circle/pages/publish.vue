<template>
  <view class="publish-page">
    <view class="publish-page__form">
      <view class="publish-page__field">
        <input
          v-model="title"
          class="publish-page__input"
          :maxlength="50"
          placeholder="标题（选填，50 字以内）"
          placeholder-class="publish-page__placeholder"
        />
        <text class="publish-page__count">{{ title.length }}/50</text>
      </view>
      <view class="publish-page__field">
        <textarea
          v-model="content"
          class="publish-page__textarea"
          :maxlength="2000"
          placeholder="分享你的购物心得…"
          placeholder-class="publish-page__placeholder"
        />
      </view>
      <view class="publish-page__field">
        <text class="publish-page__label">图片（最多 6 张）</text>
        <ImageUpload v-model="images" :maxCount="6" />
      </view>
      <view class="publish-page__field">
        <text class="publish-page__label">关联商品（可选）</text>
        <view v-if="product" class="publish-page__product">
          <image class="publish-page__product-img" :src="product.preview" mode="aspectFill" />
          <view class="publish-page__product-info">
            <text class="publish-page__product-name">{{ product.name }}</text>
            <PriceTag :price="product.price" />
          </view>
          <text class="publish-page__product-remove" @tap="clearProduct">移除</text>
        </view>
        <view v-else class="publish-page__picker">
          <view class="publish-page__search">
            <input
              v-model="keyword"
              class="publish-page__search-input"
              :maxlength="50"
              confirm-type="search"
              placeholder="输入商品名搜索"
              placeholder-class="publish-page__placeholder"
              @confirm="doSearch"
            />
            <text class="publish-page__search-btn" @tap="doSearch">搜索</text>
          </view>
          <view v-if="searching" class="publish-page__hint">搜索中…</view>
          <view v-else-if="candidates.length" class="publish-page__candidates">
            <view
              v-for="item in candidates"
              :key="item.productId"
              class="publish-page__candidate"
              @tap="pickProduct(item)"
            >
              <image class="publish-page__candidate-img" :src="item.preview" mode="aspectFill" />
              <view class="publish-page__candidate-info">
                <text class="publish-page__candidate-name">{{ item.name }}</text>
                <PriceTag :price="item.price" />
              </view>
            </view>
          </view>
          <view v-else-if="searched" class="publish-page__hint">未找到相关商品</view>
        </view>
      </view>
    </view>
    <button class="publish-page__submit" :disabled="submitting" @tap="doSubmit">
      {{ submitting ? '发布中…' : '发布' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { createCirclePost } from '../../api/queries/circle';
import { searchProducts } from '../../api/queries/product';
import { useAuthStore } from '../../stores/auth';
import ImageUpload from '../../components/ImageUpload.vue';
import PriceTag from '../../components/PriceTag.vue';

const authStore = useAuthStore();

// 游客进发布页直接引导登录（createCirclePost 需登录）
authStore.requireLogin('/pkg-circle/pages/publish');

const title = ref('');
const content = ref('');
const images = ref<string[]>([]);
const submitting = ref(false);

interface ProductCandidate { productId: string; name: string; preview: string; price: number; }

const keyword = ref('');
const candidates = ref<ProductCandidate[]>([]);
const product = ref<ProductCandidate | null>(null);
const searching = ref(false);
const searched = ref(false);

/** 关键词搜索商品（shop-api search，groupByProduct 口径与分类页一致） */
async function doSearch() {
    const term = keyword.value.trim();
    if (!term || searching.value) return;
    searching.value = true;
    try {
        const res: any = await searchProducts({ term, take: 10 });
        candidates.value = (res.search?.items || []).map((it: any) => ({
            productId: String(it.productId),
            name: it.productName,
            preview: it.productAsset?.preview || '',
            price: it.priceWithTax?.value ?? it.priceWithTax?.min ?? 0,
        }));
    } catch (e) {
        candidates.value = [];
        uni.showToast({ title: '搜索失败', icon: 'none' });
    }
    searched.value = true;
    searching.value = false;
}

function pickProduct(item: ProductCandidate) {
    product.value = item;
    keyword.value = '';
    candidates.value = [];
    searched.value = false;
}

function clearProduct() {
    product.value = null;
}

async function doSubmit() {
    if (!content.value.trim()) {
        uni.showToast({ title: '请填写正文', icon: 'none' });
        return;
    }
    if (submitting.value) return;
    submitting.value = true;
    try {
        await createCirclePost({
            title: title.value.trim() || null,
            content: content.value.trim(),
            images: images.value.length ? images.value : null,
            productId: product.value?.productId || null,
        });
        uni.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(() => uni.navigateBack(), 600);
    } catch (e: any) {
        uni.showToast({ title: e?.message || '发布失败', icon: 'none' });
    }
    submitting.value = false;
}
</script>

<style lang="scss" scoped>
.publish-page {
    min-height: 100vh; background: $bg-color; padding: 20rpx;
    &__form { background: #fff; border-radius: $radius-md; padding: 24rpx; }
    &__field { margin-bottom: 24rpx; position: relative; }
    &__input {
        height: 88rpx; background: $bg-color; border-radius: $radius-md; padding: 0 24rpx;
        font-size: 28rpx; padding-right: 120rpx;
    }
    &__count { position: absolute; right: 24rpx; top: 30rpx; font-size: 22rpx; color: #999; }
    &__textarea {
        width: 100%; height: 320rpx; background: $bg-color; border-radius: $radius-md;
        padding: 24rpx; font-size: 28rpx; box-sizing: border-box;
    }
    &__label { display: block; font-size: 26rpx; color: #666; margin-bottom: 16rpx; }
    &__placeholder { color: #bbb; }
    &__search { display: flex; align-items: center; }
    &__search-input {
        flex: 1; height: 72rpx; background: $bg-color; border-radius: $radius-md;
        padding: 0 24rpx; font-size: 26rpx;
    }
    &__search-btn { margin-left: 16rpx; font-size: 26rpx; color: $brand-color; }
    &__hint { margin-top: 16rpx; font-size: 24rpx; color: #999; }
    &__candidates { margin-top: 8rpx; max-height: 480rpx; overflow-y: auto; }
    &__candidate {
        display: flex; align-items: center; padding: 12rpx 0;
        &-img { width: 88rpx; height: 88rpx; border-radius: $radius-sm; background: $bg-color; flex-shrink: 0; }
        &-info { flex: 1; margin-left: 16rpx; min-width: 0; }
        &-name {
            display: block; font-size: 26rpx; color: #333; margin-bottom: 4rpx;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
    }
    &__product {
        display: flex; align-items: center; background: $bg-color; border-radius: $radius-md; padding: 16rpx;
        &-img { width: 88rpx; height: 88rpx; border-radius: $radius-sm; background: #fff; flex-shrink: 0; }
        &-info { flex: 1; margin-left: 16rpx; min-width: 0; }
        &-name {
            display: block; font-size: 26rpx; color: #333; margin-bottom: 4rpx;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        &-remove { font-size: 24rpx; color: #999; padding: 8rpx; }
    }
    &__submit {
        margin-top: 40rpx; background: $brand-color; color: #fff; height: 88rpx; line-height: 88rpx;
        font-size: 30rpx; border-radius: $radius-md;
        &[disabled] { opacity: 0.6; }
    }
}
</style>
