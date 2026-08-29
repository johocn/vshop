<template>
  <view>
    <view class="card">
      <view class="seg">
        <view
          class="seg-item"
          :class="{ on: value.noSpec }"
          @tap="setNoSpec(true)"
        >无规格（单品）</view>
        <view
          class="seg-item"
          :class="{ on: !value.noSpec }"
          @tap="setNoSpec(false)"
        >多规格（组合）</view>
      </view>
    </view>

    <template v-if="!value.noSpec">
      <view class="card" v-for="(g, gi) in value.groups" :key="gi">
        <view class="cell">
          <text class="lbl">规格名</text>
          <input class="inp" :value="g.name" placeholder="如：颜色" @input="onGroupName(gi, $event)" />
        </view>
        <view class="cell live">
          <text class="lbl">规格值</text>
          <view class="vals">
            <view class="pills">
              <view class="pill" v-for="(vg, vi) in g.values" :key="vi">
                <text class="pill-txt">{{ vg }}</text>
              </view>
            </view>
            <input class="inp" :value="newVal[gi]" placeholder="输入后用以下按钮添加" @input="onNewVal(gi, $event)" />
          </view>
        </view>
        <button class="ghost" @tap="addValue(gi)">添加规格值</button>
        <button class="ghost danger" @tap="removeGroup(gi)">删除此规格组</button>
      </view>
      <view class="card">
        <button class="ghost" :disabled="value.groups.length >= 3" @tap="addGroup">+ 添加规格组（上限3）</button>
      </view>
    </template>

    <view class="card">
      <view class="row-in title">
        <text>规格矩阵</text>
        <text class="lbl">划线价列：</text>
        <switch :checked="value.showListPrice" @change="onToggleListPrice" />
      </view>

      <template v-if="value.skus.length">
        <view class="mrow head">
          <text v-if="!value.noSpec" class="c-lab">规格组合</text>
          <text v-else class="c-lab">单品</text>
          <text class="c-p">价格(分)</text>
          <text class="c-p" v-if="value.showListPrice">划线价(分)</text>
          <text class="c-s">库存</text>
        </view>
        <view class="mrow" v-for="(s, si) in value.skus" :key="s.key + si">
          <text v-if="!value.noSpec" class="c-lab">{{ s.labels.join(' / ') }}</text>
          <text v-else class="c-lab">单品</text>
          <input class="c-p" type="number" :value="String(s.priceCents)" @input="onSkuField(si, 'priceCents', $event)" />
          <input
            v-if="value.showListPrice"
            class="c-p"
            type="number"
            :value="String(s.listPriceCents ?? '')"
            @input="onSkuField(si, 'listPriceCents', $event)"
          />
          <input class="c-s" type="number" :value="String(s.stock)" @input="onSkuField(si, 'stock', $event)" />
        </view>
      </template>
      <view v-else class="tip">暂无规格数据</view>

      <view class="row batch">
        <button class="ghost" @tap="batchPrice">批量设价</button>
        <button class="ghost" @tap="batchStock">批量填库存</button>
        <button class="ghost" v-if="value.showListPrice" @tap="batchListPrice">批量划线价</button>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, reactive, watch } from 'vue';
import { buildMatrix, batchFill, type SpecGroup, type MatrixSku } from '../../../composables/useVariantMatrix';

export interface VariantMatrixValue {
  noSpec: boolean;
  groups: SpecGroup[];
  skus: MatrixSku[];
  showListPrice: boolean;
}

const props = defineProps<{ value: VariantMatrixValue }>();
const emit = defineEmits<{ (e: 'update:value', v: VariantMatrixValue): void }>();

const newVal = reactive<Record<number, string>>({});

function setNoSpec(noSpec: boolean) {
  if (noSpec === props.value.noSpec) return;
  const skus = noSpec ? buildMatrix([]) : (props.value.skus.length ? props.value.skus : buildMatrix(props.value.groups));
  emit('update:value', { ...props.value, noSpec, skus });
}

function onGroupName(gi: number, e: any) {
  const groups = props.value.groups.map((g, i) => (i === gi ? { ...g, name: e.detail.value || '' } : g));
  const skus = props.value.noSpec ? props.value.skus : buildMatrix(groups);
  emit('update:value', { ...props.value, groups, skus });
}

function onNewVal(gi: number, e: any) {
  newVal[gi] = e.detail.value || '';
}

function addValue(gi: number) {
  const v = (newVal[gi] || '').trim();
  if (!v) {
    uni.showToast({ title: '请先输入规格值', icon: 'none' });
    return;
  }
  const groups = props.value.groups.map((g, i) =>
    i === gi ? { ...g, values: g.values.includes(v) ? g.values : [...g.values, v] } : g,
  );
  newVal[gi] = '';
  const skus = props.value.noSpec ? props.value.skus : buildMatrix(groups);
  emit('update:value', { ...props.value, groups, skus });
}

