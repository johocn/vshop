<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusMerchant.loading') }}</view>
    <template v-else>
      <view class="topbar">
        <view class="stat">
          <text class="stat-num">{{ board.completedToday }}</text>
          <text class="stat-lbl">{{ $t('campusMerchant.completedToday') }}</text>
        </view>
        <view class="stat">
          <text class="stat-num">¥{{ fenToYuan(board.completedTodayAmount) }}</text>
          <text class="stat-lbl">{{ $t('campusMerchant.completedAmount') }}</text>
        </view>
        <view class="switch" :class="{ on: board.openNow }" @tap="toggleOpen">
          <text class="switch-lbl">{{ board.paused ? $t('campusMerchant.closed') : (board.openNow ? $t('campusMerchant.open') : $t('campusMerchant.closedByHours')) }}</text>
        </view>
      </view>
      <!-- 休业日未出餐提醒（§71）：休业当天仍有待接单/备餐中订单，点击直达对应栏 -->
      <view v-if="board.closedToday && board.unfinishedOrders > 0" class="closedbar" @tap="goUnfinished">
        <text class="c-lbl">{{ closedUnfinishedText }}</text>
        <text class="c-chev">›</text>
      </view>
      <!-- 营业时间自动开关门：下次开门/打烊倒计时；打烊前 15 分钟标橙 -->
      <view v-if="clockText" class="clockbar" :class="{ warn: closingSoon }">
        <text>{{ clockText }}</text>
      </view>
      <view class="entrybar" @tap="goSettings">
        <text class="e-lbl">{{ $t('nav.campusStoreSettings') }}</text>
        <text class="e-chev">›</text>
      </view>
      <!-- KDS 出餐屏（P1-4）：后厨大屏，与工作台共用同一订单状态机 -->
      <view class="entrybar" @tap="goKitchen">
        <text class="e-lbl">{{ $t('campusMerchant.kitchenEntry') }}</text>
        <text class="e-chev">›</text>
      </view>
      <view class="voicebar">
        <text class="v-lbl">{{ $t('campusMerchant.voiceTitle') }}</text>
        <view class="v-switch" :class="{ on: voiceEnabled }" @tap="toggleVoice">
          <text class="v-switch-lbl">{{ voiceEnabled ? $t('campusMerchant.voiceOn') : $t('campusMerchant.voiceOff') }}</text>
        </view>
      </view>
      <view v-if="!board.merchantConfirmEnabled" class="notice">{{ $t('campusMerchant.notConfirmMode') }}</view>
      <view v-if="board.printMode !== 'off'" class="printbar" :class="{ bad: printBad }">
        <view class="p-status">
          <text class="p-dot" :class="{ bad: printBad, wait: isLocal && lodopReady === 'probing' }"></text>
          <text class="p-mode">{{ printStatusText }}</text>
          <text v-if="failedCount" class="p-warn">{{ $t('campusMerchant.printFailedCount').replace('{n}', String(failedCount)) }}</text>
        </view>
        <view class="p-ops">
          <button v-if="isLocal && lodopReady === 'fail'" class="p-btn" @tap="probePrinter(true)">
            {{ $t('campusMerchant.printRetryConnect') }}
          </button>
          <!-- 云打印通道：一键连通性测试（验证账号/设备/密钥） -->
          <button v-if="!isLocal" class="p-btn" :disabled="cloudTesting" @tap="testCloudPrint">
            {{ cloudTesting ? $t('campusMerchant.printing') : $t('campusMerchant.printTestCloud') }}
          </button>
          <button v-if="failedCount" class="p-btn" :disabled="isLocal && lodopReady !== 'ok'" @tap="retryFailed">
            {{ $t('campusMerchant.printRetryFailed') }}
          </button>
          <button class="p-btn ghost" @tap="showPrintHelp">{{ $t('campusMerchant.printHelp') }}</button>
        </view>
      </view>

      <view class="tabs">
        <view
          v-for="t in TABS" :key="t.key"
          class="tab" :class="{ on: tab === t.key }" @tap="tab = t.key"
        >
          <text>{{ $t(t.label) }}</text>
          <text v-if="listOf(t.key).length" class="badge">{{ listOf(t.key).length }}</text>
        </view>
      </view>

      <view v-if="!listOf(tab).length" class="hint">{{ $t('campusMerchant.emptyTab') }}</view>
      <view v-for="o in listOf(tab)" :key="o.id" class="card">
        <view class="row head">
          <text class="code">{{ o.code }}</text>
          <text v-if="isUnprinted(o)" class="unprinted">{{ $t('campusMerchant.printUnprinted') }}</text>
          <text class="time">{{ hhmm(o.createdAt) }}</text>
          <text v-if="o.route" class="route">{{ o.route }}</text>
        </view>
        <view v-if="o.provider || o.thirdPartyNo" class="row ext">
          <text class="ext-txt">{{ providerLabel(o.provider) }}</text>
          <text v-if="o.thirdPartyNo" class="ext-no">{{ o.thirdPartyNo }}</text>
        </view>
        <!-- 交接码：第一段送达交接点后生成，交给取货骑手核对（防丢餐扯皮） -->
        <view v-if="o.handoverCode" class="row code-row">
          <text class="code-label">{{ $t('campusMerchant.handoverCode') }}</text>
          <text class="code-val">{{ o.handoverCode }}</text>
        </view>
        <view class="row dest">
          <text class="dest-txt">{{ o.zone }} {{ o.building }}</text>
          <text v-if="o.slotText" class="slot">{{ o.slotText }}</text>
        </view>
        <view v-if="o.note" class="row note">
          <text class="note-txt">{{ $t('campusMerchant.noteLabel') }}：{{ o.note }}</text>
        </view>
        <view class="lines">
          <view v-for="(l, i) in o.lines" :key="i" class="line">
            <text class="l-name">{{ l.name }}</text>
            <text class="l-qty">×{{ l.quantity }}</text>
          </view>
        </view>
        <view class="row foot">
          <text v-if="o.riderName" class="rider">{{ $t('campusMerchant.rider') }}{{ o.riderName }}</text>
          <text class="total">¥{{ fenToYuan(o.total) }}</text>
          <button
            class="act ghost" :disabled="printingId === o.id"
            @tap="reprint(o)"
          >{{ printingId === o.id ? $t('campusMerchant.printing') : $t('campusMerchant.printBtn') }}</button>
          <button
            v-if="tab === 'pending'"
            class="act" :disabled="actingId === o.id"
            @tap="accept(o)"
          >{{ $t('campusMerchant.accept') }}</button>
          <button
            v-else-if="tab === 'cooking'"
            class="act" :disabled="actingId === o.id"
            @tap="cookingDone(o)"
          >{{ $t('campusMerchant.cookingDone') }}</button>
          <template v-else-if="tab === 'pendingDispatch'">
            <button class="act" :disabled="actingId === o.id" @tap="pushExternal(o, 'dada')">
              {{ $t('campusMerchant.pushDada') }}
            </button>
            <button class="act ghost" :disabled="actingId === o.id" @tap="pushExternal(o, 'meituan')">
              {{ $t('campusMerchant.pushMeituan') }}
            </button>
          </template>
          <template v-else-if="tab === 'thirdParty'">
            <button class="act ghost" :disabled="actingId === o.id" @tap="cancelExternal(o)">
              {{ $t('campusMerchant.cancelExternal') }}
            </button>
          </template>
          <button
            v-else-if="tab === 'ownedPool'"
            class="act" :disabled="actingId === o.id"
            @tap="acceptOwned(o)"
          >{{ $t('campusMerchant.acceptOwned') }}</button>
          <button
            v-else-if="tab === 'ownedDispatched'"
            class="act" :disabled="actingId === o.id"
            @tap="markOwnedArrived(o)"
          >{{ $t('campusMerchant.markOwnedArrived') }}</button>
          <button
            v-else-if="tab === 'merchantDelivering'"
            class="act" :disabled="actingId === o.id"
            @tap="markHandoverArrived(o)"
          >{{ $t('campusMerchant.markHandoverArrived') }}</button>
          <!-- 拒单/缺货：接单前与备餐中均可，二次确认后全额退款并取消（独立链，勿并入上方 v-else-if） -->
          <button
            v-if="tab === 'pending' || tab === 'cooking'"
            class="act ghost reject" :disabled="actingId === o.id"
            @tap="reject(o)"
          >{{ $t('campusMerchant.reject') }}</button>
        </view>
      </view>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  campusMerchantAcceptOrder,
  campusMerchantAcceptOwned,
  campusMerchantBoard,
  campusMerchantCancelExternal,
  campusMerchantCloudPrint,
  campusMerchantCloudPrintTest,
  campusMerchantCookingDone,
  campusMerchantDispatchExternal,
  campusMerchantMarkHandoverArrived,
  campusMerchantMarkOwnedArrived,
  campusMerchantMarkPrinted,
  campusMerchantRejectOrder,
  campusMerchantSetPaused,
  type CampusMerchantBoard,
  type MerchantBoardOrder,
} from '../../apis/campus';
import { fenToYuan } from '../../utils/money';
import { loadLodop, printReceipt58 } from '../../utils/lodop';
import { maybeClosingReminder, transitionText } from '../../utils/closing-reminder';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const TABS = [
  { key: 'pending', label: 'campusMerchant.tabPending' },
  { key: 'cooking', label: 'campusMerchant.tabCooking' },
  { key: 'merchantDelivering', label: 'campusMerchant.tabMerchantDelivering' },
  { key: 'pendingDispatch', label: 'campusMerchant.tabPendingDispatch' },
  { key: 'thirdParty', label: 'campusMerchant.tabThirdParty' },
  { key: 'ownedPool', label: 'campusMerchant.tabOwnedPool' },
  { key: 'ownedDispatched', label: 'campusMerchant.tabOwnedDispatched' },
  { key: 'awaitingRider', label: 'campusMerchant.tabAwaiting' },
  { key: 'delivering', label: 'campusMerchant.tabDelivering' },
  { key: 'scheduled', label: 'campusMerchant.tabScheduled' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const locale = useLocaleStore();
const loading = ref(true);
const board = ref<CampusMerchantBoard>({
  paused: false,
  openNow: false,
  businessHours: null,
  nextTransition: null,
  merchantConfirmEnabled: false,
  printMode: 'off',
  printProvider: 'local',
  cloudPrintConfigured: false,
  storeName: '',
  storePhone: null,
  pending: [],
  cooking: [],
  awaitingRider: [],
  delivering: [],
  pendingDispatch: [],
  thirdParty: [],
  ownedPool: [],
  ownedDispatched: [],
  merchantDelivering: [],
  scheduled: [],
  completedToday: 0,
  completedTodayAmount: 0,
  closedToday: false,
  closureNote: null,
  unfinishedOrders: 0,
});
const tab = ref<TabKey>('pending');
const actingId = ref('');
const printingId = ref(''); // 手动补打中的订单
const lastPendingCount = ref(0);
/** 自动开关门：下一次切换倒计时（营业时间外显示下次开门） */
const clockText = computed(() => transitionText(board.value.nextTransition));
const closingSoon = computed(() => {
  const n = board.value.nextTransition;
  return !!n && n.action === 'close' && n.inMinutes <= 15;
});
let timer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setInterval> | null = null;

/** 休业日未出餐提醒文案（§71）：今日休业（备注），仍有 N 单未出餐 */
const closedUnfinishedText = computed(() =>
  locale.t('campusMerchant.closedWithUnfinished')
    .replace('{note}', board.value.closureNote ? `（${board.value.closureNote}）` : '')
    .replace('{n}', String(board.value.unfinishedOrders)),
);

/** 点击休业提醒：跳到有未出餐订单的栏（优先待接单） */
function goUnfinished() {
  tab.value = board.value.pending.length ? 'pending' : 'cooking';
}

// ===== 小票打印（C-Lodop）=====
// 增强版：串行队列防丢票、失败可见可重试、连接断开自动重探（商家可能刚开电脑/刚装服务）
const lodopReady = ref<'probing' | 'ok' | 'fail'>('probing');
const failedPrints = ref<Record<string, string>>({}); // orderId -> 失败原因（顶部条汇总 + 卡内徽标共用）
const printQueue: MerchantBoardOrder[] = [];
let printing = false;
const autoAttempted = new Set<string>(); // 会话内已尝试自动打印的订单（防失败循环重试）
/** onPaid 自动打印仅打 30min 内的新单，防存量未打单/历史单风暴 */
const AUTO_PRINT_WINDOW_MS = 30 * 60 * 1000;
/** 打印失败重试一次（3s 退避，打印机卡纸/瞬时离线多可恢复） */
const PRINT_RETRY_DELAY_MS = 3000;
/** 失败徽标阈值：新单超过该时长仍未打票即提示（正常出票在秒级） */
const UNPRINTED_ALERT_MS = 2 * 60 * 1000;
const failedCount = computed(() => Object.keys(failedPrints.value).length);
/** 打印通道（P1-4）：local 走前端 C-Lodop，其余由服务端直连云打印机 */
const isLocal = computed(() => board.value.printProvider === 'local');
const cloudTesting = ref(false);

/** 顶部打印条异常态：本地=服务未连上；云=账号/设备未配置 */
const printBad = computed(() =>
  isLocal.value ? lodopReady.value === 'fail' : !board.value.cloudPrintConfigured,
);

const printStatusText = computed(() => {
  if (board.value.printMode === 'off') return locale.t('campusMerchant.printModeOff');
  const mode = locale.t(printModeKey.value);
  if (!isLocal.value) {
    const provider = board.value.printProvider === 'feie'
      ? locale.t('campusMerchant.printProviderFeie')
      : locale.t('campusMerchant.printProviderYilianyun');
    const state = board.value.cloudPrintConfigured
      ? locale.t('campusMerchant.printCloudReady')
      : locale.t('campusMerchant.printCloudUnconfigured');
    return `${mode} · ${provider} · ${state}`;
  }
  if (lodopReady.value === 'probing') return locale.t('campusMerchant.printProbing');
  if (lodopReady.value === 'fail') return locale.t('campusMerchant.printOffline');
  return `${mode} · ${locale.t('campusMerchant.printConnected')}`;
});

/** 连接状态重探（商家装好/启动 C-Lodop 后点「重新连接」即可恢复，不用刷新页面） */
async function probePrinter(withToast = false) {
  lodopReady.value = 'probing';
  try {
    await loadLodop();
    lodopReady.value = 'ok';
    if (withToast) uni.showToast({ title: locale.t('campusMerchant.printConnected'), icon: 'none' });
    void flushQueue();
  } catch {
    lodopReady.value = 'fail';
    if (withToast) uni.showToast({ title: locale.t('campusMerchant.lodopMissing'), icon: 'none' });
  }
}

function showPrintHelp() {
  uni.showModal({
    title: locale.t('campusMerchant.printHelpTitle'),
    content: locale.t(isLocal.value ? 'campusMerchant.printHelpBody' : 'campusMerchant.printHelpCloudBody'),
    showCancel: false,
    confirmText: locale.t('campusMerchant.printHelpOk'),
  });
}

/** 未出票徽标：打印已启用、非终态、超阈值仍无打印回执 */
function isUnprinted(o: MerchantBoardOrder): boolean {
  if (board.value.printMode === 'off' || o.printedAt) return false;
  return Date.now() - new Date(o.createdAt).getTime() > UNPRINTED_ALERT_MS;
}

const printModeKey = computed(() =>
  board.value.printMode === 'onPaid' ? 'campusMerchant.printModeOnPaid'
  : board.value.printMode === 'onAccepted' ? 'campusMerchant.printModeOnAccepted'
  : 'campusMerchant.printModeOff',
);

const listOf = (key: TabKey): MerchantBoardOrder[] =>
  (board.value[key] as MerchantBoardOrder[]) ?? [];

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fullTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function receiptLabels() {
  return {
    orderNo: locale.t('campusMerchant.receiptOrderNo'),
    time: locale.t('campusMerchant.receiptTime'),
    route: locale.t('campusMerchant.receiptRoute'),
    slot: locale.t('campusMerchant.receiptSlot'),
    note: locale.t('campusMerchant.receiptNote'),
    subtotal: locale.t('campusMerchant.receiptSubtotal'),
    deliveryFee: locale.t('campusMerchant.receiptDeliveryFee'),
    total: locale.t('campusMerchant.receiptTotal'),
    thanks: locale.t('campusMerchant.receiptThanks'),
  };
}

/** 打印一张小票：成功后回写 waimaiPrintedAt（本地同步更新，省一次轮询） */
async function printOne(o: MerchantBoardOrder, withToast: boolean): Promise<boolean> {
  printingId.value = o.id;
  try {
    if (!isLocal.value) {
      // 云打印（P1-4）：后端签名直连服务商，成功后由后端回写 printedAt（无需再调 markPrinted）
      const r = await campusMerchantCloudPrint(o.id);
      if (!r.ok) throw new Error(r.error || locale.t('campusMerchant.printFailed'));
    } else {
      await printReceipt58(
        {
          storeName: board.value.storeName,
          storePhone: board.value.storePhone,
          code: o.code,
          createdAt: o.createdAt,
          createdAtText: fullTime(o.createdAt),
          zone: o.zone,
          building: o.building,
          slotText: o.slotText,
          route: o.route,
          note: o.note,
          lines: o.lines,
          shipping: o.shipping,
          total: o.total,
        },
        receiptLabels(),
      );
      try {
        await campusMerchantMarkPrinted(o.id);
      } catch { /* 回执失败不阻塞（下次补打以 printedAt 为准） */ }
    }
    o.printedAt = new Date().toISOString();
    delete failedPrints.value[o.id];
    if (withToast) uni.showToast({ title: locale.t('campusMerchant.printOk'), icon: 'success' });
    return true;
  } catch (err: any) {
    // 失败留痕：顶部状态条汇总 + 订单卡「未出票」徽标，商家可一键重试/补打
    failedPrints.value[o.id] = graphQlErrorMsg(err, locale.t('campusMerchant.printFailed'));
    if (withToast) {
      uni.showToast({ title: failedPrints.value[o.id], icon: 'none' });
    }
    return false;
  } finally {
    printingId.value = '';
  }
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** 入队打印（串行）：多单同时到达时逐张出票，避免并发抢占 C-Lodop 丢票 */
function enqueuePrint(o: MerchantBoardOrder, withToast = false) {
  if (o.printedAt) return;
  if (printQueue.some(q => q.id === o.id)) return;
  if (isLocal.value && lodopReady.value !== 'ok') {
    failedPrints.value[o.id] = locale.t('campusMerchant.printOffline');
    return;
  }
  if (!isLocal.value && !board.value.cloudPrintConfigured) {
    failedPrints.value[o.id] = locale.t('campusMerchant.printCloudUnconfigured');
    return;
  }
  printQueue.push(o);
  if (withToast) void flushQueue(true);
  else void flushQueue();
}

/** 消费打印队列：失败退避重试一次，仍失败留痕等人工重试 */
async function flushQueue(withToast = false) {
  if (printing) return;
  printing = true;
  try {
    while (printQueue.length) {
      const o = printQueue.shift()!;
      if (o.printedAt) continue;
      const ok = await printOne(o, withToast);
      if (!ok && (isLocal.value ? lodopReady.value === 'ok' : board.value.cloudPrintConfigured)) {
        await sleep(PRINT_RETRY_DELAY_MS);
        await printOne(o, false);
      }
    }
  } finally {
    printing = false;
  }
}

/** 重试全部失败单（顶部状态条按钮；打印服务未恢复时禁用） */
async function retryFailed() {
  if (isLocal.value && lodopReady.value !== 'ok') {
    uni.showToast({ title: locale.t('campusMerchant.lodopMissing'), icon: 'none' });
    return;
  }
  const ids = Object.keys(failedPrints.value);
  const all = TABS.flatMap(t => listOf(t.key));
  const targets = ids.map(id => all.find(o => o.id === id)).filter(Boolean) as MerchantBoardOrder[];
  for (const o of targets) enqueuePrint(o);
  await flushQueue(true);
}

/** 手动补打（任意 tab，不受 30min 限制；失败单也走此路径重置状态） */
async function reprint(o: MerchantBoardOrder) {
  if (printingId.value) return;
  if (isLocal.value && lodopReady.value === 'fail') {
    uni.showToast({ title: locale.t('campusMerchant.lodopMissing'), icon: 'none' });
    void probePrinter(true); // 顺手重探：商家可能刚启动服务
    return;
  }
  enqueuePrint(o, true);
}

/** 云打印连通性测试（P1-4）：验证账号/设备/密钥，不占用订单 */
async function testCloudPrint() {
  if (cloudTesting.value) return;
  cloudTesting.value = true;
  try {
    const r = await campusMerchantCloudPrintTest();
    uni.showToast({
      title: r.ok ? locale.t('campusMerchant.printTestOk') : r.error || locale.t('campusMerchant.printFailed'),
      icon: r.ok ? 'success' : 'none',
    });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.printFailed')), icon: 'none' });
  } finally {
    cloudTesting.value = false;
  }
}

/** onPaid 自动打印：轮询发现未打新单即入队（串行出票，失败退避重试一次） */
function autoPrint(b: CampusMerchantBoard) {
  if (b.printMode !== 'onPaid') return;
  const candidates = [...b.pending, ...b.cooking, ...b.awaitingRider, ...b.delivering].filter(o => {
    if (o.printedAt || autoAttempted.has(o.id)) return false;
    return Date.now() - new Date(o.createdAt).getTime() < AUTO_PRINT_WINDOW_MS;
  });
  if (!candidates.length) return;
  for (const o of candidates) {
    autoAttempted.add(o.id);
    enqueuePrint(o);
  }
}

/** 新单提示音（H5 Web Audio，复用同一个 AudioContext：自动播放策略需手势解锁） */
let audioCtx: any = null;
const audioUnlocked = ref(false);
const VOICE_PREF_KEY = 'wa_voice_alert';
const voiceEnabled = ref(loadVoicePref());
let notifyAsked = false;

function loadVoicePref(): boolean {
  try {
    const v = uni.getStorageSync(VOICE_PREF_KEY);
    if (v === '' || v === null || v === undefined) return true;
    return v !== false && v !== 'false';
  } catch {
    return true;
  }
}

function ensureAudioCtx(): any {
  if (audioCtx) return audioCtx;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  try {
    audioCtx = new AC();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

/** 一次性手势解锁：创建/恢复 AudioContext，并顺势申请通知权限 */
function unlockAudio() {
  try {
    const ctx = ensureAudioCtx();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
    audioUnlocked.value = true;
  } catch {
    audioUnlocked.value = true; // 无 Web Audio 环境也置位，走通知/TTS 分支
  }
  requestNotifyPermission();
  if (typeof window !== 'undefined') window.removeEventListener('pointerdown', unlockAudio);
}

function requestNotifyPermission() {
  if (notifyAsked) return;
  notifyAsked = true;
  try {
    const N = (window as any).Notification;
    if (!N || N.permission !== 'default') return;
    N.requestPermission();
  } catch {
    // 浏览器不支持或用户拒绝：静默回退
  }
}

/** 语音播报开关：localStorage 记忆，默认开启 */
function toggleVoice() {
  voiceEnabled.value = !voiceEnabled.value;
  try {
    uni.setStorageSync(VOICE_PREF_KEY, voiceEnabled.value);
  } catch {
    // 存储不可用不影响本次会话
  }
  // 本次点击本身即手势，开启时直接解锁，无需再等下一次点击
  if (voiceEnabled.value && !audioUnlocked.value) unlockAudio();
}

/** 中文语音优先；无 speechSynthesis 返回 false 以回退提示音 */
function speakNewOrder(count: number): boolean {
  try {
    const syn = (window as any).speechSynthesis;
    const Utter = (window as any).SpeechSynthesisUtterance;
    if (!syn || !Utter) return false;
    const text = count > 1
      ? locale.t('campusMerchant.voiceNewOrderMany').replace('{n}', String(count))
      : locale.t('campusMerchant.voiceNewOrder');
    const u = new Utter(text);
    u.lang = 'zh-CN';
    const voices: any[] = syn.getVoices?.() || [];
    const zh = voices.find((v: any) => /^zh[-_]CN/i.test(v.lang)) || voices.find((v: any) => /^zh/i.test(v.lang));
    if (zh) u.voice = zh;
    syn.cancel();
    syn.speak(u);
    return true;
  } catch {
    return false;
  }
}

/** 浏览器通知：仅在已授权时发送（授权本身需用户手势触发） */
function notifyNewOrders(codes: string[]) {
  try {
    const N = (window as any).Notification;
    if (!N || N.permission !== 'granted') return;
    new N(locale.t('campusMerchant.notifyTitle'), {
      body: locale.t('campusMerchant.notifyBody').replace('{codes}', codes.map((c) => '#' + c).join(' ')),
    });
  } catch {
    // 通知失败不影响看板
  }
}

/** 新单到达：语音（TTS 失败回退提示音）+ 通知 */
function alertNewOrders(pending: MerchantBoardOrder[], count: number) {
  if (!count || !voiceEnabled.value || !audioUnlocked.value) return;
  if (!speakNewOrder(count)) beep();
  notifyNewOrders(pending.slice(0, count).map((o) => o.code));
}

function beep() {
  try {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.25);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.15);
    }
  } catch {
    // 无 AudioContext 环境静默跳过
  }
}

async function refresh(initial = false) {
  try {
    const b = await campusMerchantBoard();
    const pendingCount = b.pending.length;
    if (!initial && pendingCount > lastPendingCount.value) {
      alertNewOrders(b.pending, pendingCount - lastPendingCount.value);
    }
    lastPendingCount.value = pendingCount;
    board.value = b;
    maybeClosingReminder(b.nextTransition);
    // 本地通道才探 C-Lodop（云打印由服务端直连，无需浏览器插件）
    if (isLocal.value && lodopReady.value === 'probing') void probePrinter();
    void autoPrint(b);
  } catch (err: any) {
    if (initial) {
      uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.loadFailed')), icon: 'none' });
    }
  } finally {
    if (initial) loading.value = false;
  }
}

/** 经营设置：营业时间 / 店铺公告 / 经营数据（CampusMerchant 自助） */
function goSettings() {
  uni.navigateTo({ url: '/pages/campus/store-settings' });
}

/** KDS 出餐屏（P1-4）：后厨大屏 */
function goKitchen() {
  uni.navigateTo({ url: '/pages/campus/kitchen' });
}

async function toggleOpen() {
  const next = !board.value.paused;
  try {
    await campusMerchantSetPaused(next);
    board.value.paused = next;
    uni.showToast({ title: next ? locale.t('campusMerchant.paused') : locale.t('campusMerchant.resumed'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  }
}

async function accept(o: MerchantBoardOrder) {
  actingId.value = o.id;
  try {
    await campusMerchantAcceptOrder(o.id);
    // onAccepted 模式：接单成功即打小票（打失败不阻塞接单，顶部条可重试/补打）
    if (board.value.printMode === 'onAccepted') enqueuePrint(o, true);
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
  }
}

async function cookingDone(o: MerchantBoardOrder) {
  actingId.value = o.id;
  try {
    await campusMerchantCookingDone(o.id);
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
  }
}

/** 拒单/缺货：原因选择 → 二次确认 → 全额退款并取消（接单前/备餐中均可用） */
const REJECT_REASONS = [
  'campusMerchant.rejectReasonSoldOut',
  'campusMerchant.rejectReasonClosed',
  'campusMerchant.rejectReasonOutOfRange',
  'campusMerchant.rejectReasonOther',
];
function reject(o: MerchantBoardOrder) {
  const reasons = REJECT_REASONS.map(k => locale.t(k));
  uni.showActionSheet({
    itemList: reasons,
    success: (res: any) => {
      const reason = reasons[res.tapIndex] ?? reasons[reasons.length - 1];
      uni.showModal({
        title: locale.t('campusMerchant.rejectTitle'),
        content: locale.t('campusMerchant.rejectBody').replace('{code}', o.code),
        confirmText: locale.t('campusMerchant.rejectConfirm'),
        success: async (r: any) => {
          if (!r.confirm) return;
          actingId.value = o.id;
          try {
            await campusMerchantRejectOrder(o.id, reason);
            uni.showToast({ title: locale.t('campusMerchant.rejectDone'), icon: 'none' });
            await refresh();
          } catch (err: any) {
            uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
          } finally {
            actingId.value = '';
          }
        },
      });
    },
  });
}

function providerLabel(provider: string | null): string {
  if (provider === 'dada') return locale.t('campusMerchant.providerDada');
  if (provider === 'meituan') return locale.t('campusMerchant.providerMeituan');
  return '';
}

async function pushExternal(o: MerchantBoardOrder, provider: 'dada' | 'meituan') {
  actingId.value = o.id;
  try {
    await campusMerchantDispatchExternal(o.id, provider);
    uni.showToast({ title: locale.t('campusMerchant.pushOk'), icon: 'success' });
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
  }
}

async function cancelExternal(o: MerchantBoardOrder) {
  actingId.value = o.id;
  try {
    await campusMerchantCancelExternal(o.id);
    uni.showToast({ title: locale.t('campusMerchant.cancelOk'), icon: 'none' });
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
  }
}

async function acceptOwned(o: MerchantBoardOrder) {
  actingId.value = o.id;
  try {
    await campusMerchantAcceptOwned(o.id);
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
  }
}

async function markOwnedArrived(o: MerchantBoardOrder) {
  actingId.value = o.id;
  try {
    await campusMerchantMarkOwnedArrived(o.id);
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
  }
}

async function markHandoverArrived(o: MerchantBoardOrder) {
  actingId.value = o.id;
  try {
    await campusMerchantMarkHandoverArrived(o.id);
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
  }
}

onMounted(() => {
  refresh(true);
  timer = setInterval(() => refresh(), 10_000);
  // 断连后每分钟自动重探（商家开电脑/启动 C-Lodop 服务即恢复；云通道不探）
  reconnectTimer = setInterval(() => {
    if (isLocal.value && lodopReady.value === 'fail') void probePrinter();
  }, 60_000);
  // H5 自动播放/通知授权均需用户手势：首个 pointerdown 一次性解锁
  if (typeof window !== 'undefined') window.addEventListener('pointerdown', unlockAudio);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  timer = null;
  if (reconnectTimer) clearInterval(reconnectTimer);
  reconnectTimer = null;
  if (typeof window !== 'undefined') window.removeEventListener('pointerdown', unlockAudio);
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .topbar { display: flex; align-items: center; gap: 24rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .stat { flex: 1; display: flex; flex-direction: column; gap: 6rpx;
      .stat-num { font-size: 40rpx; color: $wa-ink; font-weight: 700; }
      .stat-lbl { font-size: 22rpx; color: $wa-muted; }
    }
    .switch { padding: 16rpx 36rpx; border-radius: 999rpx; background: $wa-rule;
      .switch-lbl { font-size: 26rpx; color: $wa-muted; font-weight: 600; }
      &.on { background: $wa-accent; .switch-lbl { color: #fff; } }
    }
  }
  .entrybar { display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius;
    padding: 20rpx 28rpx; margin-bottom: 20rpx;
    .e-lbl { flex: 1; font-size: 26rpx; color: $wa-ink; font-weight: 600; }
    .e-chev { font-size: 32rpx; color: $wa-muted; }
  }
  .clockbar { background: #fff7e6; border: 1.5px solid #fa8c16; border-radius: $wa-radius;
    padding: 14rpx 24rpx; margin-bottom: 20rpx;
    text { font-size: 24rpx; color: #ad4e00; font-weight: 600; }
    &.warn { background: #fff1e6; border-color: #d4380d; text { color: #d4380d; } }
  }
  .closedbar { display: flex; align-items: center; gap: 12rpx; background: #fff1f0;
    border: 1.5px solid #ff4d4f; border-radius: $wa-radius; padding: 18rpx 24rpx; margin-bottom: 20rpx;
    .c-lbl { flex: 1; font-size: 25rpx; color: #cf1322; font-weight: 700; line-height: 1.5; }
    .c-chev { font-size: 32rpx; color: #cf1322; font-weight: 700; }
  }
  .voicebar { display: flex; align-items: center; gap: 16rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 14rpx 24rpx; margin-bottom: 20rpx;
    .v-lbl { flex: 1; font-size: 24rpx; color: $wa-muted; }
    .v-switch { padding: 10rpx 28rpx; border-radius: 999rpx; background: $wa-rule;
      .v-switch-lbl { font-size: 22rpx; color: $wa-muted; font-weight: 600; }
      &.on { background: $wa-accent; .v-switch-lbl { color: #fff; } } }
  }
  .notice { font-size: 24rpx; color: #c47b00; background: #fff7e6; border: 1.5px solid #ffe1a8;
    border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 24rpx; }
  .printbar { display: flex; align-items: center; gap: 16rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 24rpx; border: 1.5px solid transparent;
    .p-status { flex: 1; display: flex; align-items: center; gap: 10rpx; flex-wrap: wrap; }
    .p-dot { width: 14rpx; height: 14rpx; border-radius: 999rpx; background: $wa-accent; flex: none;
      &.wait { background: $wa-muted; } &.bad { background: #ff4d4f; } }
    .p-mode { font-size: 24rpx; color: $wa-accent; font-weight: 600; }
    .p-warn { font-size: 22rpx; color: #c47b00; }
    .p-ops { display: flex; gap: 12rpx; flex: none;
      .p-btn { font-size: 22rpx; line-height: 1; padding: 12rpx 20rpx; border-radius: 999rpx;
        background: $wa-accent; color: #fff; border: none;
        &.ghost { background: transparent; color: $wa-muted; border: 1.5px solid $wa-rule; }
        &[disabled] { opacity: .45; } }
    }
    &.bad { border-color: #ffb4b0; background: #fff5f4;
      .p-mode { color: #d4380d; } }
  }
  .tabs { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 24rpx;
    .tab { flex: 1 1 30%; min-width: 200rpx; display: flex; align-items: center; justify-content: center; gap: 8rpx;
      background: $wa-card; border-radius: $wa-radius; padding: 18rpx 0; font-size: 26rpx;
      color: $wa-muted; border: 1.5px solid transparent;
      &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
      .badge { min-width: 36rpx; height: 36rpx; border-radius: 999rpx; background: #ff4d4f;
        color: #fff; font-size: 20rpx; display: flex; align-items: center; justify-content: center;
        padding: 0 8rpx; box-sizing: border-box; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; gap: 16rpx; }
    .head { .code { font-size: 28rpx; color: $wa-ink; font-weight: 700; flex: 1; }
      .unprinted { font-size: 20rpx; color: #d4380d; border: 1px solid #ffb4b0; background: #fff5f4;
        border-radius: 8rpx; padding: 2rpx 10rpx; }
      .time { font-size: 24rpx; color: $wa-muted; }
      .route { font-size: 20rpx; color: $wa-accent; border: 1px solid $wa-accent;
        border-radius: 8rpx; padding: 2rpx 10rpx; }
    }
    .dest { padding-top: 12rpx; .dest-txt { font-size: 26rpx; color: $wa-ink; flex: 1; }
      .slot { font-size: 22rpx; color: $wa-muted; }
    }
    .ext { padding-top: 10rpx; gap: 12rpx;
      .ext-txt { font-size: 22rpx; color: $wa-accent; }
      .ext-no { font-size: 22rpx; color: $wa-muted; word-break: break-all; }
    }
    .code-row { padding-top: 10rpx;
      .code-label { font-size: 22rpx; color: $wa-muted; }
      .code-val { font-size: 32rpx; font-weight: 700; letter-spacing: 4rpx; color: $wa-accent; }
    }
    .note { margin-top: 10rpx; background: #fff7e6; border-left: 6rpx solid #ff9800; border-radius: 8rpx; padding: 10rpx 16rpx;
      .note-txt { font-size: 24rpx; color: #b25f00; word-break: break-all; }
    }
    .lines { border-top: 1rpx solid $wa-rule; margin-top: 16rpx; padding-top: 8rpx;
      .line { display: flex; padding: 8rpx 0;
        .l-name { flex: 1; font-size: 26rpx; color: $wa-ink; }
        .l-qty { font-size: 26rpx; color: $wa-muted; }
      }
    }
    .foot { padding-top: 16rpx;
      .rider { flex: 1; font-size: 24rpx; color: $wa-muted; }
      .total { font-size: 30rpx; color: $wa-ink; font-weight: 700; margin-right: 8rpx; }
      .act { background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius;
        padding: 0 32rpx; line-height: 64rpx; }
      .act.ghost { background: transparent; border: 1.5px solid $wa-accent; color: $wa-accent;
        padding: 0 20rpx; }
      // 拒单为不可逆操作：危险色 + 置于按钮链末尾，降低误触
      .act.reject { border-color: #ff4d4f; color: #d4380d; }
    }
  }
}
</style>
