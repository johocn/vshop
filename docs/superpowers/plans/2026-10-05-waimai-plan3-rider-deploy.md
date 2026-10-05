# Waimai Plan 3/3 — 骑手端 pkg-rider + 部署收口 Implementation Plan

> **For agentic workers:** REQUIRED sub-skill: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 pkg-rider 骑手分包四页（入驻/接单大厅/配送中/收入），完成学生端↔骑手端全链路冒烟（点单→支付→抢单→接力交接→送达→分成入账），部署 `www.yourbao.cn/waimai/` 并交付操作手册。

**Architecture:** pkg-rider 复用 Plan 2 建立的底座（client.ts 闸门/tenant store/auth store/upload mutation）。骑手端不切店铺渠道（骑手是平台角色，走默认渠道会话）；核心接口全部来自 campus-delivery-plugin shop-api（Plan 1/Plan 3 后端已上线：campusHall/campusGrabOrder/campusMyTasks/campusStartTask/campusDeliverTask/campusReportException/campusTransferTask/applyRider/myRiderProfile/campusRiderOnline/campusRiderHeartbeat/myRiderEarnings）。边界规则全部后端二次校验，前端仅做体验层拦截（spec §6）。

**Tech Stack:** 同 Plan 2。轮询：大厅 10s + 心跳 30s + 任务页 8s；不引 WebSocket。

**规范：**
- 前端新页面写死中文；金额一律「分」展示时 ÷100 保留两位
- resolver 无 @Allow 的 shop-api 接口按「未登录抛 Forbidden」语义处理——所有骑手页面进入时先过登录态
- **执行时校准点**：`campusDeliverTask`/`campusReportException`/`campusTransferTask` 的参数名以 `e:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task-shop.resolver.ts` 实际代码为准（本计划给出调用侧骨架，签名不符时改 gql 不改页面结构）
- 前置：Plan 2 已收口（底座可跑、四 tab 可用）

---

### Task 1: 骑手 API 层 + rider-join 入驻页

**Files:**
- Create: `src/api/queries/rider.ts`
- Create: `src/pkg-rider/pages/rider-join.vue`

- [ ] **Step 1: API 层**

```ts
// src/api/queries/rider.ts
import gql from 'graphql-tag';
import { getGraphQLClient } from '../../api/client';

const APPLY_RIDER = gql`
    mutation applyRider($realName: String!, $studentNo: String!, $campus: String!, $idImg: String) {
        applyRider(realName: $realName, studentNo: $studentNo, campus: $campus, idImg: $idImg) { status }
    }
`;
const MY_RIDER_PROFILE = gql`
    query myRiderProfile {
        myRiderProfile { customerId riderStatus riderRealName riderStudentNo riderCampus riderCredit }
    }
`;
const RIDER_ONLINE = gql`
    mutation campusRiderOnline($online: Boolean!) { campusRiderOnline(online: $online) { customerId riderStatus } }
`;
const RIDER_HEARTBEAT = gql`
    mutation campusRiderHeartbeat { campusRiderHeartbeat { customerId riderStatus } }
`;

export async function applyRider(v: { realName: string; studentNo: string; campus: string; idImg?: string }) {
    return getGraphQLClient().request(APPLY_RIDER, v).then(r => r.applyRider);
}
export async function myRiderProfile() {
    return getGraphQLClient().request(MY_RIDER_PROFILE).then(r => r.myRiderProfile);
}
export async function riderOnline(online: boolean) {
    return getGraphQLClient().request(RIDER_ONLINE, { online }).then(r => r.campusRiderOnline);
}
export async function riderHeartbeat() {
    return getGraphQLClient().request(RIDER_HEARTBEAT).then(r => r.campusRiderHeartbeat);
}
```

> 返回类型字段（`RiderProfile { customerId riderStatus riderRealName riderStudentNo riderCampus riderCredit }`、`campusRiderOnline/campusRiderHeartbeat` 返回体）以 `campus-delivery.plugin.ts` schema 定义为准校准；mutation 返回类型若为标量/Boolean 则同步改 `.then` 取值。

- [ ] **Step 2: rider-join 页**

