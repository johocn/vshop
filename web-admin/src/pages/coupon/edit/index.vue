<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">{{ $t('couponEdit.typeLabel') }}</text>
        <picker :range="typeLabels" @change="onTypeChange">
          <view class="ipt vpicker">
            <text>{{ typeLabel(form.type) }}</text>
            <text class="caret">▾</text>
          </view>
        </picker>
      </view>

      <view class="field">
        <text class="label">{{ $t('couponEdit.sceneLabel') }}</text>
        <picker :range="sceneLabels" @change="onSceneChange">
          <view class="ipt vpicker">
            <text>{{ sceneLabel(form.usageScene) }}</text>
            <text class="caret">▾</text>
          </view>
        </picker>
        <text v-if="form.usageScene === 'IN_STORE'" class="tip">{{ $t('couponEdit.sceneInStoreTip') }}</text>
      </view>

      <!-- 分发渠道（多选）：显式配置后不再按老字段推导 -->
      <view class="field">
        <text class="label">{{ $t('couponEdit.channelsLabel') }}</text>
        <view class="chips">
          <text
            v-for="ch in channelOptions"
            :key="ch.code"
            class="chip"
            :class="{ on: form.channels.includes(ch.code) }"
            @tap="toggleChannel(ch.code)"
          >{{ channelLabel(ch.code) }}</text>
        </view>
        <text class="tip">{{ $t('couponEdit.channelsTip') }}</text>
      </view>

      <!-- 商品专享券绑定：勾选「商品页领券」渠道时管理绑定商品 -->
      <view class="field" v-if="form.channels.includes('PRODUCT')">
        <text class="label">{{ $t('couponBinding.title') }}</text>
        <CouponBindingCard v-if="id" :template-id="id || ''" @changed="loadBound" />
        <text v-else class="tip">{{ $t('couponBinding.saveFirst') }}</text>
      </view>

      <!-- 出售价：仅「券商城」渠道可售 -->
      <view class="field" v-if="form.channels.includes('SALE')">
        <text class="label">{{ $t('couponEdit.salePriceLabel') }}</text>
        <input class="ipt" v-model="form.salePriceYuan" type="digit" :placeholder="$t('couponEdit.phSalePrice')" />
        <text class="tip">{{ $t('couponEdit.salePriceTip') }}</text>
      </view>

      <!-- 满减 / 直减 面额 -->
      <view class="field" v-if="form.type === 'FIXED' || form.type === 'FULL'">
        <text class="label">{{ form.type === 'FIXED' ? $t('couponEdit.discountLabel') : $t('couponEdit.fullLabel') }}</text>
        <input class="ipt" v-model="form.discountYuan" type="digit" :placeholder="$t('couponEdit.phAmount')" />
      </view>
      <!-- 折扣 折数 -->
      <view class="field" v-if="form.type === 'PERCENT'">
        <text class="label">{{ $t('couponEdit.percentLabel') }}</text>
        <input class="ipt" v-model="form.discountYuan" type="digit" :placeholder="$t('couponEdit.phPercent')" />
        <text class="tip">{{ $t('couponEdit.percentTip') }}</text>
      </view>

      <!-- 门槛：满减/折扣可选，直减强制 0 -->
      <view class="field" v-if="form.type === 'FIXED' || form.type === 'PERCENT'">
        <text class="label">{{ $t('couponEdit.minSpendLabel') }} <text class="opt">{{ $t('couponEdit.minSpendOpt') }}</text></text>
        <input class="ipt" v-model="form.minSpendYuan" type="digit" :placeholder="$t('couponEdit.phMinSpend')" />
      </view>

      <view class="pair">
        <view class="field">
          <text class="label">{{ $t('couponEdit.startsAtLabel') }}</text>
          <picker mode="date" :value="form.startsAt || ''" @change="form.startsAt = $event.detail.value">
            <view class="ipt vpicker"><text>{{ form.startsAt || $t('couponEdit.chooseDate') }}</text><text class="caret">▾</text></view>
          </picker>
        </view>
        <view class="field">
          <text class="label">{{ $t('couponEdit.endsAtLabel') }}</text>
          <picker mode="date" :value="form.endsAt || ''" @change="form.endsAt = $event.detail.value">
            <view class="ipt vpicker"><text>{{ form.endsAt || $t('couponEdit.chooseDate') }}</text><text class="caret">▾</text></view>
          </picker>
        </view>
      </view>
      <text class="dtime-tip">{{ $t('couponEdit.dateTip') }}</text>

      <view class="field">
        <text class="label">{{ $t('couponEdit.totalCountLabel') }} <text class="opt">{{ $t('couponEdit.zeroUnlimited') }}</text></text>
        <input class="ipt" v-model="form.totalCount" type="number" :placeholder="$t('couponEdit.phTotalCount')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('couponEdit.perUserLabel') }} <text class="opt">{{ $t('couponEdit.zeroUnlimited') }}</text></text>
        <input class="ipt" v-model="form.perUserLimit" type="number" :placeholder="$t('couponEdit.phPerUser')" />
      </view>

      <text class="lang-hd">{{ $t('couponEdit.langSection') }}</text>
      <view class="field">
        <text class="label">{{ $t('couponEdit.nameZhLabel') }}</text>
        <input class="ipt" v-model="form.nameZh" :placeholder="$t('couponEdit.phNameZh')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('couponEdit.nameEnLabel') }}</text>
        <input class="ipt" v-model="form.nameEn" :placeholder="$t('couponEdit.phNameEn')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('couponEdit.descZhLabel') }}</text>
        <textarea class="area" v-model="form.descZh" :placeholder="$t('couponEdit.phDescZh')"></textarea>
      </view>
      <view class="field">
        <text class="label">{{ $t('couponEdit.descEnLabel') }}</text>
        <textarea class="area" v-model="form.descEn" :placeholder="$t('couponEdit.phDescEn')"></textarea>
      </view>

      <text class="lang-hd">{{ $t('couponEdit.claimSection') }}</text>
      <view class="field">
        <text class="label">{{ $t('couponEdit.claimableLabel') }}</text>
        <switch :checked="form.claimable" @change="form.claimable = $event.detail.value" color="#2563eb" />
      </view>
      <view class="field">
        <text class="label">{{ $t('couponEdit.claimCodeLabel') }} <text class="opt">{{ $t('couponEdit.optional') }}</text></text>
        <input class="ipt" v-model="form.claimCode" :placeholder="$t('couponEdit.phClaimCode')" />
      </view>
      <view class="field">
        <text class="label">{{ $t('couponEdit.validDaysLabel') }} <text class="opt">{{ $t('couponEdit.optional') }}</text></text>
        <input class="ipt" v-model="form.validDays" type="number" :placeholder="$t('couponEdit.phValidDays')" />
        <text class="tip">{{ $t('couponEdit.validDaysTip') }}</text>
      </view>
      <view class="field">
        <text class="label">{{ $t('couponEdit.newCustomerLabel') }}</text>
        <switch :checked="form.newCustomerOnly" @change="form.newCustomerOnly = $event.detail.value" color="#2563eb" />
      </view>
      <view class="field">
        <text class="label">{{ $t('couponEdit.memberLevelLabel') }} <text class="opt">{{ $t('couponEdit.optional') }}</text></text>
        <input class="ipt" v-model="form.memberLevel" :placeholder="$t('couponEdit.phMemberLevel')" />
      </view>

      <text class="lang-hd">{{ $t('couponEdit.bindSection') }}</text>
      <view class="field">
        <text class="label">{{ $t('couponEdit.boundLabel') }}</text>
        <view class="bind-row">
          <text class="bind-cnt">{{ boundCountText }}</text>
          <text class="btn-mini" @tap="goBindProducts">{{ $t('couponEdit.batchPick') }}</text>
        </view>
        <text class="tip">{{ $t('couponEdit.bindTip') }}</text>
      </view>

      <view class="field">
        <text class="label">{{ $t('couponEdit.enabledLabel') }}</text>
        <switch :checked="form.enabled" @change="form.enabled = $event.detail.value" color="#2563eb" />
      </view>
    </view>

    <view class="ops">
      <button class="btn ghost" @tap="goBack">{{ $t('couponEdit.back') }}</button>
      <button class="btn main" @tap="onSave">{{ $t('couponEdit.save') }}</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  fetchCouponTemplate, createCouponTemplate, updateCouponTemplate, createProductCouponBinding,
  couponTypeLabel, CouponType, CouponTemplateInput, CouponUsageScene,
  COUPON_CHANNEL_OPTIONS, parseChannels, joinChannels, fetchCouponBoundProducts,
} from '../../../apis/coupon';
import { useLocaleStore } from '../../../stores/localeStore';
import { backToHome } from '../../../utils/h5Nav';
import CouponBindingCard from '../../../components/coupon/CouponBindingCard.vue';

