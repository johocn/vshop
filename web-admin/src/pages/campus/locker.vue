<template>
  <view class="page">
    <view class="tabs">
      <view
        v-for="t in TABS" :key="t.key"
        class="tab" :class="{ on: tab === t.key }" @tap="tab = t.key"
      >{{ $t(t.label) }}</view>
    </view>

    <!-- ===== 取餐柜站点 ===== -->
    <block v-if="tab === 'stations'">
      <view v-if="canConfig" class="card form">
        <view class="row head">
          <text class="form-title">{{ $t('campusLocker.stationTitle') }}</text>
          <text class="form-hint inline">{{ $t('campusLocker.stationHint') }}</text>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusLocker.name') }}</text>
          <input v-model="draft.name" maxlength="64" :placeholder="$t('campusLocker.namePh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusLocker.location') }}</text>
          <input v-model="draft.location" maxlength="255" :placeholder="$t('campusLocker.locationPh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusLocker.provider') }}</text>
          <view class="seg">
            <view
              v-for="p in LOCKER_PROVIDERS" :key="p.code"
              class="seg-item" :class="{ on: draft.provider === p.code }" @tap="draft.provider = p.code"
            >{{ $t(p.label) }}</view>
          </view>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusLocker.cells') }}</text>
          <input v-model="draft.totalCells" type="number" :placeholder="$t('campusLocker.totalPh')" />
          <text class="unit">{{ $t('campusLocker.cellsTotal') }}</text>
          <input v-model="draft.availableCells" type="number" :placeholder="$t('campusLocker.availPh')" />
          <text class="unit">{{ $t('campusLocker.cellsAvail') }}</text>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusLocker.openHours') }}</text>
          <input v-model="draft.openHours" maxlength="32" :placeholder="$t('campusLocker.openHoursPh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusLocker.guide') }}</text>
          <input v-model="draft.pickupGuide" maxlength="500" :placeholder="$t('campusLocker.guidePh')" />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusLocker.sort') }}</text>
          <input v-model="draft.sort" type="number" :placeholder="$t('campusLocker.sortPh')" />
        </view>
        <button class="primary" :disabled="creating" @tap="submitCreate">
          {{ creating ? $t('campusLocker.submitting') : $t('campusLocker.createBtn') }}
        </button>
      </view>

      <view v-if="loading && !rows.length" class="hint">{{ $t('campusLocker.loading') }}</view>
      <view v-else-if="!rows.length" class="hint">{{ $t('campusLocker.empty') }}</view>
      <view v-for="s in rows" :key="s.id" class="card">
        <view class="row head">
          <text class="name">{{ s.name }}</text>
          <text class="pill" :class="s.enabled ? 'approved' : 'closed'">
            {{ s.enabled ? $t('campusLocker.on') : $t('campusLocker.off') }}
          </text>
        </view>
        <view class="meta">
          <text class="m tag">{{ s.providerName }}</text>
          <text class="m">{{ s.location }}</text>
          <text class="m">{{ $t('campusLocker.cellsMeta').replace('{a}', String(s.availableCells)).replace('{t}', String(s.totalCells)) }}</text>
          <text v-if="s.openHours" class="m">{{ s.openHours }}</text>
          <text class="m">{{ $t('campusLocker.sortMeta').replace('{n}', String(s.sort)) }}</text>
        </view>
        <text v-if="s.pickupGuide" class="content">{{ $t('campusLocker.guide') }}：{{ s.pickupGuide }}</text>
        <view v-if="canConfig" class="row foot">
          <text class="time">{{ fullTime(s.createdAt) }}</text>
          <button class="act ghost" :disabled="acting === s.id" @tap="openEdit(s)">{{ $t('campusLocker.edit') }}</button>
          <button class="act ghost" :disabled="acting === s.id" @tap="toggleStation(s)">
            {{ s.enabled ? $t('campusLocker.disableBtn') : $t('campusLocker.enableBtn') }}
          </button>
          <button class="act ghost danger" :disabled="acting === s.id" @tap="removeStation(s)">{{ $t('campusLocker.deleteBtn') }}</button>
        </view>
      </view>
    </block>

    <!-- ===== 无人配送通道 ===== -->
    <block v-if="tab === 'channel'">
      <view v-if="channelLoading && !channel" class="hint">{{ $t('campusLocker.loading') }}</view>
      <view v-else-if="channel" class="card form">
        <view class="row head">
          <text class="form-title">{{ $t('campusLocker.channelTitle') }}</text>
          <text class="pill" :class="channel.enabled ? 'approved' : 'closed'">
            {{ channel.enabled ? $t('campusLocker.on') : $t('campusLocker.off') }}
          </text>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusLocker.channelEnable') }}</text>
          <text class="m">{{ $t('campusLocker.channelEnableHint') }}</text>
          <switch :checked="form.enabled" :disabled="!canConfig" @change="onEnableChange" />
        </view>
        <view class="cell col">
          <text class="lbl">{{ $t('campusLocker.provider') }}</text>
          <view class="chips">
            <view
              v-for="p in channel.providers" :key="p.code"
              class="chip" :class="{ on: form.provider === p.code, disabled: !canConfig }"
              @tap="canConfig && (form.provider = p.code)"
            >{{ p.name }}</view>
          </view>
        </view>
        <view v-if="needsEndpoint" class="cell">
          <text class="lbl">{{ $t('campusLocker.endpoint') }}</text>
          <input v-model="form.endpoint" :disabled="!canConfig" :placeholder="$t('campusLocker.endpointPh')" />
        </view>
        <view v-if="needsKey" class="cell">
          <text class="lbl">{{ $t('campusLocker.key') }}</text>
          <input
            v-model="form.key" :disabled="!canConfig"
            :placeholder="channel.keyConfigured ? $t('campusLocker.keySaved') : $t('campusLocker.keyPh')"
          />
        </view>
        <text class="form-hint">{{ $t('campusLocker.channelHint') }}</text>
        <button v-if="canConfig" class="primary" :disabled="saving" @tap="saveChannel">
          {{ saving ? $t('campusLocker.submitting') : $t('campusLocker.saveBtn') }}
        </button>
      </view>
    </block>

    <!-- 编辑站点弹框 -->
    <view v-if="editTarget" class="mask" @tap="editTarget = null">
      <view class="modal" @tap.stop>
        <text class="modal-title">{{ $t('campusLocker.editTitle') }}</text>
        <text class="modal-sub">{{ editTarget.name }}</text>
        <view class="modal-cell">
          <text class="lbl">{{ $t('campusLocker.name') }}</text>
          <input v-model="editForm.name" maxlength="64" />
        </view>
        <view class="modal-cell">
          <text class="lbl">{{ $t('campusLocker.location') }}</text>
          <input v-model="editForm.location" maxlength="255" />
        </view>
        <view class="modal-cell">
          <text class="lbl">{{ $t('campusLocker.cells') }}</text>
          <input v-model="editForm.totalCells" type="number" />
          <input v-model="editForm.availableCells" type="number" />
        </view>
        <view class="modal-cell">
          <text class="lbl">{{ $t('campusLocker.openHours') }}</text>
          <input v-model="editForm.openHours" maxlength="32" />
        </view>
        <view class="modal-cell">
          <text class="lbl">{{ $t('campusLocker.guide') }}</text>
          <input v-model="editForm.pickupGuide" maxlength="500" />
        </view>
        <view class="row modal-actions">
          <button class="act ghost" @tap="editTarget = null">{{ $t('campusLocker.cancel') }}</button>
          <button class="act" :disabled="acting === editTarget.id" @tap="submitEdit">
            {{ acting === editTarget.id ? $t('campusLocker.submitting') : $t('campusLocker.saveStation') }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
// P2-4 智能取餐柜 + 无人配送（接口占位）：平台维护柜机站点与通道配置，商家只读。
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  campusCreateLockerStation,
  campusDeleteLockerStation,
  campusLockerStations,
  campusUnmannedChannel,
  campusUpdateLockerStation,
  campusUpdateUnmannedChannel,
  type CampusLockerStationRow,
  type CampusUnmannedChannel,
} from '../../apis/campus';
import { graphQlErrorMsg } from '../../apis/client';
import { useAuthStore } from '../../stores/authStore';
import { useLocaleStore } from '../../stores/localeStore';

