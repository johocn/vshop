<template>
  <view class="page">
    <!-- ① 顶部：进度 + 退出 -->
    <view class="top">
      <text class="pg">
        {{ $t('stocktake.scan.progress').replace('{done}', String(progress.counted)).replace('{total}', String(progress.expected)) }}
      </text>
      <text class="exit" @tap="exit">{{ $t('stocktake.scan.exit') }}</text>
    </view>

    <text v-if="!canCount" class="warn">{{ $t('stocktake.scan.noPermission') }}</text>
    <text v-else-if="!canEdit" class="warn">{{ $t('stocktake.scan.requireClaim') }}</text>
    <text v-else-if="!showZone" class="warn muted">{{ $t('stocktake.scan.noBin') }}</text>

    <!-- ② 当前件（大号，单件专注） -->
    <view v-if="current" class="cur">
      <text class="sku">{{ current.variantSku }}</text>
      <text class="nm">{{ current.variantName }}</text>
      <text class="bk">{{ $t('stocktake.scan.bookQty').replace('{n}', String(current.bookQty)) }}</text>
      <text class="loc">{{ binLabel(current, showBin) }}</text>
    </view>
    <view v-else class="cur empty">
      <text class="sku">{{ $t('stocktake.scan.allDone') }}</text>
    </view>

    <!-- ③ 实盘输入（大号数字 + 加减快捷） -->
    <view class="qty">
      <text class="minus" @tap="bump(-1)">−1</text>
      <input
        class="ipt"
        type="number"
        :disabled="!canEdit"
        :value="qty"
        placeholder="—"
        @input="qty = ($event as any).detail.value"
      />
      <text class="plus" @tap="bump(1)">+1</text>
    </view>

    <!-- ④ 操作：上一件 / 确认并下一件 / 跳过 -->
    <view class="acts">
      <text class="a ghost" @tap="step(-1)">{{ $t('stocktake.scan.prev') }}</text>
      <text class="a main" :class="{ dis: !canEdit }" @tap="confirmNext">{{ $t('stocktake.scan.confirmNext') }}</text>
      <text class="a ghost" @tap="step(1)">{{ $t('stocktake.scan.skip') }}</text>
    </view>

    <!-- ⑤ 扫码 / 手动输入 -->
    <view class="scanwrap">
      <text class="sbtn" @tap="onScan">{{ $t('stocktake.scan.scan') }}</text>
      <text class="sbtn ghost" @tap="showManual = !showManual">{{ $t('stocktake.scan.manual') }}</text>
    </view>
    <view v-if="showManual" class="manual">
      <input
        class="mipt"
        :placeholder="$t('stocktake.scan.manualPlaceholder')"
        :value="manual"
        @input="manual = ($event as any).detail.value"
      />
      <text class="mbtn" @tap="onManual">{{ $t('stocktake.scan.query') }}</text>
    </view>

    <!-- ⑥ 命中提示条 -->
    <view v-if="hitMsg" class="hit">{{ hitMsg }}</view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { resolveStocktakeCode } from '../../../apis/stocktake';
import { useLocaleStore } from '../../../stores/localeStore';
import { useBinMode } from '../../../composables/useBinMode';
import { useStocktakeScope } from '../../../composables/useStocktakeScope';
import { ScannerError, scanCode } from '../../../utils/scanner';
import {
  binLabel, clampCounted, isCounted, nextUncountedLine, sortLines, type StocktakeLineRow,
} from '../../../utils/stocktake-grid';

const locale = useLocaleStore();
const { showBin, showZone, ensureBinMode } = useBinMode();

const scope = useStocktakeScope();
const { taskId, waveId, lines, progress, canCount, canEdit, saveLine, addExtra, load } = scope;

const currentId = ref('');
const qty = ref('');
const manual = ref('');
const showManual = ref(false);
const hitMsg = ref('');

function toast(msg: string, icon: 'none' | 'success' = 'none') {
  uni.showToast({ title: msg, icon, duration: 2500 });
}