const locale = useLocaleStore();

const id = ref<string | null>(null);
// 支持「商品页快捷建券」：带 productId 时，新建的模板自动绑定到该商品
const bindProductId = ref<string | null>(null);
const typeKeys: CouponType[] = ['FIXED', 'PERCENT', 'FULL', 'FREE_SHIPPING'];
const typeLabels = [locale.t('couponEdit.typeFullMinus'), locale.t('couponEdit.typeDiscount'), locale.t('couponEdit.typeDirect'), locale.t('couponEdit.typeFreeShip')];
const typeLabel = (t: CouponType) => couponTypeLabel(t);
const sceneKeys: CouponUsageScene[] = ['ONLINE', 'IN_STORE', 'ALL'];
const sceneLabels = [locale.t('couponEdit.sceneOnline'), locale.t('couponEdit.sceneInStore'), locale.t('couponEdit.sceneAll')];
const SCENE_LABEL: Record<CouponUsageScene, string> = {
  ONLINE: 'couponEdit.sceneOnline',
  IN_STORE: 'couponEdit.sceneInStore',
  ALL: 'couponEdit.sceneAll',
};
const sceneLabel = (s: CouponUsageScene) => locale.t(SCENE_LABEL[s] || 'couponEdit.sceneOnline');

// 分发渠道：代号 → i18n key（与后端 ALL_COUPON_CHANNELS 顺序一致）
const channelOptions = COUPON_CHANNEL_OPTIONS;
const CHANNEL_LABEL_KEY: Record<string, string> = {
  CENTRE: 'couponEdit.channelCentre',
  SALE: 'couponEdit.channelSale',
  POINTS: 'couponEdit.channelPoints',
  CODE: 'couponEdit.channelCode',
  PRODUCT: 'couponEdit.channelProduct',
  GRANT: 'couponEdit.channelGrant',
};
const channelLabel = (code: string) => locale.t(CHANNEL_LABEL_KEY[code] || code);