```vue
<!-- src/pkg-rider/pages/rider-join.vue -->
<template>
    <view class="join">
        <view class="status-card" v-if="profile && profile.riderStatus === 'PENDING'">
            <text class="status-title">审核中</text>
            <text class="status-desc">资质提交成功，等待管理员审核（一般 1 个工作日内）</text>
        </view>
        <view class="status-card" v-else-if="profile && profile.riderStatus === 'REJECTED'">
            <text class="status-title">未通过审核</text>
            <text class="status-desc">可修改资料后重新提交</text>
        </view>
        <view v-else class="form">
            <view class="field"><text class="label">真实姓名</text><input v-model="form.realName" placeholder="与证件一致" /></view>
            <view class="field"><text class="label">学号</text><input v-model="form.studentNo" placeholder="请输入学号" /></view>
            <view class="field"><text class="label">校区</text><input v-model="form.campus" placeholder="如：东校区" /></view>
            <view class="field">
                <text class="label">学生证照片（选填）</text>
                <image v-if="form.idImg" :src="form.idImg" class="id-img" mode="aspectFill" @tap="chooseImg" />
                <view v-else class="id-upload" @tap="chooseImg">＋ 上传</view>
            </view>
            <button class="submit" :disabled="submitting" @tap="submit">{{ submitting ? '提交中…' : '提交申请' }}</button>
            <text class="tips">审核通过后即可在「我的-骑手中心」接单赚跑腿费</text>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { applyRider, myRiderProfile } from '../../api/queries/rider';
import { uploadImage } from '../../api/mutations/upload';   // 复制自 vshop，导出名以实际文件为准

const profile = ref<any>(null);
const submitting = ref(false);
const form = reactive({ realName: '', studentNo: '', campus: '', idImg: '' });

onLoad(async () => {
    try { profile.value = await myRiderProfile(); } catch { /* 未登录由外层跳转 */ }
});

async function chooseImg() {
    const res = await uni.chooseImage({ count: 1 });
    const path = res.tempFilePaths?.[0];
    if (path) form.idImg = await uploadImage(path);
}

async function submit() {
    if (!form.realName || !form.studentNo || !form.campus) {
        return uni.showToast({ title: '请填写完整资料', icon: 'none' });
    }
    submitting.value = true;
    try {
        await applyRider({ ...form, idImg: form.idImg || undefined });
        uni.showToast({ title: '已提交', icon: 'success' });
        setTimeout(() => uni.redirectTo({ url: '/pkg-rider/pages/rider-join' }), 800);
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '提交失败', icon: 'none' });
    } finally { submitting.value = false; }
}
</script>

<style scoped lang="scss">
.join { padding: 24rpx; }
.status-card { background: $surface; border-radius: $radius-card; padding: 48rpx 32rpx; text-align: center; }
.status-title { display: block; font-size: 34rpx; font-weight: 600; color: $text; margin-bottom: 16rpx; }
.status-desc { font-size: 26rpx; color: $text-muted; }
.form { background: $surface; border-radius: $radius-card; padding: 32rpx; }
.field { margin-bottom: 28rpx; }
.label { display: block; font-size: 26rpx; color: $text-muted; margin-bottom: 12rpx; }
input { background: $bg; border-radius: $radius; padding: 16rpx 20rpx; font-size: 28rpx; }
.id-upload { width: 240rpx; height: 160rpx; border: 2rpx dashed $brand; border-radius: $radius; color: $brand; text-align: center; line-height: 160rpx; }
.id-img { width: 240rpx; height: 160rpx; border-radius: $radius; }
.submit { background: $brand; color: #fff; border-radius: 999rpx; font-size: 30rpx; margin-top: 16rpx; }
.tips { display: block; text-align: center; font-size: 22rpx; color: $text-muted; margin-top: 20rpx; }
</style>
```

- [ ] **Step 3: 目检 + Commit**

Playwright 390×844 dpr=2 截图 `docs/screenshots/plan3/3-1-rider-join.png`（表单空态 + 填写态各一张；未登录态验证跳登录）

```bash
git add -A && git commit -m "feat(rider): 骑手入驻页（applyRider 表单+审核状态卡+学生证上传）"
```

---

### Task 2: rider-home 接单大厅（在线开关 + 轮询 + 乐观锁抢单）

**Files:**
- Create: `src/api/queries/hall.ts`
- Create: `src/pkg-rider/pages/rider-home.vue`

- [ ] **Step 1: 大厅 API**

```ts
// src/api/queries/hall.ts
import gql from 'graphql-tag';
import { getGraphQLClient } from '../../api/client';

const CAMPUS_HALL = gql`
    query campusHall { campusHall { orderId orderCode buildingName zoneName total amount tip createdAt route } }