type TabKey = 'stations' | 'channel';

const TABS = [
  { key: 'stations' as TabKey, label: 'campusLocker.tabStations' },
  { key: 'channel' as TabKey, label: 'campusLocker.tabChannel' },
];

/** 取餐柜服务商：self 自建 + 与后端 unmanned-delivery.ts 对齐的服务商编码 */
const LOCKER_PROVIDERS = [
  { code: 'self', label: 'campusLocker.providerSelf' },
  { code: 'mock', label: 'campusLocker.providerMock' },
  { code: 'meituan', label: 'campusLocker.providerMeituan' },
  { code: 'xinshiji', label: 'campusLocker.providerXinshiji' },
];

const auth = useAuthStore();
const locale = useLocaleStore();

const canConfig = computed(() => auth.hasPermission('CampusConfig'));
const canMerchant = computed(() => auth.hasPermission('CampusMerchant'));
const tab = ref<TabKey>('stations');

function toast(title: string, ok = false): void {
  uni.showToast({ title, icon: ok ? 'success' : 'none' });
}

function fullTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ===== 站点列表 =====
const rows = ref<CampusLockerStationRow[]>([]);
const loading = ref(false);
const acting = ref('');

const draft = ref({
  name: '',
  location: '',
  provider: 'self',
  totalCells: '',
  availableCells: '',
  openHours: '',
  pickupGuide: '',
  sort: '0',
});
const creating = ref(false);

