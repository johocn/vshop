<template>
  <view>
    <!-- 步骤条 -->
    <view class="steps card">
      <view v-for="(s, i) in steps" :key="s" class="step" :class="{ on: step === i + 1, done: step > i + 1 }" @tap="goStep(i + 1)">
        <text class="step-num">{{ step > i + 1 ? '✓' : i + 1 }}</text>
        <text class="step-label">{{ t('encounter.' + s) }}</text>
      </view>
    </view>

    <!-- 步骤1 问诊 -->
    <view v-if="step === 1" class="card">
      <view class="f-label">{{ t('encounter.chiefComplaint') }}</view>
      <textarea class="textarea" v-model="chiefComplaint" :placeholder="t('encounter.chiefComplaintPh')" />
      <view class="btn-primary mt" @tap="next1">{{ t('common.confirm') }}</view>
    </view>

    <!-- 步骤2 辨证 -->
    <view v-if="step === 2" class="card">
      <view class="f-label">{{ t('encounter.diagnosis') }}</view>
      <textarea class="textarea" v-model="diagnosis" :placeholder="t('encounter.diagnosisPh')" />
      <view class="btn-primary mt" @tap="next2">{{ t('common.confirm') }}</view>
    </view>

    <!-- 步骤3 医嘱 -->
    <view v-if="step === 3" class="card">
      <view class="row-between"><view class="f-label">{{ t('encounter.prescription') }}</view>
        <view class="btn-ghost" @tap="addItem">{{ t('encounter.addPrescription') }}</view></view>
      <view class="rx-item" v-for="(it, idx) in prescription" :key="idx">
        <input class="input" :placeholder="t('encounter.itemName')" v-model="it.name" />
        <input class="input" :placeholder="t('encounter.dosage')" v-model="it.dosage" />
        <input class="input" :placeholder="t('encounter.frequency')" v-model="it.frequency" />
        <input class="input" :placeholder="t('encounter.note')" v-model="it.note" />
        <view class="rx-del" @tap="prescription.splice(idx, 1)">×</view>
      </view>
      <view class="btn-primary mt" @tap="submitRecord">{{ t('encounter.submitRecord') }}</view>
    </view>

    <!-- 步骤4 完成 -->
    <view v-if="step === 4" class="card">
      <view class="done-tip">✓ {{ t('encounter.submitRecord') }} v{{ recordVersion }}</view>
      <view class="btn-primary mt" @tap="completeEncounter">{{ t('encounter.completeEncounter') }}</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '../../services/api'
import { t } from '../../utils/i18n'
import { GqlError } from '../../services/gql'

const steps = ['step1', 'step2', 'step3', 'step4']
const step = ref(1)
const encounterId = ref('')
const chiefComplaint = ref('')
const diagnosis = ref('')
const prescription = ref([{ name: '', dosage: '', frequency: '', note: '' }])
const recordVersion = ref(0)

onLoad(async (q) => {
  encounterId.value = String(q.id || '')
  const enc = await api.encounter(encounterId.value)
  if (enc && enc.status === 'PENDING') {
    await api.startEncounter(encounterId.value).catch(() => {})
  }
})

function goStep(n) {
  if (n <= step.value) step.value = n
}

function next1() {
  if (!chiefComplaint.value.trim()) { uni.showToast({ title: t('encounter.needStep'), icon: 'none' }); return }
  step.value = 2
}
function next2() {
  if (!diagnosis.value.trim()) { uni.showToast({ title: t('encounter.needStep'), icon: 'none' }); return }
  step.value = 3
}
function addItem() { prescription.value.push({ name: '', dosage: '', frequency: '', note: '' }) }

async function submitRecord() {
  const rx = prescription.value.filter(it => it.name.trim())
  if (!rx.length) { uni.showToast({ title: t('encounter.needStep'), icon: 'none' }); return }
  try {
    const rec = await api.createMedicalRecord({
      encounterId: Number(encounterId.value),
      chiefComplaint: chiefComplaint.value.trim(),
      diagnosis: diagnosis.value.trim(),
      prescription: rx,
    })
    recordVersion.value = rec.version
    step.value = 4
    uni.showToast({ title: t('common.success'), icon: 'success' })
  } catch (e) {
    if (e instanceof GqlError) uni.showToast({ title: e.message, icon: 'none' })
  }
}

async function completeEncounter() {
  await api.completeEncounter(encounterId.value)
  uni.showToast({ title: t('common.success'), icon: 'success' })
  setTimeout(() => uni.switchTab({ url: '/pages/home/index' }), 600)
}
</script>

<style scoped>
.steps { display: flex; justify-content: space-between; }
.step { display: flex; flex-direction: column; align-items: center; gap: 8rpx; flex: 1; }
.step-num { width: 52rpx; height: 52rpx; border-radius: 50%; background: #f0f1f0; color: #7a837f; display: flex; align-items: center; justify-content: center; font-size: 26rpx; }
.step.on .step-num { background: #2f7d5f; color: #fff; }
.step.done .step-num { background: #e8f3ee; color: #2f7d5f; }
.step-label { font-size: 24rpx; color: #7a837f; }
.step.on .step-label { color: #2f7d5f; font-weight: 600; }
.f-label { font-size: 28rpx; font-weight: 600; margin-bottom: 16rpx; }
.mt { margin-top: 32rpx; }
.rx-item { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 12rpx; padding: 16rpx; background: #fafbfa; border-radius: 12rpx; margin-bottom: 16rpx; }
.rx-del { position: absolute; right: 8rpx; top: 0; font-size: 40rpx; color: #c0504d; padding: 0 10rpx; }
.done-tip { font-size: 30rpx; color: #2f7d5f; font-weight: 600; text-align: center; padding: 30rpx 0; }
.row-between { display: flex; justify-content: space-between; align-items: center; }
</style>
