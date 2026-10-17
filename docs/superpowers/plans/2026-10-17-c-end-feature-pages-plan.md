# C 端功能页面补齐（子项目 1）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 vshop C 端补齐 6 项功能：独立搜索页、我的足迹、每日签到页、忘记密码、好友拼单（参团详情）、售后退货快递升级。

**Architecture:** uni-app Vue3 C 端新增 4 个页面 + 2 个 composable；vendure 后端 phone-auth-plugin 新增 1 个重置密码 mutation；公共文件（pages.json/i18n×5/各入口）由 Wiring 代理先行统一改，随后 4 个功能代理并行做纯新增/独占文件，避免冲突。

**Tech Stack:** uni-app Vue3 + pinia + GraphQL(Vendure shop-api)；后端 NestJS GraphQL plugin；vitest。

**定稿依据：** mockup 三组（2026-10-17 对话内联定稿）+ 用户三项决策：①六页定稿；②售后补快递=详情页内升级（快递公司 picker）；③忘记密码=先探后端再定。

---

## 0. 探查结论（关键事实，勿重复探索）

| 项 | 现状 | 方案 | 后端改动 |
|---|---|---|---|
| 搜索 | 无独立页；首页 usemall 版式搜索框占位跳分类页；已有 `searchProducts`（src/api/queries/product.ts:4-20）与 `SearchBar` 组件 | 新页 pkg-product/pages/search | 无 |
| 足迹 | 完全缺失 | localStorage 方案，`useBrowsingHistory`，最多 100 条 | 无 |
| 签到 | 已有 `checkinToday{checkedIn,streak,canCheckin}`、`checkin{success,points,streak}`（member.ts:39-49）；member-center 有内嵌签到卡片 | 新独立页 pkg-user/pages/sign；7 日格 = 后端 streak 推算 ∪ 本周本地补记（后端无历史查询） | 无 |
| 忘记密码 | 后端仅 `sendPhoneVerificationCode`+注册（phone-auth-plugin/src/auth.resolver.ts），**无重置密码 mutation**；前端有改密（需旧密码） | 后端新增 `resetPasswordWithPhoneCode`；前端两步流新页 pages/login/forgot-password | ✅ vendure |
| 好友拼单 | 数据模型 `GroupBuyActivity{currentCount,targetCount}` + `GroupBuyOrder`，**无团实体/成员查询**；已有 `joinGroupBuy(activityId,orderId,isLeader)`（group-buy.vue:231-259 模式） | 新页 pkg-promotion/pages/group-join：进度匿名占位（N/M），不显示昵称头像（隐私+避免后端改动） | 无 |
| 售后补快递 | detail.vue 已内嵌「单号+公司」文本填写，调 `updateReturnTracking`（api/mutations/after-sale.ts:12-15） | 公司字段升级为常用快递公司 picker + 自定义「其他」 | 无 |

**usemall 参照**（布局/交互对照，勿照抄其数据层）：d:\zhao\usemall 下 pages/home/search/search.vue、pages/login/forgot-password.vue、sub-user/pages/browsing/browsing.vue、sub-user/pages/integral/sign.vue、sub-marketing/pages/group-join.vue、sub-user/pages/order/aftersale/express.vue。

**i18n 硬规范：** 5 语言文件 src/i18n/locales/{zh-CN,en,zh-TW,ja,ko}.json 同步补齐，禁止只写 zh-CN。
**小程序硬规范：** `npm run build:mp-weixin` 必须绿；页面放分包，主包只加 forgot-password。
**手机截图硬规范：** Playwright 390×844 dpr=2，截图入 e2e-shots/ 并补 doc/使用手册.md。

---

## 1. 公共文件接线（Wiring 代理，先于功能代理串行执行）

### Task W1: pages.json 注册 4 个新页面

**Files:** Modify `src/pages.json`

