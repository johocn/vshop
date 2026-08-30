<template>
  <view>
    <view class="card">
      <picker mode="selector" :range="brandNames" :value="brandIndex" @change="onBrandPick">
        <view class="cell row-in">
          <text class="lbl">品牌</text>
          <text class="val">{{ value.brandName || '请选择品牌' }}</text>
        </view>
      </picker>
      <view class="cell row-in">
        <text class="lbl">新建品牌</text>
        <text class="val link" @tap="openBrandModal">+ 新建品牌</text>
      </view>
    </view>

    <view v-if="showBrandModal" class="modal-mask" @tap="closeBrandModal">
      <view class="modal" @tap.stop>
        <view class="modal-title">新建品牌</view>
        <input
          class="modal-inp"
          v-model="newBrandName"
          placeholder="输入品牌名称"
          focus
        />
        <view class="modal-btns">
          <button class="btn cancel" @tap="closeBrandModal">取消</button>
          <button class="btn ok" :disabled="saving" @tap="confirmCreateBrand">
            {{ saving ? '创建中…' : '创建' }}
          </button>
        </view>
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
import { ref, computed, onMounted } from 'vue';
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

// 当前已选品牌在下拉中的下标（用于定位高亮；未匹配返回 0）
const brandIndex = computed(() =>
  props.value.brandName ? Math.max(0, brandNames.value.indexOf(props.value.brandName)) : 0,
);

const showBrandModal = ref(false);
const newBrandName = ref('');
const saving = ref(false);

async function reloadBrands() {
  try {
    const { items } = await fetchBrands();
    brands.value = items;
    brandNames.value = items.map((b) => b.name);
  } catch {
    brands.value = [];
    brandNames.value = [];
  }
}

function openBrandModal() {
  newBrandName.value = '';
  showBrandModal.value = true;
}
function closeBrandModal() {
  if (!saving.value) showBrandModal.value = false;
}
async function confirmCreateBrand() {
  const name = (newBrandName.value || '').trim();
  if (!name) return uni.showToast({ title: '请输入品牌名', icon: 'none' });
  saving.value = true;
  try {
    const created = await import('../../apis/product').then((m) => m.createBrand(name));
    await reloadBrands();
    // 选中新建品牌
    emit('update:value', {
      ...props.value,
      brandFacetValueId: created.id,
      brandName: created.name,
      newBrand: '',
    });
    showBrandModal.value = false;
    uni.showToast({ title: '品牌已创建', icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: (e?.message || '创建失败').slice(0, 20), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

function onNewBrand(e: any) {
  newBrandName.value = e.detail.value || '';
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

onMounted(reloadBrands);
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

.link { color: $wa-accent; }
.modal-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center; z-index: 999;
}
.modal {
  width: 560rpx; background: $wa-card; border-radius: $wa-radius;
  padding: 40rpx 36rpx; box-sizing: border-box;
  .modal-title { font-size: 32rpx; font-weight: 600; color: $wa-ink; margin-bottom: 28rpx; }
  .modal-inp {
    background: $wa-bg; border: 1rpx solid $wa-rule; border-radius: 12rpx;
    padding: 18rpx 24rpx; font-size: 28rpx; color: $wa-ink;
  }
  .modal-btns { display: flex; gap: 24rpx; margin-top: 36rpx; }
  .btn {
    flex: 1; font-size: 28rpx; border-radius: 12rpx; line-height: 2.8;
    &.cancel { background: $wa-bg; color: $wa-muted; }
    &.ok { background: $wa-accent; color: #fff; }
  }
}
</style>