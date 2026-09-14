<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">房型模板库</text>
        <view class="head-ops">
          <text class="head-btn" @tap="onAdd">＋新建模板</text>
        </view>
      </view>
      <view class="filter-bar">
        <input class="q" v-model="query" placeholder="搜索房型名 / code / 床型 / 标签" />
        <scroll-view class="chips-x" scroll-x :show-scrollbar="false">
          <view class="chips">
            <text v-for="c in catOpts" :key="c.key" class="chip" :class="{ on: category === c.key }" @tap="category = c.key">{{ c.label }}</text>
          </view>
        </scroll-view>
        <view class="chips">
          <text v-for="b in bedOpts" :key="b.key" class="chip" :class="{ on: bed === b.key }" @tap="bed = b.key">{{ b.label }}</text>
        </view>
        <view class="chips">
          <text class="chip" :class="{ on: enabled === 'enabled' }" @tap="enabled = enabled === 'enabled' ? 'all' : 'enabled'">仅看启用</text>
          <text class="chip" :class="{ on: sortField === 'price' && sortDir === 'asc' }" @tap="sortField = 'price'; sortDir = 'asc'">基准价 ↑</text>
          <text class="chip" :class="{ on: sortField === 'price' && sortDir === 'desc' }" @tap="sortField = 'price'; sortDir = 'desc'">基准价 ↓</text>
        </view>
      </view>
      <view class="item" v-for="t in filteredTemplates" :key="t.id" @tap="onEdit(t)">
        <view class="info">
          <text class="name">{{ t.name }} <text class="code">{{ t.code }}</text></text>
          <text class="sub">基准价 ¥{{ (t.basePriceCent / 100).toFixed(0) }} · {{ t.minNights }}-{{ t.maxNights }} 晚 · 排序 {{ t.sortOrder }}</text>
        </view>
        <switch :checked="t.enabled" color="#4f8cff" @change="onToggle(t, $event)" @click.stop />
        <text class="link" @tap.stop="onRemove(t)">删除</text>
      </view>
      <view v-if="!templates.length" class="empty">暂无模板，点击右上角新建</view>
      <view v-else-if="!filteredTemplates.length" class="empty">
        <text class="empty-tip">未找到匹配模板</text>
        <text class="clear-btn" @tap="clearFilters">清除筛选</text>
      </view>
      <view v-if="templates.length" class="count">共 {{ templateCount }} 个模板</view>
    </view>
  </view>

  <!-- 新建/编辑弹层表单 -->
  <view class="mask" v-if="showForm" @tap="showForm = false">
    <view class="pop" @tap.stop>
      <view class="pop-head">
        <text class="pop-title">{{ editingId ? '编辑模板' : '新建模板' }}</text>
        <text class="pop-close" @tap="showForm = false">×</text>
      </view>
      <scroll-view scroll-y class="pop-body">
        <view class="field"><text class="label">名称 <text class="req">*</text></text><input class="input" v-model="form.name" placeholder="豪华套房" /></view>
        <view class="field"><text class="label">标识 code <text class="req">*</text></text><input class="input" v-model="form.code" placeholder="suite" /></view>
        <view class="field"><text class="label">基准价（元/晚）<text class="req">*</text></text><input class="input" v-model="form.basePriceYuan" type="digit" placeholder="888" /></view>
        <view class="field">
          <text class="label">启用</text>
          <switch :checked="form.enabled" color="#4f8cff" @change="form.enabled = $event.detail.value" />
        </view>
        <view class="field"><text class="label">排序 sortOrder</text><input class="input" v-model="form.sortOrder" type="number" placeholder="0" /></view>
        <view class="field"><text class="label">规格 specs JSON</text><textarea class="ta" v-model="form.specsJson" placeholder='{"bedType":"大床","area":40,"capacity":2,"maxCapacity":2,"breakfast":"included","breakfastCount":2}' /></view>
        <view class="field"><text class="label">默认房间 defaultRooms JSON</text><textarea class="ta" v-model="form.defaultRoomsJson" placeholder='[{"no":"801","floor":8,"view":"湖景"}]' /></view>
        <view class="field"><text class="label">日历价格段 JSON</text><textarea class="ta" v-model="form.priceCalendarJson" placeholder='[{"type":"weekday","rate":1.0},{"type":"weekend","rate":1.2}]' /></view>
        <view class="field"><text class="label">连住优惠 JSON</text><textarea class="ta" v-model="form.longStayJson" placeholder='[{"minNights":3,"rate":0.9}]' /></view>
        <view class="field"><text class="label">预订规则 JSON</text><textarea class="ta" v-model="form.ruleJson" placeholder='{"minNights":1,"maxNights":30,"advanceDays":30,"checkInTime":"14:00","checkOutTime":"12:00","cancelPolicy":{"type":"freeUntil","freeUntilHours":24},"depositType":"payAtHotel"}' /></view>
        <view v-if="showForm" class="guide">
          <view class="gl"><text class="glk">常用价格段</text> · 点选插入 priceCalendar</view>
          <view class="chips">
            <text v-for="p in PRICE_SEGMENT_PRESETS" :key="p.label" class="cdot" @tap="applyPresetSegment(p)">{{ p.label }}</text>
          </view>
          <view class="gl"><text class="glk">连住优惠 / 取消政策</text></view>
          <view class="chips">
            <text v-for="p in LONG_STAY_PRESETS" :key="p.label" class="cdot" @tap="applyLongStay(p)">{{ p.label }}</text>
            <text v-for="p in CANCEL_POLICY_PRESETS" :key="p.label" class="cdot" @tap="applyCancelPolicy(p)">{{ p.label }}</text>
          </view>
          <view class="gl"><text class="glk">快捷输入房间</text></view>
          <view class="qr">
            <input class="inp" v-model="roomNo" placeholder="房间号 如802" />
            <input class="inp" v-model="roomFloor" placeholder="楼层 如8" type="number" />
            <input class="inp" v-model="roomView" placeholder="特色景观" />
            <text class="add-btn" @tap="addRoomQuick">＋ 添加</text>
            <text class="badge" v-if="roomCount">已加 {{ roomCount }} 间</text>
          </view>
          <view class="gl"><text class="glk">床型</text></view>
          <view class="chips">
            <text v-for="b in BED_OPTIONS" :key="b.value" class="cdot" @tap="applyBed(b.value)">{{ b.label }}</text>
          </view>
          <view class="gl"><text class="glk">含早 / 押金</text></view>
          <view class="chips">
            <text v-for="o in BREAKFAST_OPTIONS" :key="o.label" class="cdot" @tap="applyBreakfast(o.value)">{{ o.label }}</text>
            <text v-for="o in DEPOSIT_OPTIONS" :key="o.label" class="cdot" @tap="applyDeposit(o.value)">{{ o.label }}</text>
          </view>
        </view>
        <view v-if="err" class="err">{{ err }}</view>
        <button class="btn" :disabled="saving" @tap="submit">{{ saving ? '保存中…' : '保存' }}</button>
      </scroll-view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchRoomTemplates, createRoomTemplate, updateRoomTemplate, deleteRoomTemplate,
  type RoomTemplate,
} from '../../../apis/room-template';
import { graphQlErrorMsg } from '../../../apis/client';
import { filterRoomTemplates, categorize, bedLabel, CATEGORY_MAP, PRICE_SEGMENT_PRESETS, LONG_STAY_PRESETS, CANCEL_POLICY_PRESETS, BED_OPTIONS, BREAKFAST_OPTIONS, DEPOSIT_OPTIONS, appendSegmentToList, appendRoom, overrideSpecsKey, expandDateRange } from '@/utils/room-template-guide';

