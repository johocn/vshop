<template>
  <view>
    <view class="btn-ghost create-btn" @tap="showCreate = !showCreate">{{ t('plan.create') }}</view>

    <view v-if="showCreate" class="card">
      <picker :range="patientNames" @change="onPickPatient">
        <view class="input">{{ newPlan.patientName || t('plan.pickPatient') }}</view>
      </picker>
      <input class="input mt8" :placeholder="t('plan.titlePh')" v-model="newPlan.text" />
      <view class="date-row">
        <picker mode="date" @change="e => newPlan.start = e.detail.value"><view class="input">{{ newPlan.start || t('plan.cycle') + '起' }}</view></picker>
        <picker mode="date" @change="e => newPlan.end = e.detail.value"><view class="input">{{ newPlan.end || t('plan.cycle') + '止' }}</view></picker>
      </view>
      <view class="btn-primary mt8" @tap="createPlan">{{ t('common.submit') }}</view>
    </view>

    <view class="card" v-for="p in plans" :key="p.id" @tap="goDetail(p)">
      <view class="row-between">
        <view class="pl-title">{{ p.title }}</view>
        <text class="tag" :class="statusClass(p.status)">{{ t('plan.status_' + p.status) }}</text>
      </view>
      <view class="pl-patient">{{ patientName(p.patientProfileId) }}</view>
      <view class="pl-cycle">{{ (p.cycleStart || '').slice(0, 10) }} ~ {{ (p.cycleEnd || '').slice(0, 10) }}</view>
      <view class="actions" @tap.stop>
        <view v-if="p.status === 'DRAFT'" class="btn-ghost" @tap="transition(p, 'ACTIVE')">{{ t('plan.toActive') }}</view>
        <view v-if="p.status === 'ACTIVE'" class="btn-ghost" @tap="transition(p, 'PAUSED')">{{ t('plan.toPaused') }}</view>
        <view v-if="p.status === 'ACTIVE' || p.status === 'PAUSED'" class="btn-danger" @tap="transition(p, 'CLOSED')">{{ t('plan.toClosed') }}</view>
      </view>
    </view>
    <view v-if="!plans.length" class="empty">{{ t('common.empty') }}</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '../../services/api'
import { t } from '../../utils/i18n'

const showCreate = ref(false)
const plans = ref([])
const patients = ref([])
const newPlan = ref({ patientProfileId: null, patientName: '', text: '', start: '', end: '' })

const patientNames = ref([])
const patientName = (id) => {
  const p = patients.value.find(x => String(x.id) === String(id))
  return p ? p.customerName : `#${id}`
}

onShow(refresh)

async function refresh() {
  const [plansRes, profilesRes] = await Promise.all([api.wellnessPlans(0, 50), api.patientProfiles(0, 100)])
  plans.value = plansRes.items
  patients.value = profilesRes.items
  patientNames.value = patients.value.map(p => p.customerName)
}

function onPickPatient(e) {
  const p = patients.value[e.detail.value]
  newPlan.value.patientProfileId = Number(p.id)
  newPlan.value.patientName = p.customerName
}

async function createPlan() {
  if (!newPlan.value.patientProfileId || !newPlan.value.text.trim()) return
  const src = patients.value.find(x => Number(x.id) === newPlan.value.patientProfileId)
  await api.createWellnessPlan({
    patientProfileId: newPlan.value.patientProfileId,
    clinicId: Number(src?.clinicId ?? 0),
    title: newPlan.value.text.trim(),
    cycleStart: newPlan.value.start || undefined,
    cycleEnd: newPlan.value.end || undefined,
  })
  showCreate.value = false
  newPlan.value = { patientProfileId: null, patientName: '', text: '', start: '', end: '' }
  refresh()
}

async function transition(p, to) {
  await api.transitionWellnessPlan(String(p.id), to)
  refresh()
}

function goDetail(p) { uni.navigateTo({ url: `/pages/plan/detail?id=${p.id}` }) }
function statusClass(s) { return { DRAFT: 'tag-gray', ACTIVE: 'tag-green', PAUSED: 'tag-gray', CLOSED: 'tag-red' }[s] }
</script>

<style scoped>
.create-btn { margin: 20rpx 24rpx; text-align: center; }
.mt8 { margin-top: 16rpx; }
.date-row { display: flex; gap: 16rpx; margin-top: 16rpx; }
.date-row > picker { flex: 1; }
.row-between { display: flex; justify-content: space-between; align-items: center; }
.pl-title { font-size: 30rpx; font-weight: 600; }
.pl-patient { font-size: 26rpx; color: #303133; margin-top: 10rpx; }
.pl-cycle { font-size: 24rpx; color: #7a837f; margin-top: 6rpx; }
.actions { display: flex; gap: 16rpx; margin-top: 16rpx; }
</style>
