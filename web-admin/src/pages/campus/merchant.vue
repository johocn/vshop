<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusMerchant.loading') }}</view>
    <template v-else>
      <view class="topbar">
        <view class="stat" @tap="goCompleted">
          <text class="stat-num">{{ board.completedToday }}</text>
          <text class="stat-lbl">{{ $t('campusMerchant.completedToday') }}</text>
        </view>
        <view class="stat" @tap="goCompleted">
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
      <!-- 顾客催单提醒（§78）：顾客点了「催一催」但商家还没确认，点一下直达有催单的栏 -->
      <view v-if="board.urgedCount > 0" class="urgebar" @tap="goUrged">
        <text class="u-lbl">{{ $t('campusMerchant.urgeBar').replace('{n}', String(board.urgedCount)) }}</text>
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

      <!-- 备餐汇总（§79）：今日各商品待做/已做份数，按份备料并一键复制清单 -->
      <view class="entrybar" @tap="openPrep">
        <text class="e-lbl">{{ $t('campusMerchant.prepEntry') }}</text>
        <text class="e-chev">›</text>
      </view>
      <!-- 营业日报（§80）：单日 KPI + 时段分布 + 商品 Top5 + 对比昨日/近 7 日均值 -->
      <view class="entrybar" @tap="goDailyReport">
        <text class="e-lbl">{{ $t('campusMerchant.dailyReportEntry') }}</text>
        <text class="e-chev">›</text>
      </view>
      <!-- 售后申请（§81）：顾客 C 端提交的退款申请，商家同意即退款到账 / 驳回填理由 -->
      <view class="entrybar" @tap="goAfterSales">
        <text class="e-lbl">{{ $t('campusMerchant.afterSalesEntry') }}</text>
        <text class="e-chev">›</text>
      </view>
      <!-- 退款记录台账（§77）：区间退款明细 + 汇总，与对账页退款同口径 -->
      <view class="entrybar" @tap="goRefundRecords">
        <text class="e-lbl">{{ $t('campusMerchant.refundRecordsEntry') }}</text>
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

      <!-- 已送达可退款（§77）：今日完成的订单直接在工作台发起退款，与对账页共用面板与 mutation -->
      <view v-if="refundableDone.length" class="refund-box">
        <view class="rb-head" @tap="goCompleted">
          <text class="rb-title">{{ $t('campusMerchant.recentDoneTitle') }}</text>
          <text class="rb-more">{{ $t('campusMerchant.recentDoneMore') }} ›</text>
        </view>
        <view v-for="o in refundableDone" :key="o.id" class="rb-row">
          <view class="rb-main">
            <text class="rb-code">{{ o.code }}</text>
            <text class="rb-place">{{ o.zone }} {{ o.building }}</text>
          </view>
          <button class="rb-btn" @tap="openRefund(o)">
            {{ $t('campusMerchant.recentDoneRefund') }} · ¥{{ fenToYuanFixed(o.refundable) }}
          </button>
        </view>
      </view>

      <view class="tabs">
        <view
          v-for="t in TABS" :key="t.key"
          class="tab" :class="{ on: tab === t.key }" @tap="switchTab(t.key)"
        >
          <text>{{ $t(t.label) }}</text>
          <text v-if="tab === t.key && isPickable(t.key) && picked.length" class="pick-badge">{{ picked.length }}</text>
          <text v-else-if="listOf(t.key).length" class="badge">{{ listOf(t.key).length }}</text>
        </view>
      </view>

      <!-- 订单检索/筛选（§74）：单号（可后 4 位）/楼栋/手机尾号/备注 + 区域 chips + 按楼栋分组拣单 -->
      <view class="searchbar">
        <input v-model="kw" class="s-input" :placeholder="$t('campusMerchant.searchPlaceholder')" />
        <text v-if="kw" class="s-clear" @tap="clearFilters">✕</text>
      </view>
      <view class="filters">
        <view class="f-chip" :class="{ on: !activeZone }" @tap="setZone('')">
          <text>{{ $t('campusMerchant.searchZoneAll') }}</text>
        </view>
        <view v-for="z in zones" :key="z" class="f-chip" :class="{ on: activeZone === z }" @tap="setZone(z)">
          <text>{{ z }}</text>
        </view>
        <view class="f-group" :class="{ on: groupByBuilding }" @tap="toggleGroup">
          <text class="g-box" :class="{ on: groupByBuilding }">{{ groupByBuilding ? '✓' : '' }}</text>
          <text class="g-lbl">{{ $t('campusMerchant.groupByBuilding') }}</text>
        </view>
      </view>
      <view v-if="filterActive" class="countbar">
        <text class="c-txt">{{ searchCountText }}</text>
        <text class="c-clear" @tap="clearFilters">{{ $t('campusMerchant.searchClear') }}</text>
      </view>

      <!-- 批量操作条（§73）：待接单/备餐中可多选，一次接单或出餐，失败单跳过并回报 -->
      <view v-if="pickableTab && shownList.length" class="batchbar">
        <view class="b-all" @tap="togglePickAll">
          <text class="b-box" :class="{ on: allPicked }">{{ allPicked ? '✓' : '' }}</text>
          <text class="b-lbl">{{ $t('campusMerchant.batchSelectAll') }}</text>
        </view>
        <text class="b-count">{{ $t('campusMerchant.batchPicked').replace('{n}', String(picked.length)) }}</text>
        <button class="b-act" :disabled="batchBusy || !picked.length" @tap="runBatch(tab === 'pending' ? 'accept' : 'cook')">
          {{ batchBusy ? $t('campusMerchant.batchBusy') : (tab === 'pending' ? $t('campusMerchant.batchAccept') : $t('campusMerchant.batchCookingDone')) }}
        </button>
      </view>

      <!-- 检索无结果专属空态（§74）：与「本栏暂无订单」区分，避免商家误以为没单 -->
      <view v-if="filterActive && !shownList.length" class="hint empty">
        <text>{{ $t('campusMerchant.searchEmpty') }}</text>
        <button class="empty-act" @tap="clearFilters">{{ $t('campusMerchant.searchClear') }}</button>
      </view>
      <view v-else-if="!listOf(tab).length" class="hint">{{ $t('campusMerchant.emptyTab') }}</view>
      <view v-for="g in groups" :key="g.key">
        <!-- 分组组头（§74）：楼栋 + 单数 + 最早等待分钟，便于按楼栋集中拣单 -->
        <view v-if="groupByBuilding && g.label" class="group-head">
          <text class="gh-name">{{ g.label }}</text>
          <text class="gh-num">{{ $t('campusMerchant.groupOrders').replace('{n}', String(g.orders.length)) }}</text>
          <text v-if="g.waitMin != null" class="gh-wait">{{ $t('campusMerchant.groupEarliest').replace('{n}', String(g.waitMin)) }}</text>
        </view>
        <view v-for="o in g.orders" :key="o.id" class="card" :class="{ selected: isPicked(o) }">
          <view class="row head">
            <view v-if="pickableTab" class="pick" :class="{ on: isPicked(o) }" @tap.stop="togglePick(o)">
              <text v-if="isPicked(o)">✓</text>
            </view>
            <text class="code">{{ o.code }}</text>
            <text v-if="isUnprinted(o)" class="unprinted">{{ $t('campusMerchant.printUnprinted') }}</text>
            <text class="time">{{ hhmm(o.createdAt) }}</text>
            <text v-if="o.route" class="route">{{ o.route }}</text>
          </view>
          <!-- 顾客催单（§78）：商家确认「已知晓」后解除；顾客再次催单会重新出现 -->
          <view v-if="o.urged" class="urge-row">
            <text class="urge-tag">{{ $t('campusMerchant.urgeTag') }}</text>
            <text v-if="o.urgedAt" class="urge-time">{{ $t('campusMerchant.urgeAt').replace('{t}', hhmm(o.urgedAt)) }}</text>
            <button class="urge-ack" :disabled="actingId === o.id" @tap="ackUrge(o)">{{ $t('campusMerchant.urgeAck') }}</button>
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
          <!-- 顾客手机（§74）：仅脱敏号，点击复制便于与顾客对单；明文不出服务端 -->
          <view v-if="o.customerPhone" class="row phone" @tap="copyPhone(o)">
            <text class="phone-lbl">{{ $t('campusMerchant.customerPhoneLabel') }}：{{ o.customerPhone }}</text>
            <text class="phone-copy">⧉</text>
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
      </view>
      <!-- 备餐汇总面板（§79）：待做份数 + 加料份数，底部一键复制备货清单 -->
      <view v-if="prepOpen" class="prep-mask" @tap="prepOpen = false">
        <view class="prep-sheet" @tap.stop>
          <view class="ps-head">
            <text class="ps-title">{{ $t('campusMerchant.prepTitle') }}</text>
            <text class="ps-close" @tap="prepOpen = false">✕</text>
          </view>
          <text class="ps-hint">{{ $t('campusMerchant.prepHint') }}</text>
          <view v-if="prepBusy && !prepItems.length" class="ps-empty">{{ $t('campusMerchant.loading') }}</view>
          <view v-else-if="!prepItems.length" class="ps-empty">{{ $t('campusMerchant.prepEmpty') }}</view>
          <scroll-view v-else class="ps-list" scroll-y>
            <view v-for="it in prepItems" :key="it.name" class="ps-row">
              <view class="ps-main">
                <text class="ps-name">{{ it.name }}</text>
                <text v-if="it.addons.length" class="ps-addons">{{ addonText(it) }}</text>
              </view>
              <view class="ps-qty">
                <text class="ps-todo">×{{ it.todoQty }}</text>
                <text class="ps-done">{{ $t('campusMerchant.prepDoneTag').replace('{n}', String(it.doneQty)) }}</text>
              </view>
            </view>
          </scroll-view>
          <view class="ps-foot">
            <button class="ps-btn ghost" :disabled="prepBusy" @tap="loadPrep">{{ $t('campusMerchant.prepRefresh') }}</button>
            <button class="ps-btn" :disabled="!prepItems.length" @tap="copyPrep">{{ $t('campusMerchant.prepCopy') }}</button>
          </view>
        </view>
      </view>
      <!-- 退款面板（§77）：与对账页共用组件（同一套校验 + 同一 mutation） -->
      <RefundSheet :open="refundOpen" :target="refundTarget" @close="refundOpen = false" @done="onRefundDone" />
    </template>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  campusMerchantAcceptOrder,
  campusMerchantAcceptOwned,
  campusMerchantAckUrge,
  campusMerchantBatchAcceptOrders,
  campusMerchantBatchCookingDoneOrders,
  campusMerchantBoard,
  campusMerchantCancelExternal,
  campusMerchantCloudPrint,
  campusMerchantCloudPrintTest,
  campusMerchantCompletedOrders,
  campusMerchantCookingDone,
  campusMerchantDispatchExternal,
  campusMerchantMarkHandoverArrived,
  campusMerchantMarkOwnedArrived,
  campusMerchantMarkPrinted,
  campusMerchantPrepSummary,
  campusMerchantRejectOrder,
  campusMerchantSetPaused,
  type CampusMerchantBoard,
  type CampusPrepItem,
  type MerchantBoardOrder,
  type MerchantCompletedOrder,
} from '../../apis/campus';
import RefundSheet from '../../components/campus/RefundSheet.vue';
import { fenToYuan, fenToYuanFixed } from '../../utils/money';
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
  urgedCount: 0,
});
const tab = ref<TabKey>('pending');
// 批量接单/出餐（§73）：只有待接单/备餐中可多选；换栏清空，避免跨栏误操作
const picked = ref<string[]>([]);
const batchBusy = ref(false);
const pickableTab = computed(() => isPickable(tab.value));
const allPicked = computed(() => {
  const list = shownList.value;
  return list.length > 0 && list.every(o => picked.value.includes(o.id));
});
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

