<template>
  <view class="page">
    <!-- 动态计价试算：当前供需 + 各分区加价拆解（按当前登录渠道） -->
    <view class="dpp" v-if="preview">
      <view class="dpp-head">
        <text class="dpp-title">{{ $t('campusConfig.dppTitle') }}</text>
        <text class="dpp-refresh" @tap="loadPreview">{{ $t('campusConfig.dppRefresh') }}</text>
      </view>
      <view class="dpp-meta">
        <view class="kv"><text class="k">{{ $t('campusConfig.dppBacklog') }}</text><text class="v">{{ preview.backlog }}</text></view>
        <view class="kv"><text class="k">{{ $t('campusConfig.dppRiders') }}</text><text class="v">{{ preview.onlineRiders }}</text></view>
        <view class="kv"><text class="k">{{ $t('campusConfig.dppMultiplier') }}</text><text class="v">{{ preview.manualMultiplier }}×</text></view>
        <view class="kv"><text class="k">{{ $t('campusConfig.dppMaxAdd') }}</text><text class="v">¥{{ fenToYuanFixed(preview.maxAddFee) }}</text></view>
      </view>
      <text class="dpp-off" v-if="!preview.enabled">{{ $t('campusConfig.dppOff') }}</text>
      <!-- R5 跑腿起步价：未配置按默认 2 元 -->
      <view class="dpp-row">
        <view class="dpp-row__main">
          <text class="zn">{{ $t('campusConfig.dppErrand') }}</text>
          <text class="pr">¥{{ fenToYuanFixed(preview.errand.baseFee) }} → ¥{{ fenToYuanFixed(preview.errand.price) }}</text>
          <text class="ad" :class="{ on: preview.errand.addFee > 0 }">{{ preview.errand.addFee > 0 ? '+' + fenToYuanFixed(preview.errand.addFee) : $t('campusConfig.dppNoAdd') }}</text>
        </view>
        <text class="br" v-if="preview.errand.breakdown.length">{{ breakdownText(preview.errand.breakdown) }}</text>
        <text class="br" v-else-if="!preview.errand.configured">{{ $t('campusConfig.dppErrandDefault') }}</text>
      </view>
      <!-- R2 第三方到校：未配置基价则不接管，沿用店铺普通快递运费 -->
      <view class="dpp-row">
        <view class="dpp-row__main" v-if="preview.thirdParty">
          <text class="zn">{{ $t('campusConfig.dppThirdParty') }}</text>
          <text class="pr">¥{{ fenToYuanFixed(preview.thirdParty.baseFee) }} → ¥{{ fenToYuanFixed(preview.thirdParty.price) }}</text>
          <text class="ad" :class="{ on: preview.thirdParty.addFee > 0 }">{{ preview.thirdParty.addFee > 0 ? '+' + fenToYuanFixed(preview.thirdParty.addFee) : $t('campusConfig.dppNoAdd') }}</text>
        </view>
        <view class="dpp-row__main" v-else>
          <text class="zn">{{ $t('campusConfig.dppThirdParty') }}</text>
          <text class="pr">{{ $t('campusConfig.dppNotConfigured') }}</text>
        </view>
        <text class="br" v-if="preview.thirdParty && preview.thirdParty.breakdown.length">{{ breakdownText(preview.thirdParty.breakdown) }}</text>
      </view>
      <view v-for="z in preview.zones" :key="z.zoneId" class="dpp-row">
        <view class="dpp-row__main">
          <text class="zn">{{ z.zoneName }}</text>
          <text class="pr">¥{{ fenToYuanFixed(z.baseFee) }} → ¥{{ fenToYuanFixed(z.price) }}</text>
          <text class="ad" :class="{ on: z.addFee > 0 }">{{ z.addFee > 0 ? '+' + fenToYuanFixed(z.addFee) : $t('campusConfig.dppNoAdd') }}</text>
        </view>
        <text class="br" v-if="z.breakdown.length">{{ breakdownText(z.breakdown) }}</text>
      </view>
      <text class="dpp-note">{{ $t('campusConfig.dppNote') }}</text>
    </view>
    <!-- 履约参数 + 时段容量（按当前登录渠道，CampusConfig 权限） -->
    <view class="card" v-if="ops">
      <view class="head" @tap="opsOpen = !opsOpen">
        <view class="head-l">
          <text class="name">{{ $t('campusConfig.opsTitle') }}</text>
          <text class="token">{{ $t('campusConfig.opsChannelHint') }}</text>
        </view>
        <text class="chev">{{ opsOpen ? '▾' : '▸' }}</text>
      </view>
      <block v-if="opsOpen">
        <view class="sec-t">{{ $t('campusConfig.opsSection') }}</view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.opsCommission') }}</text>
          <input v-model="ops.commission" type="number" :placeholder="$t('campusConfig.phMinutes')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.opsAutoAssign') }}</text>
          <input v-model="ops.autoAssign" type="number" :placeholder="$t('campusConfig.phMinutes')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.opsAutoRefund') }}</text>
          <input v-model="ops.autoRefund" type="number" :placeholder="$t('campusConfig.phMinutes')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.opsSla') }}</text>
          <input v-model="ops.sla" type="number" :placeholder="$t('campusConfig.phMinutes')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.opsMerchantAutoOpen') }}</text>
          <input v-model="ops.merchantAutoOpen" type="number" :placeholder="$t('campusConfig.phMinutes')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.opsCompensationCoupon') }}</text>
          <input v-model="ops.compensationCoupon" :placeholder="$t('campusConfig.phText')" />
        </view>
        <view class="pmode-row">
          <view class="pmode" :class="{ on: ops.merchantConfirm }" @tap="ops.merchantConfirm = !ops.merchantConfirm">
            <text>{{ $t(ops.merchantConfirm ? 'campusConfig.opsMerchantConfirmOn' : 'campusConfig.opsMerchantConfirmOff') }}</text>
          </view>
          <text class="timeout-tip">{{ $t('campusConfig.opsMerchantConfirmTip') }}</text>
        </view>
        <view class="pmode-row">
          <view class="pmode" :class="{ on: ops.paused }" @tap="ops.paused = !ops.paused">
            <text>{{ $t(ops.paused ? 'campusConfig.opsPausedOn' : 'campusConfig.opsPausedOff') }}</text>
          </view>
          <text class="timeout-tip">{{ $t('campusConfig.opsPausedTip') }}</text>
        </view>
        <view class="pmode-row">
          <view class="pmode" :class="{ on: ops.shiftCheck }" @tap="ops.shiftCheck = !ops.shiftCheck">
            <text>{{ $t(ops.shiftCheck ? 'campusConfig.opsShiftCheckOn' : 'campusConfig.opsShiftCheckOff') }}</text>
          </view>
          <text class="timeout-tip">{{ $t('campusConfig.opsShiftCheckTip') }}</text>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.opsBlacklistAuto') }}</text>
          <input v-model="ops.blacklistAuto" type="number" :placeholder="'0'" />
        </view>
        <text class="timeout-tip">{{ $t('campusConfig.opsBlacklistAutoTip') }}</text>
        <view class="pmode-row">
          <view class="pmode" :class="{ on: ops.timeoutEnabled }" @tap="toggleOpsTimeout">
            <text>{{ $t(ops.timeoutEnabled ? 'campusConfig.timeoutOn' : 'campusConfig.timeoutOff') }}</text>
          </view>
          <text class="timeout-tip">{{ $t('campusConfig.timeoutTip') }}</text>
        </view>
        <view v-if="ops.timeoutEnabled" class="cell">
          <text class="lbl">{{ $t('campusConfig.timeoutGrace') }}</text>
          <input v-model="ops.timeoutGrace" type="number" :placeholder="$t('campusConfig.phMinutes')" />
        </view>
        <view v-if="ops.timeoutEnabled" class="cell">
          <text class="lbl">{{ $t('campusConfig.timeoutWindow') }}</text>
          <input v-model="ops.timeoutWindow" type="number" :placeholder="$t('campusConfig.phHours')" />
        </view>
        <view v-if="ops.timeoutEnabled" class="cell">
          <text class="lbl">{{ $t('campusConfig.timeoutCoupon') }}</text>
          <input v-model="ops.timeoutCoupon" :placeholder="$t('campusConfig.timeoutCouponPh')" />
        </view>
        <button class="save" :disabled="opsSaving" @tap="saveOps">
          {{ opsSaving ? $t('campusConfig.saving') : $t('campusConfig.save') }}
        </button>
      </block>
    </view>

    <view class="card" v-if="ops">
      <view class="head" @tap="slotsOpen = !slotsOpen">
        <view class="head-l">
          <text class="name">{{ $t('campusConfig.slotTitle') }}</text>
          <text class="token">{{ slots.length ? $t('campusConfig.slotCount').replace('{n}', String(slots.length)) : $t('campusConfig.slotEmpty') }}</text>
        </view>
        <text class="chev">{{ slotsOpen ? '▾' : '▸' }}</text>
      </view>
      <block v-if="slotsOpen">
        <view class="sec-t">{{ $t('campusConfig.slotCreate') }}</view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.slotDate') }}</text>
          <picker mode="date" :value="slotForm.slotDate" @change="(e: any) => (slotForm.slotDate = e.detail.value)">
            <view class="fld picker">{{ slotForm.slotDate || $t('campusConfig.slotDatePh') }}</view>
          </picker>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.slotStart') }}</text>
          <picker mode="time" :value="slotForm.startTime" @change="(e: any) => (slotForm.startTime = e.detail.value)">
            <view class="fld picker">{{ slotForm.startTime || '08:00' }}</view>
          </picker>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.slotEnd') }}</text>
          <picker mode="time" :value="slotForm.endTime" @change="(e: any) => (slotForm.endTime = e.detail.value)">
            <view class="fld picker">{{ slotForm.endTime || '09:00' }}</view>
          </picker>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusConfig.slotCapacity') }}</text>
          <input v-model="slotForm.capacity" type="number" :placeholder="$t('campusConfig.slotCapacityPh')" />
        </view>
        <button class="save" :disabled="slotCreating" @tap="createSlot">
          {{ slotCreating ? $t('campusConfig.saving') : $t('campusConfig.slotAdd') }}
        </button>
        <view class="sec-t">{{ $t('campusConfig.slotList') }}</view>
        <view class="slot-row" v-for="s in slots" :key="s.id">
          <view class="slot-row__main">
            <text class="slot-date">{{ s.slotDate }} {{ s.startTime }}-{{ s.endTime }}</text>
            <text class="slot-usage">{{ $t('campusConfig.slotUsage').replace('{u}', String(s.lockedCount)).replace('{c}', String(s.capacity)) }}</text>
          </view>
          <view class="slot-row__acts">
            <input class="slot-cap" v-model="slotEdit[s.id]" type="number" :placeholder="String(s.capacity)" />
            <text class="slot-act" @tap="saveSlot(s)">{{ $t('campusConfig.save') }}</text>
            <text class="slot-act" :class="{ off: !s.active }" @tap="toggleSlot(s)">{{ $t(s.active ? 'campusConfig.slotDisable' : 'campusConfig.slotEnable') }}</text>
          </view>
        </view>
      </block>
    </view>
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

              <!-- 校园交接点：R1、R2 接力起点，同一路线可配多个（按收货楼栋取最近） -->
              <view v-if="r.point && card.form.routesEnabled.includes(r.code)" class="point" @tap.stop>
                <view class="point-t">{{ $t('campusConfig.pointSection') }}</view>
                <view class="point-hint">{{ $t('campusConfig.pointMultiHint') }}</view>
                <view class="point-row" v-for="(p, pi) in card.form.handoverPoints[r.code]" :key="pi">
                  <view class="point-row__head">
                    <text class="point-row__idx">#{{ pi + 1 }}</text>
                    <text class="point-default" :class="{ on: p.isDefault }" @tap.stop="setDefaultPoint(card, r.code, pi)">{{ $t('campusConfig.pointDefault') }}</text>
                    <text class="point-del" v-if="card.form.handoverPoints[r.code].length > 1" @tap.stop="removePoint(card, r.code, pi)">{{ $t('campusConfig.pointRemove') }}</text>
                  </view>
                  <view class="cell">
                    <text class="lbl">{{ $t('campusConfig.pointName') }}</text>
                    <input v-model="p.name" :placeholder="$t('campusConfig.phText')" />
                  </view>
                  <view class="cell">
                    <text class="lbl">{{ $t('campusConfig.pointAddress') }}</text>
                    <input v-model="p.address" :placeholder="$t('campusConfig.phText')" />
                  </view>
                  <view class="cell">
                    <text class="lbl">{{ $t('campusConfig.pointPhone') }}</text>
                    <input v-model="p.phone" :placeholder="$t('campusConfig.phText')" />
                  </view>
                  <view class="cell">
                    <text class="lbl">{{ $t('campusConfig.pointLat') }}</text>
                    <input v-model="p.lat" type="digit" :placeholder="$t('campusConfig.phCoord')" />
                  </view>
                  <view class="cell">
                    <text class="lbl">{{ $t('campusConfig.pointLng') }}</text>
                    <input v-model="p.lng" type="digit" :placeholder="$t('campusConfig.phCoord')" />
                  </view>
                </view>
                <view class="point-add" @tap.stop="addPoint(card, r.code)">+ {{ $t('campusConfig.pointAdd') }}</view>
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
          <text class="lbl">{{ $t('campusConfig.thirdPartyBaseFee') }}</text>
          <input v-model="card.form.thirdPartyBaseFeeYuan" type="digit" :placeholder="$t('campusConfig.thirdPartyBaseFeePh')" />
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
          <text class="lbl">{{ $t('campusConfig.notifyAddressChanged') }}</text>
          <input v-model="card.form.notifyTemplateAddressChanged" :placeholder="$t('campusConfig.notifyPh')" />
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
        <view class="sec-t">{{ $t('campusConfig.timeoutSection') }}</view>
        <view class="pmode-row">
          <view class="pmode" :class="{ on: card.form.timeoutCompensation }" @tap="toggleTimeout(card)">
            <text>{{ $t(card.form.timeoutCompensation ? 'campusConfig.timeoutOn' : 'campusConfig.timeoutOff') }}</text>
          </view>
          <text class="timeout-tip">{{ $t('campusConfig.timeoutTip') }}</text>
        </view>
        <view v-if="card.form.timeoutCompensation" class="cell">
          <text class="lbl">{{ $t('campusConfig.timeoutGrace') }}</text>
          <input v-model="card.form.timeoutGraceMinutes" type="number" :placeholder="$t('campusConfig.phMinutes')" />
        </view>
        <view v-if="card.form.timeoutCompensation" class="cell">
          <text class="lbl">{{ $t('campusConfig.timeoutWindow') }}</text>
          <input v-model="card.form.timeoutWindowHours" type="number" :placeholder="$t('campusConfig.phHours')" />
        </view>
        <view v-if="card.form.timeoutCompensation" class="cell">
          <text class="lbl">{{ $t('campusConfig.timeoutCoupon') }}</text>
          <picker
            v-if="couponTemplates.length"
            mode="selector"
            :range="couponNames"
            @change="(e: any) => onTimeoutCouponPick(card, Number(e.detail.value))"
          >
            <view class="timeout-picker">{{ timeoutCouponName(card) || $t('campusConfig.timeoutCouponPickPh') }}</view>
          </picker>
          <input v-else v-model="card.form.timeoutCouponTemplateId" :placeholder="$t('campusConfig.timeoutCouponPh')" />
        </view>
        <view v-if="card.form.timeoutCompensation && card.form.timeoutCouponTemplateId" class="cell">
          <text class="lbl">{{ $t('campusConfig.timeoutCouponId') }}</text>
          <text class="timeout-id">{{ card.form.timeoutCouponTemplateId }}</text>
          <text class="timeout-clear" @tap="card.form.timeoutCouponTemplateId = ''">{{ $t('campusConfig.clear') }}</text>
        </view>
        <view v-if="card.form.timeoutCompensation && !card.form.timeoutCouponTemplateId.trim()" class="notify-tip danger">
          {{ $t('campusConfig.timeoutCouponMissing') }}
        </view>
        <view class="sec-t">{{ $t('campusConfig.dpSection') }}</view>
        <view class="pmode-row">
          <view class="pmode" :class="{ on: card.form.dpEnabled }" @tap="toggleDp(card)">
            <text>{{ $t(card.form.dpEnabled ? 'campusConfig.dpOn' : 'campusConfig.dpOff') }}</text>
          </view>
          <text class="timeout-tip">{{ $t('campusConfig.dpTip') }}</text>
        </view>
        <block v-if="card.form.dpEnabled">
          <view class="dp-sub">{{ $t('campusConfig.dpPeakSection') }}</view>
          <view v-for="(p, pi) in card.form.dpPeaks" :key="pi" class="dp-peak">
            <input v-model="p.start" class="dp-time" placeholder="08:00" />
            <text class="dp-dash">-</text>
            <input v-model="p.end" class="dp-time" placeholder="09:00" />
            <input v-model="p.addYuan" class="dp-add" type="digit" :placeholder="$t('campusConfig.dpAddPh')" />
            <text class="dp-del" @tap="removePeak(card, pi)">{{ $t('campusConfig.pointRemove') }}</text>
          </view>
          <view class="point-add" @tap="addPeak(card)">+ {{ $t('campusConfig.dpAddPeak') }}</view>
          <view class="dp-sub">{{ $t('campusConfig.dpSupplySection') }}</view>
          <view class="pmode-row">
            <view class="pmode" :class="{ on: card.form.dpSupply }" @tap="card.form.dpSupply = !card.form.dpSupply">
              <text>{{ $t(card.form.dpSupply ? 'campusConfig.dpSupplyOn' : 'campusConfig.dpSupplyOff') }}</text>
            </view>
            <text class="timeout-tip">{{ $t('campusConfig.dpSupplyTip') }}</text>
          </view>
          <block v-if="card.form.dpSupply">
            <view class="cell">
              <text class="lbl">{{ $t('campusConfig.dpBacklog') }}</text>
              <input v-model="card.form.dpBacklog" type="number" :placeholder="$t('campusConfig.dpBacklogPh')" />
            </view>
            <view class="cell">
              <text class="lbl">{{ $t('campusConfig.dpSupplyAdd') }}</text>
              <input v-model="card.form.dpSupplyAddYuan" type="digit" :placeholder="$t('campusConfig.dpAddPh')" />
            </view>
            <view class="cell">
              <text class="lbl">{{ $t('campusConfig.dpRelease') }}</text>
              <input v-model="card.form.dpReleaseBacklog" type="number" :placeholder="$t('campusConfig.dpReleasePh')" />
            </view>
          </block>
          <view class="cell">
            <text class="lbl">{{ $t('campusConfig.dpMultiplier') }}</text>
            <input v-model="card.form.dpMultiplier" type="digit" :placeholder="$t('campusConfig.dpMultiplierPh')" />
          </view>
          <view class="cell">
            <text class="lbl">{{ $t('campusConfig.dpMaxAdd') }}</text>
            <input v-model="card.form.dpMaxAddYuan" type="digit" :placeholder="$t('campusConfig.dpAddPh')" />
          </view>
          <view class="notify-tip">{{ $t('campusConfig.dpMaxTip') }}</view>
        </block>
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
import { onMounted, ref, reactive, computed } from 'vue';
import {
  campusStoreConfigs,
  campusUpdateStoreConfig,
  campusEnsureDefaultShippingProfile,
  campusDynamicPricingPreview,
  campusConfig as fetchCampusConfig,
  campusUpdateConfig,
  campusSlots as fetchCampusSlots,
  campusCreateSlot,
  campusUpdateSlot,
  type CampusStoreConfig,
  type CampusDynamicPricingPreview,
  type CampusPricingBreakdownItem,
  type CampusDeliverySlot,
} from '../../apis/campus';
import { fetchCouponTemplates, type CouponTemplateItem } from '../../apis/coupon';
import { fenToYuan, fenToYuanFixed, yuanToFen } from '../../utils/money';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusConfig');

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
  isDefault: boolean;
}