- pkg-product 的 subpackage `pages` 数组追加：
```json
{ "path": "pages/search/index", "style": { "navigationBarTitleText": "搜索" } }
```
- pkg-user 追加：
```json
{ "path": "pages/browsing/index", "style": { "navigationBarTitleText": "我的足迹" } },
{ "path": "pages/sign/index", "style": { "navigationBarTitleText": "每日签到" } }
```
- pkg-promotion 追加：
```json
{ "path": "pages/group-join", "style": { "navigationBarTitleText": "好友拼单", "enablePullDownRefresh": false } }
```
- 主包 `pages` 数组（login 之后）追加：
```json
{ "path": "pages/login/forgot-password", "style": { "navigationBarTitleText": "忘记密码" } }
```

### Task W2: i18n 五语言补词条

**Files:** Modify `src/i18n/locales/zh-CN.json`（先加，其余 4 文件按同一 key 结构翻译）

key 清单（zh-CN 值；en/zh-TW/ja/ko 语义对应翻译；占位符 `{n}` `{s}` `{t}` 保留）：

```jsonc
"search": { "placeholder": "搜索商品", "btn": "搜索", "history": "搜索历史", "clearHistory": "清空", "hot": "热门搜索", "noResult": "没有找到相关商品", "hotWords": ["秋冬外套","卫衣","空气炸锅","蓝牙耳机","马克杯"] },
"browsing": { "clear": "清空", "today": "今天", "yesterday": "昨天", "earlier": "更早", "empty": "还没有浏览记录", "localTip": "足迹仅保存在本机 · 最多保留 100 条" },
"sign": { "myPoints": "我的积分", "streak": "连续签到 {n} 天", "checkinBtn": "立即签到", "checked": "今日已签到", "weekTip": "本周记录保存在本机", "pointsDetail": "积分明细", "rules": "签到规则", "rulesBody": "每日首次签到得 10 积分，连续签到越多，会员等级权益倍率越高。" },
"forgot": { "step1": "验证身份", "step2": "设置新密码", "phone": "手机号", "code": "短信验证码", "codePlaceholder": "请输入验证码", "getCode": "获取验证码", "resend": "重新获取 {s}s", "newPassword": "新密码", "newPasswordPlaceholder": "8-20 位，含字母和数字", "next": "下一步", "submit": "重置密码", "success": "密码已重置，请重新登录", "invalidPhone": "手机号格式不正确", "sendFail": "验证码发送失败，请稍后再试" },
"groupJoin": { "ongoing": "拼团中", "success": "拼团成功", "failed": "超时未成团，将自动退款", "timeLeft": "剩余 {t}", "needMore": "还差 {n} 人成团 · 成团后自动发货", "joined": "已参团 {m}/{n} 人", "join": "参与拼单", "strategy": "拼团攻略", "strategyBody": "1. 发起人或好友支付开团；2. 邀请好友参与同一拼团活动；3. 人数达标自动成团发货；4. 超时未成团自动取消并退款。", "notFound": "拼团活动不存在或已结束" },
"afterSale": { "carrierLabel": "快递公司", "carrierPlaceholder": "选择快递公司", "trackingNo": "快递单号", "submitExpress": "提交物流信息" },
"profile": { "footprints": "我的足迹" },
"login": { "forgotPassword": "忘记密码？" }
```

数组热词用 `tm('search.hotWords')` 取（不能用 `t()`）。

### Task W3: 入口接线（5 处小改）

1. **首页搜索入口** `src/templates/usemall/pages/HomeContent.vue`：搜索框点击由跳分类页改为 `uni.navigateTo({ url: '/pkg-product/pages/search/index' })`（删除「独立搜索页未上线」占位注释）。
2. **分类页搜索栏** `src/pages/category/index.vue` 顶部若有 SearchBar：点击/聚焦改为跳搜索页（带当前词作参数 `?q=`，搜索页 onInit 读取并回填触发搜索）。
3. **我的页菜单** `src/pages/profile/index.vue` 菜单数组加 `{ label: t('profile.footprints'), icon: 现有图标风格, url: '/pkg-user/pages/browsing/index' }`（插在「我的订单」组附近）。
4. **登录页** `src/pages/login/index.vue`：手机验证码登录模式表单下方加 `<text class="forgot-link" @tap="goForgot">{{ t('login.forgotPassword') }}</text>`，`goForgot = () => uni.navigateTo({ url: '/pages/login/forgot-password' })`。
5. **会员中心签到卡片** `src/pkg-user/pages/member-center.vue:49-52`：签到卡片点击改为 `uni.navigateTo({ url: '/pkg-user/pages/sign/index' })`（移除内嵌 doCheckin 调用与其状态逻辑，页面保留展示今日状态文字可调 getCheckinToday）。
6. **拼团列表入口** `src/pkg-promotion/pages/group-buy.vue` 活动卡片操作区加「邀请好友拼单」→ `uni.navigateTo({ url: '/pkg-promotion/pages/group-join?activityId=' + a.id })`。

