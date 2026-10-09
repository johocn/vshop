<template>
  <view>
    <view v-for="group in groups" :key="group.status">
      <view class="section-title">{{ t('followup.status_' + group.status) }}（{{ group.items.length }}）</view>
      <view class="card" v-for="f in group.items" :key="f.id">
        <view class="row-between">
          <view class="fu-title">{{ f.title }}</view>
          <text class="tag" :class="{ PENDING: 'tag-red', DONE: 'tag-green', CANCELED: 'tag-gray' }[f.status]">{{ t('followup.status_' + f.status) }}</text>
        </view>
        <view class="fu-meta">{{ (f.dueAt || '').slice(0, 10) }} · {{ t('followup.' + f.channel) }}</view>
        <view class="actions" v-if="f.status === 'PENDING'">
          <view class="btn-ghost" @tap="complete(f)">{{ t('followup.complete') }}</view>
          <view class="btn-danger" @tap="cancel(f)">{{ t('followup.cancel') }}</view>
        </view>
      </view>
    </view>
    <view v-if="!tasks.length" class="empty">{{ t('common.empty') }}</view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '../../services/api'
import { t } from '../../utils/i18n'

const tasks = ref([])
const groups = computed(() => ['PENDING', 'DONE', 'CANCELED']
  .map(status => ({ status, items: tasks.value.filter(x => x.status === status) }))
  .filter(g => g.items.length))

onShow(refresh)

async function refresh() {
  const res = await api.followUpTasks(0, 100)
  tasks.value = res.items
}

async function complete(f) { await api.completeFollowUp(String(f.id)); refresh() }
async function cancel(f) { await api.cancelFollowUp(String(f.id)); refresh() }
</script>

<style scoped>
.row-between { display: flex; justify-content: space-between; align-items: center; }
.fu-title { font-size: 28rpx; font-weight: 600; }
.fu-meta { font-size: 24rpx; color: #7a837f; margin-top: 8rpx; }
.actions { display: flex; gap: 16rpx; margin-top: 16rpx; }
</style>