async function loadStations(): Promise<void> {
  loading.value = true;
  try {
    rows.value = await campusLockerStations();
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusLocker.loadFailed')));
  } finally {
    loading.value = false;
  }
}

function intOrNull(v: string): number | undefined {
  const raw = String(v ?? '').trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function submitCreate(): Promise<void> {
  if (creating.value) return;
  const name = draft.value.name.trim();
  const location = draft.value.location.trim();
  if (!name || !location) {
    toast(locale.t('campusLocker.needNameLocation'));
    return;
  }
  creating.value = true;
  try {
    const row = await campusCreateLockerStation({
      name,
      location,
      provider: draft.value.provider,
      totalCells: intOrNull(draft.value.totalCells) ?? 0,
      availableCells: intOrNull(draft.value.availableCells) ?? 0,
      openHours: draft.value.openHours.trim() || null,
      pickupGuide: draft.value.pickupGuide.trim() || null,
      sort: intOrNull(draft.value.sort) ?? 0,
    });
    rows.value = [...rows.value, row];
    draft.value = {
      name: '', location: '', provider: draft.value.provider,
      totalCells: '', availableCells: '', openHours: '', pickupGuide: '', sort: '0',
    };
    toast(locale.t('campusLocker.created'), true);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusLocker.opFailed')));
  } finally {
    creating.value = false;
  }
}

const editTarget = ref<CampusLockerStationRow | null>(null);
const editForm = ref({ name: '', location: '', totalCells: '', availableCells: '', openHours: '', pickupGuide: '' });

function openEdit(s: CampusLockerStationRow): void {
  editTarget.value = s;
  editForm.value = {
    name: s.name,
    location: s.location,
    totalCells: String(s.totalCells),
    availableCells: String(s.availableCells),
    openHours: s.openHours ?? '',
    pickupGuide: s.pickupGuide ?? '',
  };
}

async function submitEdit(): Promise<void> {
  const s = editTarget.value;
  if (!s || acting.value) return;
  if (!editForm.value.name.trim() || !editForm.value.location.trim()) {
    toast(locale.t('campusLocker.needNameLocation'));
    return;
  }
  acting.value = s.id;
  try {
    const row = await campusUpdateLockerStation(s.id, {
      name: editForm.value.name.trim(),
      location: editForm.value.location.trim(),
      totalCells: intOrNull(editForm.value.totalCells) ?? 0,
      availableCells: intOrNull(editForm.value.availableCells) ?? 0,
      openHours: editForm.value.openHours.trim() || null,
      pickupGuide: editForm.value.pickupGuide.trim() || null,
    });
    replaceRow(row);
    editTarget.value = null;
    toast(locale.t('campusLocker.saved'), true);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusLocker.opFailed')));
  } finally {
    acting.value = '';
  }
}

function replaceRow(row: CampusLockerStationRow): void {
  const i = rows.value.findIndex((x) => x.id === row.id);
  if (i >= 0) rows.value[i] = row;
}

async function toggleStation(s: CampusLockerStationRow): Promise<void> {
  if (acting.value) return;
  acting.value = s.id;
  try {
    replaceRow(await campusUpdateLockerStation(s.id, { enabled: !s.enabled }));
    toast(locale.t('campusLocker.saved'), true);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusLocker.opFailed')));
  } finally {
    acting.value = '';
  }
}

async function removeStation(s: CampusLockerStationRow): Promise<void> {
  if (acting.value) return;
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('campusLocker.deleteTitle'),
      content: locale.t('campusLocker.deleteConfirm').replace('{name}', s.name),
      confirmText: locale.t('campusLocker.deleteBtn'),
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  acting.value = s.id;
  try {
    await campusDeleteLockerStation(s.id);
    rows.value = rows.value.filter((x) => x.id !== s.id);
    toast(locale.t('campusLocker.deleted'), true);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusLocker.opFailed')));
  } finally {
    acting.value = '';
  }
}

// ===== 无人配送通道 =====
const channel = ref<CampusUnmannedChannel | null>(null);
const channelLoading = ref(false);
const saving = ref(false);
const form = ref({ enabled: false, provider: 'mock', endpoint: '', key: '' });

const needsEndpoint = computed(() => {
  const p = channel.value?.providers.find((x) => x.code === form.value.provider);
  return !!p?.needsEndpoint;
});
const needsKey = computed(() => {
  const p = channel.value?.providers.find((x) => x.code === form.value.provider);
  return !!p?.needsKey;
});

async function loadChannel(): Promise<void> {
  channelLoading.value = true;
  try {
    const ch = await campusUnmannedChannel();
    channel.value = ch;
    form.value = { enabled: ch.enabled, provider: ch.provider, endpoint: ch.endpoint ?? '', key: '' };
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusLocker.loadFailed')));
  } finally {
    channelLoading.value = false;
  }
}

function onEnableChange(e: any): void {
  form.value.enabled = !!e?.detail?.value;
}

async function saveChannel(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  try {
    const payload: any = {
      enabled: form.value.enabled,
      provider: form.value.provider,
    };
    if (needsEndpoint.value) payload.endpoint = form.value.endpoint.trim();
    if (needsKey.value && form.value.key.trim()) payload.key = form.value.key.trim();
    channel.value = await campusUpdateUnmannedChannel(payload);
    form.value.key = '';
    toast(locale.t('campusLocker.saved'), true);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusLocker.opFailed')));
  } finally {
    saving.value = false;
  }
}

// ===== 初始化（access 就绪后按权限加载） =====
let guardTimer: ReturnType<typeof setTimeout> | null = null;

async function waitAccess(): Promise<void> {
  let tries = 0;
  while (!auth.access && auth.token && tries < 20) {
    await new Promise((r) => setTimeout(r, 300));
    tries += 1;
  }
}

onMounted(async () => {
  await waitAccess();
  if (!canConfig.value && !canMerchant.value) {
    uni.showToast({ title: locale.t('common.noPermission'), icon: 'none' });
    guardTimer = setTimeout(() => uni.navigateBack(), 800);
    return;
  }
  await Promise.all([loadStations(), loadChannel()]);
});

onUnmounted(() => {
  if (guardTimer) clearTimeout(guardTimer);
  guardTimer = null;
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx; padding-bottom: 80rpx;
  .tabs { display: flex; gap: 12rpx; margin-bottom: 24rpx;
    .tab { flex: 1; text-align: center; background: $wa-card; border-radius: $wa-radius;
      padding: 18rpx 0; font-size: 26rpx; color: $wa-muted; border: 1.5px solid transparent;
      &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; } } }
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; gap: 16rpx; }
    .head { .name { flex: 1; font-size: 28rpx; color: $wa-ink; font-weight: 700; } }
    .pill { font-size: 20rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
      color: $wa-muted; border: 1px solid $wa-rule;
      &.approved { color: $wa-success; border-color: $wa-success; }
      &.closed { color: $wa-muted; border-color: $wa-rule; } }
    .meta { display: flex; flex-wrap: wrap; gap: 16rpx; padding-top: 12rpx;
      .m { font-size: 22rpx; color: $wa-muted; }
      .tag { color: $wa-accent; border: 1px solid $wa-accent; border-radius: 6rpx; padding: 0 8rpx; } }
    .content { display: block; font-size: 24rpx; color: $wa-ink; padding-top: 12rpx; word-break: break-all; }
    .foot { padding-top: 16rpx; .time { flex: 1; font-size: 20rpx; color: $wa-muted; }
      .act { background: $wa-accent; color: #fff; font-size: 24rpx; border-radius: $wa-radius;
        padding: 0 20rpx; line-height: 58rpx; margin-left: 10rpx; }
      .act.ghost { background: transparent; border: 1.5px solid $wa-rule; color: $wa-muted; }
      .act.ghost.danger { border-color: $wa-danger; color: $wa-danger; } }
    &.form { border: 1.5px solid $wa-accent; }
    .form-title { display: block; font-size: 28rpx; color: $wa-ink; font-weight: 600; }
    .form-hint { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; }
    .form-hint.inline { flex: 1; text-align: right; margin-top: 0; }
    .cell { display: flex; align-items: center; gap: 10rpx; padding: 20rpx 0; border-bottom: 1rpx solid $wa-rule;
      &.col { flex-direction: column; align-items: stretch; gap: 14rpx; }
      .lbl { width: 170rpx; font-size: 26rpx; color: $wa-ink; flex-shrink: 0; }
      input { flex: 1; font-size: 26rpx; }
      .m { flex: 1; font-size: 22rpx; color: $wa-muted; }
      .unit { font-size: 22rpx; color: $wa-muted; }
      .seg { flex: 1; display: flex; flex-wrap: wrap; gap: 12rpx;
        .seg-item { flex: 1 0 45%; text-align: center; padding: 12rpx 0; border-radius: $wa-radius;
          background: $wa-bg; font-size: 24rpx; color: $wa-muted;
          &.on { background: $wa-accent; color: #fff; font-weight: 600; } } }
      .chips { display: flex; flex-wrap: wrap; gap: 12rpx;
        .chip { padding: 12rpx 26rpx; border-radius: 999rpx; background: $wa-bg;
          border: 1.5px solid $wa-rule; font-size: 24rpx; color: $wa-muted;
          &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
          &.disabled { opacity: .6; } } } }
    .primary { margin-top: 24rpx; background: $wa-accent; color: #fff; font-size: 28rpx;
      border-radius: $wa-radius; } }
  .mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, .45);
    display: flex; align-items: center; justify-content: center; padding: 48rpx; z-index: 99;
    .modal { width: 100%; background: $wa-card; border-radius: $wa-radius; padding: 32rpx;
      .modal-title { display: block; font-size: 30rpx; color: $wa-ink; font-weight: 600; }
      .modal-sub { display: block; font-size: 24rpx; color: $wa-muted; padding: 10rpx 0 16rpx; }
      .modal-cell { display: flex; align-items: center; gap: 12rpx; padding: 14rpx 0; border-bottom: 1rpx solid $wa-rule;
        .lbl { width: 170rpx; font-size: 24rpx; color: $wa-ink; flex-shrink: 0; }
        input { flex: 1; font-size: 24rpx; } }
      .modal-actions { display: flex; margin-top: 24rpx; justify-content: flex-end;
        .act { background: $wa-accent; color: #fff; font-size: 26rpx; border-radius: $wa-radius;
          padding: 0 32rpx; line-height: 64rpx; margin: 0 0 0 16rpx; }
        .act.ghost { background: transparent; border: 1.5px solid $wa-rule; color: $wa-muted; } } } }
}
</style>