const templates = ref<RoomTemplate[]>([]);
const showForm = ref(false);
const editingId = ref('');
const saving = ref(false);
const err = ref('');

// ---- 列表检索状态 ----
const query = ref('');
const category = ref('all');
const bed = ref('all');
const enabled = ref('all');
const sortField = ref('sortOrder');
const sortDir = ref('asc');

const catOpts = [{ key: 'all', label: '全部' }, ...CATEGORY_MAP, { key: 'other', label: '其他' }];
const bedOpts = [
  { key: 'all', label: '全部床型' },
  { key: 'king', label: '大床' },
  { key: 'twin', label: '双床' },
  { key: 'triple', label: '三床' },
  { key: 'family', label: '多床' },
];

const filteredTemplates = computed(() => filterRoomTemplates(templates.value, {
  q: query.value, category: category.value, bed: bed.value, enabled: enabled.value,
  sort: sortField.value, order: sortDir.value,
}));
const templateCount = computed(() => filteredTemplates.value.length);

function clearFilters() {
  query.value = '';
  category.value = 'all';
  bed.value = 'all';
  enabled.value = 'all';
  sortField.value = 'sortOrder';
  sortDir.value = 'asc';
}

const DEFAULT_RULE = {
  minNights: 1, maxNights: 30, advanceDays: 30,
  checkInTime: '14:00', checkOutTime: '12:00',
  cancelPolicy: { type: 'freeUntil', freeUntilHours: 24 },
  depositType: 'payAtHotel',
};

