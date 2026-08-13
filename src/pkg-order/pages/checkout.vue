<template>
  <view class="checkout-page">
    <!-- 配送方式（始终显示，置顶） -->
    <view class="section">
      <text class="section__title">配送方式</text>
      <view class="seg-control">
        <view
          v-for="tab in shippingTabs"
          :key="tab.category"
          class="seg-control__item"
          :class="{ active: activeTab === tab.category }"
          @click="switchTab(tab.category)"
        >
          <text>{{ tab.label }}</text>
        </view>
      </view>
    </view>

    <!-- 收货地址（仅邮寄方式显示） -->
    <view class="section" v-if="shippingCategory === 'shipping'">
      <text class="section__title">收货地址</text>
      <!-- 已有地址：显示当前选中地址 + 更换入口 -->
      <view v-if="selectedAddress" class="address-block" @click="showAddressPicker = true">
        <view class="address-block__top">
          <text class="address-block__name">{{ selectedAddress.fullName }}</text>
          <text class="address-block__phone">{{ selectedAddress.phoneNumber }}</text>
          <text v-if="selectedAddress.defaultShippingAddress" class="address-block__tag">默认</text>
        </view>
        <text class="address-block__detail">{{ selectedAddress.province }} {{ selectedAddress.city }} {{ selectedAddress.streetLine1 }}{{ selectedAddress.streetLine2 ? ' ' + selectedAddress.streetLine2 : '' }}</text>
        <text class="address-block__change">更换 ▾</text>
      </view>
      <!-- 无地址：显示新增表单 -->
      <view v-else class="address-form">
        <view class="address-form__tip">您还没有收货地址，请填写以下信息</view>
        <input v-model="address.fullName" placeholder="收货人姓名" class="input" />
        <input v-model="address.phoneNumber" placeholder="手机号" type="number" class="input" />
        <view class="region-row" @click="openRegionPicker('inline')">
          <text :class="{ 'region-row__placeholder': !regionText(address) }">{{ regionText(address) || '请选择省/市/区' }}</text>
          <text class="region-row__arrow">▸</text>
        </view>
        <input v-model="address.streetLine1" placeholder="详细地址" class="input" />
        <input v-model="address.streetLine2" placeholder="补充地址(可选)" class="input" />
        <view class="address-form__check">
          <text>设为默认收货地址</text>
          <switch :checked="address.defaultShippingAddress" @change="address.defaultShippingAddress = $event.detail.value" />
        </view>
        <button class="address-form__save" @click="saveNewAddress">保存并使用</button>
      </view>
    </view>

    <!-- 地址选择/管理弹窗 -->
    <view v-if="showAddressPicker" class="addr-modal-mask" @click.self="showAddressPicker = false">
      <view class="addr-modal">
        <view class="addr-modal__head">
          <text class="addr-modal__title">选择收货地址</text>
          <text class="addr-modal__close" @click="showAddressPicker = false">✕</text>
        </view>
        <scroll-view class="addr-modal__list" scroll-y>
          <view
            v-for="addr in customerAddresses"
            :key="addr.id"
            class="addr-option"
            :class="{ selected: selectedAddress?.id === addr.id }"
            @click="chooseAddress(addr)"
          >
            <view class="addr-option__top">
              <text class="addr-option__name">{{ addr.fullName }}</text>
              <text class="addr-option__phone">{{ addr.phoneNumber }}</text>
              <text v-if="addr.defaultShippingAddress" class="addr-option__tag">默认</text>
            </view>
            <text class="addr-option__detail">{{ addr.province }} {{ addr.city }} {{ addr.streetLine1 }}{{ addr.streetLine2 ? ' ' + addr.streetLine2 : '' }}</text>
            <view class="addr-option__actions">
              <text class="addr-option__edit" @click.stop="openEditForm(addr)">编辑</text>
              <text class="addr-option__del" @click.stop="deleteAddress(addr.id)">删除</text>
              <text v-if="!addr.defaultShippingAddress" class="addr-option__default" @click.stop="setDefaultAddress(addr)">设为默认</text>
            </view>
          </view>
          <view v-if="customerAddresses.length === 0" class="addr-modal__empty">
            <text>暂无收货地址</text>
          </view>
        </scroll-view>
        <view class="addr-modal__fab" @click="openAddForm">
          <text>+ 新增地址</text>
        </view>
      </view>
    </view>

    <!-- 地址新增/编辑表单弹窗 -->
    <view v-if="showAddressForm" class="addr-modal-mask" @click.self="showAddressForm = false">
      <view class="addr-modal">
        <view class="addr-modal__head">
          <text class="addr-modal__title">{{ editingAddressId ? '编辑地址' : '新增地址' }}</text>
          <text class="addr-modal__close" @click="showAddressForm = false">✕</text>
        </view>
        <scroll-view class="addr-modal__list" scroll-y>
          <input v-model="addressForm.fullName" placeholder="收货人姓名" class="input" />
          <input v-model="addressForm.phoneNumber" placeholder="手机号" type="number" class="input" />
          <view class="region-row" @click="openRegionPicker('modal')">
            <text :class="{ 'region-row__placeholder': !regionText(addressForm) }">{{ regionText(addressForm) || '请选择省/市/区' }}</text>
            <text class="region-row__arrow">▸</text>
          </view>
          <input v-model="addressForm.streetLine1" placeholder="详细地址" class="input" />
          <input v-model="addressForm.streetLine2" placeholder="补充地址(可选)" class="input" />
          <input v-model="addressForm.postalCode" placeholder="邮编(可选)" class="input" />
          <view class="address-form__check">
            <text>设为默认收货地址</text>
            <switch :checked="addressForm.defaultShippingAddress" @change="addressForm.defaultShippingAddress = $event.detail.value" />
          </view>
        </scroll-view>
        <view class="addr-modal__fab addr-modal__fab--save" @click="saveAddressForm">
          <text>保存</text>
        </view>
      </view>
    </view>

    <!-- 优惠券选择弹窗 -->
    <view v-if="showCouponPicker" class="addr-modal-mask" @click.self="showCouponPicker = false">
      <view class="addr-modal coupon-modal">
        <view class="addr-modal__head">
          <text class="addr-modal__title">选择优惠券</text>
          <text class="addr-modal__close" @click="showCouponPicker = false">✕</text>
        </view>
        <scroll-view class="addr-modal__list" scroll-y>
          <view
            v-for="mc in unusedCoupons"
            :key="mc.id"
            class="coupon-pick"
            :class="{ selected: selectedCouponCode === mc.code }"
            @click="selectCoupon(mc)"
          >
            <view class="coupon-pick__left">
              <view class="coupon-pick__amount-row">
                <text class="coupon-pick__symbol" v-if="mc.coupon?.couponType === 'fixed'">¥</text>
                <text class="coupon-pick__amount">{{ formatCouponAmount(mc) }}</text>
                <text class="coupon-pick__unit">{{ mc.coupon?.couponType === 'fixed' ? '元' : '折' }}</text>
              </view>
            </view>
            <view class="coupon-pick__right">
              <text class="coupon-pick__name">{{ mc.coupon?.name || '优惠券' }}</text>
              <text class="coupon-pick__cond">{{ formatCouponCondition(mc) }}</text>
              <text class="coupon-pick__code">券码：{{ mc.code }}</text>
            </view>
            <text class="coupon-pick__check" v-if="selectedCouponCode === mc.code">✓</text>
          </view>
          <view v-if="unusedCoupons.length === 0" class="addr-modal__empty">
            <text>暂无可用优惠券</text>
          </view>
        </scroll-view>
        <view class="coupon-modal__actions">
          <text v-if="appliedCouponCode" class="coupon-modal__btn coupon-modal__btn--remove" @click="removeAppliedCoupon">不使用优惠券</text>
          <text class="coupon-modal__btn coupon-modal__btn--confirm" @click="confirmCoupon">确定使用</text>
        </view>
      </view>
    </view>

    <!-- 自提点选择（非邮寄方式显示） -->
    <view class="section" v-if="shippingCategory !== 'shipping'">
      <text class="section__title">
        {{ shippingCategory === 'employee-pickup' ? '企业职工自提点' : '自提点选择' }}
      </text>
      <!-- 已选自提点卡片 -->
      <view v-if="selectedPickupLocation" class="pickup-card" @click="showPickupSheet = true">
        <text class="pickup-card__name">{{ selectedPickupLocation.name }}</text>
        <text class="pickup-card__addr">{{ selectedPickupLocation.address }}</text>
        <view class="pickup-card__meta">
          <text v-if="selectedPickupLocation.businessHours" class="pickup-card__hours">营业: {{ selectedPickupLocation.businessHours }}</text>
          <text v-if="pickupDistance" class="pickup-card__dist">{{ pickupDistance }}</text>
        </view>
        <text class="pickup-card__change">更换自提点 ▾</text>
      </view>
      <!-- 加载中状态 -->
      <view v-else-if="pickupLoading" class="pickup-empty">
        <text class="pickup-empty__loading">等待加载自提点...</text>
      </view>
      <!-- 加载完成但无数据 -->
      <view v-else class="pickup-empty">
        <!-- 所有自提方式均无数据：联系客服 -->
        <template v-if="allPickupTabsEmpty">
          <text class="pickup-empty__title">当前区域所有自提方式均无可用自提点</text>
          <text class="pickup-empty__hint">请选择快递配送，或联系客服反馈情况</text>
          <view class="pickup-empty__actions">
            <button class="pickup-empty__btn" @click="switchTab('shipping')">切换快递配送</button>
            <!-- #ifdef MP-WEIXIN -->
            <button class="pickup-empty__btn pickup-empty__btn--primary" open-type="contact">联系客服</button>
            <!-- #endif -->
            <!-- #ifndef MP-WEIXIN -->
            <button class="pickup-empty__btn pickup-empty__btn--primary" @click="contactSupport">联系客服</button>
            <!-- #endif -->
          </view>
        </template>
        <!-- 还有其他自提方式可选 -->
        <template v-else-if="shippingCategory === 'employee-pickup' && employeePickupLocations.length === 0">
          <text>您尚未绑定企业职工身份</text>
          <text class="pickup-empty__hint">请联系客服绑定企业自提点，或选择其他配送方式</text>
        </template>
        <template v-else>
          <text>当前区域暂无可用自提点</text>
          <text class="pickup-empty__hint">请选择其他配送方式</text>
        </template>
      </view>
    </view>

    <!-- 自提点选择弹窗 -->
    <PickupLocationSheet
      v-model:visible="showPickupSheet"
      :locations="currentPickupLocations"
      :selected-id="selectedPickupLocation?.id"
      :user-location="userLocation"
      :title="shippingCategory === 'employee-pickup' ? '选择企业职工自提点' : '选择自提点'"
      @select="onPickupSelect"
    />

    <!-- 省市区联动选择器 -->
    <RegionPicker
      v-model:visible="showRegionPicker"
      :init-province="regionTarget === 'inline' ? address.province : addressForm.province"
      :init-city="regionTarget === 'inline' ? address.city : addressForm.city"
      :init-district="regionTarget === 'inline' ? address.district : addressForm.district"
      @confirm="onRegionConfirm"
    />

    <view class="section">
      <text class="section__title">支付方式</text>
      <view v-for="pm in paymentMethods" :key="pm.id"
        class="radio-item" :class="{ active: selectedPayment === pm.code }"
        @click="selectedPayment = pm.code">
        <view class="radio-item__left">
          <text class="radio-item__icon">{{ getPaymentIcon(pm.code) }}</text>
          <text>{{ pm.name }}</text>
        </view>
        <text v-if="pm.code === 'balance-pay'" class="radio-item__balance">余额: ¥{{ balanceYuan }}</text>
      </view>
    </view>

    <!-- 优惠券 -->
    <view class="section coupon-entry" @click="openCouponPicker">
      <text class="coupon-entry__label">优惠券</text>
      <view class="coupon-entry__right">
        <text v-if="appliedCouponCode" class="coupon-entry__discount">-¥{{ couponDiscountYuan }}</text>
        <text v-else-if="unusedCoupons.length > 0" class="coupon-entry__count">{{ unusedCoupons.length }}张可用</text>
        <text v-else class="coupon-entry__none">暂无可用</text>
        <text class="coupon-entry__arrow">▸</text>
      </view>
    </view>

    <view class="checkout-page__summary" v-if="cart.order">
      <view class="summary-row"><text>商品总额</text><text>¥{{ originalSubTotalYuan }}</text></view>
      <view v-if="appliedCouponCode" class="summary-row"><text>优惠券</text><text class="coupon-entry__discount">-¥{{ couponDiscountYuan }}</text></view>
      <view class="summary-row"><text>运费</text><text>¥{{ shippingFee }}</text></view>
      <view class="summary-row summary-row--total"><text>应付</text><text class="checkout-page__total">¥{{ cart.formatPrice(cart.order.totalWithTax) }}</text></view>
    </view>

    <button class="checkout-page__submit" :disabled="submitting" @click="submitOrder">
      {{ submitting ? '处理中...' : '提交订单' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import PickupLocationSheet from '../../components/PickupLocationSheet.vue';
import RegionPicker from '../../components/RegionPicker.vue';
import type { PickupLocation } from '../../types/pickup';
import { useCartStore } from '../../stores/cart';
import { useTenantStore } from '../../stores/tenant';
import { useUIStore } from '../../stores/ui';
import { getActiveOrder, getEligibleShippingMethods, getEligibleShippingMethodsByProfile, getEligiblePaymentMethodsByProfile, getEligiblePickupLocationsByProfile, checkPickupLocationConstraint } from '../../api/queries/order';
import { getEligiblePaymentMethods, getActiveCustomer } from '../../api/queries/user';
import { getPickupLocations, getEmployeePickupLocations } from '../../api/queries/pickup';
import { setOrderShippingAddress, setOrderShippingMethod, transitionOrderToState, addPaymentToOrder, setOrderPickupLocation } from '../../api/mutations/checkout';
import { createCustomerAddress, updateCustomerAddress, deleteCustomerAddress } from '../../api/mutations/address';
import { getMyBalance } from '../../api/mutations/recharge';
import { getMyCoupons } from '../../api/queries/coupon';
import { applyCoupon, removeAppliedCoupon as removeCouponFromOrder } from '../../api/mutations/coupon';
import { handlePayment, type PaymentMethod } from '../../composables/usePayment';

type ShippingCategory = 'shipping' | 'store-pickup' | 'point-pickup' | 'employee-pickup';

const cart = useCartStore();
const tenant = useTenantStore();
const ui = useUIStore();
const shippingMethods = ref<any[]>([]);
const paymentMethods = ref<any[]>([]);
const selectedShipping = ref('');
const selectedPayment = ref('');
const submitting = ref(false);
const showAddressPicker = ref(false);
const customerAddresses = ref<any[]>([]);
const selectedAddress = ref<any>(null);
const balance = ref(0);
// 内嵌新增表单（无地址时显示）
const address = ref({ fullName: '', phoneNumber: '', streetLine1: '', streetLine2: '', city: '', province: '', district: '', postalCode: '', countryCode: 'CN', defaultShippingAddress: true });
// 弹窗新增/编辑表单
const showAddressForm = ref(false);
const editingAddressId = ref('');
const addressForm = ref({ fullName: '', phoneNumber: '', streetLine1: '', streetLine2: '', city: '', province: '', district: '', postalCode: '', countryCode: 'CN', defaultShippingAddress: false });
// 省市区联动选择器
const showRegionPicker = ref(false);
const regionTarget = ref<'inline' | 'modal'>('inline');

// 自提点相关 state
const shippingCategory = ref<ShippingCategory>('shipping');
const activeTab = ref<ShippingCategory>('shipping');
const selectedPickupLocation = ref<PickupLocation | null>(null);
const pickupLocations = ref<PickupLocation[]>([]);
const employeePickupLocations = ref<PickupLocation[]>([]);
const userLocation = ref<{ lat: number; lng: number } | null>(null);
const showPickupSheet = ref(false);
const pickupLoading = ref(false);
// 记录已尝试且无数据的自提类别
const triedEmptyCategories = ref<Set<ShippingCategory>>(new Set());

// 当前订单商品的 Profile 约束（从 cart.order.lines.productVariant.customFields 提取）
const orderShippingProfileIds = ref<string[]>([]);
const orderPaymentProfileIds = ref<string[]>([]);

// 从购物车商品提取 Profile IDs（去重）
function extractProfileIds() {
    const lines = cart.order?.lines || [];
    const spSet = new Set<string>();
    const ppSet = new Set<string>();
    for (const line of lines) {
        const cf = (line.productVariant as any)?.customFields;
        if (cf?.shippingProfileId) spSet.add(cf.shippingProfileId);
        if (cf?.paymentProfileId) ppSet.add(cf.paymentProfileId);
    }
    orderShippingProfileIds.value = [...spSet];
    orderPaymentProfileIds.value = [...ppSet];
}

// 优惠券相关
const showCouponPicker = ref(false);
const myCouponsList = ref<any[]>([]);
const selectedCouponCode = ref('');
const applyingCoupon = ref(false);

const balanceYuan = computed(() => (balance.value / 100).toFixed(2));
// 商品总额：使用 linePriceWithTax（原始行价，未扣折扣）求和，
// 因为 subTotalWithTax 已包含分摊折扣，直接用会导致折扣被重复计算。
const originalSubTotalYuan = computed(() => {
    const lines = cart.order?.lines || [];
    const total = lines.reduce((sum: number, l: any) => sum + (l.linePriceWithTax || 0), 0);
    return (total / 100).toFixed(2);
});
const shippingFee = computed(() => {
    return cart.formatPrice(cart.order?.shippingWithTax || 0);
});

// 优惠券：未使用的券
const unusedCoupons = computed(() => myCouponsList.value.filter((c: any) => (c.status || '').toUpperCase() === 'UNUSED'));
// 当前订单已应用的优惠码（自定义 applyCoupon 设置 customFields.appliedCouponCode）
const appliedCouponCode = computed(() => {
    return (cart.order as any)?.customFields?.appliedCouponCode || '';
});
// 当前订单优惠总金额（元）
const couponDiscountYuan = computed(() => {
    const discounts = cart.order?.discounts || [];
    const total = discounts.reduce((sum: number, d: any) => sum + Math.abs(d.amountWithTax || 0), 0);
    return (total / 100).toFixed(2);
});

// 当前 tab 对应的自提点列表
const currentPickupLocations = computed(() =>
    shippingCategory.value === 'employee-pickup' ? employeePickupLocations.value : pickupLocations.value
);

// 判断所有自提方式是否都无数据（用于决定是否显示联系客服）
const allPickupTabsEmpty = computed(() => {
    const pickupCats = shippingTabs.value
        .filter(t => t.category !== 'shipping')
        .map(t => t.category);
    if (pickupCats.length === 0) return false;
    return pickupCats.every(cat => triedEmptyCategories.value.has(cat));
});

// 已选自提点距离显示
const pickupDistance = computed(() => {
    if (!userLocation.value || !selectedPickupLocation.value?.coordinates) return null;
    const dist = haversineDistance(
        userLocation.value.lat,
        userLocation.value.lng,
        selectedPickupLocation.value.coordinates.lat,
        selectedPickupLocation.value.coordinates.lng
    );
    return dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
});

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPaymentIcon(code: string): string {
    const icons: Record<string, string> = { 'wechatpay': '💳', 'alipay': '💰', 'cod': '📦', 'balance-pay': '💵' };
    return icons[code] || '💳';
}

function categorizeShipping(sm: any): ShippingCategory {
    if (sm.code === 'store-pickup') return 'store-pickup';
    if (sm.code === 'pickup-point') return 'point-pickup';
    if (sm.code === 'employee-pickup') return 'employee-pickup';
    return 'shipping';
}

function tabLabel(cat: ShippingCategory): string {
    const labels: Record<ShippingCategory, string> = {
        shipping: '快递配送',
        'store-pickup': '门店自提',
        'point-pickup': '菜鸟驿站',
        'employee-pickup': '职工自提',
    };
    return labels[cat] || '配送方式';
}

// 按租户启用的配送方式分组为 Tab
const shippingTabs = computed(() => {
    const tabs: { category: ShippingCategory; label: string; method: any }[] = [];
    for (const sm of shippingMethods.value) {
        const cat = categorizeShipping(sm);
        if (!tabs.find(t => t.category === cat)) {
            tabs.push({ category: cat, label: tabLabel(cat), method: sm });
        }
    }
    return tabs;
});

function getLocationWithTimeout(ms: number): Promise<{ lat: number; lng: number } | null> {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), ms);
        uni.getLocation({
            type: 'gcj02',
            success: (res: any) => { clearTimeout(timer); resolve({ lat: res.latitude, lng: res.longitude }); },
            fail: () => { clearTimeout(timer); resolve(null); },
        });
    });
}

