<template>
  <view>
    <view class="card" v-for="r in records" :key="r.id" @tap="goDetail(r)">
      <view class="row-between">
        <view class="r-diag">{{ r.diagnosis }}</view>
        <text class="tag tag-green">v{{ r.version }}</text>
      </view>
      <view class="r-cc">{{ r.chiefComplaint }}</view>
    </view>
    <view v-if="!records.length" class="empty">{{ t('common.empty') }}</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '../../services/api'
import { t } from '../../utils/i18n'

const records = ref([])
onShow(refresh)
async function refresh() {
  const res = await api.medicalRecords(0, 50)
  records.value = res.items
}
function goDetail(r) { uni.navigateTo({ url: `/pages/record/detail?id=${r.id}` }) }
</script>

<style scoped>
.row-between { display: flex; justify-content: space-between; align-items: center; }
.r-diag { font-size: 30rpx; font-weight: 600; }
.r-cc { font-size: 26rpx; color: #7a837f; margin-top: 8rpx; }
</style>