// 排序后的全量（上一件/下一件按此顺序循环）
const ordered = computed<StocktakeLineRow[]>(() => sortLines(lines.value));

// 当前件：显式 id 优先；id 为空或已不在清单 → 退回第一件未盘
const current = computed<StocktakeLineRow | null>(() => {
  const hit = lines.value.find((l) => String(l.id) === String(currentId.value));
  return hit ?? nextUncountedLine(lines.value, null);
});

// 切件时把输入框重置为该行的已盘值（未盘为空串，避免把上一件的数字带到下一件）
watch(current, (c) => {
  qty.value = c && isCounted(c) ? String(c.countedQty) : '';
  currentId.value = c ? String(c.id) : '';
});

function bump(delta: number) {
  qty.value = String(Math.max(0, clampCounted(qty.value) + delta));
}

function step(delta: number) {
  const arr = ordered.value;
  if (!arr.length) return;
  const i = arr.findIndex((l) => String(l.id) === String(currentId.value));
  if (i < 0) {
    currentId.value = String(arr[0].id);
    return;
  }
  currentId.value = String(arr[(i + delta + arr.length) % arr.length].id);
}

async function confirmNext() {
  const c = current.value;
  if (!c || !canEdit.value) return;
  try {
    await saveLine(String(c.id), clampCounted(qty.value));
    hitMsg.value = locale.t('stocktake.scan.savedOne').replace('{sku}', c.variantSku);
    // 保存后服务端 count 已变，用本地快照推下一件（lines 里的 countedQty 已被 saveLine 就地更新）
    const next = nextUncountedLine(lines.value, String(c.id));
    currentId.value = next ? String(next.id) : '';
  } catch (e: any) {
    toast(e?.message || locale.t('stocktake.count.operationFailed'));
  }
}

/** 扫到码后的统一处理（扫码与手动输入共用） */
async function handleCode(raw: string) {
  const code = String(raw || '').trim();
  if (!code || !taskId.value) return;
  try {
    const hit = await resolveStocktakeCode(taskId.value, code);
    if (hit.kind === 'bin') {
      hitMsg.value = locale.t('stocktake.scan.hitBin').replace('{code}', hit.binCode || code);
      // 定位到该格子的第一件未盘（同格子只做「跳到下一件」，不做筛选，保持单件专注语义）
      const inBin = ordered.value.find(
        (l) => String(l.binId || '') === String(hit.binId || '') && !isCounted(l),
      );
      if (inBin) currentId.value = String(inBin.id);
      return;
    }
    if (hit.kind === 'line' && hit.lineId) {
      // 服务端按「整任务」解析，命中的行可能属于本任务的其他盘次；本页只装载当前盘次的行，
      // 此时不能谎报「已定位」——如实提示，避免用户以为跳转失效。
      const target = lines.value.find((l) => String(l.id) === String(hit.lineId));
      if (!target) {
        hitMsg.value = locale.t('stocktake.scan.otherWave');
        return;
      }
      currentId.value = String(target.id);
      hitMsg.value = locale.t('stocktake.scan.hitLine').replace('{sku}', hit.variantSku || '');
      return;
    }
    // 服务端已定：未匹配到任何商品/库位（kind = none）→ 无可登记对象，直接提示，不弹「登记为盘盈？」
    if (hit.kind !== 'extra') {
      toast(locale.t('stocktake.scan.extraNeedVariant'));
      return;
    }
    // 清单外命中商品：登记盘盈（须能解析出 variantId，否则无法建行）
    const vid = hit.variantId || '';
    const label = hit.variantSku || code;
    uni.showModal({
      title: locale.t('stocktake.scan.extraTitle'),
      content: locale.t('stocktake.scan.extraAsk').replace('{code}', label),
      success: async (r) => {
        if (!r.confirm) return;
        if (!vid) {
          toast(locale.t('stocktake.scan.extraNeedVariant'));
          return;
        }
        try {
          await addExtra(String(vid), clampCounted(qty.value));
          hitMsg.value = locale.t('stocktake.scan.extraDone');
        } catch (e: any) {
          toast(e?.message || locale.t('stocktake.count.operationFailed'));
        }
      },
    });
  } catch (e: any) {
    toast(e?.message || locale.t('stocktake.scan.scanFailed'));
  }
}

