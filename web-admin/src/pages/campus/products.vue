<template>
  <view class="page">
    <view class="notice">{{ $t('campusProducts.notice') }}</view>

    <!-- 全店批量沽清：打烊一步到位；恢复同理，避免逐个开关漏掉商品 -->
    <view class="bulk">
      <button class="bulk__btn bulk__btn--out" :disabled="allBusy" @tap="bulkSoldOut(true)">
        {{ $t('campusProducts.bulkSellOut') }}
      </button>
      <button class="bulk__btn" :disabled="allBusy" @tap="bulkSoldOut(false)">
        {{ $t('campusProducts.bulkOnSale') }}
      </button>
    </view>

    <!-- 沽清次日自动恢复：避免打烊沽清后忘恢复，第二天开市仍售罄 -->
    <view class="auto">
      <view class="auto__text">
        <text class="auto__title">{{ $t('campusProducts.autoRestore') }}</text>
        <text class="auto__hint">{{ $t('campusProducts.autoRestoreHint').replace('{n}', String(autoPending)) }}</text>
      </view>
      <switch :checked="autoEnabled" :disabled="autoBusy" color="#ff6b35" @change="onAutoRestoreChange" />
    </view>

    <!-- R5 跑腿载体商品初始化：新店铺/新校区首次开跑腿前必须执行（幂等） -->
    <view class="errand">
      <text class="errand-hint">{{ $t('campusProducts.errandHint') }}</text>
      <button class="errand-btn" :disabled="errandBusy" @tap="initErrand">
        {{ errandBusy ? $t('campusProducts.errandBusy') : $t('campusProducts.errandInit') }}
      </button>
    </view>

    <view class="searchbar">
      <input
        v-model="search" class="search"
        :placeholder="$t('campusProducts.searchPh')" confirm-type="search"
        @confirm="load(true)"
      />
      <text class="search-btn" @tap="load(true)">{{ $t('campusProducts.search') }}</text>
    </view>

    <view v-if="loading && !products.length" class="hint">{{ $t('campusProducts.loading') }}</view>
    <view v-else-if="!products.length" class="hint">{{ $t('campusProducts.empty') }}</view>
    <view v-for="p in products" :key="p.productId" class="card">
      <view class="main">
        <text class="name">{{ p.name }}</text>
        <view class="meta">
          <text class="m">{{ $t('campusProducts.monthlySales') }} {{ p.monthlySales }}</text>
          <text class="m">{{ $t('campusProducts.variantCount') }} {{ p.variantCount }}</text>
          <text class="m">{{ $t('campusProducts.packingFee') }} {{ p.packingFee != null ? '¥' + (p.packingFee / 100).toFixed(2) : $t('campusProducts.packingFeeDefault') }}</text>
          <text class="m edit" @tap="openPacking(p)">{{ $t('campusProducts.packingEdit') }}</text>
        </view>
        <view class="meta">
          <text class="m edit" @tap="openAddon(p)">{{ $t('campusProducts.addonEntry') }} {{ addonGroupCount(p) }}</text>
          <text class="m edit" @tap="openCombo(p)">{{ $t('campusProducts.comboEntry') }} {{ comboItemCount(p) }}</text>
        </view>
      </view>
      <view class="right">
        <text class="state" :class="{ out: p.soldOut }">
          {{ p.soldOut ? $t('campusProducts.soldOut') : $t('campusProducts.onSale') }}
        </text>
        <switch
          class="sw" :checked="p.soldOut"
          :disabled="!!busy[p.productId]"
          color="#ff6600"
          @change="onToggle(p, $event)"
        />
      </view>
    </view>

    <button
      v-if="products.length < total" class="more" :disabled="loading"
      @tap="load(false)"
    >{{ loading ? $t('campusProducts.loading') : $t('campusProducts.loadMore') }}</button>

    <!-- 商品级打包费（覆盖店铺单价；留空=沿用店铺配置金额） -->
    <view v-if="packingOpen" class="mask" @tap.self="packingOpen = false">
      <view class="sheet">
        <view class="sheet__hd">
          <text class="sheet__t">{{ $t('campusProducts.packingTitle') }}</text>
          <text class="sheet__x" @tap="packingOpen = false">✕</text>
        </view>
        <text class="sheet__sub">{{ packingTarget?.name }}</text>
        <text class="sheet__hint">{{ $t('campusProducts.packingHint') }}</text>
        <input v-model="packingYuan" class="sheet__input" type="digit" :placeholder="$t('campusProducts.packingPh')" />
        <view class="sheet__ops">
          <text class="sheet__clear" @tap="clearPacking">{{ $t('campusProducts.packingClear') }}</text>
          <button class="sheet__save" :disabled="packingBusy" @tap="savePacking">
            {{ packingBusy ? $t('campusProducts.loading') : $t('campusProducts.packingSave') }}
          </button>
        </view>
      </view>
    </view>

    <!-- 加料（P1-2）：组 → 选项，C 端商品详情勾选，结算按份加价 -->
    <view v-if="addonOpen" class="mask" @tap.self="addonOpen = false">
      <view class="sheet sheet--tall">
        <view class="sheet__hd">
          <text class="sheet__t">{{ $t('campusProducts.addonTitle') }}</text>
          <text class="sheet__x" @tap="addonOpen = false">✕</text>
        </view>
        <text class="sheet__sub">{{ addonTarget?.name }}</text>
        <text class="sheet__hint">{{ $t('campusProducts.addonHint') }}</text>
        <scroll-view scroll-y class="sheet__scroll">
          <view v-if="!addonDraft.length" class="empty">{{ $t('campusProducts.addonEmpty') }}</view>
          <view v-for="(g, gi) in addonDraft" :key="'ag' + gi" class="ag">
            <view class="ag__hd">
              <input v-model="g.name" class="ag__name" :placeholder="$t('campusProducts.addonGroupName')" />
              <text class="ag__del" @tap="addonDraft.splice(gi, 1)">{{ $t('campusProducts.addonRemove') }}</text>
            </view>
            <view class="ag__range">
              <text class="ag__lbl">{{ $t('campusProducts.addonMin') }}</text>
              <input v-model="g.min" class="ag__num" type="number" />
              <text class="ag__lbl">{{ $t('campusProducts.addonMax') }}</text>
              <input v-model="g.max" class="ag__num" type="number" />
            </view>
            <view v-for="(o, oi) in g.options" :key="'ao' + oi" class="op">
              <input v-model="o.name" class="op__name" :placeholder="$t('campusProducts.addonOptionName')" />
              <input v-model="o.priceYuan" class="op__price" type="digit" :placeholder="$t('campusProducts.addonOptionPrice')" />
              <text class="op__del" @tap="g.options.splice(oi, 1)">✕</text>
            </view>
            <text class="ag__add" @tap="addOption(g)">{{ $t('campusProducts.addonAddOption') }}</text>
          </view>
          <text class="add-group" @tap="addGroup">{{ $t('campusProducts.addonAddGroup') }}</text>
        </scroll-view>
        <view class="sheet__ops">
          <text class="sheet__clear" @tap="clearAddons">{{ $t('campusProducts.addonClear') }}</text>
          <button class="sheet__save" :disabled="addonBusy" @tap="saveAddons">
            {{ addonBusy ? $t('campusProducts.loading') : $t('campusProducts.addonSave') }}
          </button>
        </view>
      </view>
    </view>

    <!-- 套餐内容（P1-2）：仅展示与备餐用，套餐价仍由商品价格决定 -->
    <view v-if="comboOpen" class="mask" @tap.self="comboOpen = false">
      <view class="sheet sheet--tall">
        <view class="sheet__hd">
          <text class="sheet__t">{{ $t('campusProducts.comboTitle') }}</text>
          <text class="sheet__x" @tap="comboOpen = false">✕</text>
        </view>
        <text class="sheet__sub">{{ comboTarget?.name }}</text>
        <text class="sheet__hint">{{ $t('campusProducts.comboHint') }}</text>
        <scroll-view scroll-y class="sheet__scroll">
          <view v-if="!comboDraft.length" class="empty">{{ $t('campusProducts.comboEmpty') }}</view>
          <view class="op">
            <input v-model="comboTitle" class="op__name" :placeholder="$t('campusProducts.comboName')" />
          </view>
          <view v-for="(it, i) in comboDraft" :key="'ci' + i" class="op">
            <input v-model="it.name" class="op__name" :placeholder="$t('campusProducts.comboItemName')" />
            <input v-model="it.qty" class="ag__num" type="number" :placeholder="$t('campusProducts.comboItemQty')" />
            <input v-model="it.priceYuan" class="op__price" type="digit" :placeholder="$t('campusProducts.comboItemPrice')" />
            <text class="op__del" @tap="comboDraft.splice(i, 1)">✕</text>
          </view>
          <text class="add-group" @tap="comboDraft.push({ name: '', qty: '1', priceYuan: '' })">{{ $t('campusProducts.comboAddItem') }}</text>
        </scroll-view>
        <view class="sheet__ops">
          <text class="sheet__clear" @tap="clearCombo">{{ $t('campusProducts.comboClear') }}</text>
          <button class="sheet__save" :disabled="comboBusy" @tap="saveCombo">
            {{ comboBusy ? $t('campusProducts.loading') : $t('campusProducts.comboSave') }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
// 一键沽清：商品售罄仅影响 C 端加购，仍保留菜单展示（避免频繁上下架打断装修/搜索索引）。
import { onMounted, ref } from 'vue';
import {
  fetchMerchantProducts, setMerchantProductSoldOut, setMerchantAllProductsSoldOut,
  getMerchantSoldOutAutoRestore, setMerchantSoldOutAutoRestore,
  setMerchantProductPackingFee, ensureErrandProducts,
  setMerchantProductAddonGroups, setMerchantProductCombo,
  type MerchantProduct, type AddonGroupConfig, type ComboItemConfig,
} from '../../apis/campus-ops';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const TAKE = 20;
const MAX_GROUPS = 5;
const MAX_OPTIONS = 12;

const locale = useLocaleStore();
const products = ref<MerchantProduct[]>([]);
const total = ref(0);
const search = ref('');
const loading = ref(false);
const busy = ref<Record<string, boolean>>({});
const errandBusy = ref(false);
const autoEnabled = ref(true);
const autoPending = ref(0);
const autoBusy = ref(false);

/** 读取沽清自动恢复开关与待恢复件数 */
async function loadAutoRestore(): Promise<void> {
  try {
    const r = await getMerchantSoldOutAutoRestore();
    autoEnabled.value = !!r?.enabled;
    autoPending.value = Number(r?.pending || 0);
  } catch {
    // 开关读取失败不阻塞商品列表
  }
}

/** 切换「次日 04:00 自动恢复」 */
async function onAutoRestoreChange(e: any): Promise<void> {
  if (autoBusy.value) return;
  const next = !!e?.detail?.value;
  autoBusy.value = true;
  try {
    const r = await setMerchantSoldOutAutoRestore(next);
    autoEnabled.value = !!r?.enabled;
    autoPending.value = Number(r?.pending || 0);
    uni.showToast({
      title: locale.t(next ? 'campusProducts.autoRestoreOn' : 'campusProducts.autoRestoreOff'),
      icon: 'none',
    });
  } catch (err: any) {
    autoEnabled.value = !next;
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.setFailed')), icon: 'none' });
  } finally {
    autoBusy.value = false;
  }
}

/** 全店批量沽清/恢复（打烊场景）：二次确认后执行并刷新列表 */
function bulkSoldOut(next: boolean): void {
  if (allBusy.value) return;
  uni.showModal({
    title: locale.t(next ? 'campusProducts.bulkSellOutTitle' : 'campusProducts.bulkOnSaleTitle'),
    content: locale.t(next ? 'campusProducts.bulkSellOutConfirm' : 'campusProducts.bulkOnSaleConfirm'),
    success: async (r: any) => {
      if (!r?.confirm) return;
      allBusy.value = true;
      try {
        const n = await setMerchantAllProductsSoldOut(next);
        if (!n) {
          uni.showToast({ title: locale.t('campusProducts.bulkEmpty'), icon: 'none' });
          return;
        }
        uni.showToast({
          title: locale.t('campusProducts.bulkDone').replace('{n}', String(n)),
          icon: 'success',
        });
        await load(true);
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.setFailed')), icon: 'none' });
      } finally {
        allBusy.value = false;
      }
    },
  });
}

/** 幂等初始化跑腿载体商品（SKU 查重，重复点击安全） */
async function initErrand(): Promise<void> {
  if (errandBusy.value) return;
  errandBusy.value = true;
  try {
    const r = await ensureErrandProducts();
    uni.showToast({
      title: locale.t('campusProducts.errandOk').replace('{sku}', r.sku),
      icon: 'success',
    });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.setFailed')), icon: 'none' });
  } finally {
    errandBusy.value = false;
  }
}

async function load(reset: boolean): Promise<void> {
  if (loading.value) return;
  loading.value = true;
  try {
    const skip = reset ? 0 : products.value.length;
    const res = await fetchMerchantProducts(search.value.trim(), skip, TAKE);
    products.value = reset ? res.items : [...products.value, ...res.items];
    total.value = res.total;
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

/** 乐观更新：先切 UI，失败回滚并提示 */
async function onToggle(p: MerchantProduct, e: any): Promise<void> {
  const next = !!e?.detail?.value;
  const prev = p.soldOut;
  if (next === prev || busy.value[p.productId]) return;
  p.soldOut = next;
  busy.value[p.productId] = true;
  try {
    const actual = await setMerchantProductSoldOut(p.productId, next);
    p.soldOut = actual;
  } catch (err: any) {
    p.soldOut = prev;
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.setFailed')), icon: 'none' });
  } finally {
    delete busy.value[p.productId];
  }
}

// ===== 商品级打包费（覆盖店铺单件金额）=====
const packingOpen = ref(false);
const packingTarget = ref<MerchantProduct | null>(null);
const packingYuan = ref('');
const packingBusy = ref(false);

function openPacking(p: MerchantProduct): void {
  packingTarget.value = p;
  packingYuan.value = p.packingFee != null ? (p.packingFee / 100).toFixed(2) : '';
  packingOpen.value = true;
}

/** 元输入转分；留空返回 null（沿用店铺配置） */
function yuanToFen(v: string): number | null | undefined {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

async function savePacking(): Promise<void> {
  const p = packingTarget.value;
  if (!p || packingBusy.value) return;
  const fen = yuanToFen(packingYuan.value);
  if (fen === undefined) {
    uni.showToast({ title: locale.t('campusProducts.packingBad'), icon: 'none' });
    return;
  }
  packingBusy.value = true;
  try {
    p.packingFee = await setMerchantProductPackingFee(p.productId, fen);
    packingOpen.value = false;
    uni.showToast({ title: locale.t('campusProducts.packingSaved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.setFailed')), icon: 'none' });
  } finally {
    packingBusy.value = false;
  }
}

/** 清除商品级覆盖，回落到店铺配置金额 */
async function clearPacking(): Promise<void> {
  packingYuan.value = '';
  await savePacking();
}

// ===== 加料组（P1-2）=====
type AddonGroupDraft = {
  name: string;
  min: string;
  max: string;
  options: Array<{ name: string; priceYuan: string }>;
};

const addonOpen = ref(false);
const addonTarget = ref<MerchantProduct | null>(null);
const addonDraft = ref<AddonGroupDraft[]>([]);
const addonBusy = ref(false);

/** 卡片上展示已配置组数（解析失败按 0，避免脏 JSON 打断列表） */
function addonGroupCount(p: MerchantProduct): number {
  return readJsonArray(p.addonGroups).length;
}

function comboItemCount(p: MerchantProduct): number {
  const obj: any = readJson(p.combo);
  return Array.isArray(obj?.items) ? obj.items.length : 0;
}

function readJson(raw?: string | null): any {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function readJsonArray(raw?: string | null): any[] {
  const v = readJson(raw);
  return Array.isArray(v) ? v : [];
}

function openAddon(p: MerchantProduct): void {
  addonTarget.value = p;
  addonDraft.value = readJsonArray(p.addonGroups).map((g: any) => ({
    name: String(g?.name ?? ''),
    min: String(Number(g?.min ?? 0) || ''),
    max: String(Number(g?.max ?? 0) || ''),
    options: (Array.isArray(g?.options) ? g.options : []).map((o: any) => ({
      name: String(o?.name ?? ''),
      priceYuan: o?.price ? (Number(o.price) / 100).toFixed(2) : '',
    })),
  }));
  if (!addonDraft.value.length) addGroup();
  addonOpen.value = true;
}

function addGroup(): void {
  if (addonDraft.value.length >= MAX_GROUPS) {
    uni.showToast({ title: locale.t('campusProducts.addonBad'), icon: 'none' });
    return;
  }
  addonDraft.value.push({ name: '', min: '', max: '', options: [{ name: '', priceYuan: '' }] });
}

function addOption(g: AddonGroupDraft): void {
  if (g.options.length >= MAX_OPTIONS) {
    uni.showToast({ title: locale.t('campusProducts.addonBad'), icon: 'none' });
    return;
  }
  g.options.push({ name: '', priceYuan: '' });
}

/** 草稿 → 提交结构；任一组/选项为空或金额非法则返回 null */
function buildAddonGroups(): AddonGroupConfig[] | null {
  const out: AddonGroupConfig[] = [];
  for (const g of addonDraft.value) {
    const name = g.name.trim();
    if (!name) return null;
    const options: AddonGroupConfig['options'] = [];
    for (const o of g.options) {
      const on = o.name.trim();
      if (!on) return null;
      const fen = yuanToFen(o.priceYuan || '0');
      if (fen === undefined) return null;
      options.push({ name: on, price: fen ?? 0 });
    }
    if (!options.length) return null;
    const min = Math.max(0, Number(g.min) || 0);
    const max = Math.max(0, Number(g.max) || 0);
    if (min > 0 && max > 0 && min > max) return null;
    out.push({ name, min, max, options });
  }
  return out;
}

async function saveAddons(): Promise<void> {
  const p = addonTarget.value;
  if (!p || addonBusy.value) return;
  const groups = buildAddonGroups();
  if (!groups) {
    uni.showToast({ title: locale.t('campusProducts.addonBad'), icon: 'none' });
    return;
  }
  addonBusy.value = true;
  try {
    p.addonGroups = await setMerchantProductAddonGroups(p.productId, groups);
    addonOpen.value = false;
    uni.showToast({ title: locale.t('campusProducts.addonSaved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.setFailed')), icon: 'none' });
  } finally {
    addonBusy.value = false;
  }
}

/** 清除该商品全部加料（提交空数组） */
async function clearAddons(): Promise<void> {
  const p = addonTarget.value;
  if (!p || addonBusy.value) return;
  addonBusy.value = true;
  try {
    p.addonGroups = await setMerchantProductAddonGroups(p.productId, []);
    addonDraft.value = [];
    addonOpen.value = false;
    uni.showToast({ title: locale.t('campusProducts.addonSaved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.setFailed')), icon: 'none' });
  } finally {
    addonBusy.value = false;
  }
}

// ===== 套餐内容（P1-2）=====
type ComboDraftItem = { name: string; qty: string; priceYuan: string };

const comboOpen = ref(false);
const comboTarget = ref<MerchantProduct | null>(null);
const comboDraft = ref<ComboDraftItem[]>([]);
const comboTitle = ref('');
const comboBusy = ref(false);

function openCombo(p: MerchantProduct): void {
  comboTarget.value = p;
  const obj: any = readJson(p.combo);
  comboTitle.value = String(obj?.title ?? '');
  const items: any[] = Array.isArray(obj?.items) ? obj.items : [];
  comboDraft.value = items.map(it => ({
    name: String(it?.name ?? ''),
    qty: String(Number(it?.qty ?? 1) || 1),
    priceYuan: it?.price ? (Number(it.price) / 100).toFixed(2) : '',
  }));
  if (!comboDraft.value.length) comboDraft.value.push({ name: '', qty: '1', priceYuan: '' });
  comboOpen.value = true;
}

function buildCombo(): { title: string | null; items: ComboItemConfig[] } | null {
  const items: ComboItemConfig[] = [];
  for (const it of comboDraft.value) {
    const name = it.name.trim();
    if (!name) return null;
    const fen = yuanToFen(it.priceYuan || '');
    if (fen === undefined) return null;
    items.push({ name, qty: Math.max(1, Number(it.qty) || 1), price: fen });
  }
  if (!items.length) return null;
  return { title: comboTitle.value.trim() || null, items };
}

async function saveCombo(): Promise<void> {
  const p = comboTarget.value;
  if (!p || comboBusy.value) return;
  const combo = buildCombo();
  if (!combo) {
    uni.showToast({ title: locale.t('campusProducts.comboBad'), icon: 'none' });
    return;
  }
  comboBusy.value = true;
  try {
    p.combo = await setMerchantProductCombo(p.productId, combo);
    comboOpen.value = false;
    uni.showToast({ title: locale.t('campusProducts.comboSaved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.setFailed')), icon: 'none' });
  } finally {
    comboBusy.value = false;
  }
}

/** 清除套餐内容，恢复为普通商品（传 null） */
async function clearCombo(): Promise<void> {
  const p = comboTarget.value;
  if (!p || comboBusy.value) return;
  comboBusy.value = true;
  try {
    p.combo = await setMerchantProductCombo(p.productId, null);
    comboDraft.value = [];
    comboTitle.value = '';
    comboOpen.value = false;
    uni.showToast({ title: locale.t('campusProducts.comboSaved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusProducts.setFailed')), icon: 'none' });
  } finally {
    comboBusy.value = false;
  }
}

