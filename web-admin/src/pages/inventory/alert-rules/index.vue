<template>
  <view class="page">
    <!-- 默认安全库存（渠道级） -->
    <view class="card">
      <text class="h">{{ $t('inventoryAlertRules.defaultLabel') }}</text>
      <view class="frow">
        <input class="inp" type="number" :value="defaultVal" @input="onDefaultInput" />
        <text class="sbtn" :class="{ dis: savingDefault }" @tap="onSaveDefault">
          {{ savingDefault ? $t('inventoryAlertRules.saving') : $t('inventoryAlertRules.save') }}
        </text>
      </view>
      <text class="hint">{{ $t('inventoryAlertRules.defaultHint') }}</text>
    </view>

    <!-- 商品安全库存列表 -->
    <view class="card">
      <view class="lhead">
        <text class="h">{{ $t('inventoryAlertRules.listTitle') }}</text>
        <text class="sp"></text>
        <input
          class="sbox"
          :value="keyword"
          :placeholder="$t('inventoryAlertRules.searchPlaceholder')"
          confirm-type="search"
          @input="onSearchInput"
          @confirm="onSearchNow"
        />
      </view>
      <view class="thead">
        <text class="c1">{{ $t('inventoryAlertRules.listTitle') }}</text>
        <text class="c2">{{ $t('inventoryAlertRules.safetyPlaceholder') }}</text>
        <text class="c3">{{ $t('inventoryAlertRules.enableLabel') }}</text>
      </view>

      <view class="rrow" v-for="r in items" :key="r.variantId">
        <view class="rmain">
          <text class="rnm">{{ r.variantName || r.sku }}</text>
          <text class="rsub">{{ r.sku }}<text v-if="r.locationName"> · {{ r.locationName }}</text> · {{ r.onHand }}</text>
        </view>
        <input class="inp" type="number" :value="inputVal(r)" @input="onRuleInput(r, $event)" />
        <switch class="sw" :checked="eff(r).enabled" @change="onRuleToggle(r, $event)" />
      </view>

      <view v-if="loading || loadingMore" class="more">{{ $t('inventoryAlertRules.loadingMore') }}</view>
      <view v-else-if="finished && items.length" class="more">{{ $t('inventoryAlertRules.noMore') }}</view>
      <view v-if="!items.length && !loading" class="empty">
        {{ keyword ? $t('inventoryAlertRules.noMatch') : $t('inventoryAlertRules.empty') }}
      </view>
    </view>

    <view style="height: 200rpx" />

    <!-- 保存规则（仅提交用户改动过的行） -->
    <view class="savebar">
      <text class="count">{{ $t('inventoryAlertRules.listTitle') }} {{ editCount }}</text>
      <text class="sbtn" :class="{ dis: savingRules || !editCount }" @tap="onSaveRules">
        {{ savingRules ? $t('inventoryAlertRules.saving') : $t('inventoryAlertRules.save') }}
      </text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, reactive, ref } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import {
  fetchInventoryAlertRules,
  fetchInventoryStockPage,
  saveInventoryAlertRules,
  type InventoryAlertRuleInput,
  type InventoryStockRow,
} from '../../../apis/inventory';
import { parseQtyInput } from '../../../utils/inventoryFormat';

const locale = useLocaleStore();
const PAGE = 20;

const channelId = ref('');
const defaultVal = ref('');
const savingDefault = ref(false);

const items = ref<InventoryStockRow[]>([]);
const keyword = ref('');
// 已持久化的「全仓通用」规则（locationId 哨兵 0）
const rulesMap = ref<Record<string, { safetyStock: number; enabled: boolean }>>({});
// 用户本次改动（variantId → 规则），只提交这些行
const edits = ref<Record<string, { safetyStock: number; enabled: boolean }>>({});
// 输入框原始字符串缓冲，避免「清空重输」被回弹（受控组件回写问题）
const inputs = reactive<Record<string, string>>({});

const page = ref(1);
const loading = ref(false);
const loadingMore = ref(false);
const finished = ref(false);
const savingRules = ref(false);
let seq = 0;

const editCount = computed(() => Object.keys(edits.value).length);

/** 某行的最终生效规则：本地改动 → 已存规则 → 服务端解析值（含渠道默认回退） */
function eff(r: InventoryStockRow): { safetyStock: number; enabled: boolean } {
  return edits.value[r.variantId] ?? rulesMap.value[r.variantId] ?? { safetyStock: r.safetyStock, enabled: true };
}
function inputVal(r: InventoryStockRow): string {
  return inputs[r.variantId] ?? String(eff(r).safetyStock);
}

function onRuleInput(r: InventoryStockRow, e: any): void {
  const raw = e?.detail?.value ?? '';
  inputs[r.variantId] = raw;
  const cur = eff(r);
  const parsed = parseQtyInput(raw, -1);
  edits.value = { ...edits.value, [r.variantId]: { ...cur, safetyStock: parsed < 0 ? cur.safetyStock : parsed } };
}
function onRuleToggle(r: InventoryStockRow, e: any): void {
  const cur = eff(r);
  edits.value = { ...edits.value, [r.variantId]: { ...cur, enabled: !!e?.detail?.value } };
}

async function loadRules(): Promise<void> {
  // locationId 传 null = 本租户「全仓通用」规则（服务端哨兵 0，契约 1.3）
  const list = await fetchInventoryAlertRules(null);
  const m: Record<string, { safetyStock: number; enabled: boolean }> = {};
  for (const r of list) m[r.variantId] = { safetyStock: r.safetyStock, enabled: r.enabled };
  rulesMap.value = m;
  edits.value = {};
  for (const k of Object.keys(inputs)) delete inputs[k];
}