interface PeakForm {
  start: string;   // HH:mm
  end: string;     // HH:mm（不支持跨天）
  addYuan: string; // 加价（元输入态）
}

interface CardForm {
  routesEnabled: string[];
  routeFirstLeg: Record<string, string>; // 仅 R1 / R3
  handoverPoints: Record<string, HandoverForm[]>; // 仅 R1 / R2，可多个
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
  thirdPartyBaseFeeYuan: string; // R2 第三方到校基价（元输入态）；空=不接管，沿用店铺普通快递运费
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
  notifyTemplateAddressChanged: string;
  h5BaseUrl: string;
  printMode: string;
  timeoutCompensation: boolean;         // 超时赔付开关（默认关，灰度开）
  timeoutGraceMinutes: string;          // 宽限分钟（超过才赔）
  timeoutWindowHours: string;           // 赔付回扫窗口（小时，1-168）
  timeoutCouponTemplateId: string;      // 独立赔付券模板（与 T4 无骑手补偿券隔离）
  dpEnabled: boolean;                   // 动态计价总开关
  dpPeaks: PeakForm[];                  // 时段高峰（可多段）
  dpSupply: boolean;                    // 供需紧张加价开关
  dpBacklog: string;                    // 大厅积压阈值（单）
  dpSupplyAddYuan: string;              // 供需加价（元）
  dpReleaseBacklog: string;             // 回落阈值（单，可空）
  dpMultiplier: string;                 // 手动倍率 1.0–2.0
  dpMaxAddYuan: string;                 // 单笔加价封顶（元）
}
interface Card extends CampusStoreConfig { form: CardForm }

