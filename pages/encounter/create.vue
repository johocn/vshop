<template>
  <view>
    <view class="section-title">{{ t('encounter.pickPatient') }}</view>
    <view class="card" v-if="selected">
      <view class="sel-name">{{ selected.customerName }}</view>
      <view class="sel-phone">{{ selected.customerPhone || '--' }}</view>
    </view>
    <input v-if="!preselected" class="input search-input" :placeholder="t('home.searchPlaceholder')" v-model="keyword" />
    <scroll-view scroll-y class="picker-list">
      <view class="card patient" v-for="p in filteredPatients" :key="p.id" @tap="pick(p)">
        <view class="p-name">{{ p.customerName }}</view>
        <view class="p-phone">{{ p.customerPhone || '--' }}</view>
      </view>
      <view v-if="!filteredPatients.length" class="empty">{{ t('common.empty') }}</view>
    </scroll-view>

    <view class="section-title">{{ t('encounter.type') }}</view>
    <view class="card type-row">
      <view v-for="tp in types" :key="tp.value" class="type-chip" :class="{ on: type === tp.value }" @tap="type = tp.value">
        {{ t('encounter.' + tp.value) }}
      </view>
    </view>

    <view class="btn-primary create-btn" :class="{ disabled: !selected }" @tap="create">
      {{ t('encounter.create') }}
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '../../services/api'
import { t } from '../../utils/i18n'

const types = [{ value: 'FIRST' }, { value: 'RETURN' }, { value: 'HOUSE_CALL' }]

const preselected = ref(false)
const selected = ref(null)
const patients = ref([])
const keyword = ref('')
const type = ref('FIRST')
const clinicId = ref(null)

const filteredPatients = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return patients.value
  return patients.value.filter(p => (p.customerName || '').includes(kw) || (p.customerPhone || '').includes(kw))
})

onLoad(async (q) => {
  const res = await api.patientProfiles(0, 100)
  patients.value = res.items
  if (q.patientId) {
    const found = patients.value.find(p => String(p.id) === String(q.patientId))
    if (found) { selected.value = found; preselected.value = true }
  }
  if (q.clinicId) clinicId.value = Number(q.clinicId)
})

function pick(p) { selected.value = p }

async function create() {
  if (!selected.value) return
  const enc = await api.createEncounter({
    patientProfileId: Number(selected.value.id),
    clinicId: Number(clinicId.value ?? selected.value.clinicId),
    type: type.value,
  })
  uni.redirectTo({ url: `/pages/encounter/flow?id=${enc.id}` })
}
</script>

<style scoped>
.picker-list { max-height: 640rpx; }
.search-input { margin: 0 24rpx; }
.sel-name { font-size: 32rpx; font-weight: 600; }
.sel-phone { font-size: 24rpx; color: #7a837f; margin-top: 6rpx; }
.p-name { font-size: 30rpx; font-weight: 600; }
.p-phone { font-size: 24rpx; color: #7a837f; margin-top: 6rpx; }
.type-row { display: flex; gap: 20rpx; }
.type-chip { flex: 1; text-align: center; background: #f6f7f6; border-radius: 12rpx; padding: 18rpx 0; font-size: 28rpx; color: #7a837f; }
.type-chip.on { background: #e8f3ee; color: #2f7d5f; font-weight: 600; }
.create-btn { margin: 40rpx 24rpx; }
.create-btn.disabled { opacity: 0.4; }
</style>