const form = ref({
  name: '',
  code: '',
  basePriceYuan: '',
  enabled: true,
  sortOrder: '0',
  specsJson: '',
  defaultRoomsJson: '',
  priceCalendarJson: '',
  longStayJson: '',
  ruleJson: '',
});

// ---- 三合一 JSON 引导条状态 ----
const roomNo = ref('');
const roomFloor = ref('');
const roomView = ref('');
const roomCount = ref(0);

/** JSON 数组字段解析：空/非法 → []（引导条只负责生成合法 JSON，保存校验仍由 submit 把关） */
function parseJsonArr(text: string): any[] {
  if (!text || !text.trim()) return [];
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** JSON 对象字段解析：空/非法 → null */
function parseJsonObj(text: string): Record<string, any> | null {
  if (!text || !text.trim()) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** 覆盖 ruleJson 中的某个键（cancelPolicy / depositType） */
function updateRule(key: string, value: any) {
  const rule = parseJsonObj(form.value.ruleJson) || { ...DEFAULT_RULE };
  rule[key] = value;
  form.value.ruleJson = JSON.stringify(rule, null, 2);
}

/** 点选常用价格段：expandDateRange 展开年份 → appendSegmentToList 并入 priceCalendarJson */
function applyPresetSegment(preset: any) {
  const seg = expandDateRange(preset.value, new Date().getFullYear());
  form.value.priceCalendarJson = appendSegmentToList(parseJsonArr(form.value.priceCalendarJson), seg);
}

/** 连住优惠：按 minNights 去重并入 longStayJson */
function applyLongStay(p: any) {
  form.value.longStayJson = appendSegmentToList(parseJsonArr(form.value.longStayJson), p.value, 'minNights');
}

/** 取消政策：覆盖 ruleJson.cancelPolicy */
function applyCancelPolicy(p: any) {
  updateRule('cancelPolicy', p.value);
}

/** 快捷输入房间：房间号必填，追加进 defaultRoomsJson，之后清空输入并刷新已加数量 */
function addRoomQuick() {
  const no = roomNo.value.trim();
  if (!no) { uni.showToast({ title: '请输入房间号', icon: 'none' }); return; }
  const arr = parseJsonArr(form.value.defaultRoomsJson);
  form.value.defaultRoomsJson = appendRoom(arr, no, Number(roomFloor.value) || null, roomView.value.trim() || '');
  roomNo.value = '';
  roomView.value = '';
  roomCount.value = parseJsonArr(form.value.defaultRoomsJson).length;
}

/** 床型：覆盖 specs.bedType */
function applyBed(bed: string) {
  form.value.specsJson = overrideSpecsKey(parseJsonObj(form.value.specsJson), 'bedType', bed);
}

/** 含早：依次覆盖 specs.breakfast 与 specs.breakfastCount */
function applyBreakfast(o: any) {
  let specs = parseJsonObj(form.value.specsJson) || {};
  specs = JSON.parse(overrideSpecsKey(specs, 'breakfast', o.breakfast, false));
  form.value.specsJson = overrideSpecsKey(specs, 'breakfastCount', o.breakfastCount, false);
}

/** 押金：覆盖 ruleJson.depositType */
function applyDeposit(v: string) {
  updateRule('depositType', v);
}

onLoad(load);
async function load() {
  try {
    templates.value = await fetchRoomTemplates();
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, '加载失败'), icon: 'none' });
  }
}

function onAdd() {
  editingId.value = '';
  err.value = '';
  form.value = {
    name: '', code: '', basePriceYuan: '', enabled: true, sortOrder: '0',
    specsJson: '', defaultRoomsJson: '', priceCalendarJson: '', longStayJson: '',
    ruleJson: JSON.stringify(DEFAULT_RULE, null, 2),
  };
  roomNo.value = '';
  roomFloor.value = '';
  roomView.value = '';
  roomCount.value = 0;
  showForm.value = true;
}