`;
const GRAB = gql`
    mutation campusGrabOrder($orderId: ID!) { campusGrabOrder(orderId: $orderId) { orderId status message } }
`;
const MY_TASKS = gql`
    query campusMyTasks($status: String) { campusMyTasks(status: $status) { orderId orderCode status buildingName zoneName amount tip route assignedAt } }
`;

export async function fetchHall() { return getGraphQLClient().request(CAMPUS_HALL).then(r => r.campusHall ?? []); }
export async function grabOrder(orderId: string) { return getGraphQLClient().request(GRAB, { orderId }).then(r => r.campusGrabOrder); }
export async function fetchMyTasks(status?: string) { return getGraphQLClient().request(MY_TASKS, { status }).then(r => r.campusMyTasks ?? []); }
```

> `campusHall` 返回元素字段名以 `hall-grab.service.ts` 实际返回结构为准校准（执行时 grep hall-grab.service.spec.ts 的断言对象最直观）；`campusGrabOrder` 返回若为标量 String（如 'OK'/'TASK_TAKEN'）则按标量处理——**两种形态都适配**：`const r = resp?.status ?? resp;`

- [ ] **Step 2: rider-home 页**

```vue
<!-- src/pkg-rider/pages/rider-home.vue -->
<template>
    <view class="hall">
        <view class="topbar">
            <view class="online" :class="{ on }" @tap="toggleOnline">
                <view class="dot"></view><text>{{ on ? '接单中' : '已下线' }}</text>
            </view>
            <text class="credit">信用分 {{ profile?.riderCredit ?? '--' }}</text>
        </view>
        <view class="hint" v-if="!on">打开「接单中」开关开始接收新任务</view>
        <EmptyState v-else-if="!tasks.length" text="暂无待抢任务，新单会实时出现在这里" />
        <view v-else class="tasks">
            <view v-for="t in tasks" :key="t.orderId" class="task" :class="{ taken: takenIds.has(t.orderId) }">
                <view class="task-head">
                    <text class="order-code">#{{ t.orderCode }}</text>
                    <text class="fee">跑腿费 ¥{{ ((t.amount ?? 0) + (t.tip ?? 0)) / 100 }}</text>
                </view>
                <text class="task-addr">📍 {{ t.zoneName }} · {{ t.buildingName }}</text>
                <text class="task-route">{{ t.route === 'R1' ? '接力单（到校门口交接点取货）' : '直送单（档口取货）' }}</text>
                <button class="grab" :disabled="grabbing || takenIds.has(t.orderId)" @tap="grab(t)">
                    {{ takenIds.has(t.orderId) ? '已被抢' : grabbing ? '锁定中…' : '一键接单' }}
                </button>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { onShow, onHide } from '@dcloudio/uni-app';
import { fetchHall, grabOrder } from '../../api/queries/hall';
import { myRiderProfile, riderOnline, riderHeartbeat } from '../../api/queries/rider';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const on = ref(false);
const profile = ref<any>(null);
const tasks = ref<any[]>([]);
const grabbing = ref(false);
const takenIds = ref(new Set<string>());
let pollTimer: any = null, beatTimer: any = null;

onShow(async () => {
    if (!auth.token) return uni.redirectTo({ url: '/pages/login/index?back=/pkg-rider/pages/rider-home' });
    profile.value = await myRiderProfile().catch(() => null);
    if (profile.value?.riderStatus !== 'APPROVED') {
        return uni.redirectTo({ url: '/pkg-rider/pages/rider-join' });
    }
    await refresh();
    pollTimer = setInterval(refresh, 10000);      // spec §6.1 轮询 10s
    beatTimer = setInterval(() => riderHeartbeat().catch(() => {}), 30000);  // 心跳 30s
});
onHide(() => { clearInterval(pollTimer); clearInterval(beatTimer); });
onUnmounted(() => { clearInterval(pollTimer); clearInterval(beatTimer); });

async function refresh() {
    try { tasks.value = await fetchHall(); } catch { /* 网络抖动静默重试 */ }
}
async function toggleOnline() {
    on.value = !on.value;
    await riderOnline(on.value).catch(() => { on.value = !on.value; });
}
async function grab(t: any) {
    grabbing.value = true;   // 乐观锁 UI：立即置灰（spec §6.1.2）
    try {
        const r = await grabOrder(t.orderId);
        const status = r?.status ?? r;
        if (status === 'OK' || status === 'ASSIGNED') {
            uni.redirectTo({ url: '/pkg-rider/pages/rider-delivering' });
        } else if (status === 'TASK_TAKEN') {
            takenIds.value.add(t.orderId);
            uni.showToast({ title: '手慢了，已被抢', icon: 'none' });
        } else if (status === 'CREDIT_TOO_LOW') {
            uni.showToast({ title: '信用分不足，请先提升信用分', icon: 'none' });
        } else {
            uni.showToast({ title: String(status || '抢单失败'), icon: 'none' });
        }
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '抢单失败', icon: 'none' });
        await refresh();
    } finally { grabbing.value = false; }
}
onMounted(() => {});
</script>

<style scoped lang="scss">
.hall { padding: 24rpx; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24rpx; }
.online { display: flex; align-items: center; gap: 12rpx; background: $surface; padding: 12rpx 28rpx; border-radius: 999rpx; font-size: 26rpx; }
.online .dot { width: 16rpx; height: 16rpx; border-radius: 999rpx; background: #ccc; }
.online.on .dot { background: #1dc981; }
.credit { font-size: 26rpx; color: $text-muted; }
.hint { text-align: center; color: $text-muted; font-size: 26rpx; margin-top: 120rpx; }
.tasks { display: flex; flex-direction: column; gap: 20rpx; }
.task { background: $surface; border-radius: $radius-card; padding: 24rpx; }
.task.taken { opacity: .45; }
.task-head { display: flex; justify-content: space-between; margin-bottom: 8rpx; }
.order-code { font-size: 26rpx; color: $text-muted; }
.fee { font-size: 34rpx; font-weight: 700; color: $brand; }
.task-addr { display: block; font-size: 30rpx; font-weight: 600; color: $text; margin-bottom: 6rpx; }
.task-route { display: block; font-size: 24rpx; color: $text-muted; margin-bottom: 20rpx; }
.grab { background: $brand; color: #fff; border-radius: 999rpx; font-size: 30rpx; }
.grab:disabled { opacity: .5; }
</style>
```

