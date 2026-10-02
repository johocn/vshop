<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">{{ $t('couponBundle.edit.nameLabel') }}</text>
        <input class="ipt" v-model="form.name" :placeholder="$t('couponBundle.edit.phName')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('couponBundle.edit.descLabel') }} <text class="opt">{{ $t('couponBundle.edit.optional') }}</text></text>
        <textarea class="area" v-model="form.description" :placeholder="$t('couponBundle.edit.phDesc')"></textarea>
      </view>
      <view class="field">
        <text class="label">{{ $t('couponBundle.edit.salePriceLabel') }}</text>
        <input class="ipt" v-model="form.salePriceYuan" type="digit" :placeholder="$t('couponBundle.edit.phSalePrice')" />
        <text class="tip">{{ $t('couponBundle.edit.salePriceTip') }}</text>
      </view>

      <text class="lang-hd">{{ $t('couponBundle.edit.itemsSection') }}</text>
      <view class="item" v-for="(it, idx) in form.items" :key="idx">
        <picker :range="tplNames" @change="onPickTemplate(idx, $event)">
          <view class="ipt vpicker">
            <text :class="{ ph: !it.templateId }">{{ tplNameOf(it.templateId) || $t('couponBundle.edit.pickTemplate') }}</text>
            <text class="caret">▾</text>
          </view>
        </picker>
        <view class="qty">
          <text class="qlabel">{{ $t('couponBundle.edit.qtyLabel') }}</text>
          <input class="qinput" v-model="it.quantity" type="number" :placeholder="$t('couponBundle.edit.phQty')" />
          <text class="del" @tap="removeItem(idx)">{{ $t('couponBundle.edit.remove') }}</text>
        </view>
      </view>
      <text class="addrow" @tap="addItem">＋ {{ $t('couponBundle.edit.addItem') }}</text>

      <view class="field">
        <text class="label">{{ $t('couponBundle.edit.enabledLabel') }}</text>
        <switch :checked="form.enabled" @change="form.enabled = $event.detail.value" color="#2563eb" />
      </view>
    </view>

    <view class="ops">
      <button class="btn ghost" @tap="goBack">{{ $t('couponBundle.edit.back') }}</button>
      <button class="btn main" @tap="onSave">{{ $t('couponBundle.edit.save') }}</button>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchCouponTemplates, fetchCouponBundle, createCouponBundle, updateCouponBundle,
  type CouponTemplateItem,
} from '../../../../apis/coupon';
import { useLocaleStore } from '../../../../stores/localeStore';
import { backToHome } from '../../../../utils/h5Nav';

const locale = useLocaleStore();

const id = ref<string | null>(null);
const templates = ref<CouponTemplateItem[]>([]);
const tplNames = ref<string[]>([]);

const form = ref({
  name: '',
  description: '',
  salePriceYuan: '',
  enabled: true,
  items: [] as Array<{ templateId: string; quantity: string }>,
});

const tplNameOf = (tid: string) => templates.value.find((t) => t.id === tid)?.name || '';

function onPickTemplate(idx: number, e: any) {
  const t = templates.value[e.detail.value];
  if (t) form.value.items[idx].templateId = t.id;
}
function addItem() { form.value.items.push({ templateId: '', quantity: '1' }); }
function removeItem(idx: number) { form.value.items.splice(idx, 1); }

async function loadTemplates() {
  const res = await fetchCouponTemplates({ skip: 0, take: 200 });
  templates.value = res.items;
  tplNames.value = res.items.map((t) => t.name);
}

async function onSave() {
  const f = form.value;
  if (!f.name.trim()) { uni.showToast({ title: locale.t('couponBundle.edit.requireName'), icon: 'none' }); return; }
  if (!(Number(f.salePriceYuan) > 0)) { uni.showToast({ title: locale.t('couponBundle.edit.requirePrice'), icon: 'none' }); return; }
  const items = f.items
    .filter((it) => it.templateId)
    .map((it) => ({ templateId: it.templateId, quantity: Math.max(1, Math.round(Number(it.quantity) || 1)) }));
  if (!items.length) { uni.showToast({ title: locale.t('couponBundle.edit.requireItem'), icon: 'none' }); return; }

  const input = {
    name: f.name.trim(),
    description: f.description.trim() || undefined,
    salePrice: Math.max(0, Math.round(Number(f.salePriceYuan) * 100)),
    enabled: f.enabled,
    items,
  };
  try {
    if (id.value) await updateCouponBundle(id.value, input);
    else await createCouponBundle(input);
    uni.showToast({ title: locale.t('couponBundle.edit.saved') });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponBundle.edit.saveFailed'), icon: 'none' });
  }
}

onLoad((query: any) => { if (query?.id) id.value = query.id as string; });

onMounted(async () => {
  await loadTemplates();
  if (!id.value) return;
  const b = await fetchCouponBundle(id.value);
  if (b) {
    form.value = {
      name: b.name,
      description: b.description || '',
      salePriceYuan: String(b.salePrice / 100),
      enabled: b.enabled,
      items: b.items.map((it) => ({ templateId: it.templateId, quantity: String(it.quantity) })),
    };
  }
});

function goBack() { backToHome(); }
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .field { margin-bottom: 20rpx;
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx;
        .opt { font-size: 22rpx; color: #aaa; font-weight: 400; } }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; box-sizing: border-box; width: 100%; }
      .vpicker { display: flex; align-items: center; justify-content: space-between;
        .ph { color: $wa-muted; }
        .caret { color: $wa-muted; font-size: 24rpx; } }
      .tip { display: block; margin-top: 8rpx; font-size: 22rpx; color: $wa-muted; }
      .area { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; width: 100%; height: 120rpx; box-sizing: border-box; } }
    .lang-hd { display: block; font-size: 24rpx; color: $wa-ink; font-weight: 600; padding: 8rpx 0 16rpx; border-top: 1rpx dashed $wa-rule; margin-top: 8rpx; }
    .item { padding: 16rpx 0; border-bottom: 1rpx dashed $wa-rule;
      .qty { display: flex; align-items: center; margin-top: 12rpx;
        .qlabel { font-size: 24rpx; color: $wa-muted; margin-right: 12rpx; }
        .qinput { flex: 1; background: $wa-bg; border-radius: $wa-radius; padding: 12rpx 20rpx; font-size: 26rpx; color: $wa-ink; box-sizing: border-box; }
        .del { flex-shrink: 0; margin-left: 20rpx; font-size: 24rpx; color: #e64340; } } }
    .addrow { display: block; margin-top: 20rpx; font-size: 26rpx; color: $wa-accent; } }
  .ops { display: flex; position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx; background: #fff; box-shadow: 0 -2rpx 12rpx rgba(0,0,0,.04);
    .btn { flex: 1; margin: 0 8rpx; font-size: 28rpx; border-radius: $wa-radius; line-height: 80rpx; }
    .main { background: $wa-accent; color: #fff; }
    .ghost { background: $wa-bg; color: $wa-muted; } }
}
</style>