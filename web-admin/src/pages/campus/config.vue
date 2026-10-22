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
              <view class="route-head">
                <text class="route-name">{{ $t(r.key) }}</text>
                <text v-if="r.relay" class="chip">{{ $t('campusConfig.relayTag') }}</text>
                <text v-else class="chip plain">{{ $t('campusConfig.directTag') }}</text>
              </view>
              <text class="route-desc">{{ $t(r.descKey) }}</text>

              <!-- 第一段承运方：仅 R1（商户/自营快递）、R3（传信者/自营快递/外部快递）可配 -->
              <view v-if="r.options && card.form.routesEnabled.includes(r.code)" class="seg" @tap.stop>
                <text class="seg-lbl">{{ $t('campusConfig.firstLeg') }}</text>
                <view class="seg-items">
                  <view
                    v-for="o in r.options" :key="o.value"
                    class="seg-item" :class="{ on: card.form.routeFirstLeg[r.code] === o.value }"
                    @tap.stop="setFirstLeg(card, r.code, o.value)"
                  >{{ $t(o.label) }}</view>
                </view>
              </view>

              <!-- 校园交接点：R1、R2 接力起点 -->
              <view v-if="r.point && card.form.routesEnabled.includes(r.code)" class="point" @tap.stop>
                <view class="point-t">{{ $t('campusConfig.pointSection') }}</view>
                <view class="cell">
                  <text class="lbl">{{ $t('campusConfig.pointName') }}</text>
                  <input v-model="card.form.handoverPoints[r.code].name" :placeholder="$t('campusConfig.phText')" />
                </view>
                <view class="cell">
                  <text class="lbl">{{ $t('campusConfig.pointAddress') }}</text>
                  <input v-model="card.form.handoverPoints[r.code].address" :placeholder="$t('campusConfig.phText')" />
                </view>
                <view class="cell">
                  <text class="lbl">{{ $t('campusConfig.pointPhone') }}</text>
                  <input v-model="card.form.handoverPoints[r.code].phone" :placeholder="$t('campusConfig.phText')" />
                </view>
                <view class="cell">
                  <text class="lbl">{{ $t('campusConfig.pointLat') }}</text>
                  <input v-model="card.form.handoverPoints[r.code].lat" type="digit" :placeholder="$t('campusConfig.phCoord')" />
                </view>
                <view class="cell">
                  <text class="lbl">{{ $t('campusConfig.pointLng') }}</text>
                  <input v-model="card.form.handoverPoints[r.code].lng" type="digit" :placeholder="$t('campusConfig.phCoord')" />
                </view>
              </view>
            </view>
          </view>
        </view>
        <view class="sec-t">{{ $t('campusConfig.platformSection') }}</view>
        <view class="platform-tip">{{ $t('campusConfig.platformTip') }}</view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.storeLat') }}</text>
          <input v-model="card.form.storeLat" type="digit" :placeholder="$t('campusConfig.phCoord')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.storeLng') }}</text>
          <input v-model="card.form.storeLng" type="digit" :placeholder="$t('campusConfig.phCoord')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.shopNoDada') }}</text>
          <input v-model="card.form.shopNoDada" :placeholder="$t('campusConfig.phText')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.shopNoMeituan') }}</text>
          <input v-model="card.form.shopNoMeituan" :placeholder="$t('campusConfig.phText')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.timeoutAccept') }}</text>
          <input v-model="card.form.merchantAcceptMinutes" type="number" :placeholder="$t('campusConfig.phMinutes')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.timeoutPush') }}</text>
          <input v-model="card.form.externalPushTimeout" type="number" :placeholder="$t('campusConfig.phMinutes')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.timeoutFallback') }}</text>
          <input v-model="card.form.externalFallback" type="number" :placeholder="$t('campusConfig.phMinutes')" />
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
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.notifyOrderPlaced') }}</text>
          <input v-model="card.form.notifyTemplateOrderPlaced" :placeholder="$t('campusConfig.notifyPh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.notifyPaymentPending') }}</text>
          <input v-model="card.form.notifyTemplatePaymentPending" :placeholder="$t('campusConfig.notifyPh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.notifyCancelled') }}</text>
          <input v-model="card.form.notifyTemplateCancelled" :placeholder="$t('campusConfig.notifyPh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.notifyAfterSales') }}</text>
          <input v-model="card.form.notifyTemplateAfterSales" :placeholder="$t('campusConfig.notifyPh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.h5BaseUrl') }}</text>
          <input v-model="card.form.h5BaseUrl" :placeholder="$t('campusConfig.h5BaseUrlPh')" />
        </view>
        <view class="notify-tip">{{ $t('campusConfig.notifyTip') }}</view>
        <view class="sec-t">{{ $t('campusConfig.printSection') }}</view>
        <view class="pmodes">
          <view
            v-for="m in PRINT_MODES" :key="m.value"
            class="pmode" :class="{ on: card.form.printMode === m.value }"
            @tap="card.form.printMode = m.value"
          >
            <text>{{ $t(m.label) }}</text>
          </view>
        </view>
        <view class="notify-tip">{{ $t('campusConfig.printModeTip') }}</view>
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

