<template>
  <view class="home">
    <!-- 馆切换（多馆） -->
    <scroll-view v-if="staffList.length > 1" scroll-x class="clinic-bar">
      <view v-for="s in staffList" :key="s.id" class="clinic-chip" :class="{ on: s.clinicId === currentClinicId }" @tap="switchClinic(s)">
        {{ s.displayName }} · 馆{{ s.clinicId }}
      </view>
    </scroll-view>

    <!-- 今日接诊统计 -->
    <view class="stat-row card">
      <view class="stat"><text class="num">{{ stat.pending }}</text><text class="lbl">{{ t('home.todayPending') }}</text></view>
      <view class="stat"><text class="num">{{ stat.active }}</text><text class="lbl">{{ t('home.todayActive') }}</text></view>
      <view class="stat"><text class="num">{{ stat.completed }}</text><text class="lbl">{{ t('home.todayCompleted') }}</text></view>
    </view>

    <!-- 快捷入口 -->
    <view class="section-title">{{ t('home.quickTitle') }}</view>
    <view class="quick-grid card">
      <view class="quick-item" @tap="go('/pages/encounter/create')"><text class="q-ico">🩺</text><text>{{ t('home.newEncounter') }}</text></view>
      <view class="quick-item" @tap="go('/pages/plan/list')"><text class="q-ico">🌿</text><text>{{ t('home.wellnessPlans') }}</text></view>
      <view class="quick-item" @tap="go('/pages/followup/list')"><text class="q-ico">📋</text><text>{{ t('home.followUps') }}</text></view>
      <view class="quick-item" @tap="go('/pages/record/list')"><text class="q-ico">📚</text><text>{{ t('home.records') }}</text></view>
    </view>

    <!-- 患者列表 -->
    <view class="section-title row-between">
      <text>{{ t('home.patients') }}</text>
      <input class="input search" :placeholder="t('home.searchPlaceholder')" v-model="keyword" />
    </view>
    <view class="card patient" v-for="p in filteredPatients" :key="p.id">
      <view class="row-between">
        <view>
          <view class="p-name">{{ p.customerName }}</view>
          <view class="p-phone">{{ p.customerPhone || '--' }}</view>
        </view>
        <view class="btn-ghost" @tap="goEncounter(p)">{{ t('home.visit') }}</view>
      </view>
    </view>
    <view v-if="!filteredPatients.length" class="empty">{{ t('common.empty') }}</view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api, todayStartIso } from '../../services/api'
import { t } from '../../utils/i18n'

const staffList = ref([])
const currentClinicId = ref(null)
const patients = ref([])
const encounters = ref([])
const keyword = ref('')

const stat = computed(() => ({
  pending: encounters.value.filter(e => e.status === 'PENDING').length,
  active: encounters.value.filter(e => e.status === 'ACTIVE').length,
  completed: encounters.value.filter(e => e.status === 'COMPLETED').length,
}))
const filteredPatients = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return patients.value
  return patients.value.filter(p => (p.customerName || '').includes(kw) || (p.customerPhone || '').includes(kw))
})

onShow(refresh)

async function refresh() {
  staffList.value = await api.myStaff()
  if (!currentClinicId.value && staffList.value.length) currentClinicId.value = staffList.value[0].clinicId
  const [profiles, encs] = await Promise.all([
    api.patientProfiles(0, 50),
    api.encounters(0, 100, todayStartIso()),
  ])
  patients.value = profiles.items
  encounters.value = encs.items
}

function switchClinic(s) { currentClinicId.value = s.clinicId }

function go(url) { uni.navigateTo({ url }) }

function goEncounter(p) {
  uni.navigateTo({ url: `/pages/encounter/create?patientId=${p.id}&clinicId=${p.clinicId}` })
}
</script>

<style scoped>
.home { padding-bottom: 40rpx; }
.clinic-bar { white-space: nowrap; padding: 16rpx 24rpx 0; }
.clinic-chip { display: inline-block; background: #fff; border-radius: 32rpx; padding: 12rpx 28rpx; font-size: 26rpx; margin-right: 16rpx; color: #7a837f; }
.clinic-chip.on { background: #2f7d5f; color: #fff; }
.stat-row { display: flex; justify-content: space-around; }
.stat { display: flex; flex-direction: column; align-items: center; }
.num { font-size: 44rpx; font-weight: 700; color: #2f7d5f; }
.lbl { font-size: 24rpx; color: #7a837f; margin-top: 6rpx; }
.quick-grid { display: flex; justify-content: space-between; }
.quick-item { display: flex; flex-direction: column; align-items: center; font-size: 24rpx; color: #303133; gap: 10rpx; width: 25%; }
.q-ico { font-size: 48rpx; }
.row-between { display: flex; justify-content: space-between; align-items: center; }
.search { width: 320rpx; font-size: 26rpx; padding: 10rpx 16rpx; }
.p-name { font-size: 30rpx; font-weight: 600; }
.p-phone { font-size: 24rpx; color: #7a837f; margin-top: 6rpx; }
</style>