---

## 2. WP-A：独立搜索页 + 我的足迹（代理 A）

### Task A1: useSearchHistory composable

**Files:** Create `src/composables/useSearchHistory.ts`；Test `src/composables/__tests__/useSearchHistory.spec.ts`

```ts
const KEY = 'vshop:search-history';
const MAX = 10;
export function useSearchHistory() {
    const list = ref<string[]>(uni.getStorageSync(KEY) || []);
    function add(term: string) {
        const t = term.trim(); if (!t) return;
        list.value = [t, ...list.value.filter(x => x !== t)].slice(0, MAX);
        uni.setStorageSync(KEY, list.value);
    }
    function remove(term: string) { list.value = list.value.filter(x => x !== term); uni.setStorageSync(KEY, list.value); }
    function clear() { list.value = []; uni.removeStorageSync(KEY); }
    return { list, add, remove, clear };
}
```
测试：去重置顶、上限 10、clear 后为空（mock uni.getStorageSync/setStorageSync）。

### Task A2: useBrowsingHistory composable

**Files:** Create `src/composables/useBrowsingHistory.ts`；Test 同目录 spec

```ts
export interface BrowsingItem { slug: string; id: string; name: string; price: number; image: string; ts: number; }
const KEY = 'vshop:browsing-history';
const MAX = 100;
export function useBrowsingHistory() {
    const list = ref<BrowsingItem[]>(uni.getStorageSync(KEY) || []);
    function add(item: Omit<BrowsingItem, 'ts'>) {
        list.value = [{ ...item, ts: Date.now() }, ...list.value.filter(x => x.slug !== item.slug)].slice(0, MAX);
        uni.setStorageSync(KEY, list.value);
    }
    function remove(slug: string) { /* 过滤+回写 */ }
    function clear() { /* 清空+删除 key */ }
    // 纯函数：分组（供页面与测试用）
    function groupByDay(items: BrowsingItem[]): Array<{ label: 'today'|'yesterday'|'earlier'; items: BrowsingItem[] }> { /* 按 ts 的本地日期与今天/昨天比较 */ }
    return { list, add, remove, clear, groupByDay };
}
```
测试：去重置顶、上限 100、分组边界（今天 23:59 / 昨天 00:00）。

### Task A3: 搜索页

**Files:** Create `src/pkg-product/pages/search/index.vue`

结构（对照 mockup ①）：navbar 下方搜索输入框（自动聚焦，`confirm-type=search`）+「搜索」按钮；搜索历史 chips（点=回填搜索、右上清空）；热门搜索 chips（`tm('search.hotWords')`，前 3 名带序号样式）；输入态直接展示结果列表。
逻辑：confirm/点按钮 → `history.add(term)` → `searchProducts({ term, take: 20, skip: 0, groupByProduct: true })`；结果卡（图/名/价，复用 category 页卡片字段取法）→ 跳 `/pkg-product/pages/detail?slug=`；空态 `search.noResult`；`onLoad(options.q)` 回填并自动搜索。滚动加载（skip 递增）可后置，首版 take 20 即可。

### Task A4: 足迹页

**Files:** Create `src/pkg-user/pages/browsing/index.vue`