- [ ] **Step 3: 目检 + Commit**

Playwright 390×844 dpr=2：`rider-home` 截图 `docs/screenshots/plan3/3-2-rider-home.png`（无任务时空态 + 有任务两态）

```bash
git add -A && git commit -m "feat(rider): 接单大厅（在线开关/10s轮询/30s心跳/乐观锁抢单四态处理）"
```

---

### Task 3: rider-delivering 配送中（取货→交接→送达→异常→转单）

**Files:**
- Create: `src/pkg-rider/pages/rider-delivering.vue`

- [ ] **Step 1: 页面实现**

```vue
<!-- src/pkg-rider/pages/rider-delivering.vue -->
<template>
    <view class="delivering">
        <EmptyState v-if="!task" text="暂无进行中的任务" />
        <view v-else class="task-card">
            <text class="code">#{{ task.orderCode }} · {{ task.route === 'R1' ? '接力单' : '直送单' }}</text>
            <text class="addr">📍 {{ task.zoneName }} · {{ task.buildingName }}</text>
            <text class="sla">建议 45 分钟内送达</text>

            <!-- 状态推进区：按 task.status 渲染下一步动作（状态拼写执行时校准） -->
            <view class="actions">
                <block v-if="task.status === 'ASSIGNED'">
                    <button class="act" @tap="startTask">我已到店 · 开始取货</button>
                    <button class="act ghost" @tap="transfer(false)">转单（未取货）</button>
                </block>
                <block v-else-if="task.status === 'PICKED_UP'">
                    <text class="picked">已取货，配送中</text>
                    <button class="act" @tap="deliverFlow">我已送达（拍照存证）</button>
                    <button class="act ghost" @tap="transfer(true)">转单（已取货·拍照交接）</button>
                </block>
                <block v-else-if="task.status === 'DELIVERED'">
                    <text class="done">已送达 ✓ 分成已入账</text>
                </block>
            </view>

            <view class="extra">
                <button class="act ghost small" @tap="reportException">异常上报（联系不上学生等）</button>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { onShow, onHide } from '@dcloudio/uni-app';
import { fetchMyTasks } from '../../api/queries/hall';
import {
    startTask, deliverTask, reportException, transferTask,
} from '../../api/queries/task-actions';   // 见 Step 2
import { uploadImage } from '../../api/mutations/upload';

const task = ref<any>(null);
let timer: any = null;

onShow(async () => {
    await refresh();
    timer = setInterval(refresh, 8000);
});
onHide(() => clearInterval(timer));
onUnmounted(() => clearInterval(timer));

async function refresh() {
    const list = await fetchMyTasks().catch(() => []);
    task.value = list[0] ?? null;   // 一期单人单任务
}

async function startTask() {
    await startTask(task.value.orderId);
    uni.showToast({ title: '已开始取货', icon: 'none' });
    await refresh();
}

async function takePhoto(): Promise<string> {
    const res = await uni.chooseImage({ count: 1 });
    const path = res.tempFilePaths?.[0];
    if (!path) throw new Error('cancel');
    return uploadImage(path);
}

async function deliverFlow() {
    try {
        const photo = await takePhoto();          // 送达拍照必填（spec §6.2.2）
        await deliverTask(task.value.orderId, [photo]);
        uni.showToast({ title: '已送达，分成入账', icon: 'success' });
        await refresh();
    } catch (e: any) {
        if (e?.message !== 'cancel') uni.showToast({ title: '送达失败', icon: 'none' });
    }
}

async function transfer(picked: boolean) {
    try {
        let photos: string[] = [];
        if (picked) photos = [await takePhoto()]; // 已取货转单强制拍照交接（spec §6.2.4）
        await transferTask(task.value.orderId, photos);
        uni.showToast({ title: '已转回大厅', icon: 'none' });
        await refresh();
    } catch (e: any) {
        if (e?.message !== 'cancel') uni.showToast({ title: '转单失败', icon: 'none' });
    }
}

async function reportException() {
    // 一期固定类型 no_recipient（联系不上学生），后续扩 UI 选择器
    await reportException(task.value.orderId, 'no_recipient', '学生电话未接通，已尝试催取');
    uni.showToast({ title: '已上报，平台将介入', icon: 'none' });
    await refresh();
}
</script>

<style scoped lang="scss">
.delivering { padding: 24rpx; }
.task-card { background: $surface; border-radius: $radius-card; padding: 32rpx; }
.code { display: block; font-size: 24rpx; color: $text-muted; margin-bottom: 8rpx; }
.addr { display: block; font-size: 34rpx; font-weight: 600; color: $text; margin-bottom: 8rpx; }
.sla { display: block; font-size: 22rpx; color: #efa500; margin-bottom: 32rpx; }
.picked, .done { display: block; font-size: 28rpx; color: #1dc981; margin-bottom: 24rpx; }
.actions { display: flex; flex-direction: column; gap: 16rpx; }
.act { background: $brand; color: #fff; border-radius: 999rpx; font-size: 30rpx; }
.act.ghost { background: $bg; color: $text; }
.act.small { font-size: 24rpx; }
.extra { margin-top: 32rpx; }
</style>
```