const locale = useLocaleStore();
const loading = ref(true);
const cards = ref<Card[]>([]);
const expandedId = ref<string>('');
const savingId = ref<string>('');
const ensuringId = ref<string>('');
const preview = ref<CampusDynamicPricingPreview | null>(null);

// ===== 履约参数（当前登录渠道）+ 时段容量 =====
interface OpsForm {
  commission: string;
  autoAssign: string;
  autoRefund: string;
  sla: string;
  merchantAutoOpen: string;
  compensationCoupon: string;
  merchantConfirm: boolean;
  paused: boolean;
  shiftCheck: boolean;
  blacklistAuto: string;
  timeoutEnabled: boolean;
  timeoutGrace: string;
  timeoutWindow: string;
  timeoutCoupon: string;
}
const ops = ref<OpsForm | null>(null);
const opsOpen = ref(true);
const opsSaving = ref(false);
const slots = ref<CampusDeliverySlot[]>([]);
const slotsOpen = ref(false);
const slotCreating = ref(false);
const slotEdit = reactive<Record<string, string>>({});
const slotForm = reactive({ slotDate: '', startTime: '08:00', endTime: '09:00', capacity: '20' });

async function loadOps() {
  try {
    const c = await fetchCampusConfig();
    ops.value = {
      commission: String(c.riderCommissionRate ?? 100),
      autoAssign: String(c.autoAssignMinutes ?? 10),
      autoRefund: String(c.autoRefundMinutes ?? 30),
      sla: String(c.inProgressSlaMinutes ?? 45),
      merchantAutoOpen: String(c.merchantAutoOpenMinutes ?? 15),
      compensationCoupon: c.compensationCouponTemplateId ?? '',
      merchantConfirm: !!c.merchantConfirmEnabled,
      paused: !!c.paused,
      shiftCheck: !!c.shiftCheckEnabled,
      blacklistAuto: String(c.blacklistAutoCancelCount ?? 0),
      timeoutEnabled: !!c.timeoutCompensationEnabled,
      timeoutGrace: String(c.timeoutGraceMinutes ?? 10),
      timeoutWindow: String(c.timeoutCompensationWindowHours ?? 24),
      timeoutCoupon: c.timeoutCompensationCouponTemplateId ?? '',
    };
    slots.value = await fetchCampusSlots();
  } catch {
    // 无 CampusConfig 权限或渠道未初始化：整块隐藏，不打断店铺配置页
    ops.value = null;
  }
}