function removeGroup(gi: number) {
  if (props.value.groups.length <= 1) {
    // 删到空则退回无规格
    setNoSpec(true);
    return;
  }
  const groups = props.value.groups.filter((_, i) => i !== gi);
  const skus = buildMatrix(groups);
  emit('update:value', { ...props.value, groups, skus });
}

function addGroup() {
  if (props.value.groups.length >= 3) return;
  const groups = [...props.value.groups, { name: `规格${props.value.groups.length + 1}`, values: [] }];
  const skus = buildMatrix(groups);
  emit('update:value', { ...props.value, noSpec: false, groups, skus });
}

function onToggleListPrice(e: any) {
  emit('update:value', { ...props.value, showListPrice: !!e.detail.value });
}

function onSkuField(si: number, field: 'priceCents' | 'stock' | 'listPriceCents', e: any) {
  const skus = props.value.skus.map((s, i) => (i === si ? { ...s, [field]: Number(e.detail.value) || 0 } : s));
  emit('update:value', { ...props.value, skus });
}

function batchPrice() {
  const skus = batchFill(props.value.skus, 'priceCents', promptFillFromFirst('priceCents'));
  emit('update:value', { ...props.value, skus });
}
function batchStock() {
  const skus = batchFill(props.value.skus, 'stock', promptFillFromFirst('stock'));
  emit('update:value', { ...props.value, skus });
}
function batchListPrice() {
  const skus = batchFill(props.value.skus, 'listPriceCents', promptFillFromFirst('listPriceCents'));
  emit('update:value', { ...props.value, skus });
}

function promptFillFromFirst(field: 'priceCents' | 'stock' | 'listPriceCents'): number {
  const first = props.value.skus[0];
  const cur = field === 'listPriceCents' ? first?.listPriceCents ?? 0 : first ? (first[field] as number) : 0;
  return cur;
}

const maybeSkus = computed(() => props.value.skus);

// 监听 groups 变化自动 buildMatrix 刷新 skus（仅在多规格时）
watch(
  () => props.value.groups,
  (groups) => {
    if (props.value.noSpec) return;
    const rebuilt = buildMatrix(groups || []);
    // 保留已有 skus 的价格/库存/划线价（按 key 对齐）
    const merged = rebuilt.map((r) => {
      const old = props.value.skus.find((s) => s.key === r.key);
      return old ? { ...r, priceCents: old.priceCents, stock: old.stock, listPriceCents: old.listPriceCents ?? r.listPriceCents } : r;
    });
    emit('update:value', { ...props.value, skus: merged });
  },
  { deep: true },
);

void maybeSkus;
</script>

<style lang="scss" scoped>
.card {
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 8rpx 32rpx;
  margin-bottom: 24rpx;
  .cell {
    display: flex; align-items: center; padding: 28rpx 0; border-bottom: 1rpx solid $wa-rule;
    .lbl { width: 200rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
    .inp { flex: 1; font-size: 28rpx; }
    &.live { align-items: flex-start; flex-direction: column; }
    .vals { width: 100%; }
    .pills { display: flex; flex-wrap: wrap; margin-bottom: 16rpx; }
    .pill {
      background: rgba(0,0,0,0.05); border-radius: 8rpx; padding: 6rpx 20rpx; margin: 0 16rpx 16rpx 0;
      .pill-txt { font-size: 26rpx; color: $wa-ink; }
    }
  }
  .row-in { display: flex; align-items: center; justify-content: space-between; padding: 24rpx 0; }
  .title { font-size: 30rpx; color: $wa-ink; }
  .lbl { font-size: 26rpx; color: $wa-muted; }
  .mrow {
    display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid $wa-rule;
    &.head { color: $wa-muted; font-size: 24rpx; }
    .c-lab { flex: 1.4; font-size: 26rpx; color: $wa-ink; word-break: break-all; padding-right: 8rpx; }
    .c-p { flex: 0.9; font-size: 26rpx; color: $wa-ink; text-align: center; }
    .c-s { flex: 0.7; font-size: 26rpx; color: $wa-ink; text-align: center; }
    &:last-child { border-bottom: none; }
  }
  .batch { display: flex; flex-wrap: wrap; gap: 20rpx; padding: 20rpx 0 8rpx; }
  .ghost {
    margin-top: 20rpx; background: $wa-card; color: $wa-accent; font-size: 28rpx;
    border: 1rpx solid $wa-rule; border-radius: $wa-radius;
    &.danger { color: #e64340; }
    &[disabled] { opacity: 0.4; color: $wa-muted; }
  }
  .tip { padding: 20rpx 0; font-size: 26rpx; color: $wa-muted; }
}
.seg {
  display: flex; padding: 20rpx 0;
  .seg-item {
    flex: 1; text-align: center; padding: 20rpx 0; font-size: 30rpx; color: $wa-muted;
    border: 1rpx solid $wa-rule; border-radius: $wa-radius;
    &:first-child { margin-right: 20rpx; }
    &.on { background: $wa-accent; color: #fff; border-color: $wa-accent; }
  }
}
</style>