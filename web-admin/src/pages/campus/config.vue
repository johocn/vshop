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
        <view class="routes">
          <view
            v-for="r in ROUTES" :key="r.code"
            class="route" :class="{ on: card.form.routesEnabled.includes(r.code) }"
            @tap="toggleRoute(card, r.code)"
          >
            <view class="dot" />
            <view class="route-main">
              <text class="route-name">{{ $t(r.key) }}</text>
              <text class="route-desc">{{ $t(r.descKey) }}</text>
            </view>
          </view>
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
          <text class="lbl">{{ $t('campusConfig.errandBaseFee') }}</text>
          <input v-model="card.form.errandBaseFeeYuan" type="digit" :placeholder="$t('campusConfig.errandBaseFeePh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.freeShipping') }}</text>
          <input v-model="card.form.freeShipYuan" type="digit" :placeholder="$t('campusConfig.freeShippingPh')" />
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
        <view class="sec-t">{{ $t('campusConfig.notifySection') }}</view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.notifyAccepted') }}</text>
          <input v-model="card.form.notifyTemplateAccepted" :placeholder="$t('campusConfig.notifyPh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.notifyRiderAssigned') }}</text>
          <input v-model="card.form.notifyTemplateRiderAssigned" :placeholder="$t('campusConfig.notifyPh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.notifyCookingDone') }}</text>
          <input v-model="card.form.notifyTemplateCookingDone" :placeholder="$t('campusConfig.notifyPh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.notifyDelivered') }}</text>
          <input v-model="card.form.notifyTemplateDelivered" :placeholder="$t('campusConfig.notifyPh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.notifyExceptionHandled') }}</text>
          <input v-model="card.form.notifyTemplateExceptionHandled" :placeholder="$t('campusConfig.notifyPh')" />
        </view>
        <view class="notify-tip">{{ $t('campusConfig.notifyTip') }}</view>
        <button class="save" :disabled="savingId === card.channelId" @tap="save(card)">
          {{ savingId === card.channelId ? $t('campusConfig.saving') : $t('campusConfig.save') }}
        </button>
        <button class="ensure" :disabled="ensuringId === card.channelId" @tap="ensureProfile(card)">
          {{ ensuringId === card.channelId ? $t('campusConfig.ensuring') : $t('campusConfig.ensureProfileBtn') }}
        </button>
        <view class="ensure-tip">{{ $t('campusConfig.ensureProfileTip') }}</view>
      </block>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { campusStoreConfigs, campusUpdateStoreConfig, campusEnsureDefaultShippingProfile, type CampusStoreConfig } from '../../apis/campus';
import { fenToYuan, yuanToFen } from '../../utils/money';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';

const ROUTES = [
  { code: 'R1', key: 'campusConfig.r1', descKey: 'campusConfig.r1Desc' },
  { code: 'R2', key: 'campusConfig.r2', descKey: 'campusConfig.r2Desc' },
  { code: 'R3', key: 'campusConfig.r3', descKey: 'campusConfig.r3Desc' },
  { code: 'R4', key: 'campusConfig.r4', descKey: 'campusConfig.r4Desc' },
  { code: 'R5', key: 'campusConfig.r5', descKey: 'campusConfig.r5Desc' },
] as const;

interface CardForm {
  routesEnabled: string[];
  deliveryMinutes: string;   // 输入态用字符串，提交时转 int
  minOrderYuan: string;      // 元输入态；提交转分
  deliveryFeeYuan: string;
  errandBaseFeeYuan: string; // 跑腿起步价（元输入态）；提交转分
  freeShipYuan: string;      // 满X元免配送费门槛（元输入态）；空=不启用
  storeAddress: string;
  storePhone: string;
  storeNotice: string;
  notifyTemplateAccepted: string;
  notifyTemplateRiderAssigned: string;
  notifyTemplateCookingDone: string;
  notifyTemplateDelivered: string;
  notifyTemplateExceptionHandled: string;
}
interface Card extends CampusStoreConfig { form: CardForm }

const locale = useLocaleStore();
const loading = ref(true);
const cards = ref<Card[]>([]);
const expandedId = ref<string>('');
const savingId = ref<string>('');
const ensuringId = ref<string>('');