function onEdit(t: RoomTemplate) {
  editingId.value = t.id;
  err.value = '';
  form.value = {
    name: t.name,
    code: t.code,
    basePriceYuan: String(t.basePriceCent / 100),
    enabled: t.enabled,
    sortOrder: String(t.sortOrder ?? 0),
    specsJson: t.specs ? JSON.stringify(t.specs, null, 2) : '',
    defaultRoomsJson: t.defaultRooms ? JSON.stringify(t.defaultRooms, null, 2) : '',
    priceCalendarJson: t.priceCalendar ? JSON.stringify(t.priceCalendar, null, 2) : '',
    longStayJson: t.longStayDiscount ? JSON.stringify(t.longStayDiscount, null, 2) : '',
    ruleJson: JSON.stringify({
      minNights: t.minNights, maxNights: t.maxNights, advanceDays: t.advanceDays,
      checkInTime: t.checkInTime, checkOutTime: t.checkOutTime,
      cancelPolicy: t.cancelPolicy, depositType: t.depositType,
    }, null, 2),
  };
  roomNo.value = '';
  roomFloor.value = '';
  roomView.value = '';
  roomCount.value = parseJsonArr(form.value.defaultRoomsJson).length;
  showForm.value = true;
}

/** 整行模板 → 完整 RoomTemplateInput（SDL 全字段非空，启停/编辑都带全量提交） */
function templateToInput(t: RoomTemplate): Record<string, any> {
  return {
    code: t.code,
    name: t.name,
    enabled: t.enabled,
    sortOrder: t.sortOrder ?? 0,
    coverAssetId: t.coverAssetId ?? null,
    specs: t.specs ?? null,
    defaultRooms: t.defaultRooms ?? null,
    basePriceCent: t.basePriceCent,
    priceCalendar: t.priceCalendar ?? null,
    longStayDiscount: t.longStayDiscount ?? null,
    minNights: t.minNights,
    maxNights: t.maxNights,
    advanceDays: t.advanceDays,
    checkInTime: t.checkInTime,
    checkOutTime: t.checkOutTime,
    cancelPolicy: t.cancelPolicy,
    depositType: t.depositType,
  };
}

/** JSON 字段解析：空串→null；解析失败置 err 并返回失败哨兵 */
function tryParseJson(text: string, label: string): { ok: true; value: any } | { ok: false } {
  const v = text.trim();
  if (!v) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(v) };
  } catch {
    err.value = `${label} 不是合法 JSON`;
    return { ok: false };
  }
}

async function submit() {
  err.value = '';
  const name = form.value.name.trim();
  const code = form.value.code.trim();
  const yuan = Number(form.value.basePriceYuan);
  if (!name) { uni.showToast({ title: '名称必填', icon: 'none' }); return; }
  if (!code) { uni.showToast({ title: '标识 code 必填', icon: 'none' }); return; }
  if (!form.value.basePriceYuan || Number.isNaN(yuan) || yuan < 0) {
    uni.showToast({ title: '基准价必须为非负数字', icon: 'none' }); return;
  }

  const specs = tryParseJson(form.value.specsJson, '规格 specs');
  if (!specs.ok) return;
  const defaultRooms = tryParseJson(form.value.defaultRoomsJson, '默认房间 defaultRooms');
  if (!defaultRooms.ok) return;
  const priceCalendar = tryParseJson(form.value.priceCalendarJson, '日历价格段');
  if (!priceCalendar.ok) return;
  const longStay = tryParseJson(form.value.longStayJson, '连住优惠');
  if (!longStay.ok) return;
  const rule = tryParseJson(form.value.ruleJson, '预订规则');
  if (!rule.ok) return;

  const ruleObj = { ...DEFAULT_RULE, ...(rule.value ?? {}) };
  const input: Record<string, any> = {
    code,
    name,
    enabled: form.value.enabled,
    sortOrder: parseInt(form.value.sortOrder || '0', 10) || 0,
    coverAssetId: null,
    specs: specs.value,
    defaultRooms: defaultRooms.value,
    basePriceCent: Math.round(yuan * 100),
    priceCalendar: priceCalendar.value,
    longStayDiscount: longStay.value,
    minNights: ruleObj.minNights,
    maxNights: ruleObj.maxNights,
    advanceDays: ruleObj.advanceDays,
    checkInTime: ruleObj.checkInTime,
    checkOutTime: ruleObj.checkOutTime,
    cancelPolicy: ruleObj.cancelPolicy,
    depositType: ruleObj.depositType,
  };

  saving.value = true;
  try {
    if (editingId.value) {
      await updateRoomTemplate(editingId.value, input);
    } else {
      await createRoomTemplate(input);
    }
    showForm.value = false;
    uni.showToast({ title: '已保存', icon: 'none' });
    load();
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, '保存失败'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

function onToggle(t: RoomTemplate, e: any) {
  const enabled = e.detail.value as boolean;
  uni.showModal({
    title: enabled ? '启用模板' : '停用模板',
    content: `确定${enabled ? '启用' : '停用'}「${t.name}」？`,
    success: async (r) => {
      if (!r.confirm) return load();
      try {
        await updateRoomTemplate(t.id, { ...templateToInput(t), enabled });
        t.enabled = enabled;
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, '操作失败'), icon: 'none' });
        load();
      }
    },
  });
}