- [ ] **Step 2: 任务动作 API（独立文件，签名执行时校准）**

```ts
// src/api/queries/task-actions.ts
import gql from 'graphql-tag';
import { getGraphQLClient } from '../../api/client';

// ⚠️ 执行前先读 e:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task-shop.resolver.ts
//    校准三个 mutation 的真实参数名（photos 列表类型/nullable、note、exceptionType 枚举值），
//    本文件按以下假名书写，不符时只改 gql 与函数体，不改页面调用签名：
//    startTask(orderId) / deliverTask(orderId, photos, note?) /
//    reportException(orderId, exceptionType, note) / transferTask(orderId, photos, note?)

const START = gql`mutation campusStartTask($orderId: ID!){ campusStartTask(orderId: $orderId){ orderId status } }`;
const DELIVER = gql`mutation campusDeliverTask($orderId: ID!, $photos: [String!]!){ campusDeliverTask(orderId: $orderId, photos: $photos){ orderId status } }`;
const REPORT = gql`mutation campusReportException($orderId: ID!, $exceptionType: String!, $note: String){ campusReportException(orderId: $orderId, exceptionType: $exceptionType, note: $note){ orderId status } }`;
const TRANSFER = gql`mutation campusTransferTask($orderId: ID!, $photos: [String!]!){ campusTransferTask(orderId: $orderId, photos: $photos){ orderId status } }`;

function unwrap(resp: any, key: string) { return resp?.[key] ?? resp; }

export async function startTask(orderId: string) {
    return unwrap(await getGraphQLClient().request(START, { orderId }), 'campusStartTask');
}
export async function deliverTask(orderId: string, photos: string[]) {
    return unwrap(await getGraphQLClient().request(DELIVER, { orderId, photos }), 'campusDeliverTask');
}
export async function reportException(orderId: string, exceptionType: string, note?: string) {
    return unwrap(await getGraphQLClient().request(REPORT, { orderId, exceptionType, note }), 'campusReportException');
}
export async function transferTask(orderId: string, photos: string[]) {
    return unwrap(await getGraphQLClient().request(TRANSFER, { orderId, photos }), 'campusTransferTask');
}
```

