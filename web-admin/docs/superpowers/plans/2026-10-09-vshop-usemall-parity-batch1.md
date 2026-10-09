# usemall→vshop 批次 1 补齐 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地差距矩阵批次 1 的 5 项（F01 物流轨迹、F10 修改密码+协议页、F15 瀑布流、F17 会员权益展示、F23 web-admin 秒杀/拼团活动管理），纯前端改造，零后端改动。

**Architecture:** vshop C 端（uni-app 3 + Vue3 setup + graphql-request，自研组件）与 web-admin（同为 uni-app 3 手机后台 H5，部署 e.joho.cn/guanli）各自新增页面/接线；后端能力全部已存在（SDL 已核实）。提交全在 `d:\zhao\vshop` 仓库。

**Tech Stack:** uni-app 3 / Vue 3.5 / pinia / graphql-request / SCSS。部署：C 端 tar+scp→e.joho.cn 根目录；web-admin `scripts/deploy.mjs` 一键。

设计依据：[2026-10-09-vshop-usemall-parity-design.md](file:///d:/zhao/vshop/web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-design.md) ｜ 矩阵：[2026-10-09-vshop-usemall-parity-matrix.md](file:///d:/zhao/vshop/web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-matrix.md)

---

## 0. 前置事实与执行口径（每个 Task 都适用，全部已一手核实）

**仓库与提交**
1. 仓库根 `d:\zhao\vshop`，所有提交提到该仓库，中文 commit message。**PowerShell 5.1：禁止 `&&`**（用 `;`）；多行/中文 message 用临时文件 `git commit -F`：`[IO.File]::WriteAllText("$env:TEMP\cm.txt",$msg,[Text.UTF8Encoding]::new($false))`。只 `git add` 本 Task 文件，禁止 `git add -A`。
2. 已知问题（不在本计划修）：logistics-shop.resolver.ts L19 的 carrierName 实际返回 carrierCode（后端字段），C 端展示时以 trackingNo 为主、carrierName 作辅助，不做后端改动。

**C 端模式（vshop src）**
3. GraphQL 封装 `src/api/client.ts`：`getGraphQLClient()` 返回 graphql-request 客户端（自动带 `Authorization: Bearer` + `vendure-token` 租户头）。API 函数模式（`src/api/queries/order.ts` 为范例）：
```ts
export async function getMyOrderPackages(orderId: string) {
    const client = getGraphQLClient();
    const query = `query MyOrderPackages($orderId: String!) {
        myOrderPackages(orderId: $orderId) { code status trackingNo carrierName courierName }
    }`;
    return client.request(query, { orderId });
}
```
4. 错误约定：页面层 try/catch → `uni.showToast({ title: e.message, icon: 'none' })`。
5. 页面模式参照 `src/pkg-user/pages/points-history.vue`：`<script setup lang="ts">` + 相对路径 import + `onReachBottom`/`onPullDownRefresh`（来自 `@dcloudio/uni-app`）+ 自研组件（`src/components/`：EmptyState/LoadingSkeleton/VImage/PriceTag 等）+ scss（uni.scss 全局变量 `$brand-color/$radius-md/$bg-color`，BEM 命名）。
6. **文案口径**：pkg-user/pkg-order 既有页面（points-history/member-center/order-detail）大量硬编码中文——本批新增 C 端页面文案**硬编码中文**（与仓库现状一致，运行时也仅 zh 生效）；login/register 的 auth.* i18n key 已存在则复用。**不做** 5 语言包同步（本批无新增 i18n key 需求）。
7. pages.json（`src/pages.json`）：pkg-user 段 L226-297，条目样式照抄现有（含 `{"path":"pages/logistics","style":{"navigationBarTitleText":"物流跟踪"}}` 这类）。分包页面无需改主包 manifest。
8. 相关 SDL（已核实，直接用）：
```graphql
# logistics-plugin shop-api
myOrderTracks(orderId: ID!): [LogisticsTrackShop!]!   # @Allow(Authenticated)
type LogisticsTrackShop { id: ID! fulfillmentId: ID! trackingNo: String! carrierCode: String!
  carrierName: String! status: String! trackInfo: String signedAt: DateTime lastSyncedAt: DateTime }
myOrderPackages(orderId: ID!): [OrderPackageShop!]!
type OrderPackageShop { code: String! deliveryMode: String! status: String! shippedAt: DateTime
  deliveredAt: DateTime cancelledAt: DateTime shippingFee: Int lines: [OrderPackageLineShop!]!
  trackingNo: String carrierName: String courierName: String courierPhone: String thirdPartyNo: String etaMinutes: Int }
confirmOrderReceipt(orderId: ID!): Boolean!
# core shop-api（@Allow(Owner) + @Transaction，已登录即可）
updateCustomerPassword(currentPassword: String!, newPassword: String!): UpdateCustomerPasswordResult!
# union: Success | InvalidCredentialsError | PasswordValidationError | NativeAuthStrategyError
# member-level-plugin shop-api（myTier 与 myMemberInfo resolver 同实现、同返回型）
type MemberInfo { customerId: ID! level: Int! levelName: String! growthValue: Int! points: Int!
  nextLevelThreshold: Int nextLevelName: String pointsMultiplier: Int! redeemDiscountRate: Int!
  redeemCapRatio: Int! specialDiscountRate: Int! }
myMemberInfo: MemberInfo!  myTier: MemberInfo!
```
9. 关键文件落点：
   - `src/pkg-order/pages/order-detail.vue`：物流区块模板 L12-19、取数 L100-106、确认收货 L51+L112
   - `src/pkg-user/pages/logistics.vue`：12 行纯壳页（整页重写）
   - `src/pages/login/index.vue`：协议死链 L47-52（两个 `.agreement-link` 无 @click）；`src/pages/register/index.vue` 同款协议区（接线时同改）
   - `src/pkg-product/pages/list.vue`：列表渲染 L4-19（scroll-view + .product-grid）、卡片宽 L76-77
   - `src/pkg-user/pages/member-center.vue`：等级头部 L4-9（用 getMyMemberInfo）、签到 L25-28+L72-86
   - `src/api/queries/member.ts`：现有 getMyMemberInfo/getCheckinToday/doCheckinMutation
10. 部署链路（Task 8 用，已核实）：
    - C 端：`npm run build:h5`（=uni build）→ 产物 `dist/build/h5`；标准发布命令在 `docs/superpowers/plans/2026-09-30-vshop-tenant-token-gate.md` L824-841（tar→scp joho→ssh 解压到 `/home/admin/vshop-h5`，再执行服务器 `/home/admin/deploy-vshop.sh` 或按该文档命令直接解压到站点 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index`；静态目录即时生效）
    - web-admin：`node scripts/deploy.mjs`（本地构建→scp→解压到 `.../e.joho.cn/guanli`→备份轮转→reload openresty）
    - 生产探针：`python web-admin/scripts/_smoke_usemall_parity.py`（预期仍 6 OK，本批不影响后端）

**web-admin 模式**
11. web-admin 是 uni-app 3 手机后台 H5（非 vben）。「路由」=`web-admin/src/pages.json`（全平铺）；「菜单」=`web-admin/src/constants/menus.ts`（`menuGroups` 数组，营销组 `domain: 'marketing'` 在 L96-105）；api 层 `src/apis/client.ts` 的 `getAdminClient()`（自动带 Bearer + vendure-token，401 自动回登录）；文案走 `useLocaleStore().t()` + `$t`，语言包 `src/locale/zh-Hans.json` + `en.json`（与 vshop C 端是两套）。
12. CRUD 页面参照 `src/pages/coupon/index.vue`（卡片流列表+手写分页 PAGE=20+操作行）与 `src/pages/coupon/edit/index.vue`（表单页）。选商品参考 `src/pages/coupon/pick-products/index.vue`（新建活动选 productId/variantId 时优先复用其选品模式，若其 eventChannel 契约不通用则降级为表单内手动输入 ID + 校验）。
13. web-admin 相关 SDL（已核实，直接用；价格单位**分**）：
```graphql
# flash-sale-plugin admin-api
type FlashSaleActivity implements Node { id: ID! name: String! startAt: DateTime! endAt: DateTime!
  flashPrice: Int! totalStock: Int! soldCount: Int! limitPerUser: Int! productId: ID! variantId: ID!
  status: FlashSaleStatus! createdAt: DateTime! updatedAt: DateTime! }
enum FlashSaleStatus { upcoming active ended }
input CreateFlashSaleActivityInput { name: String! startAt: DateTime! endAt: DateTime! flashPrice: Int!
  totalStock: Int! limitPerUser: Int productId: ID! variantId: ID! }
input UpdateFlashSaleActivityInput { id: ID! name: String startAt: DateTime endAt: DateTime flashPrice: Int
  totalStock: Int limitPerUser: Int productId: ID variantId: ID status: FlashSaleStatus }
flashSaleActivities(options: FlashSaleActivityListOptions): FlashSaleActivityList!
createFlashSaleActivity(input!): FlashSaleActivity!  updateFlashSaleActivity(input!): FlashSaleActivity!
deleteFlashSaleActivity(id: ID!): Boolean!
# group-buy-plugin admin-api（Update 不含 productId/variantId/leaderRewardType/autoConfirm/allowJoinAfterComplete）
type GroupBuyActivity implements Node { id: ID! name: String! description: String! targetCount: Int!
  currentCount: Int! maxCount: Int! status: GroupBuyStatus! startAt: DateTime! endAt: DateTime!
  groupPrice: Int! leaderDiscount: Int! leaderRewardType: String! autoConfirm: Boolean!
  allowJoinAfterComplete: Boolean! createdAt: DateTime! updatedAt: DateTime! }
enum GroupBuyStatus { active completed expired }
input CreateGroupBuyActivityInput { name: String! description: String! targetCount: Int! maxCount: Int
  startAt: DateTime! endAt: DateTime! groupPrice: Int! leaderDiscount: Int leaderRewardType: String
  autoConfirm: Boolean allowJoinAfterComplete: Boolean productId: ID! variantId: ID! }
input UpdateGroupBuyActivityInput { id: ID! name: String description: String targetCount: Int maxCount: Int
  startAt: DateTime endAt: DateTime groupPrice: Int leaderDiscount: Int status: GroupBuyStatus }
groupBuyActivities(options: GroupBuyActivityListOptions): GroupBuyActivityList!
createGroupBuyActivity(input!): GroupBuyActivity!  updateGroupBuyActivity(input!): GroupBuyActivity!
deleteGroupBuyActivity(id: ID!): Boolean!
```
14. web-admin 现无任何秒杀/拼团 CRUD 页（仅装修页「限时精选」区块配置）——F23 是纯新增：`src/apis/flashSale.ts`、`src/apis/groupBuy.ts`、`src/pages/promotion/flash-sale/{index,edit}.vue`、`src/pages/promotion/group-buy/{index,edit}.vue`、pages.json 注册、menus.ts 营销组加两项、locale 两包加文案。

**验证口径**
15. 每个 C 端 Task 收尾跑 `npm run build:h5`（在 d:\zhao\vshop），要求 0 error（warning 可接受）；web-admin Task 收尾跑 `cd web-admin; npm run build:h5` 同要求。
16. 最终交付 = 实现 + 探针复跑 + Playwright 手机截图（390×844、dpr=2，存 `web-admin/docs/superpowers/manual/usemall-parity-batch1/`）+ 操作手册（同目录 index.md）+ 提交/推送/部署（一气呵成）。

---

## Task 1: F01 物流轨迹（C 端）

**Files:**
- Modify: `d:\zhao\vshop\src\api\queries\order.ts`（加 getMyOrderTracks）
- Modify: `d:\zhao\vshop\src\pkg-user\pages\logistics.vue`（12 行壳页整页重写）
- Modify: `d:\zhao\vshop\src\pkg-order\pages\order-detail.vue`（物流区块 L12-19 加「查看物流」入口）

- [ ] **Step 1: 加 API 封装**

在 `src/api/queries/order.ts` 末尾追加（与现有 getMyOrderPackages 并列）：

```ts
export async function getMyOrderTracks(orderId: string) {
    const client = getGraphQLClient();
    const query = `query MyOrderTracks($orderId: String!) {
        myOrderTracks(orderId: $orderId) {
            id fulfillmentId trackingNo carrierCode carrierName status trackInfo signedAt lastSyncedAt
        }
    }`;
    return client.request(query, { orderId });
}
```

- [ ] **Step 2: 重写 logistics.vue**

整页替换 `src/pkg-user/pages/logistics.vue`（onLoad 取 orderId 参数；包列表 + 轨迹时间线；空态用 EmptyState）：

```vue
<template>
    <view class="logistics-page">
        <view v-if="loading" class="logistics-page__loading">
            <LoadingSkeleton :rows="4" />
        </view>
        <EmptyState v-else-if="!packages.length" text="暂无物流信息" />
        <view v-else class="logistics-page__body">
            <view v-for="pkg in packages" :key="pkg.code" class="package-card">
                <view class="package-card__head">
                    <text class="package-card__no">包裹 {{ pkg.code }}</text>
                    <text class="package-card__status">{{ statusLabel(pkg.status) }}</text>
                </view>
                <view v-if="pkg.trackingNo" class="package-card__row">
                    <text class="label">运单号</text>
                    <text class="value" selectable>{{ pkg.trackingNo }}</text>
                </view>
                <view v-if="pkg.carrierName" class="package-card__row">
                    <text class="label">承运</text>
                    <text class="value">{{ pkg.carrierName }}</text>
                </view>
                <view v-if="pkg.courierName" class="package-card__row">
                    <text class="label">配送员</text>
                    <text class="value">{{ pkg.courierName }}{{ pkg.courierPhone ? ' ' + pkg.courierPhone : '' }}</text>
                </view>
                <view class="package-card__row">
                    <text class="label">状态</text>
                    <text class="value">{{ statusLabel(pkg.status) }}{{ pkg.deliveredAt ? ' · ' + fmtTime(pkg.deliveredAt) : '' }}</text>
                </view>
                <view v-if="tracksByPkg(pkg.code).length" class="track-list">
                    <view v-for="tr in tracksByPkg(pkg.code)" :key="tr.id" class="track-item">
                        <view class="track-item__dot" />
                        <view class="track-item__body">
                            <text class="track-item__info">{{ tr.trackInfo || '包裹更新' }}</text>
                            <text class="track-item__time">{{ fmtTime(tr.signedAt || tr.lastSyncedAt) }}</text>
                        </view>
                    </view>
                </view>
                <view v-else class="track-empty">
                    <text>暂无轨迹明细</text>
                </view>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import EmptyState from '../../components/EmptyState.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
import { getMyOrderPackages, getMyOrderTracks } from '../../api/queries/order';

interface OrderPackage { code: string; status: string; trackingNo: string | null; carrierName: string | null;
    courierName: string | null; courierPhone: string | null; deliveredAt: string | null; }
interface Track { id: string; fulfillmentId: string; trackingNo: string; status: string;
    trackInfo: string | null; signedAt: string | null; lastSyncedAt: string | null; }

const orderId = ref('');
const loading = ref(true);
const packages = ref<OrderPackage[]>([]);
const tracks = ref<Track[]>([]);

function statusLabel(s: string) {
    const map: Record<string, string> = { pending: '待发货', shipped: '运输中', delivered: '已送达', cancelled: '已取消' };
    return map[s] || s;
}
function fmtTime(v: string | null) {
    if (!v) return '';
    return String(v).replace('T', ' ').slice(0, 16);
}
function tracksByPkg(code: string) {
    return tracks.value.filter((t) => packages.value.find((p) => p.code === code));
}

onLoad(async (opts) => {
    orderId.value = String(opts?.orderId || '');
    try {
        const [pkgs, trs] = await Promise.all([
            getMyOrderPackages(orderId.value),
            getMyOrderTracks(orderId.value).catch(() => []),
        ]);
        packages.value = (pkgs?.myOrderPackages || []) as OrderPackage[];
        tracks.value = (trs?.myOrderTracks || []) as Track[];
    } catch (e: any) {
        uni.showToast({ title: e?.message || '加载失败', icon: 'none' });
    } finally {
        loading.value = false;
    }
});
</script>

<style lang="scss" scoped>
.logistics-page { min-height: 100vh; background: $bg-color; padding: 24rpx; }
.package-card { background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 24rpx;
    &__head { display: flex; justify-content: space-between; margin-bottom: 16rpx; }
    &__no { font-weight: 600; }
    &__status { color: $brand-color; font-size: 24rpx; }
    &__row { display: flex; font-size: 26rpx; margin-bottom: 8rpx;
        .label { color: #999; width: 140rpx; }
        .value { color: #333; flex: 1; word-break: break-all; }
    }
}
.track-list { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid #f0f0f0; }
.track-item { display: flex; padding: 12rpx 0;
    &__dot { width: 14rpx; height: 14rpx; border-radius: 50%; background: $brand-color; margin: 10rpx 20rpx 0 6rpx; }
    &__body { flex: 1; }
    &__info { font-size: 26rpx; color: #333; display: block; }
    &__time { font-size: 22rpx; color: #999; display: block; margin-top: 4rpx; }
}
.track-empty { padding: 20rpx 0 4rpx; text-align: center; color: #999; font-size: 24rpx; }
</style>
```

注意：`tracksByPkg` 当前按订单聚合（后端 track 未带包裹关联字段时全部展示在第一个包下）；若 LogisticsTrackShop.fulfillmentId 与包裹可关联则按 fulfillmentId 过滤——执行时读 `src/api/queries/order.ts` 里 getMyOrderPackages 返回结构后决定，二选一实现，保持简单。

- [ ] **Step 3: order-detail 加入口**

在 `src/pkg-order/pages/order-detail.vue` 模板 L12-19 物流区块内（trackingNo 行之后）加：

```html
<view v-if="order.trackingCode || order.packages?.length" class="logistics-link" @tap="goLogistics">
    <text class="logistics-link__text">查看物流</text>
    <text class="logistics-link__arrow">›</text>
</view>
```

script 加（import 区与方法区各一处）：

```ts
function goLogistics() {
    uni.navigateTo({ url: `/pkg-user/pages/logistics?orderId=${order.id}` });
}
```

样式区加：

```scss
.logistics-link { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx;
    padding-top: 16rpx; border-top: 1rpx solid #f0f0f0;
    &__text { font-size: 26rpx; color: $brand-color; }
    &__arrow { color: $brand-color; font-size: 32rpx; }
}
```

（`order.packages` 若页面变量名不同，以 L100-106 实际取数变量为准接入条件。）

- [ ] **Step 4: 构建验证**

```powershell
npm run build:h5
```
Expected：0 error（warning 可接受）。

- [ ] **Step 5: 提交**

```powershell
git -C d:\zhao\vshop add src/api/queries/order.ts src/pkg-user/pages/logistics.vue src/pkg-order/pages/order-detail.vue
$msg = 'feat(c端): F01 物流轨迹页接线（myOrderTracks+包裹卡片+order-detail入口）'
[IO.File]::WriteAllText("$env:TEMP\cm_b1t1.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vshop commit -F "$env:TEMP\cm_b1t1.txt"
```

---

## Task 2: F10a 修改密码页（C 端）

**Files:**
- Create: `d:\zhao\vshop\src\api\mutations\auth.ts`（若已存在则在文件末尾追加函数）
- Create: `d:\zhao\vshop\src\pkg-user\pages\change-password.vue`
- Modify: `d:\zhao\vshop\src\pages.json`（pkg-user 段注册新页）
- Modify: `d:\zhao\vshop\src\pkg-user\pages\profile.vue`（设置项加「修改密码」入口）

- [ ] **Step 1: API 封装**

`src/api/mutations/auth.ts`（新建或追加）：

```ts
import { getGraphQLClient } from '../client';

type UpdateCustomerPasswordResult =
    | { __typename: 'Success' }
    | { __typename: 'InvalidCredentialsError'; errorCode: string; message: string }
    | { __typename: 'PasswordValidationError'; errorCode: string; message: string }
    | { __typename: 'NativeAuthStrategyError'; errorCode: string; message: string };

export async function updateCustomerPassword(currentPassword: string, newPassword: string) {
    const client = getGraphQLClient();
    const query = `mutation UpdateCustomerPassword($currentPassword: String!, $newPassword: String!) {
        updateCustomerPassword(currentPassword: $currentPassword, newPassword: $newPassword) {
            __typename
            ... on ErrorResult { errorCode message }
        }
    }`;
    const res = await client.request(query, { currentPassword, newPassword });
    return res.updateCustomerPassword as UpdateCustomerPasswordResult;
}
```

- [ ] **Step 2: 新建 change-password.vue**

```vue
<template>
    <view class="pwd-page">
        <view class="pwd-form">
            <view class="pwd-form__item">
                <text class="label">当前密码</text>
                <input v-model="current" class="input" type="password" placeholder="请输入当前密码" />
            </view>
            <view class="pwd-form__item">
                <text class="label">新密码</text>
                <input v-model="next" class="input" type="password" placeholder="至少 4 位新密码" />
            </view>
            <view class="pwd-form__item">
                <text class="label">确认新密码</text>
                <input v-model="confirm" class="input" type="password" placeholder="再次输入新密码" />
            </view>
            <button class="pwd-submit" :disabled="loading" @tap="submit">{{ loading ? '提交中…' : '确认修改' }}</button>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { updateCustomerPassword } from '../../api/mutations/auth';

const current = ref('');
const next = ref('');
const confirm = ref('');
const loading = ref(false);

async function submit() {
    if (!current.value || !next.value) {
        uni.showToast({ title: '请填写完整', icon: 'none' });
        return;
    }
    if (next.value.length < 4) {
        uni.showToast({ title: '新密码至少 4 位', icon: 'none' });
        return;
    }
    if (next.value !== confirm.value) {
        uni.showToast({ title: '两次输入的新密码不一致', icon: 'none' });
        return;
    }
    loading.value = true;
    try {
        const res = await updateCustomerPassword(current.value, next.value);
        if (res.__typename === 'Success') {
            uni.showToast({ title: '修改成功', icon: 'success' });
            setTimeout(() => uni.navigateBack(), 800);
        } else {
            uni.showToast({ title: res.message || '修改失败', icon: 'none' });
        }
    } catch (e: any) {
        uni.showToast({ title: e?.message || '修改失败', icon: 'none' });
    } finally {
        loading.value = false;
    }
}
</script>

<style lang="scss" scoped>
.pwd-page { min-height: 100vh; background: $bg-color; padding: 24rpx; }
.pwd-form { background: #fff; border-radius: $radius-md; padding: 24rpx;
    &__item { margin-bottom: 28rpx;
        .label { display: block; font-size: 26rpx; color: #666; margin-bottom: 12rpx; }
        .input { height: 80rpx; background: $bg-color; border-radius: $radius-md; padding: 0 24rpx; font-size: 28rpx; }
    }
}
.pwd-submit { background: $brand-color; color: #fff; border-radius: $radius-md; font-size: 30rpx; }
</style>
```

- [ ] **Step 3: pages.json 注册**

在 `src/pages.json` pkg-user 段（`pages/logistics` 条目附近）加：

```json
{ "path": "pages/change-password", "style": { "navigationBarTitleText": "修改密码" } }
```

- [ ] **Step 4: profile 加入口**

Read `src/pkg-user/pages/profile.vue`，在设置项列表（含退出登录等条目的区域）仿照既有项加「修改密码」行，tap 跳 `uni.navigateTo({ url: '/pkg-user/pages/change-password' })`。若该页无列表区则在页面底部（退出登录按钮上方）加一个等样式的入口行。

- [ ] **Step 5: 构建验证 + 提交**

```powershell
npm run build:h5
git -C d:\zhao\vshop add src/api/mutations/auth.ts src/pkg-user/pages/change-password.vue src/pages.json src/pkg-user/pages/profile.vue
$msg = 'feat(c端): F10a 修改密码页（updateCustomerPassword+入口）'
[IO.File]::WriteAllText("$env:TEMP\cm_b1t2.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vshop commit -F "$env:TEMP\cm_b1t2.txt"
```
Expected：build 0 error。

---

## Task 3: F10b 用户协议与隐私政策页（C 端）

**Files:**
- Create: `d:\zhao\vshop\src\pkg-user\pages\agreement.vue`
- Modify: `d:\zhao\vshop\src\pages.json`
- Modify: `d:\zhao\vshop\src\pages\login\index.vue`（L47-52 死链接线）
- Modify: `d:\zhao\vshop\src\pages\register\index.vue`（同款协议区接线，若存在）

- [ ] **Step 1: 新建 agreement.vue（单页双模式）**

```vue
<template>
    <view class="agree-page">
        <scroll-view scroll-y class="agree-page__scroll">
            <view class="agree-page__doc">
                <text class="h1">{{ isPrivacy ? '隐私政策' : '用户协议' }}</text>
                <text class="p">更新日期：2026-10-09</text>
                <template v-if="isPrivacy">
                    <text class="h2">一、我们收集的信息</text>
                    <text class="p">为完成注册与下单，我们会收集您的手机号、收货人姓名、收货地址与联系方式；微信/抖音等第三方登录时收集您授权的头像与昵称。</text>
                    <text class="h2">二、信息的使用</text>
                    <text class="p">收集的信息仅用于订单处理、物流配送、售后服务与账户安全，不用于任何与本商城交易无关的用途。</text>
                    <text class="h2">三、信息的共享</text>
                    <text class="p">仅向完成配送所必需的承运方提供收货信息；除法律法规要求外，不向其他第三方提供您的个人信息。</text>
                    <text class="h2">四、信息的存储与保护</text>
                    <text class="p">您的信息存储于我们的服务器并通过加密传输；您可在「个人中心-修改密码」维护账户安全，或联系客服注销账户。</text>
                </template>
                <template v-else>
                    <text class="h2">一、服务说明</text>
                    <text class="p">本商城为您提供商品浏览、下单购买、支付结算、售后服务等电商服务。注册即视为同意本协议。</text>
                    <text class="h2">二、账户与安全</text>
                    <text class="p">您应妥善保管账户凭据，通过账户进行的操作视为您本人行为。请勿将账户出借、转让。</text>
                    <text class="h2">三、交易规范</text>
                    <text class="p">您承诺在下单、支付、评价等环节遵守诚实信用原则；利用系统漏洞或恶意下单的，平台有权取消交易并保留追责权利。</text>
                    <text class="h2">四、售后保障</text>
                    <text class="p">商品支持按平台公示的售后政策申请退换货；具体规则以订单页与售后页展示为准。</text>
                </template>
            </view>
        </scroll-view>
    </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const isPrivacy = ref(false);
onLoad((opts) => {
    isPrivacy.value = opts?.type === 'privacy';
    uni.setNavigationBarTitle({ title: isPrivacy.value ? '隐私政策' : '用户协议' });
});
</script>

<style lang="scss" scoped>
.agree-page { height: 100vh; background: #fff;
    &__scroll { height: 100%; }
    &__doc { padding: 32rpx; display: flex; flex-direction: column; }
    .h1 { font-size: 36rpx; font-weight: 700; margin-bottom: 8rpx; }
    .h2 { font-size: 30rpx; font-weight: 600; margin: 24rpx 0 8rpx; }
    .p { font-size: 26rpx; color: #444; line-height: 1.7; margin-bottom: 8rpx; }
}
</style>
```

- [ ] **Step 2: pages.json 注册**

pkg-user 段加：

```json
{ "path": "pages/agreement", "style": { "navigationBarTitleText": "协议" } }
```

- [ ] **Step 3: login 死链接线**

`src/pages/login/index.vue` L47-52 两个 `<text class="agreement-link">` 分别加：

```html
<text class="agreement-link" @click="goAgreement('user')">{{ t('auth.userAgreement') }}</text>
<text class="agreement-link" @click="goAgreement('privacy')">{{ t('auth.privacyPolicy') }}</text>
```

script 加：

```ts
function goAgreement(type: 'user' | 'privacy') {
    uni.navigateTo({ url: `/pkg-user/pages/agreement?type=${type}` });
}
```

（主包页跳分包页：uni-app H5 与 mp 均允许 navigateTo 分包路径；若构建报分包前缀问题，把 agreement.vue 移到主包 `src/pages/agreement/index.vue` 并相应调整 pages.json 与链接 URL。）

- [ ] **Step 4: register 同步接线**

Read `src/pages/register/index.vue`，若存在同款协议区（agreement-link 无 @click）按 Step 3 同样接线。

- [ ] **Step 5: 构建验证 + 提交**

```powershell
npm run build:h5
git -C d:\zhao\vshop add src/pkg-user/pages/agreement.vue src/pages.json src/pages/login/index.vue src/pages/register/index.vue
$msg = 'feat(c端): F10b 用户协议/隐私政策页并接通登录注册死链'
[IO.File]::WriteAllText("$env:TEMP\cm_b1t3.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vshop commit -F "$env:TEMP\cm_b1t3.txt"
```
Expected：build 0 error。

---

## Task 4: F15 商品列表瀑布流（C 端）

**Files:**
- Modify: `d:\zhao\vshop\src\pkg-product\pages\list.vue`（L4-19 渲染区 + L76-77 卡片样式）

- [ ] **Step 1: 加视图模式切换与瀑布流布局**

在 `src/pkg-product/pages/list.vue`：scroll-view 上方（标题/筛选行区域内）加切换按钮；模板改双分支渲染。

模板改动（在现有筛选/标题区追加）：

```html
<view class="list-toolbar">
    <text class="list-toolbar__title">商品列表</text>
    <view class="list-toolbar__toggle" @tap="toggleView">
        <text>{{ viewMode === 'grid' ? '瀑布流' : '双列' }}</text>
    </view>
</view>
```

渲染区（原 L5-13 的 `.product-grid` 外层套 `v-if="viewMode==='grid'"`，新增瀑布流分支）：

```html
<view v-if="viewMode === 'grid'" class="product-grid">
    <!-- 原卡片结构原样保留 -->
</view>
<view v-else class="waterfall">
    <view v-for="(col, ci) in waterfallCols" :key="ci" class="waterfall__col">
        <view v-for="p in col" :key="p.id" class="waterfall-card" @tap="goDetail(p)">
            <image class="waterfall-card__img" :src="p.featuredAsset?.preview || p.thumbnail" mode="widthFix" />
            <view class="waterfall-card__body">
                <text class="waterfall-card__name">{{ p.name }}</text>
                <view class="waterfall-card__price-row">
                    <PriceTag :price="priceOf(p)" />
                    <text v-if="p.priceWithTax !== priceOf(p)" class="strike">{{ formatPrice(p.priceWithTax) }}</text>
                </view>
            </view>
        </view>
    </view>
</view>
```

script 加（import PriceTag 若未引入则引入；价格工具复用页内既有 priceOf/formatPrice 函数名——以页面现有实现为准，若无则在 script 补齐同样函数）：

```ts
const VIEW_KEY = 'product_list_view_mode';
const viewMode = ref<'grid' | 'waterfall'>(uni.getStorageSync(VIEW_KEY) || 'grid');
function toggleView() {
    viewMode.value = viewMode.value === 'grid' ? 'waterfall' : 'grid';
    uni.setStorageSync(VIEW_KEY, viewMode.value);
}
const waterfallCols = computed(() => {
    const cols: any[][] = [[], []];
    items.value.forEach((p, i) => cols[i % 2].push(p));
    return cols;
});
```

（`items` 为页面现有列表响应式数组名——以实际为准；`goDetail` 若页面已有卡片跳转函数则复用其实现。`computed` 从 vue 导入。）

样式加：

```scss
.list-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 8rpx;
    &__title { font-size: 30rpx; font-weight: 600; }
    &__toggle { font-size: 24rpx; color: $brand-color; border: 1rpx solid $brand-color;
        border-radius: 24rpx; padding: 6rpx 20rpx; }
}
.waterfall { display: flex; justify-content: space-between;
    &__col { width: calc(50% - 8rpx); }
}
.waterfall-card { background: #fff; border-radius: $radius-md; overflow: hidden; margin-bottom: 16rpx;
    &__img { width: 100%; display: block; background: #f7f7f7; }
    &__body { padding: 16rpx; }
    &__name { font-size: 26rpx; color: #333; display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; overflow: hidden; }
    &__price-row { display: flex; align-items: baseline; gap: 8rpx; margin-top: 8rpx; }
    .strike { font-size: 22rpx; color: #999; text-decoration: line-through; }
}
```

- [ ] **Step 2: 构建验证 + 提交**

```powershell
npm run build:h5
git -C d:\zhao\vshop add src/pkg-product/pages/list.vue
$msg = 'feat(c端): F15 商品列表瀑布流版式（可切换，记忆偏好）'
[IO.File]::WriteAllText("$env:TEMP\cm_b1t4.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vshop commit -F "$env:TEMP\cm_b1t4.txt"
```
Expected：build 0 error。

---

## Task 5: F17 会员权益展示补全（C 端）

**Files:**
- Modify: `d:\zhao\vshop\src\api\queries\member.ts`（加 getMyTier）
- Modify: `d:\zhao\vshop\src\pkg-user\pages\member-center.vue`（等级区改用 myTier + 权益卡）

- [ ] **Step 1: API 封装**

`src/api/queries/member.ts` 末尾追加：

```ts
export async function getMyTier() {
    const client = getGraphQLClient();
    const query = `query MyTier {
        myTier { level levelName growthValue points nextLevelThreshold nextLevelName
            pointsMultiplier redeemDiscountRate redeemCapRatio specialDiscountRate }
    }`;
    return client.request(query);
}
```

- [ ] **Step 2: member-center 接线**

`src/pkg-user/pages/member-center.vue`：
1. 取数改 `getMyTier()`（替换/并存 L62-65 的 getMyMemberInfo 调用，保留原字段消费）；
2. 在等级头部卡下方新增权益卡（模板）：

```html
<view v-if="info" class="benefit-card">
    <view class="benefit-card__title">会员权益</view>
    <view class="benefit-card__grid">
        <view class="benefit-item">
            <text class="benefit-item__value">{{ info.pointsMultiplier }}×</text>
            <text class="benefit-item__label">积分加速</text>
        </view>
        <view class="benefit-item">
            <text class="benefit-item__value">{{ discountText(info.specialDiscountRate) }}</text>
            <text class="benefit-item__label">专属折扣</text>
        </view>
        <view class="benefit-item">
            <text class="benefit-item__value">{{ discountText(info.redeemDiscountRate) }}</text>
            <text class="benefit-item__label">积分抵现</text>
        </view>
        <view class="benefit-item">
            <text class="benefit-item__value">{{ info.points }}</text>
            <text class="benefit-item__label">可用积分</text>
        </view>
    </view>
    <view class="benefit-card__note">会员价下单能力建设中，敬请期待</view>
</view>
```

script 加（info 初始化为 null，字段消费沿用既有 `info.value = mi?.myTier || {}` 改法）：

```ts
function discountText(rate?: number) {
    if (!rate) return '-';
    return rate < 1 ? `${Math.round(rate * 100) / 10} 折` : `${rate}%`;
}
```

（注：specialDiscountRate/redeemDiscountRate 的具体语义——小数折扣率或百分数——执行时读 member-level-plugin `member-level-shop.resolver.ts`/service 的实际计算逻辑确认后选择正确格式化；两条路径代码都给出，取符合实际的一条。）

样式加：

```scss
.benefit-card { background: #fff; border-radius: $radius-md; padding: 24rpx; margin-top: 16rpx;
    &__title { font-size: 28rpx; font-weight: 600; margin-bottom: 20rpx; }
    &__grid { display: flex; }
    &__note { margin-top: 20rpx; font-size: 22rpx; color: #999; text-align: center; }
}
.benefit-item { flex: 1; text-align: center;
    &__value { display: block; font-size: 32rpx; font-weight: 700; color: $brand-color; }
    &__label { display: block; font-size: 22rpx; color: #999; margin-top: 6rpx; }
}
```

- [ ] **Step 3: 构建验证 + 提交**

```powershell
npm run build:h5
git -C d:\zhao\vshop add src/api/queries/member.ts src/pkg-user/pages/member-center.vue
$msg = 'feat(c端): F17 会员中心接 myTier 并补权益卡展示'
[IO.File]::WriteAllText("$env:TEMP\cm_b1t5.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vshop commit -F "$env:TEMP\cm_b1t5.txt"
```
Expected：build 0 error。

---

## Task 6: F23 web-admin 秒杀/拼团活动管理

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\flashSale.ts`
- Create: `d:\zhao\vshop\web-admin\src\apis\groupBuy.ts`
- Create: `d:\zhao\vshop\web-admin\src\pages\promotion\flash-sale\index.vue` / `edit.vue`
- Create: `d:\zhao\vshop\web-admin\src\pages\promotion\group-buy\index.vue` / `edit.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`（注册 4 页）
- Modify: `d:\zhao\vshop\web-admin\src\constants\menus.ts`（营销组加两项）
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` + `en.json`

- [ ] **Step 1: apis 两文件（先 Read `src/apis/coupon.ts` 对齐既有 interface+函数模式）**

`src/apis/flashSale.ts`：

```ts
import { getAdminClient } from './client';

export interface FlashSaleActivity {
    id: string; name: string; startAt: string; endAt: string; flashPrice: number;
    totalStock: number; soldCount: number; limitPerUser: number; productId: string;
    variantId: string; status: 'upcoming' | 'active' | 'ended'; createdAt: string; updatedAt: string;
}

const LIST_FIELDS = `id name startAt endAt flashPrice totalStock soldCount limitPerUser
    productId variantId status createdAt updatedAt`;

export async function fetchFlashSaleActivities(take = 20, skip = 0) {
    const client = getAdminClient();
    const query = `query Fs($options: FlashSaleActivityListOptions) {
        flashSaleActivities(options: $options) { items { ${LIST_FIELDS} } totalItems }
    }`;
    const res: any = await client.request(query, { options: { take, skip } });
    return res.flashSaleActivities as { items: FlashSaleActivity[]; totalItems: number };
}

export async function createFlashSaleActivity(input: Record<string, unknown>) {
    const client = getAdminClient();
    const query = `mutation FsCreate($input: CreateFlashSaleActivityInput!) {
        createFlashSaleActivity(input: $input) { ${LIST_FIELDS} }
    }`;
    const res: any = await client.request(query, { input });
    return res.createFlashSaleActivity as FlashSaleActivity;
}

export async function updateFlashSaleActivity(input: Record<string, unknown>) {
    const client = getAdminClient();
    const query = `mutation FsUpdate($input: UpdateFlashSaleActivityInput!) {
        updateFlashSaleActivity(input: $input) { ${LIST_FIELDS} }
    }`;
    const res: any = await client.request(query, { input });
    return res.updateFlashSaleActivity as FlashSaleActivity;
}

export async function deleteFlashSaleActivity(id: string) {
    const client = getAdminClient();
    const query = `mutation FsDel($id: ID!) { deleteFlashSaleActivity(id: $id) }`;
    const res: any = await client.request(query, { id });
    return res.deleteFlashSaleActivity as boolean;
}
```

`src/apis/groupBuy.ts` 同模式（字段按 SDL：name/description/targetCount/currentCount/maxCount/status/startAt/endAt/groupPrice/leaderDiscount/leaderRewardType/autoConfirm/allowJoinAfterComplete/createdAt/updatedAt；函数 fetchGroupBuyActivities/createGroupBuyActivity/updateGroupBuyActivity/deleteGroupBuyActivity；Create 用 CreateGroupBuyActivityInput 全字段，Update 只发可更新字段）。

- [ ] **Step 2: 秒杀列表页 + 编辑页**

`src/pages/promotion/flash-sale/index.vue`（模式=抄 coupon/index.vue 卡片流）：toolbar「＋ 新建秒杀」+ `v-for` 卡片（名称、状态 chip upcoming=未开始/active=进行中/ended=已结束、时间区间、价格=flashPrice/100 元、库存 soldCount/totalStock、限购）+ 操作行（编辑、删除带 `uni.showModal` 确认）+ 手写分页（PAGE=20，onReachBottom/onPullDownRefresh）。

`src/pages/promotion/flash-sale/edit.vue`：表单字段 名称/开始时间/结束时间/秒杀价(元→分 `Math.round(yuan*100)`)/总库存/每人限购(可选)/商品 ID/变体 ID；编辑态通过 `onLoad(opts.id)` 取详情回填（列表页传 id 或整页 query），提交时新建调 create、编辑调 update。**选品**：优先复用 `pages/coupon/pick-products/index.vue` 的选品交互（Read 该页确认其返回选择结果的机制——eventChannel/getOpenerEventChannel 或 store；可通用则以「选择商品」按钮进入选品页回填 productId/variantId；不通用则表单保留 ID 输入框并在 placeholder 注明可从商品复制）。

- [ ] **Step 3: 拼团列表页 + 编辑页**

`src/pages/promotion/group-buy/index.vue`：卡片额外展示 成团进度 `currentCount/targetCount`、成团价 groupPrice/100、团长奖励 leaderRewardType 映射（discount=团长折扣/cashback=返现/free=免单）；编辑仅开放 Update 输入内字段（name/description/targetCount/maxCount/startAt/endAt/groupPrice/leaderDiscount/status），productId/variantId 等创建期字段在编辑页只读展示并注明「创建后不可修改」。
`src/pages/promotion/group-buy/edit.vue`：创建表单含全部 Create 输入（description/leaderRewardType 用 picker 三选/autoConfirm+allowJoinAfterComplete 用 switch/leaderDiscount 数字）；编辑态按可更新字段裁剪。

- [ ] **Step 4: 注册与菜单与文案**

`src/pages.json` 注册（平铺段末尾，样式照既有页面条目）：

```json
{ "path": "pages/promotion/flash-sale/index", "style": { "navigationBarTitleText": "秒杀活动" } },
{ "path": "pages/promotion/flash-sale/edit", "style": { "navigationBarTitleText": "编辑秒杀活动" } },
{ "path": "pages/promotion/group-buy/index", "style": { "navigationBarTitleText": "拼团活动" } },
{ "path": "pages/promotion/group-buy/edit", "style": { "navigationBarTitleText": "编辑拼团活动" } }
```

`src/constants/menus.ts` 营销组（`domain: 'marketing'` 组的 items，L96-105 附近）加：

```ts
{ label: 'menu.flashSale', url: '/pages/promotion/flash-sale/index' },
{ label: 'menu.groupBuy', url: '/pages/promotion/group-buy/index' },
```

（label 用法以该组现有条目为准——若现有条目是 `$t` key 则沿用 key；若是字面量则直接写「秒杀活动」「拼团活动」。）

`src/locale/zh-Hans.json` 加 `"menu": { ..., "flashSale": "秒杀活动", "groupBuy": "拼团活动" }`（merge 到既有 menu 域）；`en.json` 加 `"flashSale": "Flash Sale", "groupBuy": "Group Buy"`；页面内文案随 zh-Hans/en 两包补 key（分/元、确认删除等通用文案优先复用既有 key）。

- [ ] **Step 5: 构建验证 + 提交**

```powershell
cd d:\zhao\vshop\web-admin; npm run build:h5
git -C d:\zhao\vshop add web-admin/src/apis/flashSale.ts web-admin/src/apis/groupBuy.ts web-admin/src/pages/promotion web-admin/src/pages.json web-admin/src/constants/menus.ts web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
$msg = 'feat(web-admin): F23 秒杀/拼团活动管理页（列表+编辑+菜单+双语）'
[IO.File]::WriteAllText("$env:TEMP\cm_b1t6.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vshop commit -F "$env:TEMP\cm_b1t6.txt"
```
Expected：build 0 error。注意 `cd` 与后续命令同一 Shell 调用内用 `;` 串联时，git 命令用 `-C d:\zhao\vshop` 不受 cwd 影响。

---

## Task 7: 手机截图 + 操作手册

**Files:**
- Create: `d:\zhao\vshop\web-admin\docs\superpowers\manual\usemall-parity-batch1\index.md`（手册）
- Create: `d:\zhao\vshop\web-admin\docs\superpowers\manual\usemall-parity-batch1\*.png`（截图）

- [ ] **Step 1: 起 C 端本地服务并用 Playwright 截图**

`npm run dev:h5`（后台运行，记下本地端口，默认 5173）；后端指向生产或本地 dev-server（若 dev-server 不可用则连生产 API：dev:h5 的 VITE_API_URL 默认值以 `.env` 为准——Read `d:\zhao\vshop\.env` 确认）。Playwright 脚本（临时 py 存 `$env:TEMP`，不提交）以 **390×844、deviceScaleFactor=2** 移动视口截：

1. 登录页协议区（login，死链已变可点）
2. 用户协议页（/pkg-user/pages/agreement?type=user）
3. 隐私政策页（type=privacy）
4. 修改密码页（需先登录：用页面手机验证码流程登录后进 /pkg-user/pages/change-password；若 dev 环境有验证码旁路用 DEV_BYPASS_SMS）
5. 商品列表-瀑布流模式（切到瀑布流后截）
6. 物流轨迹页（需存在已发货订单：有则截，无则跳过并在手册注明）
7. 会员中心权益卡（登录后 /pkg-user/pages/member-center）

- [ ] **Step 2: web-admin 管理页截图**

`cd d:\zhao\vshop\web-admin; node scripts/serve-h5.mjs`（端口 5280，/admin-api 代理 localhost:3000——若本地无 dev-server，改连生产 /admin-api 或部署后对生产截）。Playwright 390×844 截：秒杀活动列表、新建秒杀表单、拼团活动列表、菜单抽屉（营销组含两新项）。

- [ ] **Step 3: 写操作手册 index.md**

结构：批次 1 范围表（5 项 × 功能说明 × 入口路径）→ 每功能操作步骤（管理端：建秒杀活动全流程截图+文字；C 端：各新页截图+文字）→ 已知边界（编辑拼团不可改商品、会员价下单为批次 2、积分抽奖/购物圈等为批次 3、F22 不适用、价格单位分）→ 探针/验证记录（build 输出摘要、探针 6 OK）。

- [ ] **Step 4: 提交**

```powershell
git -C d:\zhao\vshop add web-admin/docs/superpowers/manual/usemall-parity-batch1
$msg = 'docs(manual): 批次1 操作手册与手机截图（F01/F10/F15/F17/F23）'
[IO.File]::WriteAllText("$env:TEMP\cm_b1t7.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vshop commit -F "$env:TEMP\cm_b1t7.txt"
```

---

## Task 8: 构建部署收尾（一气呵成）

- [ ] **Step 1: 全量构建**

```powershell
cd d:\zhao\vshop; npm run build:h5
cd d:\zhao\vshop\web-admin; npm run build:h5
python d:\zhao\vshop\web-admin\scripts\_smoke_usemall_parity.py
```
Expected：两次 build 0 error；探针 6 OK。

- [ ] **Step 2: 部署 C 端 H5**

按 `docs/superpowers/plans/2026-09-30-vshop-tenant-token-gate.md` L824-841 标准命令：`tar -czf vshop-h5.tgz -C dist/build/h5 .`（PowerShell 用 `tar` 原生）→ `scp vshop-h5.tgz joho:/tmp/` → ssh 解压（目标以该文档为准：`/home/admin/vshop-h5` + 服务器部署脚本，或站点目录 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index`；解压前按脚本惯例备份）。完成后 `curl -s -o NUL -w "%{http_code}" https://e.joho.cn/` 验证 200，且新页面路由可达（curl 静态 200 即可，SPA 路由由前端处理）。

- [ ] **Step 3: 部署 web-admin**

```powershell
cd d:\zhao\vshop\web-admin; node scripts/deploy.mjs
```
Expected：脚本跑完无 error，日志显示上传+备份+reload 成功。

- [ ] **Step 4: 推送**

```powershell
git -C d:\zhao\vshop push
```

- [ ] **Step 5: 汇报**

向用户汇报：批次 1 五项交付清单 + 提交/推送/部署结果 + 手册与截图路径 + 残项说明（F17 会员价→批次 2、F23 拼团创建期字段不可改、F05/F11/F19/F20→批次 3）。
