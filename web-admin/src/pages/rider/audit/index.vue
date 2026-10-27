<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">
        {{ $t('rider.audit.' + s.label) }}
      </text>
    </view>

    <view class="card" v-for="r in page.items.value" :key="r.id">
      <view class="row">
        <text class="name">{{ r.customFields.riderRealName || nameFallback(r) }}</text>
        <text class="st" :class="'st-' + (r.customFields.riderStatus || 'none')">
          {{ $t('rider.audit.status_' + (r.customFields.riderStatus || 'none')) }}
        </text>
      </view>
      <text class="meta">{{ $t('rider.audit.account') }}{{ r.emailAddress }}</text>
      <text class="meta" v-if="r.customFields.riderStudentNo">{{ $t('rider.audit.studentNo') }}{{ r.customFields.riderStudentNo }}</text>
      <text class="meta" v-if="r.customFields.riderCampus">{{ $t('rider.audit.campus') }}{{ r.customFields.riderCampus }}</text>
      <text class="meta">{{ $t('rider.audit.credit') }}{{ r.customFields.riderCredit ?? '—' }}</text>

      <view class="idimg" v-if="r.customFields.riderIdImg" @tap="preview(r)">
        <image :src="r.customFields.riderIdImg" mode="aspectFill" />
        <text>{{ $t('rider.audit.idImgLabel') }}</text>
      </view>

      <!-- ===== P2-5 合规（健康证 / 保险 / 背调） ===== -->
      <view class="comp">
        <view class="comp-head">
          <text class="comp-title">{{ $t('rider.audit.compliance') }}</text>
          <text class="comp-pill" :class="'cp-' + comp(r).level">{{ $t('rider.audit.compLevel_' + comp(r).level) }}</text>
        </view>
        <view v-for="it in comp(r).items" :key="it.key" class="comp-row">
          <text class="comp-key">{{ $t('rider.audit.comp_' + it.key) }}</text>
          <text class="comp-val" :class="'cs-' + it.status">{{ $t('rider.audit.compStatus_' + it.status) }}</text>
          <text class="comp-exp" v-if="it.expiry">{{ dateText(it.expiry) }}</text>
        </view>

        <view class="ops">
          <button class="op" @tap="toggleComp(r.id)">
            {{ compOpen === r.id ? $t('rider.audit.compCancelBtn') : $t('rider.audit.compEditBtn') }}
          </button>
        </view>

        <view v-if="compOpen === r.id" class="comp-form">
          <view class="cf-field">
            <text class="cf-lbl">{{ $t('rider.audit.comp_healthCertNo') }}</text>
            <input v-model="cd.healthCertNo" maxlength="128" :placeholder="$t('rider.audit.compHealthNoPh')" />
          </view>
          <view class="cf-field">
            <text class="cf-lbl">{{ $t('rider.audit.comp_healthExpiry') }}</text>
            <input v-model="cd.healthCertExpiry" type="date" />
          </view>
          <view class="cf-field">
            <text class="cf-lbl">{{ $t('rider.audit.comp_insuranceNo') }}</text>
            <input v-model="cd.insuranceNo" maxlength="128" :placeholder="$t('rider.audit.compInsuranceNoPh')" />
          </view>
          <view class="cf-field">
            <text class="cf-lbl">{{ $t('rider.audit.comp_insuranceExpiry') }}</text>
            <input v-model="cd.insuranceExpiry" type="date" />
          </view>
          <view class="cf-field">
            <text class="cf-lbl">{{ $t('rider.audit.comp_backgroundCheck') }}</text>
            <view class="seg">
              <view
                v-for="b in BG_STATES" :key="b" class="seg-item"
                :class="{ on: cd.backgroundCheck === b }" @tap="cd.backgroundCheck = b"
              >{{ $t('rider.audit.bg_' + b) }}</view>
            </view>
          </view>
          <text class="cf-hint">{{ $t('rider.audit.compFormHint') }}</text>
          <button class="op main" :disabled="saving" @tap="saveComp(r)">
            {{ saving ? $t('rider.audit.saving') : $t('rider.audit.compSaveBtn') }}
          </button>
        </view>
      </view>

      <view class="ops" v-if="r.customFields.riderStatus === 'pending'">
        <button class="op main" @tap="onApprove(r)">{{ $t('rider.audit.approveBtn') }}</button>
        <button class="op" @tap="onReject(r)">{{ $t('rider.audit.rejectBtn') }}</button>
      </view>
      <view class="ops" v-else-if="r.customFields.riderStatus === 'approved'">
        <button class="op" @tap="onSuspend(r)">{{ $t('rider.audit.suspendBtn') }}</button>
      </view>
      <view class="ops" v-else-if="r.customFields.riderStatus === 'suspended'">
        <button class="op main" @tap="onRestore(r)">{{ $t('rider.audit.restoreBtn') }}</button>
      </view>
    </view>

    <view v-if="page.loading.value" class="empty">{{ $t('rider.audit.loading') }}</view>
    <view v-else-if="page.error.value" class="empty">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ $t('rider.audit.retry') }}</text>
    </view>
    <view v-else-if="!page.items.value.length" class="empty">
      {{ cur === 'pending' ? $t('rider.audit.emptyPending') : $t('rider.audit.empty') }}
    </view>

    <view style="height: 160rpx" />
    <BottomBar current="order" />
  </view>