结构（对照 mockup ②）：navbar 右上「清空」（uni.showModal 二次确认）→ `clear()`；`groupByDay(list)` 渲染今天/昨天/更早三组；商品行（56px 图、单行名、规格省略可无、价格 brand 色、右上 × 单删）→ 跳详情；空态；底部 `browsing.localTip`。

### Task A5: 详情页写入足迹

**Files:** Modify `src/pkg-product/pages/detail.vue`

onMounted（或 onShow，若页面已有商品数据加载点则在该处）追加：
```ts
const browsing = useBrowsingHistory();
watch(() => product.value, (p) => {
    if (!p) return;
    browsing.add({ slug: p.slug, id: p.id, name: p.name, price: 价格字段, image: 主图字段 });
}, { once: true });
```
（价格/主图字段以 detail.vue 现有数据结构为准，executor 现场确认字段名。）

### Task A6: 提交
```
git add src/composables/useSearchHistory.ts src/composables/useBrowsingHistory.ts src/composables/__tests__/useSearchHistory.spec.ts src/composables/__tests__/useBrowsingHistory.spec.ts src/pkg-product/pages/search/index.vue src/pkg-user/pages/browsing/index.vue src/pkg-product/pages/detail.vue
git commit -m "feat(c-end): standalone search page and local browsing history"
```

---

## 3. WP-B：每日签到页 + 售后快递升级（代理 B）

### Task B1: 本周签到格纯函数 + 测试

**Files:** Create `src/pkg-user/pages/sign/week.ts`；Test `src/pkg-user/pages/sign/week.spec.ts`

```ts
export interface DayCell { date: string; weekday: number; state: 'done'|'today'|'idle' }
const DAY_MS = 86400000;
export function localDateKey(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** checkedSet: 本地记录；streak: 后端连续天数；checkedInToday: 今日是否已签 */
export function buildWeek(now: Date, checkedSet: Set<string>, streak: number, checkedInToday: boolean): DayCell[] {
    // 周一为一周起点；推算：若 checkedInToday，则 today 起往前 streak-1 天已签；否则 yesterday 起往前 streak 天已签
    // ∪ checkedSet 本地记录；未来日= idle；today 特判 checkedInToday
}
```
测试：周一起点、跨月、streak=0/1/7、today 已签/未签四类边界。

### Task B2: 签到页

**Files:** Create `src/pkg-user/pages/sign/index.vue`

结构（对照 mockup ③）：积分卡（`getMyMemberInfo()` 取 points；streak 徽章 `sign.streak`）；7 日格（`buildWeek`，本地记录 key `vshop:checkin-week` = `Record<dateKey,true>`，加载时清理上周数据）；大按钮：`canCheckin` → `sign.checkinBtn`（点击 `doCheckin()` 成功后写本地 + 刷新 + uni.showToast(points)）；`checkedIn` → `sign.checked` 置灰；下方「积分明细 › / 签到规则 ›」（明细跳 `/pkg-user/pages/points-history`（若存在该路径，executor 确认现有积分明细页路由）；规则弹层 `sign.rulesBody`）；底部 `sign.weekTip`。未登录：跳登录（复用现有登录守卫模式，executor 参照 points-mall 页做法）。

### Task B3: 售后详情快递公司 picker

**Files:** Modify `src/pkg-after-sale/pages/detail.vue`

Create `src/pkg-after-sale/carriers.ts`：
```ts
export const CARRIERS = ['顺丰速运','圆通速递','中通快递','申通快递','韵达快递','邮政 EMS','京东物流','极兔速递','德邦快递','其他'];
```
详情页「填写退货物流」区：carrier 由文本输入改 picker（`picker mode=selector :range="carriers"`；选「其他」时追加显示自定义输入框）；提交仍用 `updateReturnTracking(reqId, trackingNo, carrier==='其他' ? 自定义值 : carrier)`；新增词条 `afterSale.*`（Wiring 已加）。保留原 Approved 态显隐逻辑不变。

### Task B4: 提交
```
git add src/pkg-user/pages/sign/ src/pkg-after-sale/carriers.ts src/pkg-after-sale/pages/detail.vue
git commit -m "feat(c-end): daily check-in page and after-sale carrier picker"
```

