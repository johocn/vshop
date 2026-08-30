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
        <view class="syshead">
          <text class="link" @tap="openSystemGroups(gi)">从系统选择已有规格组</text>
        </view>
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
                <text class="pill-x" @tap="removeValue(gi, vi)">✕</text>
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
        <view class="skublock" v-for="(s, si) in value.skus" :key="si">
          <view class="mrow">
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
          <view class="mrow sub">
            <view class="variant-cover" @tap="openSkuImage(si)">
              <image v-if="(s.assetIds || []).length && coverPreview(s)" class="cover-img" :src="coverPreview(s)" mode="aspectFill" />
              <text v-else class="cover-plus">＋图</text>
            </view>
            <view class="field">
              <input class="c-b" placeholder="条形码" :value="s.barcode ?? ''" @input="onSkuField(si, 'barcode', $event)" />
              <text class="scan-btn" @tap="scanSkuField(si, 'barcode')">📷</text>
            </view>
            <view class="field">
              <input class="c-b" placeholder="内部码" :value="s.internalCode ?? ''" @input="onSkuField(si, 'internalCode', $event)" />
              <text class="scan-btn" @tap="scanSkuField(si, 'internalCode')">📷</text>
            </view>
            <input class="c-p" type="number" placeholder="成本价(分)" :value="String(s.costPrice ?? '')" @input="onSkuField(si, 'costPrice', $event)" />
          </view>
        </view>
      </template>
      <view v-else class="tip">暂无规格数据</view>

      <view class="row batch">
        <button class="ghost" @tap="batchPrice">批量设价</button>
        <button class="ghost" @tap="batchStock">批量填库存</button>
        <button class="ghost" v-if="value.showListPrice" @tap="batchListPrice">批量划线价</button>
      </view>
    </view>

    <view v-if="pickerOpen" class="picker-mask" @tap.self="pickerOpen = false">
      <view class="picker-panel">
        <view class="picker-head">
          <text>设置「{{ pickerLabels.join('/') || '单品' }}」的变体图片</text>
          <text class="picker-close" @tap="pickerOpen = false">✕</text>
        </view>
        <ImagePicker ref="pickerRef" :max="1" :value="pickerAssetIds" @change="onPickerChange" />
      </view>
    </view>

    <view v-if="sysGroupsOpen" class="picker-mask" @tap.self="sysGroupsOpen = false">
      <view class="picker-panel">
        <view class="picker-head">
          <text>选择系统已有规格组</text>
          <text class="picker-close" @tap="sysGroupsOpen = false">✕</text>
        </view>
        <scroll-view scroll-y class="sys-list">
          <view v-if="!sysGroups.length" class="sys-empty">暂无可复用的规格组</view>
          <view v-else class="sys-item" v-for="(sg, si) in sysGroups" :key="sg.id" @tap="selectSystemGroup(sg)">
            <view class="sys-item-head">
              <text class="sys-name">{{ sg.name }}</text>
              <text class="sys-count">{{ (sg.options || []).length }} 个值</text>
            </view>
            <text class="sys-opts">{{ (sg.options || []).map((o) => o.name).join(' / ') }}</text>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue';
