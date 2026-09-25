<template>
  <view class="page">
    <view class="st-screen">
    <!-- ① 工具条：导出与打印（非 H5 平台隐藏，见 §8.4） -->
    <view class="tools">
      <text class="tbtn" @tap="exportCurrentView">{{ $t('stocktake.diff.exportView') }}</text>
      <text class="tbtn" @tap="exportFull">{{ $t('stocktake.diff.exportFull') }}</text>
      <text class="tbtn" @tap="onPrint">{{ $t('stocktake.diff.print') }}</text>
    </view>

    <!-- ① 摘要四宫格 -->
    <view class="sum" v-if="diff">
      <view class="cell">
        <text class="n">{{ diff.expectedTotal }}</text>
        <text class="l">{{ $t('stocktake.diff.summaryExpected') }}</text>
      </view>
      <view class="cell">
        <text class="n ok">{{ diff.countedTotal }}</text>
        <text class="l">{{ $t('stocktake.diff.summaryCounted') }}</text>
      </view>
      <view class="cell">
        <text class="n" :class="{ warn: diff.uncountedCount > 0 }">{{ diff.uncountedCount }}</text>
        <text class="l">{{ $t('stocktake.diff.summaryUncounted') }}</text>
      </view>
      <view class="cell">
        <text class="n" :class="{ warn: diff.extraCount > 0 }">{{ diff.extraCount }}</text>
        <text class="l">{{ $t('stocktake.diff.summaryExtra') }}</text>
      </view>
    </view>

    <!-- ② 账面变动提示条（过账必须二次确认） -->
    <view v-if="diff && diff.recheck" class="recheck">
      <text class="rt">{{ $t('stocktake.diff.recheckBar').replace('{n}', String(diff.changedVariants.length)) }}</text>
      <text class="sec">{{ $t('stocktake.diff.changedTitle') }}</text>
      <text v-for="c in diff.changedVariants" :key="c.variantId" class="crow">
        {{ $t('stocktake.diff.changedRow').replace('{sku}', c.variantSku).replace('{snap}', String(c.snapBookQty)).replace('{cur}', String(c.currentBookQty)) }}
      </text>
    </view>

    <!-- ③ 未盘项折叠清单 + 显式跳过勾选 -->
    <view v-if="diff && diff.uncountedCount > 0" class="blk">
      <view class="bh" @tap="showUncounted = !showUncounted">
        <text class="bt">{{ $t('stocktake.diff.uncountedTitle').replace('{n}', String(diff.uncountedCount)) }}</text>
        <text class="caret">{{ showUncounted ? '▾' : '▸' }}</text>
      </view>
      <text class="hint">{{ $t('stocktake.diff.uncountedHint') }}</text>
      <template v-if="showUncounted">
        <view v-for="l in diff.uncountedLines" :key="l.id" class="urow">
          <text class="usku">{{ l.variantSku }}</text>
          <text class="unm">{{ l.variantName }}</text>
          <text class="ubk">{{ $t('stocktake.count.bookQty').replace('{n}', String(l.bookQty)) }}</text>
        </view>
      </template>
      <view class="skip" @tap="skipConfirmed = !skipConfirmed">
        <view class="box" :class="{ on: skipConfirmed }" />
        <text class="skt">{{ $t('stocktake.diff.skipConfirm').replace('{n}', String(diff.uncountedCount)) }}</text>
      </view>
    </view>

    <!-- ④ 差异表（按变体汇总，不是逐行相减） -->
    <view class="blk">
      <text class="bt">{{ $t('stocktake.diff.colDiff') }}</text>
      <view v-if="diff && diff.rows.length" class="thead">
        <text class="c1">{{ $t('stocktake.diff.colSku') }}</text>
        <text class="c2">{{ $t('stocktake.diff.colCounted') }}</text>
        <text class="c2">{{ $t('stocktake.diff.colBook') }}</text>
        <text class="c2">{{ $t('stocktake.diff.colDiff') }}</text>
      </view>
      <view v-for="r in diff?.rows || []" :key="r.variantId" class="trow">
        <view class="c1">
          <text class="sku">{{ r.variantSku }}</text>
          <text class="nm">{{ r.variantName }}</text>
          <text v-if="r.isExtra" class="tag">{{ $t('stocktake.diff.extraMark') }}</text>
          <text v-if="r.binChanged" class="bin">
            {{ $t('stocktake.diff.binChanged').replace('{code}', r.targetBinCode || '—') }}
          </text>
        </view>
        <text class="c2">{{ r.countedTotal }}</text>
        <text class="c2">{{ r.bookQty }}</text>
        <text class="c2" :class="r.diff > 0 ? 'plus' : r.diff < 0 ? 'minus' : ''">{{ r.diff > 0 ? '+' + r.diff : r.diff }}</text>
      </view>
      <view v-if="diff && !diff.rows.length" class="empty">{{ $t('stocktake.diff.empty') }}</view>
    </view>

    <!-- ⑤ 底部固定条：过账（仅 StocktakePost 可见可用） -->
    <view class="postbar">
      <text v-if="blockedReason" class="block">{{ blockedReason }}</text>
      <button class="main" :disabled="!canPost" @tap="onPost">
        {{ posting ? $t('stocktake.diff.posting') : $t('stocktake.diff.post') }}
      </button>
    </view>

    <view v-if="kindVisible" class="kinds">
      <view class="krow" v-for="k in kinds" :key="k.kind" @tap="pickKind(k.kind)">{{ $t(k.label) }}</view>
      <view class="krow cancel" @tap="kindVisible = false">{{ $t('stocktake.diff.cancel') }}</view>
    </view>
    </view>

    <!-- ⑥ 打印区：屏幕不显示（.st-print{display:none}），仅 @media print 显示（规格 §7.5） -->
    <view v-if="diff" class="st-print">
      <!-- 任务头：只在第一页（position: static，禁用 fixed） -->
      <view class="p-head">
        <view class="p-title">{{ printTask?.code || '—' }} · {{ printTask?.name || '' }}</view>
        <view class="p-sub">
          {{ $t('stocktake.task.warehouse') }}: {{ printTask?.locationName || '—' }}
          <text v-if="printTask?.activityCode"> | {{ $t('stocktake.task.activity') }}: {{ printTask.activityCode }}</text>
        </view>
      </view>

      <!-- 四宫格（独立块级外壳，break-inside: avoid） -->
      <view class="p-sum">
        <view class="p-cell"><text class="p-n">{{ diff.expectedTotal }}</text><text class="p-l">{{ $t('stocktake.diff.summaryExpected') }}</text></view>
        <view class="p-cell"><text class="p-n">{{ diff.countedTotal }}</text><text class="p-l">{{ $t('stocktake.diff.summaryCounted') }}</text></view>
        <view class="p-cell"><text class="p-n">{{ diff.uncountedCount }}</text><text class="p-l">{{ $t('stocktake.diff.summaryUncounted') }}</text></view>
        <view class="p-cell"><text class="p-n">{{ diff.extraCount }}</text><text class="p-l">{{ $t('stocktake.diff.summaryExtra') }}</text></view>
      </view>

      <!-- 差异表：9 列，列宽按 §7.5 固定分配（合计 186mm） -->
      <view class="p-sec">
        <table class="p-tbl">
          <thead>
            <tr>
              <th class="c1">{{ $t('stocktake.diff.printColBinCode') }}</th>
              <th class="c2">{{ $t('stocktake.diff.printColZone') }}</th>
              <th class="c3">{{ $t('stocktake.diff.printColSku') }}</th>
              <th class="c4">{{ $t('stocktake.diff.printColName') }}</th>
              <th class="c5 num">{{ $t('stocktake.diff.printColCounted') }}</th>
              <th class="c6 num">{{ $t('stocktake.diff.printColSnapBook') }}</th>
              <th class="c7 num">{{ $t('stocktake.diff.printColBook') }}</th>
              <th class="c8 num">{{ $t('stocktake.diff.printColDiff') }}</th>
              <th class="c9 num">{{ $t('stocktake.diff.printColExtra') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in diff.rows" :key="r.variantId">
              <td class="c1">{{ r.targetBinCode || '—' }}</td>
              <td class="c2">{{ r.targetZoneCode || '—' }}</td>
              <td class="c3">{{ r.variantSku }}</td>
              <td class="c4">{{ r.variantName }}</td>
              <td class="c5 num">{{ r.countedTotal }}</td>
              <td class="c6 num">{{ r.snapBookQty }}</td>
              <td class="c7 num">{{ r.currentBookQty }}</td>
              <td class="c8 num">{{ r.diff > 0 ? '+' + r.diff : r.diff }}</td>
              <td class="c9 num">{{ r.isExtra ? '1' : '' }}</td>
            </tr>
            <tr v-if="!diff.rows.length">
              <td class="p-empty" colspan="9">{{ $t('stocktake.diff.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </view>

      <!-- 未盘清单（印刷版必须带上，否则过账依据不完整） -->
      <view v-if="diff.uncountedCount > 0" class="p-sec">
        <view class="p-sec-t">{{ $t('stocktake.diff.uncountedTitle').replace('{n}', String(diff.uncountedCount)) }}</view>
        <table class="p-tbl p-unc">
          <thead>
            <tr>
              <th class="u1">{{ $t('stocktake.diff.printColSku') }}</th>
              <th class="u2">{{ $t('stocktake.diff.printColName') }}</th>
              <th class="u3 num">{{ $t('stocktake.diff.colBook') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in diff.uncountedLines" :key="l.id">
              <td class="u1">{{ l.variantSku }}</td>
              <td class="u2">{{ l.variantName }}</td>
              <td class="u3 num">{{ l.bookQty }}</td>
            </tr>
          </tbody>
        </table>
      </view>

      <!-- 页脚：任务号 + 打印时间（无页码，理由见 §7.5「页码」行） -->
      <view class="p-foot">
        <text>{{ $t('stocktake.diff.footerTask') }}: {{ printTask?.code || '—' }}</text>
        <text>{{ $t('stocktake.diff.footerAt') }}: {{ printAt }}</text>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchStocktakeDiff, fetchStocktakeTask, postStocktake, stocktakeExport, type StocktakeDiff, type StocktakeExportFile, type StocktakeTask } from '../../../apis/stocktake';
import { toCsv, VARIANCE_CSV_COLUMNS } from '../../../utils/stocktake-grid';
import { useLocaleStore } from '../../../stores/localeStore';
import { useAuthStore } from '../../../stores/authStore';

const locale = useLocaleStore();
const auth = useAuthStore();

const taskId = ref('');
const diff = ref<StocktakeDiff | null>(null);
const taskState = ref('');
const posting = ref(false);
const skipConfirmed = ref(false);
const showUncounted = ref(false);
/** 账面变动的二次确认是否已完成（弹窗点过「确认过账」） */
const recheckConfirmed = ref(false);
/** 最近一次被服务端拦下的原因（弹窗/提示里原样透出，绝不静默失败） */
const lastMessage = ref('');
const taskCode = ref('');
/** 打印区任务头数据（Task 15 消费） */
const printTask = ref<StocktakeTask | null>(null);

/**
 * 打印时间：§10.5 基线要可复现，截图脚本会用 window.__STOCKTAKE_PRINT_AT__ 冻结；
 * 未冻结时取当前时间（本地 yyyy-MM-dd HH:mm）。
 */
function currentStamp() {
  const frozen = (window as any).__STOCKTAKE_PRINT_AT__;
  const d = frozen ? new Date(frozen) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const printAt = ref(currentStamp());

onMounted(() => { printAt.value = currentStamp(); });

/** 过账权限（规格 §9：能盘 ≠ 能过账） */
const canPostPermission = computed(() => auth.isSuperAdmin || auth.hasPermission('StocktakePost'));

/** 前置条件：任务 COUNTED、有权限、未过账 */
const blockedReason = computed(() => {
  if (!canPostPermission.value) return locale.t('stocktake.diff.noPermission');
  if (taskState.value === 'POSTED') return locale.t('stocktake.diff.posted');
  if (taskState.value !== 'COUNTED') return locale.t('stocktake.diff.notCounted');
  return '';
});

/** 未盘项必须显式勾选才能过账（规格 §6.2 / §10） */
const canPost = computed(() => {
  if (posting.value || blockedReason.value || !diff.value) return false;
  return diff.value.uncountedCount === 0 || skipConfirmed.value;
});

const kindVisible = ref(false);
const kinds = [
  { kind: 'variance', label: 'stocktake.diff.kindVariance' },
  { kind: 'lines', label: 'stocktake.diff.kindLines' },
  { kind: 'by_bin', label: 'stocktake.diff.kindByBin' },
  { kind: 'by_counter', label: 'stocktake.diff.kindByCounter' },
] as const;

/** 浏览器落盘（H5）：Blob + a[download]；文件名沿用后端命名规则 */
function saveText(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function stampName(kind: string) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `stocktake-${taskCode.value || 'task'}-${kind}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}.csv`;
}

/** 当前视图导出（规格 §3.4）：内存数据即时落盘，不等待网络 */
function exportCurrentView() {
  const rows = diff.value?.rows || [];
  if (!rows.length) {
    uni.showToast({ title: locale.t('stocktake.diff.exportEmpty'), icon: 'none' });
    return;
  }
  const body = rows.map((r) => [
    r.targetBinCode || '', r.targetZoneCode || '', r.variantSku, r.variantName, r.countedTotal,
    r.snapBookQty, r.currentBookQty, r.diff, r.isExtra, r.snapBookQty !== r.currentBookQty,
  ]);
  saveText(stampName('variance'), 'text/csv;charset=utf-8', toCsv([[...VARIANCE_CSV_COLUMNS], ...body]));
  uni.showToast({ title: locale.t('stocktake.diff.exportDone').replace('{n}', String(body.length)), icon: 'none' });
}

function exportFull() { kindVisible.value = true; }

async function pickKind(kind: string) {
  kindVisible.value = false;
  try {
    const f: StocktakeExportFile = await stocktakeExport(taskId.value, kind);
    saveText(f.filename, f.mimeType, f.content);
    uni.showToast({
      title: f.truncated
        ? locale.t('stocktake.diff.exportTruncated').replace('{n}', String(f.totalRows))
        : locale.t('stocktake.diff.exportDone').replace('{n}', String(f.totalRows)),
      icon: 'none', duration: f.truncated ? 3500 : 2000,
    });
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.diff.exportFailed'), icon: 'none' });
  }
}

function onPrint() {
  printAt.value = currentStamp();
  // 打印根节点常驻 DOM（打印样式内 display 切换），此处只需触发系统打印
  window.print();
}

async function loadDiff() {
  diff.value = await fetchStocktakeDiff(taskId.value);
  const t = await fetchStocktakeTask(taskId.value);
  taskState.value = t?.state || '';
  taskCode.value = t?.code || '';
  printTask.value = t;
}

/**
 * 发一次过账请求。返回三态，供上层决定「弹二次确认 / 提示 / 收工」：
 * 'ok' 成功（已 toast + 返回）、'blocked' 被服务端守卫拦下（原因在 lastMessage）、'error' 网络/权限异常。
 */
async function sendPost(confirm: boolean): Promise<'ok' | 'blocked' | 'error'> {
  posting.value = true;
  try {
    const r = await postStocktake(taskId.value, confirm);
    if (r.diff) diff.value = r.diff;                  // 被拦时把最新差异回填，供用户重新决策
    if (r.ok) {
      uni.showToast({ title: locale.t('stocktake.diff.postDone'), icon: 'success', duration: 2500 });
      setTimeout(() => uni.navigateBack(), 900);
      return 'ok';
    }
    lastMessage.value = r.message || '';
    return 'blocked';
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.diff.postFailed'), icon: 'none', duration: 3000 });
    return 'error';
  } finally {
    posting.value = false;
  }
}

/**
 * 过账（唯一决策点，一条错误路径都不省）：
 * ① 未盘项的显式同意 = 「确认跳过 N 项未盘」勾选（未勾选按钮本身就禁用，这里再兜一层）；
 * ② 账面变动必须二次确认：先以 confirm=false 试探（服务端必拦）→ 弹窗 → 点确认后才带 confirm=true 重发；
 * ③ 已完成后直接 confirm=true 落账（勾选/弹窗都是显式同意，服务端两个守卫都接受）。
 */
async function onPost() {
  if (posting.value || blockedReason.value || !diff.value) return;
  if (diff.value.uncountedCount > 0 && !skipConfirmed.value) {
    uni.showToast({ title: locale.t('stocktake.diff.needSkip'), icon: 'none', duration: 3000 });
    return;
  }
  if (diff.value.recheck && !recheckConfirmed.value) {
    if ((await sendPost(false)) !== 'blocked') return;
    uni.showModal({
      title: locale.t('stocktake.diff.post'),
      content: (lastMessage.value ? lastMessage.value + '\n' : '') + locale.t('stocktake.diff.needRecheck'),
      confirmText: locale.t('stocktake.diff.confirmPost'),
      success: (m) => {
        if (!m.confirm) return;
        recheckConfirmed.value = true;
        void onPost();
      },
    });
    return;
  }
  if ((await sendPost(true)) === 'blocked') {
    uni.showToast({ title: lastMessage.value || locale.t('stocktake.diff.needSkip'), icon: 'none', duration: 3000 });
    await loadDiff();                                 // 兜底刷新：任务状态可能已被并发改变
  }
}

onLoad(async (q: any) => {
  taskId.value = String(q?.taskId || '');
  try {
    await loadDiff();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.diff.loadFailed'), icon: 'none' });
  }
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 200rpx; }

.sum { display: flex; background: $wa-card; border-radius: $wa-radius; padding: 24rpx 0;
  .cell { flex: 1; text-align: center;
    .n { display: block; font-size: 38rpx; font-weight: 700; color: $wa-ink;
      &.ok { color: $wa-success; }
      &.warn { color: $wa-danger; }
    }
    .l { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; }
  }
}

.recheck { background: #fff8e6; border-radius: $wa-radius; padding: 22rpx 24rpx; margin-top: 20rpx;
  .rt { display: block; font-size: 24rpx; color: #a86b00; }
  .sec { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 14rpx; }
  .crow { display: block; font-size: 23rpx; color: $wa-ink; margin-top: 8rpx; }
}

.blk { background: $wa-card; border-radius: $wa-radius; padding: 22rpx 24rpx; margin-top: 20rpx;
  .bt { display: block; font-size: 26rpx; font-weight: 600; color: $wa-ink; }
  .bh { display: flex; align-items: center;
    .bt { flex: 1; }
    .caret { font-size: 24rpx; color: $wa-muted; }
  }
  .hint { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 10rpx; }
}

.urow { display: flex; align-items: center; margin-top: 14rpx;
  .usku { font-size: 24rpx; color: $wa-ink; }
  .unm { flex: 1; font-size: 22rpx; color: $wa-muted; margin-left: 12rpx; }
  .ubk { font-size: 22rpx; color: $wa-muted; }
}
.skip { display: flex; align-items: center; margin-top: 18rpx;
  .box { width: 34rpx; height: 34rpx; border: 2rpx solid $wa-rule; border-radius: 6rpx;
    &.on { background: $wa-accent; border-color: $wa-accent; }
  }
  .skt { font-size: 24rpx; color: $wa-ink; margin-left: 14rpx; }
}

.thead { display: flex; align-items: center; margin-top: 16rpx; padding-bottom: 10rpx; border-bottom: 1rpx solid $wa-rule;
  .c1 { flex: 1; font-size: 22rpx; color: $wa-muted; }
  .c2 { width: 110rpx; text-align: right; font-size: 22rpx; color: $wa-muted; }
}
.trow { display: flex; align-items: center; padding: 18rpx 0; border-bottom: 1rpx solid $wa-rule;
  .c1 { flex: 1;
    .sku { display: block; font-size: 26rpx; color: $wa-ink; }
    .nm { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; }
    .tag { font-size: 20rpx; color: #fff; background: $wa-accent; border-radius: 6rpx; padding: 2rpx 10rpx; }
    .bin { display: block; font-size: 21rpx; color: $wa-accent; margin-top: 4rpx; }
  }
  .c2 { width: 110rpx; text-align: right; font-size: 26rpx; color: $wa-ink;
    &.plus { color: $wa-success; }
    &.minus { color: $wa-danger; }
  }
}
.empty { text-align: center; font-size: 24rpx; color: $wa-muted; padding: 40rpx 0; }

.postbar { position: fixed; left: 0; right: 0; bottom: 0;
  padding: 18rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $wa-rule;
  .block { display: block; font-size: 23rpx; color: $wa-danger; margin-bottom: 12rpx; text-align: center; }
  .main { width: 100%; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
  .main[disabled] { opacity: .5; }
}

.tools { display: flex; gap: 16rpx; margin-bottom: 16rpx;
  .tbtn { flex: 1; text-align: center; font-size: 25rpx; color: $wa-ink; background: $wa-card;
    border-radius: $wa-radius; padding: 16rpx 0; }
}
.kinds { position: fixed; left: 24rpx; right: 24rpx; bottom: calc(160rpx + env(safe-area-inset-bottom));
  background: $wa-card; border-radius: $wa-radius; overflow: hidden; box-shadow: 0 8rpx 24rpx rgba(0,0,0,.15);
  .krow { padding: 26rpx 32rpx; font-size: 27rpx; color: $wa-ink; border-bottom: 1rpx solid $wa-rule;
    &.cancel { text-align: center; color: $wa-muted; border-bottom: 0; }
  }
}
</style>

<style lang="scss">
/* 打印样式：唯一出处是规格 §7.5。不引用主题变量；几何只用 mm、字号只用 pt；
   禁用 transform: scale / zoom / vw / 自适应列宽；缩放固定 100%。 */
.st-print { display: none; }

@media print {
  @page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }

  /* html/body 的打印归零见 src/App.vue：uni-app H5 会把本块强制加 scoped，写在这里永不命中 */
  .page { background: #fff !important; padding: 0 !important; }
  .st-screen { display: none !important; }

  .st-print { display: block; width: 186mm; background: #fff; color: #000;
    font-family: "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
    font-size: 8.5pt; line-height: 12pt;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* 任务头：只在第一页 */
  .p-head { break-inside: avoid; padding-bottom: 2mm; border-bottom: 0.2mm solid #000; }
  .p-title { font-size: 14pt; line-height: 18pt; font-weight: 700; }
  .p-sub { font-size: 8.5pt; line-height: 12pt; margin-top: 1mm; }

  /* 四宫格 */
  .p-sum { display: flex; break-inside: avoid; margin: 3mm 0; border: 0.2mm solid #000; }
  .p-cell { flex: 1; text-align: center; padding: 1.5mm 0; border-left: 0.2mm solid #000; }
  .p-cell:first-child { border-left: 0; }
  .p-n { display: block; font-size: 12pt; line-height: 14pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  .p-l { display: block; font-size: 8.5pt; line-height: 12pt; }

  /* 分区外壳：各自不跨页 */
  .p-sec { break-inside: avoid; margin-top: 3mm; }
  .p-sec-t { font-size: 8.5pt; line-height: 12pt; font-weight: 700; margin-bottom: 1mm; }

  /* 表格：固定布局，禁用斑马纹 */
  .p-tbl { table-layout: fixed; border-collapse: collapse; width: 186mm; }
  .p-tbl th, .p-tbl td { border-bottom: 0.2mm solid #000; padding: 0.8mm 1mm; text-align: left;
    font-size: 8.5pt; line-height: 12pt; overflow-wrap: anywhere; }
  .p-tbl thead { display: table-header-group; }
  .p-tbl thead th { background: #F2F2F2; border-top: 0.2mm solid #000; font-weight: 700; }
  .p-tbl tbody tr { break-inside: avoid; height: 6mm; }
  .p-tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
  .p-tbl .p-empty { text-align: center; border-bottom: 0; }

  /* 差异表列宽（§7.5 定值，合计 186mm） */
  .p-tbl .c1 { width: 22mm; } .p-tbl .c2 { width: 30mm; } .p-tbl .c3 { width: 38mm; }
  .p-tbl .c4 { width: 17mm; } .p-tbl .c5 { width: 17mm; } .p-tbl .c6 { width: 17mm; }
  .p-tbl .c7 { width: 15mm; } .p-tbl .c8 { width: 12mm; } .p-tbl .c9 { width: 18mm; }
  /* 未盘清单列宽（§7.5 未定义，本计划新增，合计 186mm） */
  .p-unc .u1 { width: 30mm; } .p-unc .u2 { width: 138mm; } .p-unc .u3 { width: 18mm; }

  /* 页脚 */
  .p-foot { break-inside: avoid; margin-top: 3mm; padding-top: 1mm; border-top: 0.2mm solid #000;
    font-size: 7.5pt; line-height: 10pt; display: flex; justify-content: space-between; }
}
</style>