onMounted(() => {
  void load(true);
  void loadAutoRestore();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx; padding-bottom: 80rpx;
  .notice { font-size: 24rpx; color: #c47b00; background: #fff7e6; border: 1.5px solid #ffe1a8;
    border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 20rpx; }
  .bulk { display: flex; gap: 16rpx; margin-bottom: 20rpx;
    &__btn { flex: 1; margin: 0; height: 68rpx; line-height: 68rpx; font-size: 24rpx;
      background: $wa-card; color: $wa-accent; border: 1.5rpx solid $wa-accent; border-radius: $wa-radius; }
    &__btn--out { color: $wa-danger; border-color: $wa-danger; }
    &__btn[disabled] { opacity: .5; } }
  .auto { display: flex; align-items: center; gap: 16rpx; background: $wa-card; border-radius: $wa-radius;
    padding: 20rpx 24rpx; margin-bottom: 20rpx;
    &__text { flex: 1; display: flex; flex-direction: column; gap: 6rpx; }
    &__title { font-size: 26rpx; color: $wa-ink; }
    &__hint { font-size: 22rpx; color: $wa-muted; } }
  .errand { display: flex; align-items: center; gap: 16rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 20rpx;
    .errand-hint { flex: 1; font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
    .errand-btn { flex: none; margin: 0; font-size: 22rpx; line-height: 56rpx; padding: 0 24rpx;
      background: transparent; border: 1.5px solid $wa-accent; color: $wa-accent; border-radius: $wa-radius; } }
  .searchbar { display: flex; align-items: center; gap: 16rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 12rpx 24rpx; margin-bottom: 20rpx;
    .search { flex: 1; font-size: 26rpx; }
    .search-btn { flex: none; font-size: 26rpx; color: $wa-accent; font-weight: 600; padding: 8rpx 4rpx; } }
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .card { display: flex; align-items: center; gap: 20rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10rpx;
      .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; word-break: break-all; }
      .meta { display: flex; flex-wrap: wrap; gap: 24rpx;
        .m { font-size: 22rpx; color: $wa-muted; } } }
    .right { flex: none; display: flex; flex-direction: column; align-items: center; gap: 8rpx;
      .state { font-size: 20rpx; color: $wa-success;
        &.out { color: $wa-danger; } }
      .sw { transform: scale(.8); } } }
  .more { margin: 12rpx 0 0; background: transparent; border: 1.5px solid $wa-accent;
    color: $wa-accent; font-size: 26rpx; border-radius: $wa-radius; }
}
.mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 300;
  display: flex; align-items: flex-end; }
