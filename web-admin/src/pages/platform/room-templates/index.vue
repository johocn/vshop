<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">房型模板库</text>
        <view class="head-ops">
          <text class="head-btn" @tap="onAdd">＋新建模板</text>
        </view>
      </view>
      <view class="item" v-for="t in templates" :key="t.id" @tap="onEdit(t)">
        <view class="info">
          <text class="name">{{ t.name }} <text class="code">{{ t.code }}</text></text>
          <text class="sub">基准价 ¥{{ (t.basePriceCent / 100).toFixed(0) }} · {{ t.minNights }}-{{ t.maxNights }} 晚 · 排序 {{ t.sortOrder }}</text>
        </view>
        <switch :checked="t.enabled" color="#4f8cff" @change="onToggle(t, $event)" @click.stop />
        <text class="link" @tap.stop="onRemove(t)">删除</text>
      </view>
      <view v-if="!templates.length" class="empty">暂无模板，点击右上角新建</view>
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
        <view v-if="err" class="err">{{ err }}</view>
        <button class="btn" :disabled="saving" @tap="submit">{{ saving ? '保存中…' : '保存' }}</button>
      </scroll-view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchRoomTemplates, createRoomTemplate, updateRoomTemplate, deleteRoomTemplate,
  type RoomTemplate,
} from '../../../apis/room-template';
import { graphQlErrorMsg } from '../../../apis/client';

const templates = ref<RoomTemplate[]>([]);
const showForm = ref(false);
const editingId = ref('');
const saving = ref(false);
const err = ref('');

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
.err { color: #e64340; font-size: 24rpx; margin-bottom: 16rpx; }
.btn { border-radius: 40rpx; font-size: 28rpx; background: #4f8cff; color: #fff; line-height: 2.4; }
.btn[disabled] { opacity: .6; }
</style>