async function resolveLocation(): Promise<{ lat: number; lng: number } | null> {
    const pos = await getLocationWithTimeout(3000);
    if (pos) { userLocation.value = pos; return pos; }
    const tenantStore = useTenantStore();
    if (tenantStore.defaultLocation) return tenantStore.defaultLocation;
    return null;
}

// 切换 Tab
async function switchTab(category: ShippingCategory) {
    activeTab.value = category;
    shippingCategory.value = category;
    selectedPickupLocation.value = null;

    const tab = shippingTabs.value.find(t => t.category === category);
    if (!tab) return;
    selectedShipping.value = tab.method.id;

    if (category === 'shipping') {
        // 快递方式：同步 shipping method 到后端，并用返回值更新订单（含运费）
        try {
            const res: any = await setOrderShippingMethod([tab.method.id]);
            if (res?.setOrderShippingMethod?.id) cart.setOrder(res.setOrderShippingMethod);
        } catch (e) { console.warn('[checkout] setOrderShippingMethod failed', e); }
        return;
    }

    // 清空旧数据 + 进入加载态
    pickupLoading.value = true;
    if (category === 'employee-pickup') {
        employeePickupLocations.value = [];
    } else {
        pickupLocations.value = [];
    }

    const location = await resolveLocation();
    if (category === 'employee-pickup') {
        try {
            const res: any = await getEmployeePickupLocations(location);
            employeePickupLocations.value = res.employeePickupLocations || [];
            if (employeePickupLocations.value.length > 0) {
                selectedPickupLocation.value = employeePickupLocations.value[0];
                triedEmptyCategories.value.delete(category);
            } else {
                triedEmptyCategories.value.add(category);
            }
        } catch (e) { console.warn('[checkout] load employeePickupLocations failed', e); triedEmptyCategories.value.add(category); }
    } else {
        const type = category === 'store-pickup' ? 'store' : 'point';
        // Profile 级自提点过滤：优先按商品 Profile 关联的自提点交集过滤
        const profileIds = orderShippingProfileIds.value;
        let usedProfileFilter = false;
        if (profileIds.length > 0) {
            try {
                const [locRes, constrainedRes]: any = await Promise.all([
                    getEligiblePickupLocationsByProfile(profileIds),
                    checkPickupLocationConstraint(profileIds),
                ]);
                const constrained = constrainedRes?.checkPickupLocationConstraint === true;
                const profileLocs = (locRes?.eligiblePickupLocationsByProfile || [])
                    .filter((l: any) => !type || l.type === type);
                if (constrained) {
                    // Profile 约束了自提点：直接用交集结果（即使为空也展示"无可用"）
                    pickupLocations.value = profileLocs as PickupLocation[];
                    usedProfileFilter = true;
                    if (pickupLocations.value.length > 0) {
                        selectedPickupLocation.value = pickupLocations.value[0];
                        triedEmptyCategories.value.delete(category);
                    } else {
                        triedEmptyCategories.value.add(category);
                    }
                }
                // constrained=false → 未约束，回退到全量查询
            } catch (e) { console.warn('[checkout] Profile 级自提点过滤失败，回退到全量', e); }
        }
        if (!usedProfileFilter) {
            try {
                const res: any = await getPickupLocations(type, location);
                pickupLocations.value = res.pickupLocations || [];
                if (pickupLocations.value.length > 0) {
                    selectedPickupLocation.value = pickupLocations.value[0];
                    triedEmptyCategories.value.delete(category);
                } else {
                    triedEmptyCategories.value.add(category);
                }
            } catch (e) { console.warn('[checkout] load pickupLocations failed', e); triedEmptyCategories.value.add(category); }
        }
    }
    pickupLoading.value = false;
    // 同步 shipping method 到后端，并用返回值更新订单（含运费）
    try {
        const res: any = await setOrderShippingMethod([tab.method.id]);
        if (res?.setOrderShippingMethod?.id) cart.setOrder(res.setOrderShippingMethod);
    } catch (e) { console.warn('[checkout] setOrderShippingMethod failed', e); }
}

