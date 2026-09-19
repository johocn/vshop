<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">券类型 *</text>
        <picker :range="typeLabels" @change="onTypeChange">
          <view class="ipt vpicker">
            <text>{{ typeLabel(form.type) }}</text>
            <text class="caret">▾</text>
          </view>
        </picker>
      </view>

      <!-- 满减 / 直减 面额 -->
      <view class="field" v-if="form.type === 'FIXED' || form.type === 'FULL'">
        <text class="label">{{ form.type === 'FIXED' ? '减免金额(元) *' : '直减金额(元) *' }}</text>
        <input class="ipt" v-model="form.discountYuan" type="digit" placeholder="如 20" />
      </view>
      <!-- 折扣 折数 -->
      <view class="field" v-if="form.type === 'PERCENT'">
        <text class="label">折扣(折) *</text>
        <input class="ipt" v-model="form.discountYuan" type="digit" placeholder="如 8.5" />
        <text class="tip">以折数填写，8.5 即 85 折</text>
      </view>

      <!-- 门槛：满减/折扣可选，直减强制 0 -->
      <view class="field" v-if="form.type === 'FIXED' || form.type === 'PERCENT'">
        <text class="label">使用门槛(元) <text class="opt">选填，0=无门槛</text></text>
        <input class="ipt" v-model="form.minSpendYuan" type="digit" placeholder="如 100" />
      </view>

      <view class="pair">
        <view class="field">
          <text class="label">生效时间</text>
          <picker mode="date" :value="form.startsAt || ''" @change="form.startsAt = $event.detail.value">
            <view class="ipt vpicker"><text>{{ form.startsAt || '请选择' }}</text><text class="caret">▾</text></view>
          </picker>
        </view>
        <view class="field">
          <text class="label">失效时间</text>
          <picker mode="date" :value="form.endsAt || ''" @change="form.endsAt = $event.detail.value">
            <view class="ipt vpicker"><text>{{ form.endsAt || '请选择' }}</text><text class="caret">▾</text></view>
          </picker>
        </view>
      </view>
      <text class="dtime-tip">不选时间为长期有效</text>

      <view class="field">
        <text class="label">发行总量 <text class="opt">0=不限</text></text>
        <input class="ipt" v-model="form.totalCount" type="number" placeholder="如 1000" />
      </view>
      <view class="field">
        <text class="label">每人限领 <text class="opt">0=不限</text></text>
        <input class="ipt" v-model="form.perUserLimit" type="number" placeholder="如 1" />
      </view>

      <text class="lang-hd">多语言文案</text>
      <view class="field">
        <text class="label">券名称（中文）*</text>
        <input class="ipt" v-model="form.nameZh" placeholder="如 满100减20" />
      </view>
      <view class="field">
        <text class="label">券名称（English）</text>
        <input class="ipt" v-model="form.nameEn" placeholder="如 20 off 100" />
      </view>
      <view class="field">
        <text class="label">券说明（中文）</text>
        <textarea class="area" v-model="form.descZh" placeholder="选填"></textarea>
      </view>
      <view class="field">
        <text class="label">券说明（English）</text>
        <textarea class="area" v-model="form.descEn" placeholder="选填"></textarea>
      </view>

      <text class="lang-hd">领取设置</text>
      <view class="field">
        <text class="label">允许用户自行领取</text>
        <switch :checked="form.claimable" @change="form.claimable = $event.detail.value" color="#2563eb" />
      </view>
      <view class="field">
        <text class="label">凭码领券 <text class="opt">选填</text></text>
        <input class="ipt" v-model="form.claimCode" placeholder="不填则不开放凭码兑换" />
      </view>
      <view class="field">
        <text class="label">领取后 N 天内有效 <text class="opt">选填</text></text>
        <input class="ipt" v-model="form.validDays" type="number" placeholder="如 30" />
        <text class="tip">0/留空=按失效时间</text>
      </view>
      <view class="field">
        <text class="label">仅限新客领取</text>
        <switch :checked="form.newCustomerOnly" @change="form.newCustomerOnly = $event.detail.value" color="#2563eb" />
      </view>
      <view class="field">
        <text class="label">会员等级限制 <text class="opt">选填</text></text>
        <input class="ipt" v-model="form.memberLevel" placeholder="如 GOLD，留空不限" />
      </view>

      <view class="field">
        <text class="label">是否可用</text>
        <switch :checked="form.enabled" @change="form.enabled = $event.detail.value" color="#2563eb" />
      </view>
    </view>

    <view class="ops">
      <button class="btn ghost" @tap="goBack">返回</button>
      <button class="btn main" @tap="onSave">保存</button>
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

const id = ref<string | null>(null);
// 支持「商品页快捷建券」：带 productId 时，新建的模板自动绑定到该商品
const bindProductId = ref<string | null>(null);
const typeKeys: CouponType[] = ['FIXED', 'PERCENT', 'FULL', 'FREE_SHIPPING'];
const typeLabels = ['满减', '折扣', '直减', '免邮'];
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
    // 后端 admin input 的 name/description 为 String!，仅能传纯字符串（当前仅提交 zh）；
    // en 多语言需后端补充多语言输入后才可投递（见问题清单），此处不组装 LocalizedText 对象。
    name: f.nameZh.trim(),
    type: f.type,
    discountValue,
    enabled: f.enabled,
    claimable: f.claimable,
    newCustomerOnly: f.newCustomerOnly,
  };
  if (f.descZh.trim()) {
    model.description = f.descZh.trim();
  }
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
  if (!f.nameZh.trim()) { uni.showToast({ title: '请填写中文券名称', icon: 'none' }); return; }
  if (f.type === 'FREE_SHIPPING') {
    // 免邮无面额
  } else if (!f.discountYuan || Number(f.discountYuan) <= 0) {
    uni.showToast({ title: '请填写面额/折扣', icon: 'none' }); return;
  }
  if (f.startsAt && f.endsAt && f.startsAt > f.endsAt) {
    uni.showToast({ title: '失效时间不能早于生效时间', icon: 'none' }); return;
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
    uni.showToast({ title: '保存成功' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '保存失败', icon: 'none' });
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

function goBack() { uni.navigateBack(); }
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