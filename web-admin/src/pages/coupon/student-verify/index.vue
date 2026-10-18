<template>
  <view class="page">
    <view class="chips">
      <text
        v-for="t in tabs"
        :key="t.key"
        class="chip"
        :class="{ on: tab === t.key }"
        @tap="switchTab(t.key)"
      >{{ $t(t.labelKey) }}</text>
    </view>

    <view class="card" v-for="v in items" :key="v.customerId">
      <view class="top">
        <view class="head">
          <text class="name">{{ v.customerName }}</text>
          <text class="badge" :class="v.status">{{ statusLabel(v.status) }}</text>
        </view>
        <text class="school">{{ v.school || '—' }}</text>
      </view>
      <view class="rows">
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('studentVerify.studentNoLabel') }}</text>
            <text class="v">{{ v.studentNo || '—' }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('studentVerify.emailLabel') }}</text>
            <text class="v">{{ v.customerEmail || '—' }}</text>
          </view>
        </view>
        <view class="row" v-if="v.reviewedAt">
          <view class="kv">
            <text class="k">{{ $t('studentVerify.reviewedAtLabel') }}</text>
            <text class="v">{{ fmtDT(v.reviewedAt) }}</text>
          </view>
        </view>
        <image
          v-if="v.idImg"
          class="idimg"
          :src="v.idImg"
          mode="widthFix"
          @tap="previewImg(v.idImg!)"
        />
      </view>
      <view class="ops" v-if="v.status === 'pending'">
        <text class="reject" @tap="onReview(v, false)">{{ $t('studentVerify.reject') }}</text>
        <text class="approve" @tap="onReview(v, true)">{{ $t('studentVerify.approve') }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('studentVerify.empty') }}</view>
    <view v-if="loading" class="empty">{{ $t('studentVerify.loading') }}</view>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { fetchStudentVerifications, reviewStudentVerification, type StudentVerificationItem } from '../../../apis/student-verification';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const tabs = [
  { key: 'pending', labelKey: 'studentVerify.tabPending' },
  { key: 'approved', labelKey: 'studentVerify.tabApproved' },
  { key: 'rejected', labelKey: 'studentVerify.tabRejected' },
];
const tab = ref('pending');
const items = ref<StudentVerificationItem[]>([]);
const loading = ref(false);

const STATUS_LABELS: Record<string, string> = {
  none: '', pending: '待审核', approved: '已通过', rejected: '已驳回',
};
const statusLabel = (s: string) => locale.t(`studentVerify.status_${s}`) !== `studentVerify.status_${s}` ? locale.t(`studentVerify.status_${s}`) : (STATUS_LABELS[s] || s);
const fmtDT = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

function previewImg(url: string) {
  uni.previewImage({ urls: [url] });
}

async function load() {
  loading.value = true;
  try {
    items.value = await fetchStudentVerifications(tab.value || undefined);
  } finally {
    loading.value = false;
  }
}
function switchTab(k: string) {
  tab.value = k;
  load();
}
async function onReview(v: StudentVerificationItem, approve: boolean) {
  uni.showModal({
    title: locale.t(approve ? 'studentVerify.approveConfirmTitle' : 'studentVerify.rejectConfirmTitle'),
    content: `${v.customerName} · ${v.school || ''}`,
    success: async (res) => {
      if (!res.confirm) return;
      await reviewStudentVerification(v.customerId, approve);
      uni.showToast({ title: locale.t('studentVerify.reviewed'), icon: 'none' });
      load();
    },
  });
}

onMounted(load);
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
</script>

<style scoped>
.page { padding: 12px; padding-bottom: 32px; }
.chips { display: flex; gap: 8px; margin-bottom: 12px; }
.chip { font-size: 13px; color: #666; background: #f2f3f5; border-radius: 999px; padding: 4px 14px; }
.chip.on { color: #fff; background: #4f8cff; }
.card { background: #fff; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.name { font-size: 15px; font-weight: 600; }
.badge { font-size: 11px; border-radius: 999px; padding: 1px 8px; background: #f2f3f5; color: #666; }
.badge.pending { background: #fff7e6; color: #d46b08; }
.badge.approved { background: #e6fffb; color: #08979c; }
.badge.rejected { background: #fff1f0; color: #cf1322; }
.school { font-size: 13px; color: #333; }
.rows { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; gap: 12px; }
.kv { display: flex; gap: 4px; min-width: 0; }
.k { font-size: 12px; color: #999; flex: none; }
.v { font-size: 12px; color: #333; word-break: break-all; }
.idimg { margin-top: 8px; width: 160px; border-radius: 8px; }
.ops { display: flex; justify-content: flex-end; gap: 16px; margin-top: 10px; border-top: 1px solid #f0f0f0; padding-top: 10px; }
.approve { font-size: 13px; color: #08979c; font-weight: 600; }
.reject { font-size: 13px; color: #cf1322; }
.empty { text-align: center; color: #999; font-size: 13px; padding: 40px 0; }
</style>