function toggleChannel(code: string) {
  const list = form.value.channels;
  const i = list.indexOf(code);
  if (i >= 0) list.splice(i, 1);
  else list.push(code);
}

function onSceneChange(e: any) {
  const s = sceneKeys[e.detail.value];
  form.value.usageScene = s;
  // 到店买单券默认 8 折：切场景时按 8 折预填折扣（商户可改）
  if (s === 'IN_STORE') {
    form.value.type = 'PERCENT';
    if (!form.value.discountYuan || Number(form.value.discountYuan) > 9) form.value.discountYuan = '8';
  }
}

const form = ref({
  type: 'FIXED' as CouponType,
  usageScene: 'ONLINE' as CouponUsageScene,
  channels: [] as string[],
  salePriceYuan: '',
  discountYuan: '',
  minSpendYuan: '',
  startsAt: '',
  endsAt: '',
  totalCount: '0',
  perUserLimit: '0',
  nameZh: '',
  nameEn: '',
  descZh: '',
  descEn: '',
  claimable: true,
  claimCode: '',
  validDays: '',
  newCustomerOnly: false,
  memberLevel: '',
  enabled: true,
});

function onTypeChange(e: any) {
  const t = typeKeys[e.detail.value];
  form.value.type = t;
  // 直减强制无门槛；免邮无需面额
  if (t === 'FULL') form.value.minSpendYuan = '0';
  if (t === 'FREE_SHIPPING') form.value.discountYuan = '';
}

function toInt(s: string): number { return Math.max(0, Math.round(Number(s) || 0)); }

