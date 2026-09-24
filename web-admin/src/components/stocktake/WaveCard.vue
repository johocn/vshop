<template>
  <!-- 盘次卡片：库区 / 负责人 / 状态 / 进度 + 认领·指派·释放 / 进入录入 -->
  <view class="wcard">
    <view class="top">
      <text class="zn">{{ zoneLabel }}</text>
      <text class="st" :class="stateClass">{{ $t('stocktake.waveState.' + wave.state) }}</text>
    </view>
    <view class="mid">
      <text class="as">{{ $t('stocktake.task.assignee') }}：{{ wave.assigneeName || $t('stocktake.task.none') }}</text>
      <text class="pg">{{ $t('stocktake.task.waveProgress').replace('{done}', String(p.counted)).replace('{total}', String(p.expected)) }}</text>
    </view>
    <view class="bar"><view class="fill" :style="{ width: p.percent + '%' }" /></view>
    <view class="ops">
      <text v-if="canClaim" class="b primary" @tap="emit('claim')">{{ $t('stocktake.task.claim') }}</text>
      <text v-if="canEnter" class="b" @tap="emit('enter')">{{ $t('stocktake.task.enter') }}</text>
      <text v-if="canRelease" class="b" @tap="emit('release')">{{ $t('stocktake.task.release') }}</text>
      <text v-if="canAssign" class="b" @tap="emit('assign')">{{ $t('stocktake.task.assign') }}</text>
      <text v-if="canCancel" class="b danger" @tap="emit('cancel')">{{ $t('stocktake.task.cancelWave') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { StocktakeWave } from '../../apis/stocktake';
import { waveProgress } from '../../utils/stocktake-grid';

const props = defineProps<{
  wave: StocktakeWave;
  /** 当前登录人是否为该盘次负责人（前端只做按钮可见性，最终由服务端独占锁裁决） */
  isOwner: boolean;
  /** 是否为管理员（可指派 / 取消盘次） */
  isAdmin: boolean;
  /** 三种盘次范围的展示文案由父组件用 i18n 备好（组件脚本内不引 useLocaleStore，保持可测试） */
  labelZone: string;
  labelUnassigned: string;
  labelWhole: string;
}>();
const emit = defineEmits<{
  (e: 'claim'): void; (e: 'assign'): void; (e: 'release'): void; (e: 'enter'): void; (e: 'cancel'): void;
}>();

const p = computed(() => waveProgress(props.wave));

// 盘次标签：库区 / 整仓 / 未归位桶（规格 §4.2 scopeType 三值）
const zoneLabel = computed(() => {
  const w = props.wave;
  if (w.scopeType === 'unassigned') return props.labelUnassigned;
  if (w.scopeType === 'whole') return props.labelWhole;
  if (!w.zoneCode) return props.labelWhole;
  const base = props.labelZone.replace('{code}', w.zoneCode);
  return w.zoneName ? `${base} ${w.zoneName}` : base;
});

const canClaim = computed(() => props.wave.state === 'OPEN');
const canEnter = computed(() => ['CLAIMED', 'COUNTING'].includes(props.wave.state) && props.isOwner);
// 释放只认负责人：服务端 releaseWave/waveOwnerError 强制独占锁，非负责人点击必被拒
const canRelease = computed(() => ['CLAIMED', 'COUNTING'].includes(props.wave.state) && props.isOwner);
const canAssign = computed(() => ['OPEN', 'CLAIMED', 'COUNTING'].includes(props.wave.state) && props.isAdmin);
const canCancel = computed(() => ['OPEN', 'CLAIMED', 'COUNTING'].includes(props.wave.state) && props.isAdmin);

const stateClass = computed(() => {
  switch (props.wave.state) {
    case 'SUBMITTED': return 'ok';
    case 'CANCELLED': return 'dead';
    case 'COUNTING': return 'doing';
    case 'CLAIMED': return 'ready';
    default: return 'idle';
  }
});
</script>

<style lang="scss" scoped>
.wcard {
  background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 16rpx;
  .top { display: flex; align-items: center;
    .zn { flex: 1; font-size: 29rpx; font-weight: 600; color: $wa-ink; }
    .st { font-size: 20rpx; color: #fff; border-radius: 6rpx; padding: 4rpx 14rpx; background: $wa-muted;
      &.idle { background: $wa-muted; }
      &.ready { background: $wa-ink; }
      &.doing { background: $wa-accent; }
      &.ok { background: $wa-success; }
      &.dead { background: $wa-muted; }
    }
  }
  .mid { display: flex; align-items: center; margin-top: 14rpx;
    .as { flex: 1; font-size: 25rpx; color: $wa-ink; }
    .pg { font-size: 24rpx; color: $wa-muted; }
  }
  .bar { height: 10rpx; background: $wa-rule; border-radius: 6rpx; margin-top: 14rpx; overflow: hidden;
    .fill { height: 100%; background: $wa-accent; border-radius: 6rpx; }
  }
  .ops { display: flex; flex-wrap: wrap; margin-top: 18rpx;
    .b { font-size: 25rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius; padding: 12rpx 26rpx; margin: 0 14rpx 12rpx 0;
      &.primary { background: $wa-accent; color: #fff; }
      &.danger { color: $wa-danger; }
    }
  }
}
</style>