// 弹窗选中回调
function onPickupSelect(loc: PickupLocation) {
    selectedPickupLocation.value = loc;
}

// 非微信平台联系客服（回退提示）
function contactSupport() {
    uni.showModal({
        title: '联系客服',
        content: '当前区域所有自提方式均无可用自提点，请通过微信客服或致电管理员反馈情况。',
        showCancel: false,
        confirmText: '知道了',
    });
}

// ===== 收货地址管理 =====
function emptyAddressForm() {
    return { fullName: '', phoneNumber: '', streetLine1: '', streetLine2: '', city: '', province: '', district: '', postalCode: '', countryCode: 'CN', defaultShippingAddress: false };
}

// 省市区显示文本
function regionText(form: any): string {
    if (form.province) {
        return [form.province, form.city, form.district].filter(Boolean).join(' ');
    }
    return '';
}

// 打开省市区选择器
function openRegionPicker(target: 'inline' | 'modal') {
    regionTarget.value = target;
    showRegionPicker.value = true;
}

// 省市区选择确认
function onRegionConfirm(region: { province: string; city: string; district: string }) {
    const form = regionTarget.value === 'inline' ? address.value : addressForm.value;
    form.province = region.province;
    form.city = region.city;
    form.district = region.district;
}

// 合并区+详细地址为 streetLine1（发送给后端时使用）
function buildStreetLine1(form: any): string {
    if (form.district) {
        return `${form.district} ${form.streetLine1}`.trim();
    }
    return form.streetLine1;
}