- [ ] **Step 3: 目检 + Commit**

Playwright 390×844 dpr=2 截图 `docs/screenshots/plan3/3-3-rider-delivering.png`（ASSIGNED 态动作区 + DELIVERED 态各一张，用后端真实单据驱动状态）

```bash
git add -A && git commit -m "feat(rider): 配送中（开始取货/送达拍照必填/异常上报/未取货与拍照交接转单）"
```

---

### Task 4: rider-earning 收入明细

**Files:**
- Create: `src/pkg-rider/pages/rider-earning.vue`

- [ ] **Step 1: 页面实现**

```vue
<!-- src/pkg-rider/pages/rider-earning.vue -->
<template>
    <view class="earning">
        <view class="kpi">
            <view class="kpi-item">
                <text class="kpi-num">¥{{ fmt(todayTotal) }}</text>
                <text class="kpi-label">今日</text>
            </view>
            <view class="kpi-item">
                <text class="kpi-num">¥{{ fmt(weekTotal) }}</text>
                <text class="kpi-label">本周</text>
            </view>
            <view class="kpi-item">
                <text class="kpi-num">{{ profile?.riderCredit ?? '--' }}</text>
                <text class="kpi-label">信用分</text>
            </view>
        </view>
        <EmptyState v-if="!rows.length" text="暂无分成流水" />
        <view v-else class="list">
            <view v-for="r in rows" :key="r.id" class="row">
                <view class="row-main">
                    <text class="row-title">订单 #{{ r.orderId }}{{ r.tip ? ` · 含小费` : '' }}</text>
                    <text class="row-time">{{ r.createdAt }}</text>
                </view>
                <text class="row-amount">+¥{{ fmt((r.amount ?? 0) + (r.tip ?? 0)) }}</text>
            </view>
        </view>
        <text class="note">提现能力二期开放；分成随送达实时入账（status=credited）</text>
    </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { myRiderProfile } from '../../api/queries/rider';
import { fetchMyEarnings } from '../../api/queries/earnings';

const profile = ref<any>(null);
const rows = ref<any[]>([]);

const todayTotal = computed(() => sumOf(rows.value, 0));
const weekTotal = computed(() => sumOf(rows.value, 7));

function fmt(fen: number) { return (fen / 100).toFixed(2); }
function sumOf(list: any[], days: number) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - days);
    return list
        .filter(r => new Date(r.createdAt) >= start && r.status === 'credited')
        .reduce((s, r) => s + (r.amount ?? 0) + (r.tip ?? 0), 0);
}

onShow(async () => {
    profile.value = await myRiderProfile().catch(() => null);
    rows.value = await fetchMyEarnings(0, 50).catch(() => []);
});
</script>

<style scoped lang="scss">
.earning { padding: 24rpx; }
.kpi { display: flex; background: $brand; border-radius: $radius-card; padding: 32rpx 16rpx; margin-bottom: 24rpx; }
.kpi-item { flex: 1; text-align: center; }
.kpi-num { display: block; color: #fff; font-size: 34rpx; font-weight: 700; }
.kpi-label { display: block; color: rgba(255,255,255,.8); font-size: 22rpx; margin-top: 6rpx; }
.list { background: $surface; border-radius: $radius-card; }
.row { display: flex; justify-content: space-between; padding: 24rpx; border-bottom: 1rpx solid #f0f0f0; }
.row:last-child { border-bottom: none; }
.row-title { display: block; font-size: 26rpx; color: $text; }
.row-time { display: block; font-size: 22rpx; color: $text-muted; margin-top: 4rpx; }
.row-amount { font-size: 30rpx; font-weight: 600; color: #1dc981; }
.note { display: block; text-align: center; font-size: 22rpx; color: $text-muted; margin-top: 24rpx; }
</style>
```

```ts
// src/api/queries/earnings.ts
import gql from 'graphql-tag';
import { getGraphQLClient } from '../../api/client';

const MY_EARNINGS = gql`
    query myRiderEarnings($skip: Int, $take: Int) {
        myRiderEarnings(skip: $skip, take: $take) { id orderId amount tip status createdAt }
    }