interface RouteOption {
    value: string;
    label: string;
}

interface RouteDef {
    code: string;
    key: string;
    descKey: string;
    relay: boolean;
    point: boolean;
    options?: RouteOption[]; // 仅 R1、R3 可配第一段承运
}

const MERCHANT_OPT: RouteOption = { value: 'merchant', label: 'campusConfig.carrierMerchant' };
const OWNED_OPT: RouteOption = { value: 'owned', label: 'campusConfig.carrierOwned' };
const CAMPUS_OPT: RouteOption = { value: 'campus', label: 'campusConfig.carrierCampus' };
const EXTERNAL_OPT: RouteOption = { value: 'external', label: 'campusConfig.carrierExternal' };

/**
 * 五条路线（R6 已取消）。接力由路线决定：
 * - R1/R2 恒两段（先送到校园交接点，再由传信者接力）
 * - R3/R4/R5 一段到底
 * 只有 R1、R3 可配「第一段由谁送」；只有 R1、R2 需要填校园交接点。
 */
const ROUTES: RouteDef[] = [
    { code: 'R1', key: 'campusConfig.r1', descKey: 'campusConfig.chainR1', relay: true, point: true,
      options: [MERCHANT_OPT, OWNED_OPT] },
    { code: 'R2', key: 'campusConfig.r2', descKey: 'campusConfig.chainR2', relay: true, point: true },
    { code: 'R3', key: 'campusConfig.r3', descKey: 'campusConfig.chainR3', relay: false, point: false,
      options: [CAMPUS_OPT, OWNED_OPT, EXTERNAL_OPT] },
    { code: 'R4', key: 'campusConfig.r4', descKey: 'campusConfig.chainR4', relay: false, point: false },
    { code: 'R5', key: 'campusConfig.r5', descKey: 'campusConfig.chainR5', relay: false, point: false },
];

const PRINT_MODES = [
  { value: 'off', label: 'campusConfig.printModeOff' },
  { value: 'onPaid', label: 'campusConfig.printModeOnPaid' },
  { value: 'onAccepted', label: 'campusConfig.printModeOnAccepted' },
] as const;

interface HandoverForm {
  name: string;
  address: string;
  phone: string;
  lat: string;
  lng: string;
}

interface CardForm {
  routesEnabled: string[];
  routeFirstLeg: Record<string, string>; // 仅 R1 / R3
  handoverPoints: Record<string, HandoverForm>; // 仅 R1 / R2
  shopNoDada: string;
  shopNoMeituan: string;
  merchantAcceptMinutes: string;
  externalPushTimeout: string;
  externalFallback: string;
  storeLat: string;
  storeLng: string;
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
  notifyTemplateOrderPlaced: string;
  notifyTemplatePaymentPending: string;
  notifyTemplateCancelled: string;
  notifyTemplateAfterSales: string;
  h5BaseUrl: string;
  printMode: string;
}
interface Card extends CampusStoreConfig { form: CardForm }