function toggleOpsTimeout() {
  if (!ops.value) return;
  ops.value.timeoutEnabled = !ops.value.timeoutEnabled;
}

/** 非负整数校验：空=默认值，非法=null（调用方提示） */
function intOr(raw: string, def: number): number | null {
  const t = raw.trim();
  if (t === '') return def;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

async function saveOps() {
  const f = ops.value;
  if (!f) return;
  const commission = intOr(f.commission, 100);
  const autoAssign = intOr(f.autoAssign, 10);
  const autoRefund = intOr(f.autoRefund, 30);
  const sla = intOr(f.sla, 45);
  const merchantAutoOpen = intOr(f.merchantAutoOpen, 15);
  const grace = intOr(f.timeoutGrace, 10);
  const windowH = intOr(f.timeoutWindow, 24);
  const blacklistAuto = intOr(f.blacklistAuto, 0);
  if (commission == null || commission > 100) {
    uni.showToast({ title: locale.t('campusConfig.badCommission'), icon: 'none' });
    return;
  }
  if (autoAssign == null || autoRefund == null || sla == null || merchantAutoOpen == null) {
    uni.showToast({ title: locale.t('campusConfig.badTimeout'), icon: 'none' });
    return;
  }
  if (grace == null || grace > 240) {
    uni.showToast({ title: locale.t('campusConfig.badGrace'), icon: 'none' });
    return;
  }
  if (windowH == null || windowH < 1 || windowH > 168) {
    uni.showToast({ title: locale.t('campusConfig.badWindow'), icon: 'none' });
    return;
  }
  if (blacklistAuto == null || blacklistAuto > 50) {
    uni.showToast({ title: locale.t('campusConfig.badBlacklistAuto'), icon: 'none' });
    return;
  }
  if (f.timeoutEnabled && !f.timeoutCoupon.trim()) {
    uni.showToast({ title: locale.t('campusConfig.timeoutCouponRequired'), icon: 'none' });
    return;
  }
  opsSaving.value = true;
  try {
    const saved = await campusUpdateConfig({
      riderCommissionRate: commission,
      autoAssignMinutes: autoAssign,
      autoRefundMinutes: autoRefund,
      inProgressSlaMinutes: sla,
      merchantAutoOpenMinutes: merchantAutoOpen,
      compensationCouponTemplateId: f.compensationCoupon.trim() || null,
      merchantConfirmEnabled: f.merchantConfirm,
      paused: f.paused,
      shiftCheckEnabled: f.shiftCheck,
      blacklistAutoCancelCount: blacklistAuto,
      timeoutCompensationEnabled: f.timeoutEnabled,
      timeoutGraceMinutes: grace,
      timeoutCompensationWindowHours: windowH,
      timeoutCompensationCouponTemplateId: f.timeoutCoupon.trim() || null,
    });
    ops.value = {
      ...f,
      commission: String(saved.riderCommissionRate),
      autoAssign: String(saved.autoAssignMinutes),
      autoRefund: String(saved.autoRefundMinutes),
      sla: String(saved.inProgressSlaMinutes),
      merchantAutoOpen: String(saved.merchantAutoOpenMinutes),
      compensationCoupon: saved.compensationCouponTemplateId ?? '',
      merchantConfirm: !!saved.merchantConfirmEnabled,
      paused: !!saved.paused,
      shiftCheck: !!saved.shiftCheckEnabled,
      blacklistAuto: String(saved.blacklistAutoCancelCount ?? 0),
      timeoutEnabled: !!saved.timeoutCompensationEnabled,
      timeoutGrace: String(saved.timeoutGraceMinutes),
      timeoutWindow: String(saved.timeoutCompensationWindowHours ?? 24),
      timeoutCoupon: saved.timeoutCompensationCouponTemplateId ?? '',
    };
    uni.showToast({ title: locale.t('campusConfig.saved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusConfig.saveFailed')), icon: 'none' });
  } finally {
    opsSaving.value = false;
  }
}

