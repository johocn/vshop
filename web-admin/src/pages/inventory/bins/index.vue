<template>
  <view class="page">
    <!-- off 档：菜单已隐藏，此处兜底直链进入的场景，不渲染任何库位 UI（避免半开状态） -->
    <view v-if="!showZone" class="disabled">
      <text class="dt">{{ $t('inventoryBin.offTitle') }}</text>
      <text class="dd">{{ $t('inventoryBin.offHint') }}</text>
    </view>

    <template v-else>
      <view class="card">
        <view class="field">
          <text class="label">{{ $t('inventoryBin.warehouse') }}</text>
          <picker mode="selector" :range="locNames" @change="onLocChange">
            <view class="picker">{{ curLocName || $t('inventoryBin.selectWarehouse') }} ▾</view>
          </picker>
        </view>
        <view class="modes">
          <text class="mi on">{{ showBin ? $t('inventoryBin.modeBin') : $t('inventoryBin.modeZone') }}</text>
          <text class="mt">{{ showBin ? $t('inventoryBin.modeBinHint') : $t('inventoryBin.modeZoneHint') }}</text>
        </view>
        <button class="gen" :disabled="!locId || working" @tap="onGenerate">
          {{ working ? $t('inventoryBin.generating') : $t('inventoryBin.generateStandard') }}
        </button>
      </view>

      <view v-if="!locId" class="empty">{{ $t('inventoryBin.pickWarehouseFirst') }}</view>
      <view v-else-if="!zones.length" class="empty">{{ $t('inventoryBin.empty') }}</view>

      <view v-for="z in zones" :key="z.id" class="card zone">
        <view class="zh">
          <text class="zc">{{ z.code }}</text>
          <text class="zn">{{ z.name }}</text>
          <text v-if="showBin" class="zb">{{ $t('inventoryBin.binCount').replace('{n}', String(binsOf(z.id).length)) }}</text>
        </view>

        <!-- zone 档只到库区，不显示库位网格 -->
        <view v-if="showBin" class="grid">
          <view v-for="b in binsOf(z.id)" :key="b.id" class="chip" @longpress="onDeleteBin(b)">
            <text class="cc">{{ b.code }}</text>
            <text class="cx" @tap.stop="onDeleteBin(b)">✕</text>
          </view>
          <view v-if="!binsOf(z.id).length" class="ze">{{ $t('inventoryBin.zoneNoBin') }}</view>
        </view>
      </view>

      <view v-if="showBin && locId" class="tip">{{ $t('inventoryBin.deleteHint') }}</view>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchStockLocations } from '../../../apis/inventory';
import {
  deleteStorageBin,
  fetchStorageBins,
  fetchStorageZones,
  generateStandardBins,
  type StorageBin,
  type StorageZone,
} from '../../../apis/storage-bin';
import { useBinMode } from '../../../composables/useBinMode';

const locale = useLocaleStore();
const { showZone, showBin, ensureBinMode } = useBinMode();

const locations = ref<Array<{ id: string; name: string }>>([]);
const locNames = ref<string[]>([]);
const locIdx = ref(-1);
const locId = ref('');
const curLocName = ref('');
const zones = ref<StorageZone[]>([]);
const bins = ref<StorageBin[]>([]);
const working = ref(false);

const binsOf = (zoneId: string | number) => bins.value.filter((b) => String(b.zoneId) === String(zoneId));

function onLocChange(e: any) {
  locIdx.value = Number(e.detail.value);
  const hit = locations.value[locIdx.value];
  locId.value = hit ? String(hit.id) : '';
  curLocName.value = hit?.name ?? '';
  reloadBins();
}

async function reloadBins() {
  if (!locId.value) {
    zones.value = [];
    bins.value = [];
    return;
  }
  try {
    zones.value = await fetchStorageZones(locId.value);
    // zone 档不拉库位（后端虽共用同一套接口，前端按档位收敛展示范围）
    bins.value = showBin.value ? await fetchStorageBins(locId.value) : [];
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryBin.loadFailed'), icon: 'none' });
  }
}

async function onGenerate() {
  if (!locId.value || working.value) return;
  working.value = true;
  try {
    const r = await generateStandardBins(locId.value);
    uni.showToast({
      title: locale.t('inventoryBin.generated')
        .replace('{z}', String(r.zonesCreated))
        .replace('{b}', String(r.binsCreated)),
      icon: 'none',
    });
    await reloadBins();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryBin.generateFailed'), icon: 'none' });
  } finally {
    working.value = false;
  }
}

function onDeleteBin(b: StorageBin) {
  uni.showModal({
    title: locale.t('inventoryBin.deleteBin'),
    content: locale.t('inventoryBin.deleteConfirm').replace('{code}', b.code),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteStorageBin(b.id);
        uni.showToast({ title: locale.t('inventoryBin.deleted'), icon: 'none' });
        await reloadBins();
      } catch (e: any) {
        // 已绑定 SKU 时后端拒绝，此处只透出后端原因原文（不伪造提示）
        uni.showToast({ title: e?.message || locale.t('inventoryBin.deleteFailed'), icon: 'none' });
      }
    },
  });
}

onShow(async () => {
  await ensureBinMode();
  locations.value = await fetchStockLocations();
  locNames.value = locations.value.map((l) => l.name);
  // 首次进入默认选第一个仓（仓库通常只有一个，减少一次点击）
  if (locIdx.value < 0 && locations.value.length) {
    locIdx.value = 0;
    locId.value = String(locations.value[0].id);
    curLocName.value = locations.value[0].name;
  }
  await reloadBins();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 120rpx;

  .disabled { margin-top: 200rpx; text-align: center;
    .dt { display: block; font-size: 30rpx; color: $wa-ink; font-weight: 600; }
    .dd { display: block; margin-top: 16rpx; font-size: 24rpx; color: $wa-muted; line-height: 1.6; padding: 0 40rpx; }
  }

  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .field { margin-bottom: 24rpx;
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 12rpx; }
      .picker { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx; font-size: 28rpx; color: $wa-ink; }
    }
    .modes { display: flex; align-items: center; flex-wrap: wrap; gap: 12rpx; margin-bottom: 24rpx;
      .mi { font-size: 22rpx; color: #fff; background: $wa-accent; border-radius: 999rpx; padding: 2rpx 18rpx; }
      .mt { font-size: 22rpx; color: $wa-muted; }
    }
    .gen { background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius;
      &[disabled] { opacity: 0.5; }
    }
  }

  .zone {
    .zh { display: flex; align-items: center; gap: 12rpx; margin-bottom: 20rpx;
      .zc { font-size: 26rpx; font-weight: 700; color: #fff; background: $wa-accent; border-radius: 8rpx; padding: 2rpx 16rpx; }
      .zn { flex: 1; font-size: 28rpx; color: $wa-ink; font-weight: 600; }
      .zb { font-size: 22rpx; color: $wa-muted; }
    }
    .grid { display: flex; flex-wrap: wrap; gap: 14rpx;
      .chip { display: flex; align-items: center; gap: 10rpx; background: $wa-bg; border-radius: 10rpx; padding: 12rpx 18rpx;
        .cc { font-size: 24rpx; color: $wa-ink; }
        .cx { font-size: 20rpx; color: #bbb; padding: 0 4rpx; }
      }
      .ze { font-size: 24rpx; color: $wa-muted; padding: 12rpx 0; }
    }
  }

  .tip { font-size: 22rpx; color: $wa-muted; text-align: center; padding: 12rpx 0 40rpx; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>