<template>
  <view v-if="plan">
    <view class="card">
      <view class="row-between">
        <view class="pl-title">{{ plan.title }}</view>
        <text class="tag" :class="{ DRAFT: 'tag-gray', ACTIVE: 'tag-green', PAUSED: 'tag-gray', CLOSED: 'tag-red' }[plan.status]">{{ t('plan.status_' + plan.status) }}</text>
      </view>
      <view class="pl-cycle">{{ (plan.cycleStart || '').slice(0, 10) }} ~ {{ (plan.cycleEnd || '').slice(0, 10) }}</view>
    </view>

    <view class="section-title row-between">
      <text>{{ t('plan.items') }}</text>
      <view class="btn-ghost" @tap="showItem = !showItem">{{ t('plan.addItem') }}</view>
    </view>
    <view v-if="showItem" class="card">
      <input class="input" :placeholder="t('plan.itemTitle')" v-model="itemForm.title" />
      <input class="input mt8" :placeholder="t('plan.frequency')" v-model="itemForm.frequency" />
      <input class="input mt8" type="number" :placeholder="t('plan.variantId')" v-model="itemForm.variantId" />
      <view class="btn-primary mt8" @tap="addItem">{{ t('common.submit') }}</view>
    </view>
    <view class="card" v-for="it in plan.items" :key="it.id">
      <view class="it-title">{{ it.title }}</view>
      <view class="it-meta">{{ it.frequency || '--' }}<text v-if="it.productVariantId"> · variant {{ it.productVariantId }}</text></view>
    </view>

    <view class="section-title row-between">
      <text>{{ t('plan.followUps') }}</text>
      <view class="btn-ghost" @tap="showFu = !showFu">{{ t('followup.create') }}</view>
    </view>
    <view v-if="showFu" class="card">
      <input class="input" :placeholder="t('followup.titlePh')" v-model="fuForm.title" />
      <picker mode="date" @change="e => fuForm.date = e.detail.value">
        <view class="input mt8">{{ fuForm.date || t('followup.dueAt') }}</view>
      </picker>
      <view class="ch-row">
        <view v-for="c in ['sms', 'wechat', 'phone']" :key="c" class="type-chip" :class="{ on: fuForm.channel === c }" @tap="fuForm.channel = c">{{ t('followup.' + c) }}</view>
      </view>
      <view class="btn-primary mt8" @tap="createFu">{{ t('common.submit') }}</view>
    </view>
    <view class="card" v-for="f in plan.followUps" :key="f.id">
      <view class="row-between">
        <view class="it-title">{{ f.title }}</view>
        <text class="tag" :class="{ PENDING: 'tag-red', DONE: 'tag-green', CANCELED: 'tag-gray' }[f.status]">{{ t('followup.status_' + f.status) }}</text>
      </view>
      <view class="it-meta">{{ (f.dueAt || '').slice(0, 10) }} · {{ t('followup.' + f.channel) }}</view>
      <view class="actions" v-if="f.status === 'PENDING'">
        <view class="btn-ghost" @tap="completeFu(f)">{{ t('followup.complete') }}</view>
        <view class="btn-danger" @tap="cancelFu(f)">{{ t('followup.cancel') }}</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '../../services/api'
import { t } from '../../utils/i18n'

const planId = ref('')
const plan = ref(null)
const showItem = ref(false)
const showFu = ref(false)
const itemForm = ref({ title: '', frequency: '', variantId: '' })
const fuForm = ref({ title: '', date: '', channel: 'wechat' })

onLoad(q => { planId.value = String(q.id || '') })
onShow(refresh)

async function refresh() {
  plan.value = await api.wellnessPlan(planId.value)
}

async function addItem() {
  if (!itemForm.value.title.trim()) return
  await api.addPlanItem({
    planId: Number(planId.value),
    title: itemForm.value.title.trim(),
    frequency: itemForm.value.frequency || undefined,
    productVariantId: itemForm.value.variantId ? Number(itemForm.value.variantId) : undefined,
  })
  itemForm.value = { title: '', frequency: '', variantId: '' }
  showItem.value = false
  refresh()
}

async function createFu() {
  if (!fuForm.value.title.trim() || !fuForm.value.date) return
  await api.createFollowUp({
    patientProfileId: Number(plan.value.patientProfileId),
    planId: Number(planId.value),
    title: fuForm.value.title.trim(),
    dueAt: `${fuForm.value.date}T09:00:00.000Z`,
    channel: fuForm.value.channel,
  })
  fuForm.value = { title: '', date: '', channel: 'wechat' }
  showFu.value = false
  refresh()
}

async function completeFu(f) { await api.completeFollowUp(String(f.id)); refresh() }
async function cancelFu(f) { await api.cancelFollowUp(String(f.id)); refresh() }
</script>

<style scoped>
.row-between { display: flex; justify-content: space-between; align-items: center; }
.pl-title { font-size: 32rpx; font-weight: 600; }
.pl-cycle { font-size: 24rpx; color: #7a837f; margin-top: 8rpx; }
.mt8 { margin-top: 16rpx; }
.it-title { font-size: 28rpx; font-weight: 600; }
.it-meta { font-size: 24rpx; color: #7a837f; margin-top: 8rpx; }
.ch-row { display: flex; gap: 16rpx; margin-top: 16rpx; }
.type-chip { flex: 1; text-align: center; background: #f6f7f6; border-radius: 12rpx; padding: 14rpx 0; font-size: 26rpx; color: #7a837f; }
.type-chip.on { background: #e8f3ee; color: #2f7d5f; font-weight: 600; }
.actions { display: flex; gap: 16rpx; margin-top: 16rpx; }
</style>
