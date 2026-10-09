<template>
  <view v-if="record">
    <view class="card">
      <view class="row-between">
        <view class="f-label">{{ t('record.version') }} v{{ record.version }}</view>
        <view class="btn-ghost" @tap="openEdit">{{ t('record.edit') }}</view>
      </view>
      <view class="f-label mt16">{{ t('record.chiefComplaint') }}</view>
      <view class="f-value">{{ record.chiefComplaint }}</view>
      <view class="f-label mt16">{{ t('record.diagnosis') }}</view>
      <view class="f-value">{{ record.diagnosis }}</view>
      <view class="f-label mt16">{{ t('record.prescription') }}</view>
      <view class="f-value" v-for="(it, i) in record.prescription" :key="i">
        {{ it.name }} · {{ it.dosage || '--' }} · {{ it.frequency || '--' }}
      </view>
    </view>

    <view class="section-title">{{ t('record.revisions') }}</view>
    <view class="card">
      <view class="rev" v-for="r in record.revisions" :key="r.version">
        <text class="rev-dot"></text>
        <text>v{{ r.version }} · {{ (r.createdAt || '').slice(0, 19).replace('T', ' ') }} · staff {{ r.editedByStaffId }}</text>
      </view>
      <view v-if="!record.revisions.length" class="empty">{{ t('common.empty') }}</view>
    </view>

    <view v-if="editing" class="mask" @tap="editing = false">
      <view class="editor" @tap.stop>
        <view class="f-label">{{ t('record.chiefComplaint') }}</view>
        <textarea class="textarea" v-model="editForm.chiefComplaint" />
        <view class="f-label mt16">{{ t('record.diagnosis') }}</view>
        <textarea class="textarea" v-model="editForm.diagnosis" />
        <view class="f-label mt16">{{ t('record.prescription') }}(JSON)</view>
        <textarea class="textarea" v-model="editForm.prescriptionJson" />
        <view class="btn-primary mt16" @tap="save">{{ t('common.save') }}</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '../../services/api'
import { t } from '../../utils/i18n'

const record = ref(null)
const editing = ref(false)
const editForm = ref({ chiefComplaint: '', diagnosis: '', prescriptionJson: '' })
const id = ref('')

onLoad(q => { id.value = String(q.id || ''); refresh() })

async function refresh() {
  record.value = await api.medicalRecord(id.value)
}

function openEdit() {
  editForm.value = {
    chiefComplaint: record.value.chiefComplaint,
    diagnosis: record.value.diagnosis,
    prescriptionJson: JSON.stringify(record.value.prescription, null, 2),
  }
  editing.value = true
}

async function save() {
  let prescription
  try { prescription = JSON.parse(editForm.value.prescriptionJson) } catch { uni.showToast({ title: 'JSON invalid', icon: 'none' }); return }
  await api.updateMedicalRecord(id.value, {
    chiefComplaint: editForm.value.chiefComplaint,
    diagnosis: editForm.value.diagnosis,
    prescription,
  })
  editing.value = false
  uni.showToast({ title: t('common.success'), icon: 'success' })
  refresh()
}
</script>

<style scoped>
.row-between { display: flex; justify-content: space-between; align-items: center; }
.f-label { font-size: 26rpx; color: #7a837f; }
.mt16 { margin-top: 20rpx; }
.f-value { font-size: 30rpx; color: #303133; margin-top: 8rpx; }
.rev { display: flex; align-items: center; gap: 12rpx; font-size: 26rpx; color: #303133; padding: 10rpx 0; }
.rev-dot { width: 14rpx; height: 14rpx; border-radius: 50%; background: #2f7d5f; }
.mask { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 99; }
.editor { width: 640rpx; background: #fff; border-radius: 16rpx; padding: 32rpx; }
</style>