.sheet { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; padding: 28rpx 32rpx 40rpx;
  box-sizing: border-box;
  &--tall { max-height: 86vh; display: flex; flex-direction: column; }
  &__hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
  &__t { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
  &__x { font-size: 32rpx; color: $wa-muted; padding: 4rpx 8rpx; }
  &__sub { display: block; font-size: 26rpx; color: $wa-ink; margin-bottom: 8rpx; }
  &__hint { display: block; font-size: 22rpx; color: $wa-muted; line-height: 1.5; margin-bottom: 16rpx; }
  &__input { height: 72rpx; background: $wa-bg; border-radius: $wa-radius; padding: 0 20rpx;
    font-size: 28rpx; box-sizing: border-box; }
  &__scroll { flex: 1; min-height: 120rpx; margin-bottom: 8rpx; }
  &__ops { display: flex; align-items: center; gap: 20rpx; margin-top: 24rpx; }
  &__clear { flex: none; font-size: 24rpx; color: $wa-muted; padding: 12rpx 8rpx; }
  &__save { flex: 1; margin: 0; height: 76rpx; line-height: 76rpx; background: $wa-accent;
    color: #fff; font-size: 28rpx; border-radius: $wa-radius; border: none; }
}
.empty { font-size: 24rpx; color: $wa-muted; padding: 24rpx 0; text-align: center; }
.ag { background: $wa-bg; border-radius: $wa-radius; padding: 20rpx; margin-bottom: 16rpx;
  &__hd { display: flex; align-items: center; gap: 16rpx; }
  &__name { flex: 1; height: 64rpx; background: $wa-card; border-radius: $wa-radius;
    padding: 0 16rpx; font-size: 26rpx; box-sizing: border-box; }
  &__del { flex: none; font-size: 22rpx; color: $wa-danger; }
  &__range { display: flex; align-items: center; gap: 12rpx; margin-top: 12rpx; }
  &__lbl { font-size: 22rpx; color: $wa-muted; }
  &__num { width: 96rpx; height: 56rpx; background: $wa-card; border-radius: $wa-radius;
    padding: 0 12rpx; font-size: 24rpx; text-align: center; box-sizing: border-box; }
  &__add { display: block; font-size: 24rpx; color: $wa-accent; padding: 12rpx 0 0; }
}
.op { display: flex; align-items: center; gap: 12rpx; margin-top: 12rpx;
  &__name { flex: 1; min-width: 0; height: 60rpx; background: $wa-card; border-radius: $wa-radius;
    padding: 0 14rpx; font-size: 24rpx; box-sizing: border-box; }
  &__price { width: 150rpx; height: 60rpx; background: $wa-card; border-radius: $wa-radius;
    padding: 0 14rpx; font-size: 24rpx; box-sizing: border-box; }
  &__del { flex: none; font-size: 22rpx; color: $wa-muted; padding: 0 4rpx; }
}
.add-group { display: block; text-align: center; font-size: 26rpx; color: $wa-accent;
  border: 1.5px dashed $wa-accent; border-radius: $wa-radius; padding: 16rpx 0; margin-top: 8rpx; }
.page .meta .edit { color: $wa-accent; }
</style>