// 重新加载客户地址列表
async function reloadCustomerAddresses() {
    try {
        const custRes: any = await getActiveCustomer();
        customerAddresses.value = custRes.activeCustomer?.addresses || [];
    } catch (e) { console.warn('[checkout] reloadCustomerAddresses failed', e); }
}

// 选择地址（点击列表项）
function chooseAddress(addr: any) {
    selectedAddress.value = addr;
    showAddressPicker.value = false;
}

// 打开新增地址表单
function openAddForm() {
    editingAddressId.value = '';
    addressForm.value = emptyAddressForm();
    showAddressForm.value = true;
}

// 打开编辑地址表单
function openEditForm(addr: any) {
    editingAddressId.value = addr.id;
    // 尝试从 streetLine1 中提取区名（格式："区名 详细地址"）
    let district = '';
    let detailLine = addr.streetLine1 || '';
    const streetParts = detailLine.split(' ');
    if (streetParts.length > 1 && streetParts[0].endsWith('区')) {
        district = streetParts[0];
        detailLine = streetParts.slice(1).join(' ');
    }
    addressForm.value = {
        fullName: addr.fullName || '',
        phoneNumber: addr.phoneNumber || '',
        province: addr.province || '',
        city: addr.city || '',
        district,
        streetLine1: detailLine,
        streetLine2: addr.streetLine2 || '',
        postalCode: addr.postalCode || '',
        countryCode: addr.country?.code || 'CN',
        defaultShippingAddress: addr.defaultShippingAddress || false,
    };
    showAddressForm.value = true;
}