async function load(reset = true): Promise<void> {
  const my = ++seq;
  const target = reset ? 1 : page.value + 1;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  try {
    const res = await fetchInventoryStockPage({
      locationId: null, // 全部仓聚合
      keyword: keyword.value || undefined,
      sort: 'stockAsc', // spec §3.2.2：预警列表固定按库存升序
      page: target,
      pageSize: PAGE,
    });
    if (my !== seq) return;
    page.value = target;
    items.value = reset ? res.items : items.value.concat(res.items);
    finished.value = items.value.length >= res.totalItems;
  } catch (e: any) {
    if (my !== seq) return;
    uni.showToast({ title: e?.message || locale.t('inventoryAlertRules.loadFailed'), icon: 'none' });
  } finally {
    if (my === seq) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || finished.value) return;
  await load(false);
}

let timer: any = null;
function onSearchInput(e: any): void {
  keyword.value = e?.detail?.value ?? '';
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void load(true), 400);
}
function onSearchNow(): void {
  if (timer) clearTimeout(timer);
  void load(true);
}

function onDefaultInput(e: any): void {
  defaultVal.value = e?.detail?.value ?? '';
}
async function onSaveDefault(): Promise<void> {
  const v = parseQtyInput(defaultVal.value, -1);
  if (v < 0) {
    uni.showToast({ title: locale.t('inventoryAlertRules.defaultInvalid'), icon: 'none' });
    return;
  }
  if (savingDefault.value) return;
  savingDefault.value = true;
  try {
    await updateChannelCustomFields(channelId.value, { inventoryDefaultSafetyStock: v });
    defaultVal.value = String(v);
    uni.showToast({ title: locale.t('inventoryAlertRules.defaultSaved'), icon: 'success' });
    // 默认值变化会影响「未单独设规则」SKU 的解析值，重拉列表
    await load(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryAlertRules.defaultFailed'), icon: 'none' });
  } finally {
    savingDefault.value = false;
  }
}

async function onSaveRules(): Promise<void> {
  if (savingRules.value) return;
  const entries = Object.entries(edits.value);
  if (!entries.length) return;
  // 逐行校验输入缓冲（可能含空串/负数）
  for (const [vid] of entries) {
    if (parseQtyInput(inputs[vid], -1) < 0) {
      uni.showToast({ title: locale.t('inventoryAlertRules.safetyInvalid'), icon: 'none' });
      return;
    }
  }
  const payload: InventoryAlertRuleInput[] = entries.map(([vid, v]) => ({
    variantId: vid,
    safetyStock: v.safetyStock,
    enabled: v.enabled,
  }));
  savingRules.value = true;
  try {
    await saveInventoryAlertRules(null, payload);
    uni.showToast({ title: locale.t('inventoryAlertRules.saved'), icon: 'success' });
    await loadRules();
    await load(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryAlertRules.saveFailed'), icon: 'none' });
  } finally {
    savingRules.value = false;
  }
}

async function init(): Promise<void> {
  try {
    const ch = await fetchActiveChannel();
    channelId.value = ch.id;
    const v = Number(ch.customFields.inventoryDefaultSafetyStock ?? 10);
    defaultVal.value = String(Number.isFinite(v) ? v : 10);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryAlertRules.loadFailed'), icon: 'none' });
  }
  try {
    await loadRules();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryAlertRules.loadFailed'), icon: 'none' });
  }
  await load(true);
}

init();
onPullDownRefresh(async () => {
  await load(true);
  uni.stopPullDownRefresh();
});
onReachBottom(loadMore);
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 0;

  .card {
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 28rpx 32rpx;
    margin-bottom: 20rpx;

    .h { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .hint { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 12rpx; }

    .frow { display: flex; align-items: center; gap: 20rpx; margin-top: 20rpx;
      .inp { flex: 1; background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 24rpx; font-size: 28rpx; color: $wa-ink; text-align: center; }
    }

    .lhead { display: flex; align-items: center;
      .sp { flex: 1; }
      .sbox { width: 300rpx; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 20rpx; font-size: 24rpx; color: $wa-ink; }
    }

    .thead { display: flex; align-items: center; margin-top: 20rpx; padding-bottom: 12rpx; border-bottom: 1rpx solid $wa-rule;
      .c1 { flex: 1; font-size: 22rpx; color: $wa-muted; }
      .c2 { width: 180rpx; text-align: center; font-size: 22rpx; color: $wa-muted; }
      .c3 { width: 110rpx; text-align: center; font-size: 22rpx; color: $wa-muted; }
    }

    .rrow { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $wa-rule;
      .rmain { flex: 1; min-width: 0; display: flex; flex-direction: column;
        .rnm { font-size: 26rpx; color: $wa-ink; }
        .rsub { font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; }
      }
      .inp { width: 180rpx; text-align: center; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 16rpx; font-size: 26rpx; color: $wa-ink; }
      .sw { width: 110rpx; transform: scale(0.75); }
    }
  }

  .more { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 60rpx 0; }

  .sbtn {
    font-size: 26rpx; color: #fff; background: $wa-accent; border-radius: $wa-radius;
    padding: 14rpx 32rpx; white-space: nowrap;
    &.dis { opacity: 0.5; }
  }

  .savebar {
    position: fixed; left: 0; right: 0; bottom: 0;
    display: flex; align-items: center; gap: 20rpx;
    padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
    background: #fff; border-top: 1rpx solid $wa-rule;
    .count { flex: 1; font-size: 24rpx; color: $wa-muted; }
  }
}
</style>