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
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchCouponTemplate, createCouponTemplate, updateCouponTemplate, createProductCouponBinding,
  couponTypeLabel, CouponType, CouponTemplateInput,
} from '../../../apis/coupon';
import { useLocaleStore } from '../../../stores/localeStore';
import { backToHome } from '../../../utils/h5Nav';

const locale = useLocaleStore();

const id = ref<string | null>(null);
// 支持「商品页快捷建券」：带 productId 时，新建的模板自动绑定到该商品
const bindProductId = ref<string | null>(null);
const typeKeys: CouponType[] = ['FIXED', 'PERCENT', 'FULL', 'FREE_SHIPPING'];
const typeLabels = [locale.t('couponEdit.typeFullMinus'), locale.t('couponEdit.typeDiscount'), locale.t('couponEdit.typeDirect'), locale.t('couponEdit.typeFreeShip')];
const typeLabel = (t: CouponType) => couponTypeLabel(t);

const form = ref({
  type: 'FIXED' as CouponType,
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

onMounted(async () => {
    if (!id.value) return;
    const c = await fetchCouponTemplate(id.value);
    if (c) {
      form.value = {
        type: c.type,
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
    }
  });

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
    .lang-hd { display: block; font-size: 24rpx; color: $wa-ink; font-weight: 600; padding: 8rpx 0 16rpx; border-top: 1rpx dashed $wa-rule; margin-top: 8rpx; }
  }
  .ops { display: flex; position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx; background: #fff; box-shadow: 0 -2rpx 12rpx rgba(0,0,0,.04);
    .btn { flex: 1; margin: 0 8rpx; font-size: 28rpx; border-radius: $wa-radius; line-height: 80rpx; }
    .main { background: $wa-accent; color: #fff; }
    .ghost { background: $wa-bg; color: $wa-muted; }
  }
}
</style>