`;
export async function fetchMyEarnings(skip = 0, take = 50) {
    return getGraphQLClient().request(MY_EARNINGS, { skip, take }).then(r => r.myRiderEarnings ?? []);
}
```

- [ ] **Step 2: 目检 + Commit**

Playwright 390×844 dpr=2 截图 `docs/screenshots/plan3/3-4-rider-earning.png`

```bash
git add -A && git commit -m "feat(rider): 收入明细（今日/本周 KPI+分成流水+信用分展示）"
```

---

### Task 5: 数据准备 + 全链路冒烟

**Files:**
- Create: `e:\zhao\vshop\.secrets\waimai-e2e-prepare.cjs`（造数：店铺渠道+履约配置+zone/building/slot+waimai 元数据）
- Create: `e:\zhao\vshop\.secrets\waimai-e2e-smoke.cjs`（全链路冒烟）
- Create: `e:\zhao\vshop\docs\verify\2026-10-waimai-e2e.md`

- [ ] **Step 1: 造数脚本**（admin-api 登录用 superadmin，token 缓存 `e:\zhao\vshop\.secrets\admin_token.txt`；两个店铺渠道 canteen-a/canteen-b + 各自 campus_fulfillment_config + zone「东区」+ building「1 栋/2 栋」+ 明日两个时段 + Channel waimai 元数据）

要点（逐条落到脚本）：
1. `authentication { login(...) }` 取 `vendure-auth-token` 响应头
2. 建渠道：admin `createChannel(code, token, defaultLanguageCode, defaultShippingZoneId?, defaultTaxCategoryId?)`；若无默认 shipping zone 先建
3. Channel waimai 元数据：`updateChannel(input: { id, customFields: { waimaiTags, waimaiMonthlySales, waimaiLogo, waimaiPromoText } })`——字段在 customFields 定义后 admin schema 自动出现
4. 每渠道 `campusUpsertFulfillmentConfig`（admin resolver 名执行时 grep `campus-config-admin.resolver.ts` 校准）
5. zone/building 用 admin resolver 的创建 mutation（同名文件校准）；slot 用 DeliverySlot admin CRUD（Plan 3 commit 1a087cd69 引入，grep `DeliverySlot` 的 admin resolver）
6. 每店铺渠道造 1 个分类 + 2 个商品（¥10/¥15，含价格）+ facet 可省——商品走 admin `createProduct`+`createProductVariants` 最小集
7. 脚本幂等：全部用 `upsert` 语义或按 code 先查后建，可重复执行

- [ ] **Step 2: 全链路冒烟脚本**（node cjs，fetch 直调 shop-api；复用 etao native 登录 `e:\zhao\vshop\.secrets\verify-paymode.cjs` 的凭据形态）

```
步骤（每步 console.log 断言，失败 throw）：
S1  waimaiStoreList 返回 ≥2 店铺且含 promoText
S2  native 登录 etao（凭据读 .secrets/verify-paymode.cjs 同款）拿 vendure-auth-token
S3  以店铺 A token：addItemToOrder 商品×1
S4  campusSetDeliveryTarget(zoneId, buildingId, route='R3', slotId) → 断言 customFields 五字段写入
S5  transitionOrderToState 'ArrangingPayment' → 'PaymentSettled'（模拟支付：admin transition 或复用 verify-paymode 的余额支付路径）
    支付后断言：hallStatus 出现 + slot-lock 生效（DeliverySlot.lockedCount +1，admin 查证）
S6  切骑手会话（etao 同人不行——下单/接单互斥；用第二个测试账号或 admin 代骑手申请 approved）
    骑手：campusHall 断言该单在列 → campusGrabOrder 断言 ASSIGNED → campusStartTask → campusDeliverTask(photos:['/static/x.webp'])
S7  断言：hallStatus=DELIVERED、rider_earning 出现流水（amount+tip）、学生侧 campusOrderRider 返回骑手名+信用分
S8  转单链路：再下一单（店铺 B）→ 骑手接单 → campusTransferTask(photos:[]) 未取货转单 → campusHall 重新出现该单
输出 E2E SMOKE PASS
```

- [ ] **Step 3: 执行并取证**

Run: `node e:\zhao\vshop\.secrets\waimai-e2e-prepare.cjs` 然后 `node e:\zhao\vshop\.secrets\waimai-e2e-smoke.cjs https://e.joho.cn/shop-api`
Expected: `E2E SMOKE PASS`；全程输出留存到 `docs/verify/2026-10-waimai-e2e.md`

