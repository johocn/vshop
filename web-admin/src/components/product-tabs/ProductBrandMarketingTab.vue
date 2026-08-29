<template>
  <view>
    <view class="card">
      <picker mode="selector" :range="brandNames" @change="onBrandPick" :disabled="!brandNames.length || !!value.newBrand">
        <view class="cell row-in">
          <text class="lbl">品牌</text>
          <text class="val">{{ value.brandName || '请选择品牌' }}</text>
        </view>
      </picker>
      <view class="cell row-in">
        <text class="lbl">新建品牌</text>
        <input class="inp" :value="value.newBrand" placeholder="品牌库无匹配时输入新品名（本期不落库）" @input="onNewBrand" />
      </view>
    </view>

    <view class="card">
      <view class="cell">
        <text class="lbl">划线价（元）</text>
        <input class="inp" :value="value.listPriceYuan" type="digit" placeholder="0.00" @input="onField('listPriceYuan', $event)" />
      </view>
      <picker mode="date" :value="value.saleStart" @change="onDatePick('saleStart', $event)">
        <view class="cell row-in">
          <text class="lbl">促销开始</text>
          <text class="val">{{ value.saleStart || '选择日期' }}</text>
        </view>
      </picker>
      <picker mode="date" :value="value.saleEnd" @change="onDatePick('saleEnd', $event)">
        <view class="cell row-in">
          <text class="lbl">促销结束</text>
          <text class="val">{{ value.saleEnd || '选择日期' }}</text>
        </view>
      </picker>
    </view>

    <view class="card">
      <view class="img-title">营销标签</view>
      <checkbox-group class="tags" @change="onTags">
        <label class="tag" v-for="t in TAG_LIST" :key="t.code">
          <checkbox :value="t.code" :checked="value.tags.includes(t.code)" />
          <text>{{ t.label }}</text>
        </label>
      </checkbox-group>
    </view>

    <view class="card col">
      <text class="lbl">卖点</text>
      <textarea class="ta" :value="value.sellingPoint" placeholder="商品核心卖点，最多一行" @input="onField('sellingPoint', $event)" />
    </view>

    <view class="card">
      <view class="tip">满减 / 优惠券请复用既有活动（coupon 插件），暂不在此页配置关联活动。</view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchBrands } from '../../apis/product';

export interface BrandMarketingValue {
  brandFacetValueId: string;
  brandName: string;
  listPriceYuan: string;
  saleStart: string;
  saleEnd: string;
  tags: string[];
  sellingPoint: string;
  newBrand: string;
}

const TAG_LIST: Array<{ code: string; label: string }> = [
  { code: 'new', label: '新品' },
  { code: 'hot', label: '热卖' },
  { code: 'special', label: '特价' },
  { code: 'sale', label: '限时折扣' },
  { code: 'freeShip', label: '包邮' },
  { code: 'cut', label: '满减' },
  { code: 'clearance', label: '清仓' },
  { code: 'instock', label: '有货' },
];

const props = defineProps<{ value: BrandMarketingValue }>();
const emit = defineEmits<{ (e: 'update:value', v: BrandMarketingValue): void }>();

const brands = ref<Array<{ id: string; name: string }>>([]);
const brandNames = ref<string[]>([]);

function onNewBrand(e: any) {
  emit('update:value', { ...props.value, newBrand: e.detail.value || '' });
}
function onBrandPick(e: any) {
  const it = brands.value[Number(e.detail.value)];
  if (!it) return;
  emit('update:value', {
    ...props.value,
    brandFacetValueId: it.id,
    brandName: it.name,
    newBrand: '',
  });
}
function onField(field: 'listPriceYuan' | 'sellingPoint', e: any) {
  emit('update:value', { ...props.value, [field]: e.detail.value || '' });
}
function onDatePick(field: 'saleStart' | 'saleEnd', e: any) {
  emit('update:value', { ...props.value, [field]: e.detail.value || '' });
}
function onTags(e: any) {
  emit('update:value', { ...props.value, tags: (e.detail.value || []) as string[] });
}

onMounted(async () => {
  try {
    const list = await fetchBrands();
    brands.value = list;
    brandNames.value = list.map((b) => b.name);
    // v-if，未选中品牌名则不显示已选
    if (!props.value.brandName && props.value.brandFacetValueId) {
      const hit = list.find((b) => b.id === props.value.brandFacetValueId);
      if (hit) emit('update:value', { ...props.value, brandName: hit.name });
    }
  } catch {
    brands.value = [];
  }
});
</script>

<style lang="scss" scoped>
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
    .lbl { width: 200rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
    .val { font-size: 28rpx; color: $wa-muted; flex: 1; text-align: right; }
    .inp { flex: 1; font-size: 28rpx; }
    &:last-child { border-bottom: none; }
    &.row-in { justify-content: space-between; }
  }
  .img-title { padding-top: 20rpx; font-size: 28rpx; color: $wa-ink; }
  .lbl { font-size: 28rpx; color: $wa-ink; }
  .ta { width: 100%; min-height: 140rpx; font-size: 28rpx; box-sizing: border-box; }
}
.col { padding: 24rpx 32rpx; }
.tags {
  display: flex; flex-wrap: wrap; padding: 16rpx 0;
  .tag { display: flex; align-items: center; margin: 0 32rpx 16rpx 0; font-size: 28rpx; color: $wa-ink; }
}
.tip { padding: 28rpx 0; font-size: 26rpx; color: $wa-muted; }
</style>