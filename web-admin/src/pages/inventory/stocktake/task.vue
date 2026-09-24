<template>
  <view class="page">
    <!-- ① 任务信息卡 -->
    <view v-if="task" class="card">
      <view class="top">
        <text class="code">{{ task.code }}</text>
        <text class="st" :class="stateClass">{{ $t('stocktake.state.' + task.state) }}</text>
      </view>
      <view class="bar"><view class="fill" :style="{ width: p.percent + '%' }" /></view>
      <view class="kv"><text class="k">{{ $t('stocktake.task.warehouse') }}</text><text class="v">{{ task.locationName || '—' }}</text></view>
      <view class="kv"><text class="k">{{ $t('stocktake.task.activity') }}</text><text class="v">{{ task.activityCode || $t('stocktake.board.activityNone') }}</text></view>
      <view class="kv"><text class="k">{{ $t('stocktake.task.scope') }}</text><text class="v">{{ scopeLabel }}</text></view>
      <view class="kv"><text class="k">{{ $t('stocktake.task.createdBy') }}</text><text class="v">{{ task.createdByName || '—' }}</text></view>
      <view class="kv"><text class="k">{{ $t('stocktake.task.createdAt') }}</text><text class="v">{{ timeLabel(task.createdAt) }}</text></view>
      <view v-if="task.postedStockDocId" class="posted">
        {{ $t('stocktake.task.posted').replace('{code}', String(task.postedStockDocId)) }}
      </view>
    </view>
    <view v-else-if="!loading" class="empty">{{ $t('stocktake.task.loadFailed') }}</view>

    <!-- ② 盘次列表：认领 / 进入录入 / 释放 / 指派 / 取消 -->
    <text class="sec">{{ $t('stocktake.task.waves') }}</text>
    <WaveCard
      v-for="w in waves"
      :key="w.id"
      :wave="w"
      :is-owner="isMine(w)"
      :is-admin="isAdmin"
      :label-zone="$t('stocktake.task.waveZone')"
      :label-unassigned="$t('stocktake.task.waveUnassigned')"
      :label-whole="$t('stocktake.task.waveWhole')"
      @claim="onClaim(w)"
      @assign="onAssign(w)"
      @release="onRelease(w)"
      @enter="onEnter(w)"
      @cancel="onCancelWave(w)"
    />
    <view v-if="task && !waves.length" class="empty">{{ $t('stocktake.board.empty') }}</view>

    <!-- ③ 吸底：取消任务 / 查看差异并过账（未提交满时禁用并说明原因） -->
    <view class="savebar">
      <button class="ghost" :disabled="working" @tap="onCancelTask">{{ $t('stocktake.task.cancelTask') }}</button>
      <button class="main" :disabled="!readyToPost" @tap="goDiff">{{ $t('stocktake.task.toDiff') }}</button>
    </view>
    <view v-if="task && openWaveCount > 0" class="tip">
      {{ $t('stocktake.task.notReady').replace('{n}', String(openWaveCount)) }}
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import WaveCard from '../../../components/stocktake/WaveCard.vue';
import {
  assignStocktakeWave, cancelStocktakeTask, cancelStocktakeWave, claimStocktakeWave,
  fetchStocktakeTask, fetchStocktakeWaves, releaseStocktakeWave,
  type StocktakeTask, type StocktakeWave,
} from '../../../apis/stocktake';
import { fetchMyTenantMembers, type TenantMemberItem } from '../../../apis/tenant-admin';
import { useLocaleStore } from '../../../stores/localeStore';
import { useAuthStore } from '../../../stores/authStore';
import { parseScopeJson, scopeBadges, taskProgress } from '../../../utils/stocktake-grid';

const locale = useLocaleStore();
const auth = useAuthStore();

const taskId = ref('');
const task = ref<StocktakeTask | null>(null);
const waves = ref<StocktakeWave[]>([]);
const working = ref(false);
const loading = ref(false);
/** 当前登录人的 TenantMember.id（服务端 claimWave 用同一口径，独占锁按这个 id 比对） */
const myMemberId = ref('');

const p = computed(() => taskProgress(task.value ?? { expectedTotal: 0, countedTotal: 0, waveCount: 0, submittedWaveCount: 0, state: 'OPEN' }));
const isAdmin = computed(() => auth.isSuperAdmin || auth.hasPermission('StocktakePost'));
const openWaveCount = computed(() => waves.value.filter((w) => !['SUBMITTED', 'CANCELLED'].includes(w.state)).length);
const readyToPost = computed(() => !!task.value && task.value.state === 'COUNTED' && openWaveCount.value === 0);
const scopeLabel = computed(() => {
  const s = parseScopeJson(task.value?.scopeJson);
  const badges = scopeBadges(s);
  return badges.join(' · ') + (s.includeZeroBook ? '' : ` (${locale.t('stocktake.board.formIncludeZero')}: ✕)`);
});
const stateClass = computed(() => {
  switch (task.value?.state) {
    case 'POSTED': return 'ok';
    case 'COUNTED': return 'ready';
    case 'CANCELLED': return 'dead';
    case 'COUNTING': return 'doing';
    default: return 'idle';
  }
});

const timeLabel = (s?: string | null) => String(s || '').replace('T', ' ').slice(0, 16);

/** 盘次负责人是否就是当前登录人（服务端独占锁按 TenantMember.id 比对） */
function isMine(w: StocktakeWave): boolean {
  return !!myMemberId.value && String(w.assigneeId || '') === myMemberId.value;
}