</template>
<script lang="ts" setup>
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import { useListPage } from '../../../composables/useListPage';
import {
  fetchRiderApplications,
  campusSetRiderStatus,
  campusUpdateRiderCompliance,
  type RiderApplicationRow,
  type RiderComplianceInput,
} from '../../../apis/rider-audit';

const locale = useLocaleStore();

// pending 默认（待办入口）；approved/suspended 也可在对应页签继续操作
const tabs = [
  { key: 'pending', label: 'tabPending' },
  { key: 'approved', label: 'tabApproved' },
  { key: 'suspended', label: 'tabSuspended' },
];
const cur = ref('pending');

const page = useListPage<RiderApplicationRow>({
  take: 50,
  immediate: false,
  // F8 后端分页：resolver 返回 { items, total }
  fetcher: async (p) => {
    return await fetchRiderApplications(cur.value, p.skip, p.take);
  },
});

function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  compOpen.value = '';
  void page.refresh();
}

function nameFallback(r: RiderApplicationRow): string {
  const n = [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
  return n || r.emailAddress;
}

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}

function preview(r: RiderApplicationRow) {
  const url = r.customFields.riderIdImg;
  if (url) uni.previewImage({ urls: [url] });
}

async function run(action: () => Promise<unknown>, okMsg: string) {
  try {
    await action();
    uni.showToast({ title: okMsg, icon: 'success' });
    await page.refresh();
  } catch (e: any) {
    toast(e?.response?.errors?.[0]?.message || e?.message || locale.t('rider.audit.opFailed'));
  }
}

function onApprove(r: RiderApplicationRow) {
  uni.showModal({
    title: locale.t('rider.audit.approveTitle'),
    content: (locale.t('rider.audit.approveContent') as string).replace('{name}', r.customFields.riderRealName || nameFallback(r)),
    success: (res) => {
      if (res.confirm) void run(() => campusSetRiderStatus(r.id, 'approved'), locale.t('rider.audit.approveOk'));
    },
  });
}

function onReject(r: RiderApplicationRow) {
  uni.showModal({
    title: locale.t('rider.audit.rejectTitle'),
    content: (locale.t('rider.audit.rejectContent') as string).replace('{name}', r.customFields.riderRealName || nameFallback(r)),
    success: (res) => {
      if (res.confirm) void run(() => campusSetRiderStatus(r.id, 'none'), locale.t('rider.audit.rejectOk'));
    },
  });
}