function toForm(c: CampusStoreConfig): CardForm {
  return {
    routesEnabled: [...c.routesEnabled],
    deliveryMinutes: c.deliveryMinutes != null ? String(c.deliveryMinutes) : '',
    minOrderYuan: c.minOrderAmount != null ? fenToYuan(c.minOrderAmount) : '',
    deliveryFeeYuan: c.deliveryFee != null ? fenToYuan(c.deliveryFee) : '',
    errandBaseFeeYuan: c.errandBaseFee != null ? fenToYuan(c.errandBaseFee) : '',
    freeShipYuan: c.freeShippingThreshold != null ? fenToYuan(c.freeShippingThreshold) : '',
    storeAddress: c.storeAddress ?? '',
    storePhone: c.storePhone ?? '',
    storeNotice: c.storeNotice ?? '',
    notifyTemplateAccepted: c.notifyTemplateAccepted ?? '',
    notifyTemplateRiderAssigned: c.notifyTemplateRiderAssigned ?? '',
    notifyTemplateCookingDone: c.notifyTemplateCookingDone ?? '',
    notifyTemplateDelivered: c.notifyTemplateDelivered ?? '',
    notifyTemplateExceptionHandled: c.notifyTemplateExceptionHandled ?? '',
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
  const errandFee = f.errandBaseFeeYuan.trim() === '' ? null : yuanToFen(f.errandBaseFeeYuan);
  const freeShip = f.freeShipYuan.trim() === '' ? null : yuanToFen(f.freeShipYuan);
  if (f.freeShipYuan.trim() !== '' && freeShip == null) {
    uni.showToast({ title: locale.t('campusConfig.badAmount'), icon: 'none' });
    return;
  }
  if (f.errandBaseFeeYuan.trim() !== '' && errandFee == null) {
    uni.showToast({ title: locale.t('campusConfig.badAmount'), icon: 'none' });
    return;
  }
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
      errandBaseFee: errandFee,
      freeShippingThreshold: freeShip,
      storeAddress: f.storeAddress.trim() || null,
      storePhone: f.storePhone.trim() || null,
      storeNotice: f.storeNotice.trim() || null,
      notifyTemplateAccepted: f.notifyTemplateAccepted.trim() || null,
      notifyTemplateRiderAssigned: f.notifyTemplateRiderAssigned.trim() || null,
      notifyTemplateCookingDone: f.notifyTemplateCookingDone.trim() || null,
      notifyTemplateDelivered: f.notifyTemplateDelivered.trim() || null,
      notifyTemplateExceptionHandled: f.notifyTemplateExceptionHandled.trim() || null,
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

/** R2/R4 档案初始化：合并默认档案（store-pickup + courier-delivery）+ 补绑未绑档案变体（幂等） */
async function ensureProfile(card: Card) {
  ensuringId.value = card.channelId;
  try {
    const r = await campusEnsureDefaultShippingProfile(card.channelId);
    const lines = [locale.t('campusConfig.ensureOk')
      .replace('{methods}', r.linkedMethodCodes.join(', ') || '-')
      .replace('{n}', String(r.boundVariantCount))];
    if (r.missingMethodCodes.length) {
      lines.push(locale.t('campusConfig.ensureMissing').replace('{codes}', r.missingMethodCodes.join(', ')));
    }
    uni.showModal({ title: r.profileName, content: lines.join('\n'), showCancel: false });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusConfig.saveFailed')), icon: 'none' });
  } finally {
    ensuringId.value = '';
  }
}
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
  .routes { display: flex; flex-direction: column; gap: 16rpx; padding: 8rpx 0 16rpx;
    .route { display: flex; align-items: flex-start; gap: 16rpx; padding: 20rpx 24rpx;
      border: 1.5px solid $wa-rule; border-radius: $wa-radius; background: $wa-card; }
    .route.on { border-color: $wa-accent; }
    .dot { width: 32rpx; height: 32rpx; border-radius: 999rpx; border: 1.5px solid $wa-muted;
      flex-shrink: 0; margin-top: 2rpx; box-sizing: border-box; position: relative; }
    .route.on .dot { background: $wa-accent; border-color: $wa-accent;
      &::after { content: ''; position: absolute; left: 8rpx; top: 4rpx; width: 12rpx; height: 6rpx;
        border-left: 3rpx solid #fff; border-bottom: 3rpx solid #fff; transform: rotate(-45deg); } }
    .route-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx;
      .route-name { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
      .route-desc { font-size: 24rpx; color: $wa-muted; } }
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
  .save { margin: 32rpx 0 16rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
  .ensure { background: transparent; border: 1.5px solid $wa-accent; color: $wa-accent; font-size: 28rpx; border-radius: $wa-radius; }
  .ensure-tip { font-size: 22rpx; color: $wa-muted; padding: 8rpx 0 24rpx; }
  .notify-tip { font-size: 22rpx; color: $wa-muted; padding: 4rpx 0 24rpx; }
}
</style>