function buildInput(): CouponTemplateInput {
  const f = form.value;
  const discountYuan = Number(f.discountYuan || 0);
  const discountValue = f.type === 'PERCENT'
    ? Math.round(discountYuan * 10)   // 折 → 1-99 整数（8.5 折 → 85）
    : Math.round(discountYuan * 100); // 元 → 分
  const model: CouponTemplateInput = {
    // 后端支持多语言入参（P5）：投 nameZh/nameEn/descZh/descEn，name 保留 zh 兜底。
    name: f.nameZh.trim(),
    nameZh: f.nameZh.trim(),
    nameEn: f.nameEn.trim(),
    type: f.type,
    discountValue,
    enabled: f.enabled,
    claimable: f.claimable,
    newCustomerOnly: f.newCustomerOnly,
    usageScene: f.usageScene,
    // 分发渠道：显式写入（空串=不开放任何渠道，后端回退老字段推导）
    distributionChannels: joinChannels(f.channels),
    // 出售价：仅「券商城」渠道可售，元→分；非 SALE 渠道置 0 = 不可售
    salePrice: f.channels.includes('SALE') ? Math.max(0, Math.round((Number(f.salePriceYuan) || 0) * 100)) : 0,
  };
  if (f.descZh.trim()) model.description = f.descZh.trim();
  if (f.descZh.trim()) model.descZh = f.descZh.trim();
  if (f.descEn.trim()) model.descEn = f.descEn.trim();
  if (f.type === 'FIXED' || f.type === 'PERCENT') {
    model.minSpend = Math.round((Number(f.minSpendYuan) || 0) * 100);
  }
  if (f.startsAt) model.startsAt = `${f.startsAt}T00:00:00.000Z`;
  if (f.endsAt) model.endsAt = `${f.endsAt}T23:59:59.999Z`;
  model.totalCount = toInt(f.totalCount);
  model.perUserLimit = toInt(f.perUserLimit);
  // 领取设置：空串/0 按后端语义不传（空 = 不限 / 按失效时间）
  if (f.claimCode.trim()) model.claimCode = f.claimCode.trim();
  const vd = f.validDays.trim();
  if (vd && Number(vd) > 0) model.validDays = toInt(vd);
  if (f.memberLevel.trim()) model.memberLevel = f.memberLevel.trim();
  return model;
}

async function onSave() {
  const f = form.value;
  if (!f.nameZh.trim()) { uni.showToast({ title: locale.t('couponEdit.requireNameZh'), icon: 'none' }); return; }
  if (f.type === 'FREE_SHIPPING') {
    // 免邮无面额
  } else if (!f.discountYuan || Number(f.discountYuan) <= 0) {
    uni.showToast({ title: locale.t('couponEdit.requireAmount'), icon: 'none' }); return;
  }
  if (f.startsAt && f.endsAt && f.startsAt > f.endsAt) {
    uni.showToast({ title: locale.t('couponEdit.invalidDateRange'), icon: 'none' }); return;
  }
  if (f.channels.includes('SALE') && !(Number(f.salePriceYuan) > 0)) {
    uni.showToast({ title: locale.t('couponEdit.requireSalePrice'), icon: 'none' }); return;
  }
  try {
    if (id.value) {
      await updateCouponTemplate({ id: id.value, ...buildInput() });
    } else {
      const newId = await createCouponTemplate(buildInput());
      // 商品页快捷建券：新建成功后自动绑定到该商品（商品详情高亮展示）
      if (bindProductId.value && newId) {
        await createProductCouponBinding({ productId: bindProductId.value, couponTemplateId: newId, enabled: true, displayOrder: 0 });
      }
    }
    uni.showToast({ title: locale.t('couponEdit.saved') });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponEdit.saveFailed'), icon: 'none' });
  }
}

onLoad((query: any) => {
  if (query?.id) id.value = query?.id as string;
  if (query?.productId) bindProductId.value = query?.productId as string;
});

// ---- 分发渠道回显：显式配置优先；历史券按老字段推导，避免编辑后丢渠道 ----
const boundCount = ref(0);
const formLoaded = ref(false);
const boundCountText = computed(() =>
  boundCount.value > 0
    ? locale.t('couponEdit.boundCount').replace('{n}', String(boundCount.value))
    : locale.t('couponEdit.boundNone'),
);

async function loadBound(): Promise<number> {
  if (!id.value) return 0;
  try {
    const list = await fetchCouponBoundProducts(id.value);
    boundCount.value = list.length;
    return list.length;
  } catch {
    return boundCount.value;
  }
}

/** 历史券（distributionChannels 为空）按老字段还原实际生效渠道，与后端 resolveCouponChannels 一致 */
function deriveLegacyChannels(c: CouponTemplateInput & { claimable?: boolean; pointsPrice?: number; claimCode?: string | null }, bound: number): string[] {
  const out: string[] = [];
  if (c.claimable) out.push('CENTRE');
  if (Number(c.pointsPrice ?? 0) > 0) out.push('POINTS');
  if (c.claimCode) out.push('CODE');
  if (bound > 0) out.push('PRODUCT');
  return out;
}