---

## 4. WP-C：忘记密码（前后端，代理 C）

### Task C1: 后端 mutation（vendure 仓库）

**Files:** Modify `d:\zhao\vendure\packages\phone-auth-plugin\src\auth.resolver.ts`

在 PhoneAuthResolver 末尾追加（复用类内已有 PHONE_NUMBER_RE/smsService）：

```ts
@Mutation()
@Allow(Permission.Public)
async resetPasswordWithPhoneCode(
    @Ctx() ctx: RequestContext,
    @Args('phoneNumber') phoneNumber: string,
    @Args('code') code: string,
    @Args('newPassword') newPassword: string,
): Promise<boolean> {
    if (!isAuthMethodEnabled(ctx, 'phone')) {
        throw new ForbiddenError();
    }
    if (!PHONE_NUMBER_RE.test(phoneNumber)) {
        throw new UserInputError('手机号格式不正确');
    }
    // 漏 await 会得到恒真 Promise（同 registerCustomer 内既有注释）
    const verified = await this.smsService.verifyCode(phoneNumber, code);
    if (!verified) {
        throw new UserInputError('验证码错误或已过期');
    }
    // 手机注册用户 identifier 存于 user.identifier（= 手机号，见本插件 registerCustomer）
    const user = await this.userService.getUserByIdentifier(phoneNumber);
    if (!user) {
        throw new UserInputError('账号不存在');
    }
    const result = await this.userService.setPassword(ctx, user.id, newPassword);
    if (isGraphQlErrorResult(result)) {
        throw new UserInputError(result.message || '密码不符合要求');
    }
    return true;
}
```
构造器注入补 `private userService: UserService`（import 自 @vendure/core）。
**必须先核对 vendure core 真实 API**（packages/core/src/service/services/user.service.ts）：确认 `getUserByIdentifier` 与 `setPassword` 的确切签名/是否需 ctx，按实际签名调整调用，不得凭空编造；PasswordValidationError 需映射为友好文案。

- [ ] 构建插件（本地，勿在服务器构建）：`cd d:\zhao\vendure\packages\phone-auth-plugin && npm run build`（若无独立 build 脚本则 `npx tsc -p tsconfig.json`，产物进 lib/，lib 与 src 一并提交）
- [ ] 验证 schema 出现该 mutation：`Select-String -Path lib/src/auth.resolver.js -Pattern resetPasswordWithPhoneCode`

### Task C2: 前端 API 封装

**Files:** Modify `src/api/mutations/auth.ts`

```ts
export async function resetPasswordWithPhoneCode(phoneNumber: string, code: string, newPassword: string): Promise<boolean> {
    const { data } = await authRequest(
        `mutation ResetPwd($phoneNumber: String!, $code: String!, $newPassword: String!) {
            resetPasswordWithPhoneCode(phoneNumber: $phoneNumber, code: $code, newPassword: $newPassword)
        }`,
        { phoneNumber, code, newPassword }
    );
    return data?.resetPasswordWithPhoneCode ?? false;
}
```

### Task C3: 忘记密码页

**Files:** Create `src/pages/login/forgot-password.vue`

结构（对照 mockup ④）：两步指示条（step1 验证身份 / step2 设置新密码）；step1：手机号输入 + 验证码输入 +「获取验证码」按钮（60s 本地倒计时，调 `sendPhoneVerificationCode`，禁用态显示 `forgot.resend`）；step2：新密码输入（明文切换可省）+「重置密码」按钮 → `resetPasswordWithPhoneCode` 成功 → `uni.showToast(forgot.success)` → `uni.redirectTo('/pages/login/index')`；失败 toast 后端 message。

### Task C4: 提交（vendure 仓库单独提交）
```
cd d:\zhao\vendure
git add packages/phone-auth-plugin/src/auth.resolver.ts packages/phone-auth-plugin/lib
git commit -m "feat(phone-auth-plugin): reset password with phone verification code"
```
vshop 仓库文件由主上下文收尾统一提交（与其它 WP 同批）。