async function reload() {
  if (!taskId.value) return;
  loading.value = true;
  try {
    task.value = await fetchStocktakeTask(taskId.value);
    waves.value = await fetchStocktakeWaves(taskId.value);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.task.loadFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

/**
 * 把当前登录管理员解析为 TenantMember.id：复用店铺成员列表查询（`tenantMembers`，只要求已登录 + 本店成员），
 * 按 `administratorId` 匹配自己。拿不到时留空 —— 此时「进入录入 / 释放」按钮不显示，但认领等操作仍可走。
 */
async function loadMyMemberId() {
  if (myMemberId.value) return;
  try {
    const members = await fetchMyTenantMembers();
    const mine = members.find((m) => String(m.administratorId) === String(auth.userId));
    myMemberId.value = mine ? String(mine.id) : '';
  } catch {
    myMemberId.value = '';
  }
}

async function guard(fn: () => Promise<unknown>, okTitle: string) {
  if (working.value) return;
  working.value = true;
  try {
    await fn();
    uni.showToast({ title: okTitle, icon: 'none' });
    await reload();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.task.opFailed'), icon: 'none' });
  } finally {
    working.value = false;
  }
}

const memberLabel = (m: TenantMemberItem) => m.displayName || m.emailAddress || String(m.administratorId);

const onClaim = (w: StocktakeWave) => guard(() => claimStocktakeWave(String(w.id)), locale.t('stocktake.task.claimed'));
const onRelease = (w: StocktakeWave) => guard(() => releaseStocktakeWave(String(w.id)), locale.t('stocktake.task.released'));
const onCancelWave = (w: StocktakeWave) => guard(() => cancelStocktakeWave(String(w.id)), locale.t('stocktake.task.cancelled'));
const onCancelTask = () => guard(() => cancelStocktakeTask(taskId.value), locale.t('stocktake.task.cancelled'));

/** 指派：本店成员选择器（`uni.showActionSheet`），已认领的盘次额外给一条「改为待认领」 */
async function onAssign(w: StocktakeWave) {
  if (working.value) return;
  try {
    // showActionSheet 各端最多 6 项，成员多于 5 人时取前 5 条
    const members = (await fetchMyTenantMembers()).filter((m) => m.enabled !== false).slice(0, 5);
    const items = members.map(memberLabel);
    if (w.assigneeId) items.push(locale.t('stocktake.task.none'));
    if (!items.length) {
      uni.showToast({ title: locale.t('stocktake.task.pickMember'), icon: 'none' });
      return;
    }
    uni.showActionSheet({
      itemList: items,
      success: (res: any) => {
        const idx = Number(res?.tapIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) return;
        const target = members[idx];
        if (!target) {
          guard(() => assignStocktakeWave(String(w.id), null), locale.t('stocktake.task.released'));
          return;
        }
        guard(
          () => assignStocktakeWave(String(w.id), String(target.id)),
          locale.t('stocktake.task.assignedTo').replace('{name}', memberLabel(target)),
        );
      },
      fail: () => { /* 用户取消：静默 */ },
    });
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.task.opFailed'), icon: 'none' });
  }
}

function onEnter(w: StocktakeWave) {
  if (!['CLAIMED', 'COUNTING'].includes(w.state)) {
    uni.showToast({ title: locale.t('stocktake.task.cannotEdit'), icon: 'none' });
    return;
  }
  uni.navigateTo({ url: `/pages/inventory/stocktake/count?taskId=${taskId.value}&waveId=${w.id}` });
}

function goDiff() {
  if (!readyToPost.value) return;
  uni.navigateTo({ url: `/pages/inventory/stocktake/diff?taskId=${taskId.value}` });
}

onLoad((q: any) => { taskId.value = String(q?.id || ''); });
onShow(async () => {
  await loadMyMemberId();
  await reload();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 200rpx; }
.card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx;
  .top { display: flex; align-items: center;
    .code { flex: 1; font-size: 32rpx; font-weight: 600; color: $wa-ink; }
    .st { font-size: 20rpx; color: #fff; border-radius: 6rpx; padding: 4rpx 14rpx; background: $wa-muted;
      &.idle { background: $wa-muted; } &.ready { background: $wa-ink; }
      &.doing { background: $wa-accent; } &.ok { background: $wa-success; } &.dead { background: $wa-muted; }
    }
  }
  .bar { height: 10rpx; background: $wa-rule; border-radius: 6rpx; margin: 18rpx 0; overflow: hidden;
    .fill { height: 100%; background: $wa-accent; }
  }
  .kv { display: flex; margin-top: 12rpx;
    .k { width: 150rpx; font-size: 25rpx; color: $wa-muted; }
    .v { flex: 1; font-size: 25rpx; color: $wa-ink; }
  }
  .posted { margin-top: 16rpx; font-size: 24rpx; color: $wa-success; }
}
.sec { display: block; font-size: 24rpx; color: $wa-muted; margin: 28rpx 0 14rpx 8rpx; }
.empty { text-align: center; font-size: 26rpx; color: $wa-muted; padding: 60rpx 0; }
.savebar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 20rpx;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $wa-rule;
  .ghost { flex: 1; background: $wa-bg; color: $wa-ink; font-size: 28rpx; border-radius: $wa-radius; }
  .main { flex: 2; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; }
}
.tip { position: fixed; left: 32rpx; right: 32rpx; bottom: calc(150rpx + env(safe-area-inset-bottom));
  font-size: 23rpx; color: $wa-muted; text-align: center;
}
</style>