function goBindProducts() {
  if (!id.value) { uni.showToast({ title: locale.t('couponEdit.saveFirst'), icon: 'none' }); return; }
  uni.navigateTo({ url: `/pages/coupon/pick-products/index?templateId=${id.value}` });
}

async function loadAll() {
  if (!id.value) return;
  const c = await fetchCouponTemplate(id.value);
  if (!c) return;
  const bound = await loadBound();
  const explicit = parseChannels(c.distributionChannels);
  form.value = {
    type: c.type,
    usageScene: (c.usageScene || 'ONLINE') as CouponUsageScene,
    channels: explicit.length ? explicit : deriveLegacyChannels(c as any, bound),
    salePriceYuan: c.salePrice ? String(c.salePrice / 100) : '',
    discountYuan: c.type === 'PERCENT' ? String((c.discountValue || 0) / 10) : String((c.discountValue || 0) / 100),
    minSpendYuan: String((c.minSpend || 0) / 100),
    startsAt: c.startsAt ? c.startsAt.slice(0, 10) : '',
    endsAt: c.endsAt ? c.endsAt.slice(0, 10) : '',
    totalCount: String(c.totalCount ?? 0),
    perUserLimit: String(c.perUserLimit ?? 0),
    // 后台已按原值回传 zh_Hans/en，直接回显；无多语言时回退当前语言 name
    nameZh: c.nameZh ?? plainName(c.name),
    nameEn: c.nameEn ?? '',
    descZh: c.descZh ?? (c.description || ''),
    descEn: c.descEn ?? '',
    claimable: c.claimable ?? true,
    claimCode: c.claimCode || '',
    validDays: c.validDays != null ? String(c.validDays) : '',
    newCustomerOnly: c.newCustomerOnly ?? false,
    memberLevel: c.memberLevel || '',
    enabled: c.enabled,
  };
  formLoaded.value = true;
}

onMounted(loadAll);
// 从选品页返回时仅刷新「已绑商品」计数（首次显示时 formLoaded=false，由 onMounted 统一加载）
onShow(() => { if (formLoaded.value) loadBound(); });

  // 后端 field resolver 返回的 name 为按会话语言本地化后的纯字符串，仅作 zh 兜底
  function plainName(name: string): string { return name || ''; }

function goBack() { backToHome(); }
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .field { margin-bottom: 20rpx;
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx;
        .opt { font-size: 22rpx; color: #aaa; font-weight: 400; }
      }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; box-sizing: border-box; width: 100%; }
      .vpicker { display: flex; align-items: center; justify-content: space-between; }
      .caret { color: $wa-muted; font-size: 24rpx; }
      .tip { display: block; margin-top: 8rpx; font-size: 22rpx; color: $wa-muted; }
      .area { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; width: 100%; height: 120rpx; box-sizing: border-box; }
    }
    .pair { display: flex; gap: 12rpx;
      .field { flex: 1; margin-bottom: 0; }
    }
    .dtime-tip { display: block; margin: 6rpx 0 20rpx; font-size: 22rpx; color: $wa-muted; }
    .chips { display: flex; flex-wrap: wrap; gap: 12rpx;
      .chip { font-size: 24rpx; color: $wa-ink; background: $wa-bg; border: 1rpx solid $wa-rule; border-radius: 999rpx; padding: 8rpx 24rpx;
        &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; } } }
    .bind-row { display: flex; align-items: center; justify-content: space-between;
      .bind-cnt { font-size: 26rpx; color: $wa-ink; }
      .btn-mini { font-size: 24rpx; color: #fff; background: $wa-accent; border-radius: 999rpx; padding: 8rpx 28rpx; } }
    .lang-hd { display: block; font-size: 24rpx; color: $wa-ink; font-weight: 600; padding: 8rpx 0 16rpx; border-top: 1rpx dashed $wa-rule; margin-top: 8rpx; }
  }
  .ops { display: flex; position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx; background: #fff; box-shadow: 0 -2rpx 12rpx rgba(0,0,0,.04);
    .btn { flex: 1; margin: 0 8rpx; font-size: 28rpx; border-radius: $wa-radius; line-height: 80rpx; }
    .main { background: $wa-accent; color: #fff; }
    .ghost { background: $wa-bg; color: $wa-muted; }
  }
}
</style>