---

## 5. WP-D：好友拼单参团页（代理 D）

### Task D1: 活动详情查询封装

**Files:** Modify `src/api/queries/promotion.ts` 追加

```ts
/** 按 id 取单个进行中拼团活动（复用列表接口过滤，零后端改动） */
export async function getGroupBuyActivityById(activityId: string) {
    const res = await getActiveGroupBuyActivities();
    const items = res?.activeGroupBuyActivities || [];
    return items.find((a: any) => String(a.id) === String(activityId)) || null;
}
```

### Task D2: group-join 页面

**Files:** Create `src/pkg-promotion/pages/group-join.vue`

参数：`onLoad({ activityId, q })`（q=邀请码，写 authStore.inviteCode，逻辑参照 App.vue 对 `ref` 的处理）。
结构（对照 mockup ⑤，团员位为匿名占位版）：
- 状态条：`groupJoin.ongoing/success/failed`（status 字段）+ 倒计时 `endAt` 本地每秒刷新（页面卸载清除 timer）`groupJoin.timeLeft`（HH:MM:SS）。
- 成员位：一排 `targetCount` 个圆位；前 `currentCount` 个实心（icon 人形/「已参团」，不显示昵称），余为虚线「+」；文案 `groupJoin.joined`（m=currentCount, n=targetCount）与 `groupJoin.needMore`（差值=targetCount-currentCount）。
- 商品卡：`productId/variantId` → 复用现有商品查询（product.ts 中按 id/slug 的既有函数；无则用 searchProducts 精确查）取名称/主图/价格；拼团价 `groupPrice`，单买价划线（variant price）。
- 按钮：主按钮 `groupJoin.join`（文案带 groupPrice）→ 复用 group-buy.vue:231-259 的参团模式（获取/建 active order → addToOrder(variantId, 1) → joinGroupBuy(activityId, orderId, false) → 跳结算）；未登录先跳登录。次按钮「拼团攻略」→ 弹层 `groupJoin.strategyBody`。
- `onShareAppMessage`/`useShare`：path = `/pkg-promotion/pages/group-join?activityId=${id}&ref=${inviteCode}`，标题带商品名与拼团价；图片用商品主图。
- 活动不存在/已结束 → 空态 `groupJoin.notFound`。

### Task D3: 测试 + 提交

Test：倒计时格式化纯函数（`formatRemaining(ms)` → HH:MM:SS，负数归 0）放 `src/pkg-promotion/pages/group-join/utils.ts` + spec。
```
git add src/pkg-promotion/pages/group-join.vue src/pkg-promotion/pages/group-join/utils.ts src/pkg-promotion/pages/group-join/utils.spec.ts src/api/queries/promotion.ts
git commit -m "feat(c-end): group-join detail page via share link"
```

---

## 6. WP-G：收尾（主上下文）

- [ ] 审查 4 代理 diff（逐文件核对与本计划一致性）
- [ ] vitest 全绿：`npx vitest run`（新增 4 个 spec）
- [ ] `npm run build:h5` + `npm run build:mp-weixin` 绿
- [ ] e2e 手机截图（390×844 dpr=2）：搜索页（历史+热词态）、足迹页、签到页、忘记密码页、拼单页、售后详情 picker，入 e2e-shots/
- [ ] doc/使用手册.md 补「功能页面」六小节（路径/入口/交互/截图引用）
- [ ] 提交推送：vshop 仓库（Wiring 残留 + A/B/D/C 前端文件一次收口）；vendure 仓库由代理 C 已提交、主上下文推送
- [ ] 部署：C 端 H5 本地 build → tar+scp 解压 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index/`；后端 vendure 服务器 git pull + pm2 restart（绝不在服务器构建）；部署后线上冒烟（搜索/签到接口连通）

## 明确不做
- 团成员真实头像/昵称列表（需后端新查询，隐私评审后另立项）
- 签到历史后端查询 API（本地补记方案已覆盖演示诉求）
- 搜索热词后台可配置（本期 i18n 静态词）
- web-admin 任何改动