// 保存地址表单（新增或编辑）
async function saveAddressForm() {
    if (!addressForm.value.fullName || !addressForm.value.phoneNumber || !addressForm.value.streetLine1) {
        ui.showToast('请填写必要信息');
        return;
    }
    try {
        ui.showLoading();
        const payload = { ...addressForm.value, streetLine1: buildStreetLine1(addressForm.value) };
        delete (payload as any).district;
        if (editingAddressId.value) {
            await updateCustomerAddress({ id: editingAddressId.value, ...payload });
        } else {
            await createCustomerAddress(payload);
        }
        ui.showToast('保存成功', 'success');
        showAddressForm.value = false;
        await reloadCustomerAddresses();
        // 如果当前没有选中地址，选第一个
        if (!selectedAddress.value && customerAddresses.value.length > 0) {
            selectedAddress.value = customerAddresses.value.find((a: any) => a.defaultShippingAddress) || customerAddresses.value[0];
        } else if (selectedAddress.value && editingAddressId.value === selectedAddress.value.id) {
            // 编辑了当前选中地址，同步更新
            const updated = customerAddresses.value.find((a: any) => a.id === editingAddressId.value);
            if (updated) selectedAddress.value = updated;
        }
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
}

// 内嵌新增表单保存（无地址时）
async function saveNewAddress() {
    if (!address.value.fullName || !address.value.phoneNumber || !address.value.streetLine1) {
        ui.showToast('请填写必要信息');
        return;
    }
    try {
        ui.showLoading();
        const payload = { ...address.value, streetLine1: buildStreetLine1(address.value) };
        delete (payload as any).district;
        const res: any = await createCustomerAddress(payload);
        ui.showToast('保存成功', 'success');
        await reloadCustomerAddresses();
        // 选中刚创建的地址
        if (res?.createCustomerAddress) {
            selectedAddress.value = res.createCustomerAddress;
        } else if (customerAddresses.value.length > 0) {
            selectedAddress.value = customerAddresses.value[customerAddresses.value.length - 1];
        }
        // 清空内嵌表单
        address.value = { fullName: '', phoneNumber: '', streetLine1: '', streetLine2: '', city: '', province: '', district: '', postalCode: '', countryCode: 'CN', defaultShippingAddress: true };
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
}

// 删除地址
function deleteAddress(id: string) {
    uni.showModal({
        title: '确认',
        content: '确定删除该地址?',
        success: async (res: any) => {
            if (res.confirm) {
                try {
                    ui.showLoading();
                    await deleteCustomerAddress(id);
                    ui.showToast('已删除', 'success');
                    await reloadCustomerAddresses();
                    // 如果删除的是当前选中地址，切换到默认或第一个
                    if (selectedAddress.value?.id === id) {
                        selectedAddress.value = customerAddresses.value.find((a: any) => a.defaultShippingAddress) || customerAddresses.value[0] || null;
                    }
                } catch (e: any) { ui.showToast(e.message); }
                ui.hideLoading();
            }
        }
    });
}

// 设为默认地址
async function setDefaultAddress(addr: any) {
    try {
        ui.showLoading();
        await updateCustomerAddress({ id: addr.id, defaultShippingAddress: true });
        ui.showToast('已设为默认', 'success');
        await reloadCustomerAddresses();
        // 同步当前选中地址
        if (selectedAddress.value?.id === addr.id) {
            selectedAddress.value = customerAddresses.value.find((a: any) => a.id === addr.id) || selectedAddress.value;
        }
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
}

onMounted(async () => {
    // 加载租户 channel 配置（employeePickupMode、defaultLocation）
    await tenant.loadChannelConfig();
    // 加载我的优惠券（用于结算页选择）
    loadMyCoupons();
    // Load saved addresses
    try { const custRes: any = await getActiveCustomer(); customerAddresses.value = custRes.activeCustomer?.addresses || []; if (customerAddresses.value.length > 0) { selectedAddress.value = customerAddresses.value.find((a: any) => a.defaultShippingAddress) || customerAddresses.value[0]; } } catch (e) {}
    try {
        // 先加载 active order，提取商品的 Profile 约束
        const orderRes: any = await getActiveOrder();
        if (orderRes.activeOrder) cart.setOrder(orderRes.activeOrder);
        extractProfileIds();

        const [shipRes, payRes]: any = await Promise.all([getEligibleShippingMethods(), getEligiblePaymentMethods()]);
        let shipList = shipRes.eligibleShippingMethods || [];

        // Profile 级配送方式过滤：仅保留商品 Profile 交集允许的配送方式
        if (orderShippingProfileIds.value.length > 0) {
            try {
                const profileShipRes: any = await getEligibleShippingMethodsByProfile(orderShippingProfileIds.value);
                const allowedCodes = new Set((profileShipRes?.eligibleShippingMethodsByProfile || []).map((m: any) => m.code));
                shipList = shipList.filter((sm: any) => allowedCodes.has(sm.code));
            } catch (e) { console.warn('[checkout] Profile 级配送方式过滤失败，回退到全量', e); }
        }
        shippingMethods.value = shipList;

        // 支付方式
        let payList = (payRes.eligiblePaymentMethods || []).filter((p: any) => p.isEligible);

        // Profile 级支付方式过滤
        if (orderPaymentProfileIds.value.length > 0) {
            try {
                const profilePayRes: any = await getEligiblePaymentMethodsByProfile(orderPaymentProfileIds.value);
                const allowedPayCodes = new Set((profilePayRes?.eligiblePaymentMethodsByProfile || []).map((m: any) => m.code));
                if (allowedPayCodes.size > 0) {
                    payList = payList.filter((p: any) => allowedPayCodes.has(p.code));
                }
            } catch (e) { console.warn('[checkout] Profile 级支付方式过滤失败，回退到全量', e); }
        }

        const seen = new Set<string>();
        paymentMethods.value = payList.filter((p: any) => {
            if (seen.has(p.code)) return false;
            seen.add(p.code);
            return true;
        });
        if (paymentMethods.value.length > 0) selectedPayment.value = paymentMethods.value[0].code;
        // Load balance
        try { const balRes: any = await getMyBalance(); balance.value = balRes.myRechargeBalance || 0; } catch (e) {}
        // 默认选中第一个 Tab
        if (shippingTabs.value.length > 0) {
            await switchTab(shippingTabs.value[0].category);
        }
    } catch (e) { console.error(e); }
});

// ===== 优惠券 =====
async function loadMyCoupons() {
    try {
        const res: any = await getMyCoupons();
        myCouponsList.value = res.myCoupons || [];
    } catch (e) { console.warn('[checkout] loadMyCoupons failed', e); }
}

function openCouponPicker() {
    selectedCouponCode.value = appliedCouponCode.value || '';
    showCouponPicker.value = true;
    if (myCouponsList.value.length === 0) loadMyCoupons();
}

function selectCoupon(mc: any) {
    selectedCouponCode.value = mc.code;
}

async function confirmCoupon() {
    if (!selectedCouponCode.value) { ui.showToast('请选择优惠券'); return; }
    if (!cart.order?.id) { ui.showToast('订单未创建'); return; }
    if (applyingCoupon.value) return;
    applyingCoupon.value = true;
    try {
        ui.showLoading();
        const res: any = await applyCoupon(cart.order.id, selectedCouponCode.value);
        const result = res.applyCoupon;
        if (result?.valid) {
            // 应用成功，刷新订单获取最新折扣信息
            const orderRes: any = await getActiveOrder();
            if (orderRes.activeOrder) {
                cart.setOrder(orderRes.activeOrder);
            }
            ui.showToast('优惠券已应用', 'success');
            showCouponPicker.value = false;
        } else {
            ui.showToast(result?.error || '优惠券不可用');
        }
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
    applyingCoupon.value = false;
}

async function removeAppliedCoupon() {
    if (!appliedCouponCode.value) return;
    if (!cart.order?.id) return;
    try {
        ui.showLoading();
        await removeCouponFromOrder(cart.order.id);
        // removeCoupon 返回 Boolean，需刷新订单获取最新折扣信息
        const orderRes: any = await getActiveOrder();
        if (orderRes.activeOrder) cart.setOrder(orderRes.activeOrder);
        ui.showToast('已移除', 'success');
        showCouponPicker.value = false;
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
}

function formatCouponAmount(mc: any): string {
    const c = mc.coupon || {};
    if (c.couponType === 'fixed') return (c.discountValue / 100).toString();
    const zhe = (100 - c.discountValue) / 10;
    return zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1);
}

function formatCouponCondition(mc: any): string {
    const c = mc.coupon || {};
    const minSpend = c.minSpend ? c.minSpend / 100 : 0;
    let cond = minSpend > 0 ? `满${minSpend}元可用` : '无门槛';
    if (c.couponType === 'percentage' && c.maxDiscount) {
        cond += `，最高减${c.maxDiscount / 100}元`;
    }
    return cond;
}

async function submitOrder() {
    if (submitting.value) return;
    submitting.value = true;
    try {
        ui.showLoading();
        if (shippingCategory.value === 'shipping') {
            // 邮寄方式：设置收货地址
            if (!selectedAddress.value) {
                // 没有已选地址，尝试用内嵌表单数据
                if (!address.value.fullName || !address.value.phoneNumber || !address.value.streetLine1) {
                    ui.showToast('请填写收货地址');
                    ui.hideLoading();
                    submitting.value = false;
                    return;
                }
                await setOrderShippingAddress({ ...address.value, streetLine1: buildStreetLine1(address.value) });
            } else {
                // 已有地址，传 id 让后端关联
                await setOrderShippingAddress({
                    id: selectedAddress.value.id,
                    fullName: selectedAddress.value.fullName,
                    phoneNumber: selectedAddress.value.phoneNumber,
                    streetLine1: selectedAddress.value.streetLine1,
                    streetLine2: selectedAddress.value.streetLine2 || '',
                    city: selectedAddress.value.city,
                    province: selectedAddress.value.province,
                    postalCode: selectedAddress.value.postalCode || '',
                    countryCode: selectedAddress.value.country?.code || 'CN',
                });
            }
        } else {
            // 自提方式：设置自提点
            if (!selectedPickupLocation.value) {
                ui.showToast('请选择自提点');
                ui.hideLoading();
                submitting.value = false;
                return;
            }
            await setOrderPickupLocation(selectedPickupLocation.value.id, shippingCategory.value);
        }
        // Set shipping method
        if (selectedShipping.value) await setOrderShippingMethod([selectedShipping.value]);
        // Transition to ArrangingPayment
        await transitionOrderToState('ArrangingPayment');
        // Build payment metadata (wechatpay JSAPI requires openid)
        const paymentMetadata: Record<string, any> = {};
        if (selectedPayment.value === 'wechatpay') {
            const openid = uni.getStorageSync('auth_openid');
            if (openid) paymentMetadata.openid = openid;
        }
        // Add payment
        const payRes: any = await addPaymentToOrder(selectedPayment.value, paymentMetadata);
        const order = payRes.addPaymentToOrder;
        if (order?.state === 'PaymentSettled' || order?.state === 'PaymentAuthorized') {
            uni.redirectTo({ url: '/pkg-order/pages/pay-result?code=' + order.code + '&status=success' });
        } else {
            // 从最新一笔 payment 取 metadata（后端在 payment.metadata 中返回支付参数）
            const lastPayment = order?.payments?.[order.payments.length - 1];
            const result = await handlePayment(selectedPayment.value as PaymentMethod, {
                ...lastPayment,
                orderCode: order?.code,
                orderState: order?.state,
            });
            if (result.success) {
                uni.redirectTo({ url: '/pkg-order/pages/pay-result?code=' + (order?.code || '') + '&status=success' });
            } else {
                uni.redirectTo({ url: '/pkg-order/pages/pay-result?code=' + (order?.code || '') + '&status=pending' });
            }
        }
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
    submitting.value = false;
}
</script>

<style lang="scss" scoped>
.checkout-page {
    padding: 20rpx; padding-bottom: 140rpx;
    &__summary { background: #fff; padding: 20rpx; border-radius: $radius-md; margin-top: 20rpx; }
    &__total { font-size: 36rpx; color: $price-color; font-weight: bold; }
    &__submit { position: fixed; bottom: 20rpx; left: 20rpx; right: 20rpx; height: 90rpx; background: $brand-color; color: #fff; font-size: 32rpx; border-radius: $radius-md; border: none; }
    &__submit[disabled] { opacity: 0.6; }
}
.section {
    background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 20rpx;
    &__title { font-size: 30rpx; font-weight: bold; margin-bottom: 16rpx; display: block; }
}
.address-block {
    padding: 16rpx 0; position: relative;
    &__top { display: flex; align-items: center; gap: 16rpx; }
    &__name { font-size: 30rpx; font-weight: bold; }
    &__phone { font-size: 26rpx; color: #666; }
    &__tag { font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color; padding: 2rpx 12rpx; border-radius: 20rpx; }
    &__detail { font-size: 24rpx; color: $text-color-secondary; display: block; margin-top: 8rpx; }
    &__change { position: absolute; right: 0; top: 16rpx; font-size: 24rpx; color: $brand-color; }
}
.address-form {
    &__tip { font-size: 26rpx; color: $text-color-secondary; margin-bottom: 16rpx; }
    &__check { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0; font-size: 28rpx; }
    &__save { margin-top: 20rpx; height: 80rpx; background: $brand-color; color: #fff; border: none; border-radius: $radius-md; font-size: 28rpx; }
}
.input { height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; }
.region-row {
    height: 80rpx; border-bottom: 1rpx solid $border-color;
    display: flex; align-items: center; justify-content: space-between;
    font-size: 28rpx; color: #333;
    &__placeholder { color: #999; }
    &__arrow { color: #ccc; font-size: 24rpx; }
}
.addr-modal-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: flex-end; }
.addr-modal {
    background: #fff; width: 100%; border-radius: 24rpx 24rpx 0 0; padding: 30rpx; max-height: 80vh; display: flex; flex-direction: column;
    &__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
    &__title { font-size: 32rpx; font-weight: bold; }
    &__close { font-size: 36rpx; color: #999; padding: 0 10rpx; }
    &__list { flex: 1; max-height: 60vh; }
    &__empty { padding: 60rpx 0; text-align: center; text { font-size: 28rpx; color: #999; } }
    &__fab {
        margin-top: 20rpx; height: 90rpx; background: $brand-color; color: #fff;
        display: flex; align-items: center; justify-content: center; border-radius: $radius-md;
        text { font-size: 30rpx; }
        &--save { background: #07c160; }
    }
}
.addr-option {
    padding: 24rpx 0; border-bottom: 1rpx solid $border-color;
    &.selected { background: #f0ecff; }
    &__top { display: flex; align-items: center; gap: 16rpx; margin-bottom: 8rpx; }
    &__name { font-size: 28rpx; font-weight: bold; }
    &__phone { font-size: 24rpx; color: #666; }
    &__tag { font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color; padding: 2rpx 12rpx; border-radius: 20rpx; }
    &__detail { font-size: 24rpx; color: $text-color-secondary; display: block; }
    &__actions { display: flex; gap: 24rpx; margin-top: 12rpx; }
    &__edit { font-size: 24rpx; color: $brand-color; }
    &__del { font-size: 24rpx; color: #999; }
    &__default { font-size: 24rpx; color: #07c160; }
}
.radio-item {
    display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $border-color;
    &.active { color: $brand-color; }
    &__left { display: flex; align-items: center; gap: 12rpx; }
    &__icon { font-size: 36rpx; }
    &__price { color: $text-color-secondary; }
    &__balance { font-size: 24rpx; color: $text-color-secondary; }
}
.summary-row {
    display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 28rpx;
    &--total { padding-top: 16rpx; border-top: 1rpx solid $border-color; margin-top: 8rpx; }
}
.pickup-item {
    padding: 20rpx 0; border-bottom: 1rpx solid $border-color;
    &.active { color: $brand-color; }
    &__name { font-size: 28rpx; font-weight: bold; display: block; }
    &__addr { font-size: 24rpx; color: $text-color-secondary; display: block; margin-top: 6rpx; }
    &__hours { font-size: 24rpx; color: $text-color-secondary; display: block; margin-top: 4rpx; }
}
.pickup-empty {
    padding: 40rpx 0; text-align: center;
    text { font-size: 28rpx; color: $text-color-secondary; display: block; }
    &__title { font-size: 28rpx; color: #333; font-weight: 500; }
    &__hint { font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; }
    &__loading { color: #8a8a90; }
    &__actions { display: flex; gap: 20rpx; justify-content: center; margin-top: 24rpx; }
    &__btn {
        height: 72rpx; line-height: 72rpx; padding: 0 32rpx; font-size: 26rpx;
        border-radius: 36rpx; border: 1rpx solid $border-color; background: #fff; color: #333;
        &--primary { background: $brand-color; color: #fff; border-color: $brand-color; }
    }
}
.seg-control {
    display: flex; gap: 8rpx; background: #f7f7f8; padding: 8rpx; border-radius: 8rpx; margin-bottom: 16rpx;
    &__item {
        flex: 1; text-align: center; padding: 16rpx 8rpx; border-radius: 8rpx;
        font-size: 24rpx; color: #8a8a90; transition: all 0.15s;
        &.active { background: #fff; color: #6b4fff; font-weight: 500; box-shadow: 0 1rpx 4rpx rgba(0,0,0,0.06); }
    }
}
.pickup-card {
    padding: 24rpx 0; border-bottom: 1rpx solid $border-color; position: relative;
    &__name { font-size: 28rpx; font-weight: bold; display: block; }
    &__addr { font-size: 24rpx; color: $text-color-secondary; display: block; margin-top: 6rpx; }
    &__meta { display: flex; gap: 20rpx; margin-top: 8rpx; }
    &__hours { font-size: 24rpx; color: $text-color-secondary; }
    &__dist { font-size: 24rpx; color: #ff8a3d; }
    &__change { position: absolute; right: 0; top: 24rpx; font-size: 24rpx; color: $brand-color; }
}
.coupon-entry {
    display: flex; align-items: center; justify-content: space-between;
    &__label { font-size: 30rpx; font-weight: bold; }
    &__right { display: flex; align-items: center; gap: 8rpx; }
    &__discount { font-size: 28rpx; color: $price-color; font-weight: bold; }
    &__count { font-size: 26rpx; color: $brand-color; }
    &__none { font-size: 26rpx; color: #999; }
    &__arrow { font-size: 24rpx; color: #ccc; }
}
.coupon-modal {
    &__actions { display: flex; gap: 16rpx; padding: 20rpx 0 0; }
    &__btn {
        flex: 1; height: 88rpx; line-height: 88rpx; text-align: center;
        border-radius: $radius-md; font-size: 30rpx;
        &--remove { background: #f7f7f8; color: #666; }
        &--confirm { background: $brand-color; color: #fff; }
    }
}
.coupon-pick {
    display: flex; align-items: center; padding: 24rpx 0; border-bottom: 1rpx solid $border-color; position: relative;
    &.selected { background: #f7f5ff; }
    &__left {
        width: 160rpx; background: linear-gradient(135deg, $brand-color, #8a6fff);
        border-radius: $radius-sm; padding: 16rpx 0; margin-right: 20rpx;
        display: flex; align-items: center; justify-content: center; color: #fff;
    }
    &__amount-row { display: flex; align-items: baseline; }
    &__symbol { font-size: 24rpx; font-weight: bold; }
    &__amount { font-size: 44rpx; font-weight: bold; line-height: 1; }
    &__unit { font-size: 22rpx; margin-left: 4rpx; }
    &__right { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    &__name { font-size: 28rpx; font-weight: bold; color: #333; }
    &__cond { font-size: 24rpx; color: #999; margin-top: 6rpx; }
    &__code { font-size: 22rpx; color: #666; margin-top: 6rpx; }
    &__check { position: absolute; right: 16rpx; color: $brand-color; font-size: 36rpx; }
}
</style>