async function createSlot() {
  const date = slotForm.slotDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    uni.showToast({ title: locale.t('campusConfig.slotBadDate'), icon: 'none' });
    return;
  }
  if (!slotForm.startTime || !slotForm.endTime || slotForm.endTime <= slotForm.startTime) {
    uni.showToast({ title: locale.t('campusConfig.slotBadTime'), icon: 'none' });
    return;
  }
  const capacity = intOr(slotForm.capacity, 20);
  if (capacity == null || capacity < 1) {
    uni.showToast({ title: locale.t('campusConfig.slotBadCapacity'), icon: 'none' });
    return;
  }
  slotCreating.value = true;
  try {
    await campusCreateSlot({
      slotDate: date,
      startTime: slotForm.startTime,
      endTime: slotForm.endTime,
      capacity,
    });
    slots.value = await fetchCampusSlots();
    uni.showToast({ title: locale.t('campusConfig.slotAdded'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusConfig.saveFailed')), icon: 'none' });
  } finally {
    slotCreating.value = false;
  }
}

async function saveSlot(s: CampusDeliverySlot) {
  const raw = (slotEdit[s.id] ?? '').trim();
  const capacity = intOr(raw, s.capacity);
  if (capacity == null || capacity < Math.max(0, s.lockedCount)) {
    uni.showToast({ title: locale.t('campusConfig.slotCapacityTooLow').replace('{n}', String(s.lockedCount)), icon: 'none' });
    return;
  }
  try {
    const saved = await campusUpdateSlot(s.id, { capacity });
    Object.assign(s, saved);
    slotEdit[s.id] = '';
    uni.showToast({ title: locale.t('campusConfig.saved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusConfig.saveFailed')), icon: 'none' });
  }
}

async function toggleSlot(s: CampusDeliverySlot) {
  try {
    const saved = await campusUpdateSlot(s.id, { active: !s.active });
    Object.assign(s, saved);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusConfig.saveFailed')), icon: 'none' });
  }
}

// ===== 超时赔付券模板选择器（与调度台同源券模板列表）=====
const couponTemplates = ref<CouponTemplateItem[]>([]);
const couponNames = computed(() => couponTemplates.value.map(t => `${t.name || t.id}`));

async function loadCoupons() {
  try {
    const { items } = await fetchCouponTemplates({ skip: 0, take: 50 });
    couponTemplates.value = items;
  } catch { /* 券模板接口不可用时回退为手填 ID */ }
}

function timeoutCouponName(card: Card): string {
  const id = card.form.timeoutCouponTemplateId;
  const hit = couponTemplates.value.find(t => String(t.id) === String(id));
  return hit ? `${hit.name || hit.id}` : '';
}

function onTimeoutCouponPick(card: Card, index: number) {
  const tpl = couponTemplates.value[index];
  if (tpl) card.form.timeoutCouponTemplateId = String(tpl.id);
}

/** 加价拆解文案：时段高峰 3 元 · 运力紧张 2 元 · 手动 1.2x 1 元 */
function breakdownText(items: CampusPricingBreakdownItem[]): string {
  return items.map((b) => `${b.label} ¥${fenToYuanFixed(b.fee)}`).join(' · ');
}

/** 动态计价试算：按当前登录渠道取实时供需与分区报价（失败不打断配置页） */
async function loadPreview() {
  try {
    preview.value = await campusDynamicPricingPreview();
  } catch {
    preview.value = null;
  }
}

const emptyPoint = (): HandoverForm => ({ name: '', address: '', phone: '', lat: '', lng: '', isDefault: false });

/** 同一路线可配多个交接点：按距离收货楼栋取最近，默认点用于收货楼栋无坐标时兜底 */
function addPoint(card: CardForm, code: string) {
  (card.form.handoverPoints[code] ??= []).push(emptyPoint());
}
function removePoint(card: CardForm, code: string, idx: number) {
  const list = card.form.handoverPoints[code];
  if (!list || list.length <= 1) return; // 至少保留一行，避免无输入框可填
  list.splice(idx, 1);
  if (!list.some(p => p.isDefault) && list[0]) list[0].isDefault = true;
}
function setDefaultPoint(card: CardForm, code: string, idx: number) {
  (card.form.handoverPoints[code] ?? []).forEach((p, i) => { p.isDefault = i === idx; });
}

interface DpParsed {
  enabled: boolean;
  peakWindows: Array<{ start: string; end: string; addFee: number }>;
  supply: { backlogThreshold: number; addFee: number; releaseBacklog: number | null } | null;
  manualMultiplier: number;
  maxAddFee: number;
}

/**
 * 解析后台下发的动态计价 JSON（坏 JSON / 未启用一律回退默认关闭态）。
 * 与后端 parseDynamicPricing 口径一致：enabled !== true 时忽略其余字段。
 */
function parseDp(raw: string | null): DpParsed {
  const def: DpParsed = { enabled: false, peakWindows: [], supply: null, manualMultiplier: 1, maxAddFee: 600 };
  if (!raw) return def;
  try {
    const r = JSON.parse(raw);
    if (!r || r.enabled !== true) return def;
    const num = (v: any, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
    return {
      enabled: true,
      peakWindows: Array.isArray(r.peakWindows)
        ? r.peakWindows
            .filter((w: any) => w && typeof w.start === 'string' && typeof w.end === 'string')
            .map((w: any) => ({ start: w.start, end: w.end, addFee: num(w.addFee, 0) }))
        : [],
      supply: r.supply && typeof r.supply === 'object'
        ? {
            backlogThreshold: num(r.supply.backlogThreshold, 5),
            addFee: num(r.supply.addFee, 0),
            releaseBacklog: typeof r.supply.releaseBacklog === 'number' ? r.supply.releaseBacklog : null,
          }
        : null,
      manualMultiplier: Math.min(2, Math.max(1, num(r.manualMultiplier, 1))),
      maxAddFee: num(r.maxAddFee, 600),
    };
  } catch (_e) {
    return def;
  }
}

function toggleDp(card: Card) {
  card.form.dpEnabled = !card.form.dpEnabled;
}

function addPeak(card: Card) {
  card.form.dpPeaks.push({ start: '', end: '', addYuan: '' });
}

function removePeak(card: Card, idx: number) {
  card.form.dpPeaks.splice(idx, 1);
}

function toForm(c: CampusStoreConfig): CardForm {
  const leg = Object.fromEntries((c.routeFirstLeg ?? []).map(x => [x.route, x.carrier]));
  const pts: Record<string, HandoverForm[]> = { R1: [], R2: [] };
  for (const x of c.handoverPoints ?? []) {
    (pts[x.route] ??= []).push({
      name: x.name ?? '',
      address: x.address ?? '',
      phone: x.phone ?? '',
      lat: x.lat != null ? String(x.lat) : '',
      lng: x.lng != null ? String(x.lng) : '',
      isDefault: !!x.isDefault,
    });
  }
  const shops = Object.fromEntries((c.providerShopNo ?? []).map(x => [x.provider, x.shopNo]));
  const dp = parseDp(c.dynamicPricing);
  return {
    routesEnabled: [...c.routesEnabled],
    routeFirstLeg: { R1: leg.R1 ?? 'merchant', R3: leg.R3 ?? 'campus' },
    handoverPoints: {
      R1: pts.R1.length ? pts.R1 : [emptyPoint()],
      R2: pts.R2.length ? pts.R2 : [emptyPoint()],
    },
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
    thirdPartyBaseFeeYuan: c.thirdPartyBaseFee != null ? fenToYuan(c.thirdPartyBaseFee) : '',
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
    notifyTemplateAddressChanged: c.notifyTemplateAddressChanged ?? '',
    h5BaseUrl: c.h5BaseUrl ?? '',
    printMode: c.printMode ?? 'off',
    timeoutCompensation: !!c.timeoutCompensationEnabled,
    timeoutGraceMinutes: String(c.timeoutGraceMinutes ?? 10),
    timeoutWindowHours: String(c.timeoutCompensationWindowHours ?? 24),
    timeoutCouponTemplateId: c.timeoutCompensationCouponTemplateId ?? '',
    dpEnabled: dp.enabled,
    dpPeaks: dp.peakWindows.map(w => ({ start: w.start, end: w.end, addYuan: fenToYuan(w.addFee) })),
    dpSupply: !!dp.supply,
    dpBacklog: String(dp.supply?.backlogThreshold ?? 5),
    dpSupplyAddYuan: dp.supply ? fenToYuan(dp.supply.addFee) : '',
    dpReleaseBacklog: dp.supply?.releaseBacklog != null ? String(dp.supply.releaseBacklog) : '',
    dpMultiplier: String(dp.manualMultiplier ?? 1),
    dpMaxAddYuan: fenToYuan(dp.maxAddFee ?? 600) || '6',
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

/** 超时赔付开关（默认关；开启需配券模板，否则后端只告警不扣闸） */
function toggleTimeout(card: Card) {
  card.form.timeoutCompensation = !card.form.timeoutCompensation;
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
  const thirdPartyFee = f.thirdPartyBaseFeeYuan.trim() === '' ? null : yuanToFen(f.thirdPartyBaseFeeYuan);
  const freeShip = f.freeShipYuan.trim() === '' ? null : yuanToFen(f.freeShipYuan);
  if (f.freeShipYuan.trim() !== '' && freeShip == null) {
    uni.showToast({ title: locale.t('campusConfig.badAmount'), icon: 'none' });
    return;
  }
  if (f.errandBaseFeeYuan.trim() !== '' && errandFee == null) {
    uni.showToast({ title: locale.t('campusConfig.badAmount'), icon: 'none' });
    return;
  }
  if (f.thirdPartyBaseFeeYuan.trim() !== '' && thirdPartyFee == null) {
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

  // 交接点（仅 R1/R2）：每条路线可配多个；名称 + 经纬度必填，避免外部快递派不到点
  const handoverPoints: Array<{ route: string; name: string; address: string | null; phone: string | null; lat: number; lng: number; isDefault: boolean }> = [];
  for (const code of ['R1', 'R2']) {
    if (!f.routesEnabled.includes(code)) continue;
    const list = (f.handoverPoints[code] ?? []).filter(p => p.name.trim() !== '' || p.lat.trim() !== '' || p.lng.trim() !== '');
    if (!list.length) {
      uni.showToast({ title: locale.t('campusConfig.pointRequired'), icon: 'none' });
      return;
    }
    for (const p of list) {
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
        isDefault: p.isDefault,
      });
    }
    // 每条路线保证有且仅有一个默认点（与后端归一一致，避免前端展示与实际不一致）
    const own = handoverPoints.filter(x => x.route === code);
    const marked = own.filter(x => x.isDefault);
    if (marked.length !== 1) {
      own.forEach((x, i) => { x.isDefault = i === 0; });
    }
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

  // 动态计价：关闭时提交 null（后端视为关闭）；开启时按输入组装 JSON（峰段可多段）
  let dynamicPricing: string | null = null;
  if (f.dpEnabled) {
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    const peaks: Array<{ start: string; end: string; addFee: number }> = [];
    for (const p of f.dpPeaks) {
      const start = p.start.trim();
      const end = p.end.trim();
      const addYuan = p.addYuan.trim();
      if (!start && !end && !addYuan) continue; // 空行忽略
      if (!timeRe.test(start) || !timeRe.test(end) || end <= start) {
        uni.showToast({ title: locale.t('campusConfig.dpBadPeak'), icon: 'none' });
        return;
      }
      const addFee = yuanToFen(addYuan);
      if (addFee == null || addFee <= 0) {
        uni.showToast({ title: locale.t('campusConfig.badAmount'), icon: 'none' });
        return;
      }
      peaks.push({ start, end, addFee });
    }
    let supply: { backlogThreshold: number; addFee: number; releaseBacklog: number | null } | null = null;
    if (f.dpSupply) {
      const backlog = Number(f.dpBacklog);
      if (!Number.isInteger(backlog) || backlog < 1) {
        uni.showToast({ title: locale.t('campusConfig.dpBadBacklog'), icon: 'none' });
        return;
      }
      const addFee = yuanToFen(f.dpSupplyAddYuan.trim());
      if (addFee == null || addFee <= 0) {
        uni.showToast({ title: locale.t('campusConfig.badAmount'), icon: 'none' });
        return;
      }
      let releaseBacklog: number | null = null;
      if (f.dpReleaseBacklog.trim() !== '') {
        const n = Number(f.dpReleaseBacklog);
        if (!Number.isInteger(n) || n < 0 || n >= backlog) {
          uni.showToast({ title: locale.t('campusConfig.dpBadRelease'), icon: 'none' });
          return;
        }
        releaseBacklog = n;
      }
      supply = { backlogThreshold: backlog, addFee, releaseBacklog };
    }
    const mult = Number(f.dpMultiplier);
    if (!Number.isFinite(mult) || mult < 1 || mult > 2) {
      uni.showToast({ title: locale.t('campusConfig.dpBadMultiplier'), icon: 'none' });
      return;
    }
    const maxAddFee = yuanToFen(f.dpMaxAddYuan.trim());
    if (maxAddFee == null) {
      uni.showToast({ title: locale.t('campusConfig.badAmount'), icon: 'none' });
      return;
    }
    dynamicPricing = JSON.stringify({ enabled: true, peakWindows: peaks, supply, manualMultiplier: mult, maxAddFee });
  }

  // 超时赔付（P2）：开启必须选券模板；宽限非法直接阻断，不再静默回落 10 分钟
  if (f.timeoutCompensation && !f.timeoutCouponTemplateId.trim()) {
    uni.showToast({ title: locale.t('campusConfig.timeoutCouponRequired'), icon: 'none' });
    return;
  }
  const graceInput = f.timeoutGraceMinutes.trim() === '' ? 10 : Number(f.timeoutGraceMinutes);
  if (!Number.isInteger(graceInput) || graceInput < 0 || graceInput > 240) {
    uni.showToast({ title: locale.t('campusConfig.badGrace'), icon: 'none' });
    return;
  }
  const windowInput = f.timeoutWindowHours.trim() === '' ? 24 : Number(f.timeoutWindowHours);
  if (!Number.isInteger(windowInput) || windowInput < 1 || windowInput > 168) {
    uni.showToast({ title: locale.t('campusConfig.badWindow'), icon: 'none' });
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
      thirdPartyBaseFee: thirdPartyFee,
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
      notifyTemplateAddressChanged: f.notifyTemplateAddressChanged.trim() || null,
      h5BaseUrl: f.h5BaseUrl.trim() || null,
      printMode: f.printMode,
      timeoutCompensationEnabled: f.timeoutCompensation,
      timeoutGraceMinutes: graceInput,
      timeoutCompensationWindowHours: windowInput,
      timeoutCompensationCouponTemplateId: f.timeoutCouponTemplateId.trim() || null,
      dynamicPricing,
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
  loadPreview();
  loadOps();
  loadCoupons();
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
  .dpp { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 24rpx;
    .dpp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx;
      .dpp-title { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
      .dpp-refresh { font-size: 24rpx; color: $wa-accent; } }
    .dpp-meta { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 12rpx;
      .kv { flex: 1 0 45%; display: flex; align-items: center; justify-content: space-between; background: $wa-bg; border-radius: 10rpx; padding: 12rpx 18rpx;
        .k { font-size: 22rpx; color: $wa-muted; }
        .v { font-size: 26rpx; color: $wa-ink; font-weight: 600; } } }
    .dpp-off { display: block; font-size: 22rpx; color: $wa-muted; margin: 8rpx 0; }
    .dpp-row { padding: 16rpx 0; border-top: 1rpx solid $wa-rule;
      .dpp-row__main { display: flex; align-items: center; gap: 16rpx;
        .zn { flex: 1; font-size: 26rpx; color: $wa-ink; }
        .pr { font-size: 24rpx; color: $wa-muted; }
        .ad { font-size: 24rpx; color: $wa-muted; min-width: 96rpx; text-align: right;
          &.on { color: $wa-danger; font-weight: 600; } } }
      .br { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; } }
    .dpp-note { display: block; font-size: 22rpx; color: $wa-muted; line-height: 1.6; margin-top: 12rpx; } }
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
        .point-hint { font-size: 21rpx; color: $wa-muted; padding-bottom: 6rpx; }
        .point-row { border-top: 1rpx solid $wa-rule; margin-top: 8rpx; padding-top: 4rpx;
          &:first-of-type { border-top: none; }
        }
        .point-row__head { display: flex; align-items: center; gap: 16rpx; padding: 8rpx 0;
          .point-row__idx { font-size: 22rpx; color: $wa-muted; }
          .point-default { font-size: 21rpx; color: $wa-muted; border: 1rpx solid $wa-rule; border-radius: 20rpx; padding: 2rpx 14rpx;
            &.on { color: #fff; background: $wa-accent; border-color: $wa-accent; }
          }
          .point-del { font-size: 21rpx; color: $wa-danger; margin-left: auto; }
        }
        .point-add { font-size: 23rpx; color: $wa-accent; padding: 12rpx 0 4rpx; }
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
  .notify-tip.danger { color: $wa-danger; }
  .fld.picker { flex: 1; font-size: 28rpx; color: $wa-ink; }
  .timeout-picker { flex: 1; font-size: 28rpx; color: $wa-ink; }
  .timeout-id { flex: 1; font-size: 24rpx; color: $wa-muted; word-break: break-all; }
  .timeout-clear { font-size: 24rpx; color: $wa-danger; margin-left: 16rpx; }
  .slot-row { padding: 18rpx 0; border-bottom: 1rpx solid $wa-rule;
    &__main { display: flex; align-items: center; justify-content: space-between;
      .slot-date { font-size: 26rpx; color: $wa-ink; font-weight: 600; }
      .slot-usage { font-size: 22rpx; color: $wa-muted; } }
    &__acts { display: flex; align-items: center; gap: 16rpx; margin-top: 12rpx;
      .slot-cap { width: 160rpx; font-size: 26rpx; border: 1rpx solid $wa-rule; border-radius: 8rpx; padding: 8rpx 12rpx; }
      .slot-act { font-size: 24rpx; color: $wa-accent;
        &.off { color: $wa-muted; } } }
  }
  .platform-tip { font-size: 22rpx; color: $wa-muted; padding: 4rpx 0 12rpx; }
  .pmodes { display: flex; gap: 16rpx; padding: 8rpx 0 16rpx;
    .pmode { flex: 1; text-align: center; padding: 18rpx 0; font-size: 26rpx; color: $wa-muted;
      border: 1.5px solid $wa-rule; border-radius: $wa-radius; background: $wa-card; }
    .pmode.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
  }
  // 超时赔付：开关按钮 + 说明同行
  .pmode-row { display: flex; align-items: center; gap: 16rpx; padding: 8rpx 0 16rpx;
    .pmode { flex: none; min-width: 180rpx; text-align: center; padding: 18rpx 24rpx; font-size: 26rpx;
      color: $wa-muted; border: 1.5px solid $wa-rule; border-radius: $wa-radius; background: $wa-card; }
    .pmode.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
    .timeout-tip { flex: 1; font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
  }
  // 动态计价：时段高峰行（起止时间 + 加价）
  .dp-sub { font-size: 24rpx; color: $wa-ink; font-weight: 600; padding: 16rpx 0 8rpx; }
  .dp-peak { display: flex; align-items: center; gap: 12rpx; padding: 8rpx 0;
    .dp-time { width: 150rpx; font-size: 24rpx; text-align: center; border: 1px solid $wa-rule; border-radius: $wa-radius; padding: 10rpx 0; }
    .dp-dash { font-size: 24rpx; color: $wa-muted; }
    .dp-add { flex: 1; font-size: 24rpx; border: 1px solid $wa-rule; border-radius: $wa-radius; padding: 10rpx 16rpx; }
    .dp-del { font-size: 22rpx; color: $wa-danger; padding: 8rpx 0 8rpx 8rpx; }
  }
}
</style>