function onRemove(t: RoomTemplate) {
  uni.showModal({
    title: '删除模板',
    content: `确定删除「${t.name}」？已应用该模板的商品不受影响。`,
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteRoomTemplate(t.id);
        uni.showToast({ title: '已删除', icon: 'none' });
        load();
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, '删除失败'), icon: 'none' });
      }
    },
  });
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.head-ops { display: flex; align-items: center; gap: 16rpx; }
.head-btn { flex: 0 0 auto; padding: 8rpx 26rpx; background: $pm-info; color: #fff; border-radius: 999rpx; font-size: 26rpx; }
.filter-bar { margin-bottom: 8rpx; }
.q { box-sizing: border-box; width: 100%; border: 1px solid #eee; border-radius: 12rpx; padding: 14rpx 20rpx; font-size: 26rpx; margin-bottom: 16rpx; }
.chips-x { white-space: nowrap; }
.chips-x .chips { display: inline-flex; flex-wrap: nowrap; }
.chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 12rpx; }
.chip { flex: 0 0 auto; padding: 6rpx 22rpx; border: 1px solid #eee; border-radius: 999rpx; font-size: 24rpx; color: #666; background: #fafafa; }
.chip.on { background: #4f8cff; border-color: #4f8cff; color: #fff; }
.count { text-align: center; color: #999; font-size: 24rpx; padding: 20rpx 0 4rpx; }
.empty-tip { display: block; }
.clear-btn { display: inline-block; margin-top: 16rpx; padding: 8rpx 28rpx; border: 1px solid #4f8cff; color: #4f8cff; border-radius: 999rpx; font-size: 26rpx; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.info { flex: 1; }
.name { display: block; font-size: 28rpx; font-weight: 600; }
.code { font-size: 22rpx; color: #999; font-weight: 400; margin-left: 8rpx; }
.sub { display: block; font-size: 22rpx; color: #999; margin-top: 6rpx; }
.link { color: #e64340; font-size: 26rpx; }
.empty { text-align: center; color: #bbb; padding: 40rpx 0; font-size: 26rpx; }
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 620rpx; max-height: 80vh; background: #fff; border-radius: 20rpx; padding: 32rpx; display: flex; flex-direction: column; }
.pop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
.pop-title { font-size: 32rpx; font-weight: 700; }
.pop-close { font-size: 36rpx; color: #999; line-height: 1; padding: 8rpx; }
.pop-body { max-height: 60vh; }
.field { margin-bottom: 24rpx; }
.req { color: #e64340; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.input { border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 28rpx; }
.ta { width: 100%; box-sizing: border-box; border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 24rpx; height: 160rpx; }
.guide { margin-bottom: 24rpx; padding: 20rpx; border: 1px dashed #d9e4ff; border-radius: 16rpx; background: #f7faff; }
.gl { font-size: 24rpx; color: #666; margin-bottom: 12rpx; }
.glk { color: #4f8cff; font-weight: 600; }
.cdot { flex: 0 0 auto; padding: 6rpx 22rpx; border: 1px solid #d9e4ff; border-radius: 999rpx; font-size: 24rpx; color: #4f8cff; background: #fff; }
.qr { display: flex; flex-wrap: wrap; gap: 12rpx; align-items: center; margin-bottom: 12rpx; }
.inp { flex: 1 1 140rpx; box-sizing: border-box; border: 1px solid #eee; border-radius: 12rpx; padding: 10rpx 16rpx; font-size: 24rpx; background: #fff; }
.add-btn { flex: 0 0 auto; padding: 10rpx 28rpx; background: #4f8cff; color: #fff; border-radius: 999rpx; font-size: 24rpx; }
.badge { flex: 0 0 auto; font-size: 22rpx; color: #4f8cff; background: #e8f1ff; padding: 6rpx 16rpx; border-radius: 999rpx; }
.err { color: #e64340; font-size: 24rpx; margin-bottom: 16rpx; }
.btn { border-radius: 40rpx; font-size: 28rpx; background: #4f8cff; color: #fff; line-height: 2.4; }
.btn[disabled] { opacity: .6; }
</style>