async function onScan() {
  try {
    await handleCode(await scanCode());
  } catch (e: any) {
    const code = e instanceof ScannerError ? e.code : '';
    if (code === 'CANCEL') return;                       // 用户主动取消 → 静默
    if (code === 'MANUAL') {                             // 微信内置/非安全上下文 → 展开手动输入
      showManual.value = true;
      hitMsg.value = e?.message || locale.t('stocktake.scan.manualHint');
      return;
    }
    toast(e?.message || locale.t('stocktake.scan.scanFailed')); // FAILED（相机无法打开）
  }
}

async function onManual() {
  const c = manual.value;
  manual.value = '';
  await handleCode(c);
}

function exit() {
  uni.navigateBack();
}

onLoad(async (q: any) => {
  await ensureBinMode();
  try {
    await load(String(q?.taskId || ''), String(q?.waveId || ''));
  } catch (e: any) {
    toast(e?.message || locale.t('stocktake.scan.loadFailed'));
  }
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx; }

.top { display: flex; align-items: center; margin-bottom: 16rpx;
  .pg { flex: 1; font-size: 25rpx; color: $wa-muted; }
  .exit { font-size: 25rpx; color: $wa-accent; }
}
.warn { display: block; font-size: 24rpx; color: $wa-danger; margin: 0 0 12rpx 8rpx;
  &.muted { color: $wa-muted; }
}

.cur { background: $wa-card; border-radius: $wa-radius; padding: 36rpx 32rpx; text-align: center;
  .sku { display: block; font-size: 44rpx; font-weight: 700; color: $wa-ink; }
  .nm { display: block; font-size: 26rpx; color: $wa-muted; margin-top: 10rpx; }
  .bk { display: block; font-size: 26rpx; color: $wa-ink; margin-top: 18rpx; }
  .loc { display: block; font-size: 24rpx; color: $wa-accent; margin-top: 8rpx; }
  &.empty .sku { font-size: 30rpx; color: $wa-muted; font-weight: 500; }
}

.qty { display: flex; align-items: center; margin-top: 24rpx;
  .ipt { flex: 1; text-align: center; background: $wa-card; border-radius: $wa-radius;
    padding: 28rpx 0; font-size: 48rpx; color: $wa-ink; }
  .minus, .plus { width: 140rpx; text-align: center; font-size: 30rpx; color: $wa-ink;
    background: $wa-card; border-radius: $wa-radius; padding: 34rpx 0; }
  .minus { margin-right: 16rpx; }
  .plus { margin-left: 16rpx; color: #fff; background: $wa-accent; }
}

.acts { display: flex; gap: 16rpx; margin-top: 24rpx;
  .a { flex: 1; text-align: center; font-size: 28rpx; border-radius: $wa-radius; padding: 26rpx 0; }
  .ghost { background: $wa-card; color: $wa-ink; }
  .main { background: $wa-accent; color: #fff; }
  .dis { opacity: .5; }
}

.scanwrap { display: flex; gap: 16rpx; margin-top: 28rpx;
  .sbtn { flex: 1; text-align: center; font-size: 27rpx; border-radius: $wa-radius; padding: 24rpx 0;
    background: $wa-accent; color: #fff;
    &.ghost { background: $wa-card; color: $wa-accent; }
  }
}
.manual { display: flex; align-items: center; margin-top: 16rpx;
  .mipt { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 22rpx 24rpx; font-size: 26rpx; color: $wa-ink; }
  .mbtn { margin-left: 16rpx; font-size: 26rpx; color: #fff; background: $wa-accent; border-radius: $wa-radius; padding: 22rpx 32rpx; }
}

.hit { margin-top: 20rpx; font-size: 24rpx; color: $wa-ink; background: $wa-card;
  border-radius: $wa-radius; padding: 18rpx 24rpx; }
</style>