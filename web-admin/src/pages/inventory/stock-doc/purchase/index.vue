<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">{{ $t('stockDocPurchase.labelToLoc') }}</text>
        <picker mode="selector" :range="locNames" @change="onLocChange">
          <view class="picker">{{ curLocName || $t('stockDocPurchase.selectLoc') }} ▾</view>
        </picker>
      </view>

      <!-- 入库归位（仅启用库位功能的店铺显示，off 档整块不渲染） -->
      <BinPicker
        v-if="showZone"
        v-model:zoneId="zoneId"
        v-model:binId="binId"
        :stockLocationId="curLocId"
      />

      <view class="field">
        <text class="label">{{ $t('stockDocPurchase.labelVariant') }}</text>
        <input class="ipt" v-model="variantId" type="number" :placeholder="$t('stockDocPurchase.placeholderVariant')" @blur="checkExistingBin" />
      </view>

      <!-- 该 SKU 现库位提示（无绑定则不提示，不伪造） -->
      <view v-if="existingBinLabel" class="exist">
        <text class="et">{{ $t('stockDocPurchase.existingBin').replace('{code}', existingBinLabel) }}</text>
      </view>

      <view class="field">
        <text class="label">{{ $t('stockDocPurchase.labelQty') }}</text>
        <input class="ipt" v-model="qty" type="number" :placeholder="$t('stockDocPurchase.placeholderQty')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('stockDocPurchase.labelCost') }}</text>
        <input class="ipt" v-model="costPrice" type="number" :placeholder="$t('stockDocPurchase.optional')" />
      </view>
    </view>
    <view class="savebar">
      <button class="save" :disabled="saving" @tap="onSave">{{ saving ? $t('stockDocPurchase.submitting') : $t('stockDocPurchase.submit') }}</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../../stores/localeStore';
import { fetchStockLocations } from '../../../../apis/inventory';
import { createStockDoc } from '../../../../apis/stock-doc';
import { fetchVariantBin } from '../../../../apis/storage-bin';
import { useBinMode } from '../../../../composables/useBinMode';
import BinPicker from '../../../../components/picking/BinPicker.vue';

const locale = useLocaleStore();
const { showZone, showBin, ensureBinMode } = useBinMode();

const locations = ref<Array<{ id: string; name: string }>>([]);
const locNames = ref<string[]>([]);
const locIdx = ref(-1);
const curLocName = ref('');
const variantId = ref('');
const qty = ref('');
const costPrice = ref('');
const saving = ref(false);
// 入库归位（bin 档传 binId，zone 档只传 zoneId）
const zoneId = ref('');
const binId = ref('');
const existingBinLabel = ref('');

const curLocId = computed(() => (locIdx.value >= 0 ? String(locations.value[locIdx.value]?.id ?? '') : ''));

function onLocChange(e: any) {
  locIdx.value = Number(e.detail.value);
  curLocName.value = locNames.value[locIdx.value];
  // 换仓后原库区/库位不再属于该仓，必须清空重选
  zoneId.value = '';
  binId.value = '';
  existingBinLabel.value = '';
  checkExistingBin();
}

/** 带出该 SKU 在该仓的现有库位，并预选回填（无绑定则清空提示，不伪造） */
async function checkExistingBin() {
  existingBinLabel.value = '';
  if (!showZone.value || !curLocId.value || !variantId.value.trim()) return;
  try {
    const row = await fetchVariantBin(variantId.value.trim(), curLocId.value);
    if (!row) return;
    existingBinLabel.value = row.bin?.code || row.zone?.name || row.zone?.code || '';
    if (row.zoneId) zoneId.value = String(row.zoneId);
    if (showBin.value && row.binId) binId.value = String(row.binId);
  } catch (_e) {
    // 查询失败不阻断入库，仅不展示提示
  }
}

async function onSave() {
  if (locIdx.value < 0) return uni.showToast({ title: locale.t('stockDocPurchase.requireLoc'), icon: 'none' });
  if (!variantId.value.trim()) return uni.showToast({ title: locale.t('stockDocPurchase.requireVariant'), icon: 'none' });
  if (!qty.value || Number(qty.value) <= 0) return uni.showToast({ title: locale.t('stockDocPurchase.requireQty'), icon: 'none' });
  // 启用库位功能的店铺必须选到库区（bin 档还需选到库位），否则本次入库无法归位
  if (showZone.value && !zoneId.value) return uni.showToast({ title: locale.t('stockDocPurchase.requireZone'), icon: 'none' });
  if (showBin.value && !binId.value) return uni.showToast({ title: locale.t('stockDocPurchase.requireBin'), icon: 'none' });
  saving.value = true;
  try {
    const doc = await createStockDoc({
      type: 'PURCHASE',
      items: [{
        variantId: variantId.value,
        toStockLocationId: curLocId.value,
        qty: Number(qty.value),
        costPrice: costPrice.value ? Number(costPrice.value) : undefined,
        // 不传 zoneId/binId 时后端保持原绑定不动，与旧行为完全一致
        ...(showZone.value && zoneId.value ? { zoneId: zoneId.value } : {}),
        ...(showBin.value && binId.value ? { binId: binId.value } : {}),
      }],
    });
    uni.showToast({ title: locale.t('stockDocPurchase.done').replace('{code}', doc.code), icon: 'success' });
    setTimeout(() => uni.navigateBack(), 700);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stockDocPurchase.submitFailed'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

// 支持从库存主页「补货」带参进入：?variantId=&qty=&locationId=（契约 1.6）
onLoad(async (q: any) => {
  await ensureBinMode();
  locations.value = await fetchStockLocations();
  locNames.value = locations.value.map((l) => l.name);
  const wantLoc = String(q?.locationId ?? '');
  if (wantLoc) {
    const i = locations.value.findIndex((l) => l.id === wantLoc);
    if (i >= 0) {
      locIdx.value = i;
      curLocName.value = locations.value[i].name;
    }
  }
  if (q?.variantId) variantId.value = String(q.variantId);
  if (q?.qty) qty.value = String(q.qty);
  if (q?.variantId || q?.qty) {
    uni.showToast({ title: locale.t('stockDocPurchase.prefilled'), icon: 'none' });
  }
  await checkExistingBin();
});
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx;
    .field { margin-bottom: 32rpx;
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 12rpx; }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx; font-size: 28rpx; color: $wa-ink; }
      .picker { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx; font-size: 28rpx; color: $wa-ink; }
    }
    .exist { margin: -16rpx 0 32rpx; padding: 16rpx 20rpx; border-radius: 8rpx; background: #fff4ea;
      .et { font-size: 24rpx; color: $wa-accent; }
    }
  }
  .savebar { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $wa-rule;
    .save { background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
  }
}
</style>