function onSuspend(r: RiderApplicationRow) {
  uni.showModal({
    title: locale.t('rider.audit.suspendTitle'),
    content: (locale.t('rider.audit.suspendContent') as string).replace('{name}', r.customFields.riderRealName || nameFallback(r)),
    success: (res) => {
      if (res.confirm) void run(() => campusSetRiderStatus(r.id, 'suspended'), locale.t('rider.audit.suspendOk'));
    },
  });
}

function onRestore(r: RiderApplicationRow) {
  uni.showModal({
    title: locale.t('rider.audit.restoreTitle'),
    content: (locale.t('rider.audit.restoreContent') as string).replace('{name}', r.customFields.riderRealName || nameFallback(r)),
    success: (res) => {
      if (res.confirm) void run(() => campusSetRiderStatus(r.id, 'approved'), locale.t('rider.audit.restoreOk'));
    },
  });
}

/* ===== P2-5 合规：本地判定与后端 rider-compliance.ts 同口径（30 天内到期为 expiring） ===== */
const BG_STATES = ['none', 'pending', 'passed', 'failed'];
const EXPIRING_DAYS = 30;
const compOpen = ref('');
const saving = ref(false);
const cd = reactive<RiderComplianceInput>({
  healthCertNo: '', healthCertExpiry: '', insuranceNo: '', insuranceExpiry: '', backgroundCheck: 'none',
});

