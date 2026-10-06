<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusConfig.loading') }}</view>
    <view v-else-if="!cards.length" class="hint">{{ $t('campusConfig.empty') }}</view>
    <view v-for="card in cards" v-else :key="card.channelId" class="card">
      <view class="head" @tap="toggle(card.channelId)">
        <view class="head-l">
          <text class="name">{{ card.channelName }}</text>
          <text class="token">…{{ card.channelToken.slice(-4) }}</text>
        </view>
        <text class="count">{{ routeCountLabel(card.routesEnabled) }}</text>
        <text class="chev">{{ expandedId === card.channelId ? '▾' : '▸' }}</text>
      </view>
      <block v-if="expandedId === card.channelId">
        <view class="sec-t">{{ $t('campusConfig.routeSection') }}</view>
        <view class="chips">
          <view
            v-for="r in ROUTES" :key="r.code"
            class="chip" :class="{ on: card.form.routesEnabled.includes(r.code) }"
            @tap="toggleRoute(card, r.code)"
          >{{ $t(r.key) }}</view>
        </view>
        <view class="sec-t">{{ $t('campusConfig.infoSection') }}</view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.deliveryMinutes') }}</text>
          <input v-model="card.form.deliveryMinutes" type="number" :placeholder="$t('campusConfig.phMinutes')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.minOrder') }}</text>
          <input v-model="card.form.minOrderYuan" type="digit" :placeholder="$t('campusConfig.phYuan')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.deliveryFee') }}</text>
          <input v-model="card.form.deliveryFeeYuan" type="digit" :placeholder="$t('campusConfig.phYuan')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.storeAddress') }}</text>
          <input v-model="card.form.storeAddress" :placeholder="$t('campusConfig.phText')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.storePhone') }}</text>
          <input v-model="card.form.storePhone" :placeholder="$t('campusConfig.phText')" />
        </view>
        <view class="cell col">
          <text class="lbl">{{ $t('campusConfig.storeNotice') }}</text>
          <textarea v-model="card.form.storeNotice" :placeholder="$t('campusConfig.phText')" />
        </view>
        <button class="save" :disabled="savingId === card.channelId" @tap="save(card)">
          {{ savingId === card.channelId ? $t('campusConfig.saving') : $t('campusConfig.save') }}
        </button>
      </block>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { campusStoreConfigs, campusUpdateStoreConfig, type CampusStoreConfig } from '../../apis/campus';
import { fenToYuan, yuanToFen } from '../../utils/money';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';

const ROUTES = [
  { code: 'R1', key: 'campusConfig.r1' },
  { code: 'R2', key: 'campusConfig.r2' },
  { code: 'R3', key: 'campusConfig.r3' },
  { code: 'R4', key: 'campusConfig.r4' },
  { code: 'R5', key: 'campusConfig.r5' },
] as const;

interface CardForm {
  routesEnabled: string[];
  deliveryMinutes: string;   // 输入态用字符串，提交时转 int
  minOrderYuan: string;      // 元输入态；提交转分
  deliveryFeeYuan: string;
  storeAddress: string;
  storePhone: string;
  storeNotice: string;
}
interface Card extends CampusStoreConfig { form: CardForm }

const locale = useLocaleStore();
const loading = ref(true);
const cards = ref<Card[]>([]);
const expandedId = ref<string>('');
const savingId = ref<string>('');

function toForm(c: CampusStoreConfig): CardForm {
  return {
    routesEnabled: [...c.routesEnabled],
    deliveryMinutes: c.deliveryMinutes != null ? String(c.deliveryMinutes) : '',
    minOrderYuan: c.minOrderAmount != null ? fenToYuan(c.minOrderAmount) : '',
    deliveryFeeYuan: c.deliveryFee != null ? fenToYuan(c.deliveryFee) : '',
    storeAddress: c.storeAddress ?? '',
    storePhone: c.storePhone ?? '',
    storeNotice: c.storeNotice ?? '',
  };
}

function routeCountLabel(routes: string[]): string {
  if (!routes.length) return locale.t('campusConfig.routesNone');
  return locale.t('campusConfig.routesCount').replace('{n}', String(routes.length));
}

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? '' : id;
}

function toggleRoute(card: Card, code: string) {
  const i = card.form.routesEnabled.indexOf(code);
  if (i >= 0) card.form.routesEnabled.splice(i, 1);
  else card.form.routesEnabled.push(code);
}

async function save(card: Card) {
  const f = card.form;
  const minutes = f.deliveryMinutes.trim() === '' ? null : Number(f.deliveryMinutes);
  if (minutes != null && (!Number.isInteger(minutes) || minutes < 0)) {
    uni.showToast({ title: locale.t('campusConfig.badMinutes'), icon: 'none' });
    return;
  }
  const minOrder = f.minOrderYuan.trim() === '' ? null : yuanToFen(f.minOrderYuan);
  const fee = f.deliveryFeeYuan.trim() === '' ? null : yuanToFen(f.deliveryFeeYuan);
  if (f.minOrderYuan.trim() !== '' && minOrder == null) {
    uni.showToast({ title: locale.t('campusConfig.badAmount'), icon: 'none' });
    return;
  }
  if (f.deliveryFeeYuan.trim() !== '' && fee == null) {
    uni.showToast({ title: locale.t('campusConfig.badAmount'), icon: 'none' });
    return;
  }
  savingId.value = card.channelId;
  try {
    const saved = await campusUpdateStoreConfig(card.channelId, {
      routesEnabled: [...f.routesEnabled],
      deliveryMinutes: minutes,
      minOrderAmount: minOrder,
      deliveryFee: fee,
      storeAddress: f.storeAddress.trim() || null,
      storePhone: f.storePhone.trim() || null,
      storeNotice: f.storeNotice.trim() || null,
    });
    Object.assign(card, saved, { form: toForm(saved) });
    uni.showToast({ title: locale.t('campusConfig.saved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusConfig.saveFailed')), icon: 'none' });
  } finally {
    savingId.value = '';
  }
}

onMounted(async () => {
  try {
    const list = await campusStoreConfigs();
    cards.value = list.map((c) => ({ ...c, form: toForm(c) }));
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusConfig.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 32rpx; margin-bottom: 24rpx; }
  .head { display: flex; align-items: center; padding: 28rpx 0;
    .head-l { flex: 1; display: flex; align-items: center; gap: 12rpx; min-width: 0;
      .name { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
      .token { font-size: 22rpx; color: $wa-muted; }
    }
    .count { font-size: 24rpx; color: $wa-muted; margin-right: 12rpx; }
    .chev { color: $wa-muted; font-size: 26rpx; }
  }
  .sec-t { font-size: 26rpx; color: $wa-ink; padding: 20rpx 0 8rpx; font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 12rpx; padding: 8rpx 0 16rpx;
    .chip { padding: 10rpx 26rpx; border: 1px solid $wa-rule; border-radius: 999rpx; font-size: 24rpx; color: $wa-muted; background: $wa-card; }
    .chip.on { background: $wa-accent; border-color: $wa-accent; color: #fff; }
  }
  .cell { display: flex; align-items: center; padding: 22rpx 0; border-bottom: 1rpx solid $wa-rule;
    .lbl { width: 240rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
    input { flex: 1; font-size: 28rpx; }
    &.col { flex-direction: column; align-items: flex-start;
      .lbl { width: auto; margin-bottom: 16rpx; }
      textarea { width: 100%; height: 140rpx; font-size: 28rpx; }
    }
    &:last-of-type { border-bottom: none; }
  }
  .save { margin: 32rpx 0 24rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