const locale = useLocaleStore();
const loading = ref(true);
const cards = ref<Card[]>([]);
const expandedId = ref<string>('');
const savingId = ref<string>('');
const ensuringId = ref<string>('');

const emptyPoint = (): HandoverForm => ({ name: '', address: '', phone: '', lat: '', lng: '' });

function toForm(c: CampusStoreConfig): CardForm {
  const leg = Object.fromEntries((c.routeFirstLeg ?? []).map(x => [x.route, x.carrier]));
  const pts = Object.fromEntries((c.handoverPoints ?? []).map(x => [x.route, {
    name: x.name ?? '',
    address: x.address ?? '',
    phone: x.phone ?? '',
    lat: x.lat != null ? String(x.lat) : '',
    lng: x.lng != null ? String(x.lng) : '',
  }]));
  const shops = Object.fromEntries((c.providerShopNo ?? []).map(x => [x.provider, x.shopNo]));
  return {
    routesEnabled: [...c.routesEnabled],
    routeFirstLeg: { R1: leg.R1 ?? 'merchant', R3: leg.R3 ?? 'campus' },
    handoverPoints: { R1: pts.R1 ?? emptyPoint(), R2: pts.R2 ?? emptyPoint() },
    shopNoDada: shops.dada ?? '',
    shopNoMeituan: shops.meituan ?? '',
    merchantAcceptMinutes: String(c.merchantAcceptMinutes ?? 5),
    externalPushTimeout: String(c.externalPushTimeoutMinutes ?? 10),
    externalFallback: String(c.externalFallbackMinutes ?? 20),
    storeLat: c.storeLat != null ? String(c.storeLat) : '',
    storeLng: c.storeLng != null ? String(c.storeLng) : '',
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
    notifyTemplateOrderPlaced: c.notifyTemplateOrderPlaced ?? '',
    notifyTemplatePaymentPending: c.notifyTemplatePaymentPending ?? '',
    notifyTemplateCancelled: c.notifyTemplateCancelled ?? '',
    notifyTemplateAfterSales: c.notifyTemplateAfterSales ?? '',
    h5BaseUrl: c.h5BaseUrl ?? '',
    printMode: c.printMode ?? 'off',
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

function setFirstLeg(card: Card, route: string, carrier: string) {
  card.form.routeFirstLeg[route] = carrier;
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

  // 交接点（仅 R1/R2）：名称 + 经纬度必填，避免外部快递派不到点
  const handoverPoints: Array<{ route: string; name: string; address: string | null; phone: string | null; lat: number; lng: number }> = [];
  for (const code of ['R1', 'R2']) {
    if (!f.routesEnabled.includes(code)) continue;
    const p = f.handoverPoints[code];
    if (!p.name.trim() || p.lat.trim() === '' || p.lng.trim() === '') {
      uni.showToast({ title: locale.t('campusConfig.pointRequired'), icon: 'none' });
      return;
    }
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      uni.showToast({ title: locale.t('campusConfig.badCoord'), icon: 'none' });
      return;
    }
    handoverPoints.push({
      route: code,
      name: p.name.trim(),
      address: p.address.trim() || null,
      phone: p.phone.trim() || null,
      lat,
      lng,
    });
  }

  // 第一段承运方：仅 R1（merchant|owned）、R3（campus|owned|external）
  const routeFirstLeg = (['R1', 'R3'] as const)
    .filter((r) => f.routesEnabled.includes(r))
    .map((r) => ({ route: r, carrier: f.routeFirstLeg[r] }));

  // 外部快递门店编号：只在填写时提交，空表示沿用原值
  const providerShopNo = [['dada', f.shopNoDada], ['meituan', f.shopNoMeituan]]
    .filter(([, v]) => v.trim() !== '')
    .map(([provider, v]) => ({ provider, shopNo: v.trim() }));

  const timeout = (raw: string, def: number): number | null => {
    if (raw.trim() === '') return def;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };
  const acceptMin = timeout(f.merchantAcceptMinutes, 5);
  const pushMin = timeout(f.externalPushTimeout, 10);
  const fallbackMin = timeout(f.externalFallback, 20);
  if (acceptMin == null || pushMin == null || fallbackMin == null) {
    uni.showToast({ title: locale.t('campusConfig.badTimeout'), icon: 'none' });
    return;
  }
  const coordOf = (raw: string, limit: number): number | null | undefined => {
    if (raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && Math.abs(n) <= limit ? n : undefined;
  };
  const storeLat = coordOf(f.storeLat, 90);
  const storeLng = coordOf(f.storeLng, 180);
  if (storeLat === undefined || storeLng === undefined) {
    uni.showToast({ title: locale.t('campusConfig.badCoord'), icon: 'none' });
    return;
  }

  savingId.value = card.channelId;
  try {
    const saved = await campusUpdateStoreConfig(card.channelId, {
      routesEnabled: [...f.routesEnabled],
      routeFirstLeg,
      handoverPoints,
      providerShopNo,
      merchantAcceptMinutes: acceptMin,
      externalPushTimeoutMinutes: pushMin,
      externalFallbackMinutes: fallbackMin,
      storeLat,
      storeLng,
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
      notifyTemplateOrderPlaced: f.notifyTemplateOrderPlaced.trim() || null,
      notifyTemplatePaymentPending: f.notifyTemplatePaymentPending.trim() || null,
      notifyTemplateCancelled: f.notifyTemplateCancelled.trim() || null,
      notifyTemplateAfterSales: f.notifyTemplateAfterSales.trim() || null,
      h5BaseUrl: f.h5BaseUrl.trim() || null,
      printMode: f.printMode,
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
      .route-desc { font-size: 24rpx; color: $wa-muted; }
      .route-head { display: flex; align-items: center; gap: 12rpx; }
      .chip { font-size: 20rpx; color: $wa-accent; border: 1rpx solid $wa-accent;
        border-radius: 999rpx; padding: 2rpx 12rpx; }
      .chip.plain { color: $wa-muted; border-color: $wa-rule; }
      .seg { margin-top: 16rpx; padding: 16rpx 0 4rpx; border-top: 1rpx dashed $wa-rule;
        .seg-lbl { font-size: 23rpx; color: $wa-muted; }
        .seg-items { display: flex; gap: 12rpx; margin-top: 12rpx; }
        .seg-item { flex: 1; text-align: center; font-size: 24rpx; color: $wa-muted;
          padding: 12rpx 0; border: 1.5px solid $wa-rule; border-radius: $wa-radius; background: $wa-card; }
        .seg-item.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
      }
      .point { margin-top: 16rpx; padding-top: 12rpx; border-top: 1rpx dashed $wa-rule;
        .point-t { font-size: 23rpx; color: $wa-muted; padding: 8rpx 0; }
        .cell { padding: 14rpx 0;
          .lbl { width: 160rpx; font-size: 24rpx; }
          input { font-size: 24rpx; }
        }
      }
    }
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
  .platform-tip { font-size: 22rpx; color: $wa-muted; padding: 4rpx 0 12rpx; }
  .pmodes { display: flex; gap: 16rpx; padding: 8rpx 0 16rpx;
    .pmode { flex: 1; text-align: center; padding: 18rpx 0; font-size: 26rpx; color: $wa-muted;
      border: 1.5px solid $wa-rule; border-radius: $wa-radius; background: $wa-card; }
    .pmode.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
  }
}
</style>