function dateText(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Level = 'ok' | 'expiring' | 'blocked' | 'pending';

function expiryStatus(v?: string | null): 'ok' | 'expiring' | 'expired' {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return 'ok';
  const now = Date.now();
  if (d.getTime() < now) return 'expired';
  if (d.getTime() - now <= EXPIRING_DAYS * 86400000) return 'expiring';
  return 'ok';
}

function comp(r: RiderApplicationRow) {
  const cf = r.customFields;
  const hasHealth = !!(cf.riderHealthCertNo || cf.riderHealthCertImg);
  const hasInsurance = !!cf.riderInsuranceNo;
  const bg = cf.riderBackgroundCheck || 'none';
  const items = [
    {
      key: 'healthCert',
      status: !hasHealth ? 'missing' : expiryStatus(cf.riderHealthCertExpiry),
      expiry: cf.riderHealthCertExpiry || '',
    },
    {
      key: 'insurance',
      status: !hasInsurance ? 'missing' : expiryStatus(cf.riderInsuranceExpiry),
      expiry: cf.riderInsuranceExpiry || '',
    },
    {
      key: 'backgroundCheck',
      status: bg === 'passed' ? 'ok' : bg === 'failed' ? 'failed' : bg === 'pending' ? 'pending' : 'missing',
      expiry: '',
    },
  ];
  const blocked = items.some(i => i.status === 'expired' || i.status === 'failed');
  const pending = items.some(i => i.status === 'missing' || i.status === 'pending');
  const expiring = items.some(i => i.status === 'expiring');
  const level: Level = blocked ? 'blocked' : pending ? 'pending' : expiring ? 'expiring' : 'ok';
  return { items, level };
}

function toggleComp(customerId: string) {
  if (compOpen.value === customerId) {
    compOpen.value = '';
    return;
  }
  compOpen.value = customerId;
}

/** 表单：仅回填健康证/保险编号，避免与后端已有到期日混用（到期日留空 = 不改动） */
function saveComp(r: RiderApplicationRow) {
  const input: RiderComplianceInput = {};
  if (cd.healthCertNo) input.healthCertNo = cd.healthCertNo;
  if (cd.healthCertExpiry) input.healthCertExpiry = cd.healthCertExpiry;
  if (cd.insuranceNo) input.insuranceNo = cd.insuranceNo;
  if (cd.insuranceExpiry) input.insuranceExpiry = cd.insuranceExpiry;
  if (cd.backgroundCheck) input.backgroundCheck = cd.backgroundCheck;
  saving.value = true;
  run(async () => {
    const res = await campusUpdateRiderCompliance(r.id, input);
    compOpen.value = '';
    cd.healthCertNo = ''; cd.healthCertExpiry = ''; cd.insuranceNo = ''; cd.insuranceExpiry = ''; cd.backgroundCheck = 'none';
    if (res?.blocked) throw new Error(locale.t('rider.audit.compBlockedWarn'));
  }, locale.t('rider.audit.compSaveOk')).finally(() => { saving.value = false; });
}

onLoad(() => {
  void page.refresh();
});
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .tabs { display: flex; margin-bottom: 24rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx;
    text { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx; display: flex; flex-direction: column; gap: 12rpx;
    .row { display: flex; align-items: center; justify-content: space-between; }
    .name { font-size: 32rpx; font-weight: 700; color: $wa-ink; }
    .st { font-size: 24rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
      &.st-pending { color: #b45309; background: #fdf3e0; }
      &.st-approved { color: #16a34a; background: #e6f5ec; }
      &.st-suspended { color: #b91c1c; background: #fdeaea; }
      &.st-none { color: #8a919c; background: #f5f6f8; } }
    .meta { font-size: 24rpx; color: $wa-muted; }
    .idimg { display: flex; align-items: center; gap: 16rpx;
      image { width: 160rpx; height: 120rpx; border-radius: $wa-radius; background: $wa-bg; }
      text { font-size: 24rpx; color: $wa-accent; } }
    /* P2-5 合规块 */
    .comp { margin-top: 8rpx; padding: 20rpx; border-radius: $wa-radius; background: $wa-bg; display: flex; flex-direction: column; gap: 10rpx;
      .comp-head { display: flex; align-items: center; justify-content: space-between; }
      .comp-title { font-size: 26rpx; font-weight: 600; color: $wa-ink; }
      .comp-pill { font-size: 22rpx; border-radius: 999rpx; padding: 2rpx 14rpx;
        &.cp-ok { color: #16a34a; background: #e6f5ec; }
        &.cp-expiring { color: #b45309; background: #fdf3e0; }
        &.cp-pending { color: #8a919c; background: #f0f1f4; }
        &.cp-blocked { color: #b91c1c; background: #fdeaea; } }
      .comp-row { display: flex; align-items: center; gap: 12rpx; font-size: 24rpx;
        .comp-key { color: $wa-muted; min-width: 150rpx; }
        .comp-val { font-weight: 600;
          &.cs-ok { color: #16a34a; }
          &.cs-expiring { color: #b45309; }
          &.cs-expired, &.cs-failed { color: #b91c1c; }
          &.cs-pending { color: #b45309; }
          &.cs-missing { color: #8a919c; } }
        .comp-exp { font-size: 22rpx; color: $wa-muted; } }
      .comp-form { margin-top: 8rpx; padding-top: 16rpx; border-top: 1rpx solid rgba(0, 0, 0, .06); display: flex; flex-direction: column; gap: 14rpx;
        .cf-field { display: flex; flex-direction: column; gap: 8rpx;
          .cf-lbl { font-size: 24rpx; color: $wa-muted; }
          input { background: $wa-card; border-radius: $wa-radius; padding: 12rpx 16rpx; font-size: 26rpx; color: $wa-ink; }
          .seg { display: flex; gap: 8rpx; flex-wrap: wrap;
            .seg-item { font-size: 24rpx; padding: 8rpx 20rpx; border-radius: $wa-radius; background: $wa-card; color: $wa-muted;
              &.on { background: $wa-accent; color: #fff; font-weight: 600; } } }
        }
        .cf-hint { font-size: 22rpx; color: $wa-muted; } }
    }
    .ops { display: flex; gap: 12rpx; margin-top: 8rpx;
      .op { min-width: 160rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
        font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; } } }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
}
</style>