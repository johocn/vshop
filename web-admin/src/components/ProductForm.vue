<template>
  <view class="form">
    <view class="card">
      <view class="cell">
        <text class="lbl">商品名</text>
        <input v-model="d.name" placeholder="必填" />
      </view>
      <view class="cell">
        <text class="lbl">Slug</text>
        <input v-model="d.slug" placeholder="URL 别名" />
      </view>
      <view class="cell col">
        <text class="lbl">描述</text>
        <textarea v-model="d.description" class="ta" placeholder="商品描述" />
      </view>
      <view class="cell">
        <text class="lbl">价格（元）</text>
        <input v-model="d.priceYuan" type="digit" placeholder="0.00" />
      </view>
      <view class="cell">
        <text class="lbl">库存（件）</text>
        <input v-model="d.stock" type="number" placeholder="0" />
      </view>
    </view>

    <view class="card">
      <picker mode="selector" :range="spNames" @change="onSpChange">
        <view class="cell row-in">
          <text class="lbl">配送档案</text>
          <text class="val">{{ spName }}</text>
        </view>
      </picker>
      <picker mode="selector" :range="ppNames" @change="onPpChange">
        <view class="cell row-in">
          <text class="lbl">支付档案</text>
          <text class="val">{{ ppName }}</text>
        </view>
      </picker>
      <picker mode="selector" :range="catNames" @change="onCatChange">
        <view class="cell row-in">
          <text class="lbl">分类</text>
          <text class="val">{{ catName }}</text>
        </view>
      </picker>
      <view class="cell row-in">
        <text class="lbl">上架</text>
        <switch :checked="d.enabled" @change="onToggle" />
      </view>
    </view>

    <view class="card">
      <view class="img-title">商品图片</view>
      <ImagePicker :max="9" :value="d.assetIds" @change="onImg" />
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, reactive, computed, onMounted } from 'vue';
import ImagePicker from './ImagePicker.vue';
import { fetchShippingProfiles, type ShippingProfileItem } from '../apis/shipping-profile';
import { fetchPaymentProfiles, type PaymentProfileItem } from '../apis/payment-profile';
import { fetchCollectionsOptimized, type CollectionItem } from '../apis/collection';

interface ProductDraft {
  name: string;
  slug: string;
  description: string;
  priceYuan: number;
  stock: number;
  enabled: boolean;
  assetIds: string[];
  shippingProfileId?: string;
  paymentProfileId?: string;
  collectionId?: string;
}

const props = defineProps<{
  initial?: Partial<{
    name?: string;
    slug?: string;
    description?: string;
    priceYuan?: number;
    stock?: number;
    enabled?: boolean;
    assetIds?: string[];
    shippingProfileId?: string;
    paymentProfileId?: string;
    collectionId?: string;
  }>;
}>();

const emit = defineEmits<{ (e: 'submit', d: ProductDraft): void }>();

const d = reactive<ProductDraft>({
  name: props.initial?.name || '',
  slug: props.initial?.slug || '',
  description: props.initial?.description || '',
  priceYuan: props.initial?.priceYuan ?? 0,
  stock: props.initial?.stock ?? 0,
  enabled: props.initial?.enabled ?? false,
  assetIds: props.initial?.assetIds ? [...props.initial.assetIds] : [],
  shippingProfileId: props.initial?.shippingProfileId,
  paymentProfileId: props.initial?.paymentProfileId,
  collectionId: props.initial?.collectionId,
});

const spList = ref<ShippingProfileItem[]>([]);
const ppList = ref<PaymentProfileItem[]>([]);
const catList = ref<CollectionItem[]>([]);

const spNames = computed(() => spList.value.map((i) => i.name));
const ppNames = computed(() => ppList.value.map((i) => i.name));
const catNames = computed(() => catList.value.map((i) => i.name));

const spName = computed(() => spList.value.find((i) => i.id === d.shippingProfileId)?.name || '请选择');
const ppName = computed(() => ppList.value.find((i) => i.id === d.paymentProfileId)?.name || '请选择');
const catName = computed(() => catList.value.find((i) => i.id === d.collectionId)?.name || '请选择');

function onSpChange(e: any) {
  const it = spList.value[Number(e.detail.value)];
  if (it) d.shippingProfileId = it.id;
}
function onPpChange(e: any) {
  const it = ppList.value[Number(e.detail.value)];
  if (it) d.paymentProfileId = it.id;
}
function onCatChange(e: any) {
  const it = catList.value[Number(e.detail.value)];
  if (it) d.collectionId = it.id;
}
function onToggle(e: any) {
  d.enabled = !!e.detail.value;
}
function onImg(ids: string[]) {
  d.assetIds = ids;
}

function submit() {
  if (!d.name) return uni.showToast({ title: '请填商品名', icon: 'none' });
  d.priceYuan = Number(d.priceYuan);
  d.stock = Number(d.stock);
  emit('submit', JSON.parse(JSON.stringify(d)));
}

onMounted(async () => {
  const [sp, pp, cat] = await Promise.all([
    fetchShippingProfiles().catch(() => []),
    fetchPaymentProfiles().catch(() => []),
    fetchCollectionsOptimized().catch(() => []),
  ]);
  spList.value = sp;
  ppList.value = pp;
  catList.value = cat;
});

defineExpose({ submit });
</script>

<style lang="scss" scoped>
.form {
  .card {
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 8rpx 32rpx;
    margin-bottom: 24rpx;

    .cell {
      display: flex;
      align-items: center;
      padding: 28rpx 0;
      border-bottom: 1rpx solid $wa-rule;

      .lbl {
        width: 200rpx;
        font-size: 28rpx;
        color: $wa-ink;
        flex-shrink: 0;
      }
      input {
        flex: 1;
        font-size: 28rpx;
      }
      &.col {
        flex-direction: column;
        align-items: flex-start;
        .lbl { margin-bottom: 16rpx; }
      }
      &.row-in {
        justify-content: space-between;
        &:last-child { border-bottom: none; }
      }
      .val {
        font-size: 28rpx;
        color: $wa-muted;
      }
      &:last-child { border-bottom: none; }
    }

    .ta {
      width: 100%;
      min-height: 140rpx;
      font-size: 28rpx;
      box-sizing: border-box;
    }

    .img-title {
      padding-top: 20rpx;
      font-size: 28rpx;
      color: $wa-ink;
    }
  }
}
</style>