/** 点击催单提醒（§78）：跳到第一个含待处理催单的栏 */
function goUrged() {
  for (const t of TABS) {
    if (listOf(t.key).some(o => o.urged)) { switchTab(t.key); return; }
  }
}

/** 商家确认已看到顾客催单（§78）：仅解除本店提醒，骑手端催单标记不受影响 */
async function ackUrge(o: MerchantBoardOrder) {
  if (actingId.value) return;
  actingId.value = o.id;
  try {
    await campusMerchantAckUrge(o.id);
    o.urged = false;
    board.value.urgedCount = Math.max(0, board.value.urgedCount - 1);
    uni.showToast({ title: locale.t('campusMerchant.urgeAcked'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
  }
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

/** 可多选的栏：仅待接单/备餐中支持批量状态机动作 */
function isPickable(key: TabKey): boolean {
  return key === 'pending' || key === 'cooking';
}

function switchTab(key: TabKey) {
  if (tab.value === key) return;
  tab.value = key;
  picked.value = [];
}

function isPicked(o: MerchantBoardOrder): boolean {
  return picked.value.includes(o.id);
}

function togglePick(o: MerchantBoardOrder) {
  const i = picked.value.indexOf(o.id);
  if (i >= 0) picked.value.splice(i, 1);
  else picked.value.push(o.id);
}

function togglePickAll() {
  // 全选只作用于当前可见单（§74）：筛选/分组后的列表，避免把隐藏单一起选中
  const list = shownList.value;
  picked.value = allPicked.value ? [] : list.map(o => o.id);
}

// ===== 订单检索 / 筛选 / 按楼栋分组（§74）=====
// 关键词一次匹配多字段（单号含后 4/8 位、楼栋、区域、备注、脱敏手机号数字段）；
// 区域另设 chips，分组开关只影响展示顺序，均不改变后端查询（看板本就只拉活跃单）。
const kw = ref('');
const activeZone = ref('');
const groupByBuilding = ref(false);
const filterActive = computed(() => !!kw.value.trim() || !!activeZone.value);
/** 区域 chips：取自当前栏全量单（不受自身筛选影响，避免选中后 chip 消失） */
const zones = computed(() => Array.from(new Set(listOf(tab.value).map(o => o.zone).filter(Boolean))));
/** 关键词匹配：脱敏号里的星号段无法匹配（明文不出服务端），只比对可见数字 */
function matchKeyword(o: MerchantBoardOrder): boolean {
  const k = kw.value.trim().toLowerCase();
  if (!k) return true;
  if (o.code.toLowerCase().includes(k)) return true;
  if (o.building && o.building.toLowerCase().includes(k)) return true;
  if (o.zone && o.zone.toLowerCase().includes(k)) return true;
  if (o.note && o.note.toLowerCase().includes(k)) return true;
  const digits = k.replace(/\D/g, '');
  if (digits) {
    const phoneDigits = (o.customerPhone ?? '').replace(/\D/g, '');
    if (phoneDigits && phoneDigits.includes(digits)) return true;
  }
  return false;
}
/** 当前栏可见单：区域 + 关键词过滤后结果（批量全选/计数/空态均以此为准） */
const shownList = computed(() =>
  listOf(tab.value).filter(o => (!activeZone.value || o.zone === activeZone.value) && matchKeyword(o)),
);
const searchCountText = computed(() =>
  locale.t('campusMerchant.searchCount')
    .replace('{n}', String(shownList.value.length))
    .replace('{m}', String(listOf(tab.value).length)),
);
/** 分组渲染：关闭时单组（无组头），开启时按 区域+楼栋 分组、最早等待久的排前 */
const groups = computed(() => {
  const list = shownList.value;
  if (!groupByBuilding.value) {
    return [{ key: '__all', label: '', orders: list, waitMin: null as number | null }];
  }
  const map = new Map<string, MerchantBoardOrder[]>();
  for (const o of list) {
    const key = `${o.zone}|${o.building}`;
    const arr = map.get(key);
    if (arr) arr.push(o);
    else map.set(key, [o]);
  }
  return [...map.entries()]
    .map(([key, orders]) => {
      const oldest = Math.min(...orders.map(o => new Date(o.createdAt).getTime()));
      return {
        key,
        label: `${orders[0].zone} ${orders[0].building}`.trim(),
        orders,
        // 组内最早一单已等待分钟数：数字越大越该先做，故按此降序排
        waitMin: Math.max(0, Math.floor((Date.now() - oldest) / 60_000)),
      };
    })
    .sort((a, b) => b.waitMin - a.waitMin);
});

/** 过滤条件变化即清空勾选：避免勾中后切筛选把隐藏单一起提交 */
watch([kw, activeZone], () => {
  picked.value = [];
});

function setZone(z: string) {
  if (z === activeZone.value) return;
  activeZone.value = z;
}

function toggleGroup() {
  groupByBuilding.value = !groupByBuilding.value;
  picked.value = [];
}

function clearFilters() {
  kw.value = '';
  activeZone.value = '';
  picked.value = [];
}

/** 点击卡片脱敏号复制：便于电话对单（复制的是脱敏文本，不产生明文泄露） */
function copyPhone(o: MerchantBoardOrder) {
  if (!o.customerPhone) return;
  uni.setClipboardData({
    data: o.customerPhone,
    success: () => uni.showToast({ title: locale.t('campusMerchant.copyDone'), icon: 'none' }),
  });
}

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
    // 勾选集合随看板收敛：已流转/已取消的单自动移出批量选择，避免对过期单重复操作
    const alive = new Set(listOf(tab.value).map(o => o.id));
    picked.value = picked.value.filter(id => alive.has(id));
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

/** 今日已完成对账（§75）：明细 + 区间汇总 + 一键复制 */
function goCompleted() {
  uni.navigateTo({ url: '/pages/campus/completed-orders' });
}

/** 退款记录台账（§77）：区间退款明细 + 汇总 */
function goRefundRecords() {
  uni.navigateTo({ url: '/pages/campus/refund-records' });
}

/** 营业日报（§80）：单日 KPI + 时段分布 + 商品 Top5 + 对比昨日/近 7 日均值 */
function goDailyReport() {
  uni.navigateTo({ url: '/pages/campus/daily-report' });
}

/** 售后申请（§81）：顾客提交的退款申请，商家同意/驳回 */
function goAfterSales() {
  uni.navigateTo({ url: '/pages/campus/merchant-after-sales' });
}

/** 已送达可退款（§77）：今日完成订单中仍有可退余额的（最多展示 5 条，详情去对账页） */
const recentDone = ref<MerchantCompletedOrder[]>([]);
const refundableDone = computed(() => recentDone.value.filter(o => o.refundable > 0).slice(0, 5));
const refundOpen = ref(false);
const refundTarget = ref<MerchantCompletedOrder | null>(null);

/** 加载今日已完成订单（只用于工作台退款入口，不参与 10s 看板轮询） */
async function loadRecentDone(): Promise<void> {
  try {
    const res = await campusMerchantCompletedOrders({ take: 20 });
    recentDone.value = res.items;
  } catch {
    // 退款入口加载失败不影响工作台主流程（可进入对账页操作）
  }
}

function openRefund(o: MerchantCompletedOrder): void {
  refundTarget.value = o;
  refundOpen.value = true;
}

/** 退款成功：关闭面板并刷新可退款列表（看板单量/金额由轮询同步） */
async function onRefundDone(): Promise<void> {
  refundOpen.value = false;
  await loadRecentDone();
}

/** 备餐汇总（§79）：今日商品份数聚合，打开面板时才拉取（不参与 10s 看板轮询） */
const prepOpen = ref(false);
const prepBusy = ref(false);
const prepItems = ref<CampusPrepItem[]>([]);

async function loadPrep(): Promise<void> {
  prepBusy.value = true;
  try {
    prepItems.value = await campusMerchantPrepSummary();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    prepBusy.value = false;
  }
}

function openPrep(): void {
  prepOpen.value = true;
  void loadPrep();
}

/** 加料/口味份数文案：加辣 ×3 · 多花生 ×1 */
function addonText(it: CampusPrepItem): string {
  return it.addons.map(a => `${a.name} ×${a.quantity}`).join(' · ');
}

/** 复制备货清单：一行一商品，含待做份数与今日已出参考（便于估算续做量） */
function copyPrep(): void {
  const head = locale.t('campusMerchant.prepCopyTitle');
  const lines = prepItems.value.map(it =>
    `${it.name} ×${it.todoQty}` + (it.doneQty > 0 ? `（已出 ${it.doneQty}）` : ''));
  uni.setClipboardData({
    data: [head, ...lines].join('\n'),
    success: () => uni.showToast({ title: locale.t('campusMerchant.prepCopied'), icon: 'none' }),
  });
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

/** 批量接单/出餐（§73）：二次确认 → 后端逐单执行（失败单跳过）→ 汇总提示 + 刷新 */
async function runBatch(kind: 'accept' | 'cook') {
  const ids = [...picked.value];
  if (!ids.length || batchBusy.value) return;
  const isAccept = kind === 'accept';
  const action = locale.t(isAccept ? 'campusMerchant.batchAcceptAction' : 'campusMerchant.batchCookingAction');
  uni.showModal({
    title: locale.t(isAccept ? 'campusMerchant.batchAcceptConfirmTitle' : 'campusMerchant.batchCookingConfirmTitle'),
    content: locale.t('campusMerchant.batchConfirmBody')
      .replace('{n}', String(ids.length))
      .replace('{action}', action),
    confirmText: locale.t(isAccept ? 'campusMerchant.batchAccept' : 'campusMerchant.batchCookingDone'),
    success: async (r: any) => {
      if (!r.confirm) return;
      batchBusy.value = true;
      const targets = listOf(tab.value).filter(o => ids.includes(o.id));
      try {
        const res = isAccept
          ? await campusMerchantBatchAcceptOrders(ids)
          : await campusMerchantBatchCookingDoneOrders(ids);
        const failIds = new Set((res.failed ?? []).map(f => String(f.orderId)));
        picked.value = [];
        // onAccepted 模式：本地通道逐张出票（云通道由后端接单即出票，无需前端再打）
        if (isAccept && board.value.printMode === 'onAccepted') {
          for (const o of targets) if (!failIds.has(o.id)) enqueuePrint(o);
        }
        await refresh();
        if (res.failed?.length) {
          uni.showToast({
            title: locale.t('campusMerchant.batchPartial')
              .replace('{ok}', String(res.ok))
              .replace('{n}', String(res.failed.length))
              .replace('{msg}', res.failed[0].message),
            icon: 'none',
          });
        } else {
          uni.showToast({ title: locale.t('campusMerchant.batchDone').replace('{n}', String(res.ok)), icon: 'success' });
        }
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
      } finally {
        batchBusy.value = false;
      }
    },
  });
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
  void loadRecentDone();
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
  // 备餐汇总面板（§79）：底部弹出，列表滚动，商品份数 + 加料份数
  .prep-mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.45);
    z-index: 900; display: flex; align-items: flex-end;
    .prep-sheet { width: 100%; max-height: 76vh; background: $wa-card; border-radius: 28rpx 28rpx 0 0;
      padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom)); display: flex; flex-direction: column;
      .ps-head { display: flex; align-items: center; margin-bottom: 12rpx;
        .ps-title { flex: 1; font-size: 30rpx; color: $wa-ink; font-weight: 700; }
        .ps-close { font-size: 32rpx; color: $wa-muted; padding: 0 8rpx; }
      }
      .ps-hint { font-size: 22rpx; color: $wa-muted; line-height: 1.6; margin-bottom: 16rpx; }
      .ps-empty { font-size: 24rpx; color: $wa-muted; text-align: center; padding: 48rpx 0; }
      .ps-list { flex: 1; min-height: 200rpx; max-height: 50vh;
        .ps-row { display: flex; align-items: center; gap: 16rpx; padding: 18rpx 0;
          border-bottom: 1px solid $wa-rule;
          .ps-main { flex: 1; display: flex; flex-direction: column; gap: 6rpx;
            .ps-name { font-size: 26rpx; color: $wa-ink; font-weight: 600; }
            .ps-addons { font-size: 21rpx; color: $wa-muted; }
          }
          .ps-qty { display: flex; flex-direction: column; align-items: flex-end; gap: 4rpx;
            .ps-todo { font-size: 30rpx; color: $wa-ink; font-weight: 700; }
            .ps-done { font-size: 20rpx; color: $wa-muted; }
          }
        }
      }
      .ps-foot { display: flex; gap: 16rpx; margin-top: 20rpx;
        .ps-btn { flex: 1; font-size: 26rpx; border-radius: 999rpx; background: $wa-accent; color: #fff;
          &[disabled] { opacity: 0.5; }
          &.ghost { background: $wa-rule; color: $wa-ink; }
        }
      }
    }
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
  // 顾客催单提醒（§78）：蓝色区分于休业红条，点击直达有催单的栏
  .urgebar { display: flex; align-items: center; gap: 12rpx; background: #e6f4ff;
    border: 1.5px solid #1677ff; border-radius: $wa-radius; padding: 18rpx 24rpx; margin-bottom: 20rpx;
    .u-lbl { flex: 1; font-size: 25rpx; color: #0958d9; font-weight: 700; line-height: 1.5; }
    .c-chev { font-size: 32rpx; color: #0958d9; font-weight: 700; }
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
  .refund-box { background: $wa-card; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 24rpx;
    .rb-head { display: flex; align-items: center; gap: 16rpx; margin-bottom: 12rpx;
      .rb-title { flex: 1; font-size: 24rpx; color: $wa-ink; font-weight: 600; }
      .rb-more { font-size: 22rpx; color: $wa-accent; }
    }
    .rb-row { display: flex; align-items: center; gap: 16rpx; padding: 12rpx 0;
      border-top: 1.5px solid $wa-rule;
      .rb-main { flex: 1; display: flex; flex-direction: column; gap: 4rpx;
        .rb-code { font-size: 26rpx; color: $wa-ink; font-weight: 600; }
        .rb-place { font-size: 22rpx; color: $wa-muted; }
      }
      .rb-btn { margin: 0; flex: none; height: 56rpx; line-height: 56rpx; padding: 0 24rpx;
        background: #fff1f0; color: #d4380d; font-size: 22rpx; border-radius: 999rpx; border: none;
      }
    }
  }
  .tabs { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 24rpx;
    .tab { flex: 1 1 30%; min-width: 200rpx; display: flex; align-items: center; justify-content: center; gap: 8rpx;
      background: $wa-card; border-radius: $wa-radius; padding: 18rpx 0; font-size: 26rpx;
      color: $wa-muted; border: 1.5px solid transparent;
      &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
      .badge { min-width: 36rpx; height: 36rpx; border-radius: 999rpx; background: #ff4d4f;
        color: #fff; font-size: 20rpx; display: flex; align-items: center; justify-content: center;
        padding: 0 8rpx; box-sizing: border-box; }
      // 已选角标（§73）：当前栏勾选数，replace 掉数量红点避免两个角标并排
      .pick-badge { min-width: 36rpx; height: 36rpx; border-radius: 999rpx; background: $wa-accent;
        color: #fff; font-size: 20rpx; display: flex; align-items: center; justify-content: center;
        padding: 0 8rpx; box-sizing: border-box; }
    }
  }
  // 批量操作条（§73）：全选 / 已选 N 单 / 批量接单·批量出餐
  .batchbar { display: flex; align-items: center; gap: 16rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 20rpx;
    .b-all { display: flex; align-items: center; gap: 10rpx;
      .b-box { width: 34rpx; height: 34rpx; border-radius: 8rpx; border: 1.5px solid $wa-rule;
        color: #fff; font-size: 22rpx; line-height: 1; display: flex; align-items: center;
        justify-content: center;
        &.on { background: $wa-accent; border-color: $wa-accent; } }
      .b-lbl { font-size: 24rpx; color: $wa-muted; }
    }
    .b-count { flex: 1; font-size: 24rpx; color: $wa-ink; font-weight: 600; }
    .b-act { background: $wa-accent; color: #fff; font-size: 24rpx; border-radius: 999rpx;
      padding: 0 28rpx; line-height: 56rpx; &[disabled] { opacity: .45; } }
  }
  // 订单检索/筛选/分组（§74）
  .searchbar { display: flex; align-items: center; gap: 12rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 8rpx 20rpx; margin-bottom: 16rpx;
    .s-input { flex: 1; height: 68rpx; font-size: 26rpx; color: $wa-ink; }
    .s-clear { font-size: 26rpx; color: $wa-muted; padding: 0 8rpx; }
  }
  .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx; margin-bottom: 16rpx;
    .f-chip { padding: 8rpx 22rpx; border-radius: 999rpx; background: $wa-card;
      border: 1.5px solid transparent;
      text { font-size: 24rpx; color: $wa-muted; }
      &.on { border-color: $wa-accent; text { color: $wa-accent; font-weight: 600; } }
    }
    .f-group { margin-left: auto; display: flex; align-items: center; gap: 10rpx;
      padding: 8rpx 20rpx; border-radius: 999rpx; background: $wa-card;
      .g-box { width: 30rpx; height: 30rpx; border-radius: 8rpx; border: 1.5px solid $wa-rule;
        color: #fff; font-size: 20rpx; line-height: 1; display: flex; align-items: center;
        justify-content: center;
        &.on { background: $wa-accent; border-color: $wa-accent; } }
      .g-lbl { font-size: 24rpx; color: $wa-muted; }
      &.on .g-lbl { color: $wa-accent; font-weight: 600; }
    }
  }
  .countbar { display: flex; align-items: center; gap: 12rpx; margin-bottom: 16rpx; padding: 0 8rpx;
    .c-txt { flex: 1; font-size: 24rpx; color: $wa-ink; font-weight: 600; }
    .c-clear { font-size: 24rpx; color: $wa-accent; }
  }
  .hint.empty { display: flex; flex-direction: column; align-items: center; gap: 24rpx;
    .empty-act { font-size: 24rpx; color: $wa-accent; background: transparent;
      border: 1.5px solid $wa-accent; border-radius: 999rpx; padding: 0 32rpx; line-height: 56rpx; }
  }
  // 分组组头：楼栋 + 单数 + 最早等待
  .group-head { display: flex; align-items: center; gap: 16rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 14rpx 24rpx; margin-bottom: 12rpx;
    border-left: 6rpx solid $wa-accent;
    .gh-name { flex: 1; font-size: 26rpx; color: $wa-ink; font-weight: 700; }
    .gh-num { font-size: 22rpx; color: $wa-accent; }
    .gh-wait { font-size: 22rpx; color: #c47b00; }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    // 勾选态描边（§73）：inset 描边避免占位导致卡片抖动
    &.selected { box-shadow: inset 0 0 0 1.5px $wa-accent; }
    .row { display: flex; align-items: center; gap: 16rpx; }
    .head { .pick { width: 40rpx; height: 40rpx; border-radius: 10rpx; border: 1.5px solid $wa-rule;
        flex: none; display: flex; align-items: center; justify-content: center;
        text { font-size: 24rpx; color: #fff; line-height: 1; }
        &.on { background: $wa-accent; border-color: $wa-accent; } }
      .code { font-size: 28rpx; color: $wa-ink; font-weight: 700; flex: 1; }
      .unprinted { font-size: 20rpx; color: #d4380d; border: 1px solid #ffb4b0; background: #fff5f4;
        border-radius: 8rpx; padding: 2rpx 10rpx; }
      .time { font-size: 24rpx; color: $wa-muted; }
      .route { font-size: 20rpx; color: $wa-accent; border: 1px solid $wa-accent;
        border-radius: 8rpx; padding: 2rpx 10rpx; }
    }
    // 顾客催单行（§78）：蓝色标签 + 催单时间 + 「已知晓」按钮
    .urge-row { padding-top: 12rpx; display: flex; align-items: center; gap: 12rpx;
      .urge-tag { font-size: 22rpx; color: #fff; background: #1677ff; border-radius: 8rpx;
        padding: 2rpx 12rpx; font-weight: 600; }
      .urge-time { flex: 1; font-size: 22rpx; color: #0958d9; }
      .urge-ack { margin: 0; flex: none; height: 52rpx; line-height: 52rpx; padding: 0 20rpx;
        background: #1677ff; color: #fff; font-size: 22rpx; border-radius: 999rpx; border: none;
        &[disabled] { opacity: .45; } }
    }
    .dest { padding-top: 12rpx; .dest-txt { font-size: 26rpx; color: $wa-ink; flex: 1; }
      .slot { font-size: 22rpx; color: $wa-muted; }
    }
    .ext { padding-top: 10rpx; gap: 12rpx;
      .ext-txt { font-size: 22rpx; color: $wa-accent; }
      .ext-no { font-size: 22rpx; color: $wa-muted; word-break: break-all; }
    }
    // 顾客脱敏手机（§74）：点击复制，弱化展示避免与备注抢眼
    .phone { padding-top: 8rpx; gap: 10rpx;
      .phone-lbl { font-size: 24rpx; color: $wa-muted; letter-spacing: 2rpx; }
      .phone-copy { font-size: 22rpx; color: $wa-accent; }
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