import ImagePicker from '../../components/ImagePicker.vue';
import { buildMatrix, batchFill, type SpecGroup, type MatrixSku } from '../../composables/useVariantMatrix';
import { fetchReusableOptionGroups } from '../../apis/product';
import { scanCode } from '../../utils/scanner';

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
  // 手动改名：若该组已复用系统规格组，丢弃 groupId/valueIds（退化为新建组，避免 id 与值错位）
  const groups = props.value.groups.map((g, i) => {
    if (i !== gi) return g;
    // 复用组被手动改动 -> 清除 groupId/valueIds 再改名
    const next: SpecGroup = { name: e.detail.value || '', values: g.values };
    return next;
  });
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
  // 复用组被手动增删规格值 -> 清除 groupId/valueIds（退化为新建组，避免 id 与值错位）
  const groups = props.value.groups.map((g, i) =>
    i === gi
      ? { name: g.name, values: g.values.includes(v) ? g.values : [...g.values, v] }
      : g,
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

// 删除单个规格值：从组内移除该值并重建矩阵；若组删空则整组移除
function removeValue(gi: number, vi: number) {
  const group = props.value.groups[gi];
  if (!group) return;
  const next = group.values.filter((_, i) => i !== vi);
  const groups = props.value.groups.map((g, i) =>
    i === gi ? { name: g.name, values: next } : g,
  );
  // 空值组整组剔除；若全部组删空则退回无规格
  const cleaned = groups.filter((g) => g.values.length);
  if (!cleaned.length) {
    setNoSpec(true);
    return;
  }
  const skus = buildMatrix(cleaned);
  emit('update:value', { ...props.value, noSpec: false, groups: cleaned, skus });
}

// 扫码：App/小程序走 uni.scanCode，H5 走浏览器 BarcodeDetector（Chrome 内置）降级扫码；均失败时提示手动输入
async function scanSkuField(si: number, field: 'barcode' | 'internalCode') {
  try {
    const val = await scanCode();
    if (!val) return;
    onSkuFieldLiteral(si, field, val);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '扫码失败', icon: 'none' });
  }
}
// 直接写入字符串字段，复用 onSkuField 的语义
function onSkuFieldLiteral(si: number, field: 'barcode' | 'internalCode', val: string) {
  const skus = props.value.skus.map((s, i) =>
    i === si ? { ...s, [field]: val } : s,
  );
  emit('update:value', { ...props.value, skus });
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

const pickerOpen = ref(false);
const pickerIndex = ref(0);
const pickerLabels = ref<string[]>([]);
const pickerAssetIds = ref<string[]>([]);
const pickerRef = ref<any>(null);

// —— 从系统选择已有规格组 ——
interface ReusableSysGroup {
  id: string;
  name: string;
  options: Array<{ id: string; name: string }>;
}
const sysGroupsOpen = ref(false);
const sysGroups = ref<ReusableSysGroup[]>([]);
const sysTarget = ref(0);

async function openSystemGroups(gi: number) {
  sysTarget.value = gi;
  try {
    sysGroups.value = await fetchReusableOptionGroups();
    sysGroupsOpen.value = true;
  } catch {
    uni.showToast({ title: '获取规格组失败', icon: 'none' });
  }
}

function selectSystemGroup(g: ReusableSysGroup) {
  const gi = sysTarget.value;
  const values = g.options.map((o) => o.name);
  const valueIds = g.options.map((o) => o.id);
  const groups = props.value.groups.map((grp, i) =>
    i === gi ? { name: g.name, values, groupId: g.id, valueIds } : grp,
  );
  const skus = props.value.noSpec ? props.value.skus : buildMatrix(groups);
  emit('update:value', { ...props.value, groups, skus });
  sysGroupsOpen.value = false;
  uni.showToast({ title: '已引用规格组，可修改名称/值', icon: 'none' });
}

function coverPreview(s: MatrixSku): string {
  return (s as any)._preview || '';
}

function openSkuImage(si: number) {
  const s = props.value.skus[si];
  pickerIndex.value = si;
  pickerLabels.value = s?.labels || [];
  pickerAssetIds.value = s?.assetIds ? [...s.assetIds] : [];
  pickerOpen.value = true;
}

async function onPickerChange(ids: string[]) {
  const assets = pickerRef.value?.getSelectedAssets?.() ?? [];
  const preview = assets[0]?.preview || '';
  const skus = props.value.skus.map((s, i): MatrixSku => {
    if (i !== pickerIndex.value) return s;
    const base = { ...s, assetIds: [...ids] } as MatrixSku;
    (base as any)._preview = preview;
    return base;
  });
  emit('update:value', { ...props.value, skus });
}

function onSkuField(
  si: number,
  field: 'priceCents' | 'stock' | 'listPriceCents' | 'costPrice' | 'barcode' | 'internalCode',
  e: any,
) {
  const raw = e.detail.value ?? '';
  const skus = props.value.skus.map((s, i) => {
    if (i !== si) return s;
    // 条形码/内部码为字符串；可选数字字段（划线价/成本价）留空则置 undefined，价格/库存留空按 0
    if (field === 'barcode' || field === 'internalCode') return { ...s, [field]: raw };
    if (field === 'listPriceCents' || field === 'costPrice') {
      return { ...s, [field]: raw === '' ? undefined : Number(raw) || 0 };
    }
    return { ...s, [field]: Number(raw) || 0 };
  });
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
      display: inline-flex; align-items: center;
      .pill-txt { font-size: 26rpx; color: $wa-ink; }
      .pill-x { margin-left: 10rpx; font-size: 24rpx; color: $wa-muted; padding: 0 4rpx; }
    }
  }
  .row-in { display: flex; align-items: center; justify-content: space-between; padding: 24rpx 0; }
  .title { font-size: 30rpx; color: $wa-ink; }
  .lbl { font-size: 26rpx; color: $wa-muted; }
  .mrow {
    display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid $wa-rule;
    &.head { color: $wa-muted; font-size: 24rpx; }
    &.sub {
      padding: 12rpx 0 12rpx 12rpx; border-bottom: 1rpx solid $wa-rule;
      background: rgba(0,0,0,0.02);
      .field { flex: 1; display: flex; align-items: center; margin-right: 12rpx; }
      .c-b { flex: 1; font-size: 24rpx; color: $wa-ink; min-width: 0; }
    }
    .scan-btn { font-size: 26rpx; margin-left: 8rpx; padding: 4rpx; color: $wa-accent; }
    .c-lab { flex: 1.4; font-size: 26rpx; color: $wa-ink; word-break: break-all; padding-right: 8rpx; }
    .c-p { flex: 0.9; font-size: 26rpx; color: $wa-ink; text-align: center; }
    .c-s { flex: 0.7; font-size: 26rpx; color: $wa-ink; text-align: center; }
    &:last-child { border-bottom: none; }
  }
  .skublock {
    border-bottom: 1rpx solid $wa-rule;
    .mrow:last-child { border-bottom: none; }
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
.variant-cover {
  width: 56rpx;
  height: 56rpx;
  border: 1rpx solid $wa-rule;
  border-radius: $wa-radius;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: $wa-card;
  flex: none;
  .cover-img { width: 100%; height: 100%; display: block; }
  .cover-plus { font-size: 20rpx; color: $wa-muted; }
}
.picker-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.picker-panel {
  width: 640rpx;
  max-height: 80vh;
  background: $wa-bg;
  border-radius: $wa-radius;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  background: $wa-card;
  border-bottom: 1rpx solid $wa-rule;
  font-size: 26rpx;
  color: $wa-ink;
}
.picker-close { font-size: 30rpx; color: $wa-muted; padding: 0 8rpx; }
.syshead { padding: 16rpx 0 0; }
.link { color: #00A2EA; font-size: 26rpx; }
.sys-list { max-height: 60vh; }
.sys-empty { padding: 48rpx 0; text-align: center; font-size: 26rpx; color: $wa-muted; }
.sys-item {
  padding: 24rpx;
  border-bottom: 1rpx solid $wa-rule;
  background: $wa-card;
  .sys-item-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
  .sys-name { font-size: 28rpx; color: $wa-ink; font-weight: 500; }
  .sys-count { font-size: 24rpx; color: $wa-muted; }
  .sys-opts { font-size: 26rpx; color: $wa-muted; line-height: 1.5; }
}
</style>