- [ ] **Step 4: Commit（vshop 仓库）**

```bash
cd e:\zhao\vshop
git add .secrets/waimai-e2e-prepare.cjs .secrets/waimai-e2e-smoke.cjs docs/verify/2026-10-waimai-e2e.md
git commit -m "test(waimai): 全链路冒烟（造数+八步断言）与验收手册"
```

---

### Task 6: 部署 + 手机截图 + 操作手册

- [ ] **Step 1: nginx 增补**（先与用户确认无并发服务器操作；ssh 别名 joho）

```bash
ssh joho "sudo cp /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/conf/conf.d/www.yourbao.cn.conf /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/conf/conf.d/www.yourbao.cn.conf.bak_$(date +%Y%m%d%H%M)"
```

在 `server { }` 内（现有 `/shop-api` location 之前）追加：

```nginx
    location /waimai/ {
        try_files $uri $uri/ /waimai/index.html;
        add_header Cache-Control "no-cache";
    }
    location /waimai/assets/ {
        add_header Cache-Control "immutable";
    }
```

重载：`ssh joho "sudo docker exec 1panel-openresty nginx -t && sudo docker exec 1panel-openresty nginx -s reload"`（容器名执行时 `docker ps` 核对）

- [ ] **Step 2: 构建上传**（写 `e:\zhao\waimai\.secrets\deploy-waimai.sh`，参照 vshop `.secrets/wechatpay/deploy-yourbao.sh`；PowerShell 不适合内嵌远程脚本——scp .sh 到 /tmp 再 ssh 执行，完成后 rm）

```
流程：本地 pnpm build:h5 → tar -czf waimai.tgz -C dist/build/h5 . →
scp waimai.tgz joho:/tmp/ → ssh: 备份远端 waimai 目录（如有）为 index.bak_<ts> 平级 →
mkdir -p .../yourbao/waimai && tar -xzf /tmp/waimai.tgz -C .../yourbao/waimai → rm /tmp/waimai.tgz
```

验证：`curl -s -o /dev/null -w '%{http_code}' https://www.yourbao.cn/waimai/` 期望 200

- [ ] **Step 3: 手机截图目检（生产）**

Playwright 390×844 dpr=2 逐页截图到 `e:\zhao\vshop\docs\screenshots\waimai\`：
`home / menu / checkout / order-detail / rider-join / rider-home / rider-delivering / rider-earning`
**主窗口逐张 Read 目检**（冒烟铁律：不信任子代理的 PASS 汇报）

- [ ] **Step 4: 操作手册**

Create: `e:\zhao\vshop\docs\waimai-操作手册.md`——内容：学生端五步点单流程、骑手端入驻→接单→交接→送达流程、管理员造数入口（zone/building/slot/waimai 元数据维护点）、已知限制（提现二期/小程序二期/WS 二期/JSAPI 授权目录待追加）、冒烟脚本复跑命令

- [ ] **Step 5: 双仓库收口提交**

```bash
cd e:\zhao\waimai && git add -A && git commit -m "chore: 部署脚本与生产截图收口"
cd e:\zhao\vshop && git add docs/screenshots/waimai docs/waimai-操作手册.md docs/verify/2026-10-waimai-e2e.md
git commit -m "docs(waimai): 生产部署截图 + 操作手册 + 验收手册"
```

---

## Self-Review 结论

- Spec 覆盖：§4 pkg-rider 四页 → Task 1-4；§6.1 抢单五要点（轮询/乐观锁四态/超时自动下架为后端已上线能力前端只表现/改派通知后端已上线/新单提醒 H5 轮询降级）→ Task 2 + Task 3 轮询；§6.2 交接五要点（拍照交接/送达拍照必填/no_recipient/转单双形态/SLA 警示）→ Task 3（SLA 警示一期用固定文案「建议 45 分钟内送达」）；§9 冒烟+截图+手册 → Task 5/6；§8 部署 → Task 6
- 明确不做（spec §10）：提现入口一期只展示文案；SLA 警示态不做倒计时（后端有 T3 告警）
- 类型一致：`fetchMyTasks`（hall.ts）与 Task 3 引用一致；`uploadImage` 复制自 vshop upload mutation（导出名执行时校准）；四 mutation 签名校准点已集中标注在 task-actions.ts
- 骑手测试账号：S6 需第二个顾客账号（下单/接单互斥），凭据走 .secrets 参数化不入库
- 无占位符
