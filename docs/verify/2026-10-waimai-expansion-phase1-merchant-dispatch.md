# 外卖扩展阶段一（商家接单/出餐端复用 web-admin + 调度中心运营页）部署与验收

日期：2026-10-07
设计文档：`waimai/docs/superpowers/specs/2026-10-06-waimai-expansion-design.md`（1.1 节，2026-10-07 变更为复用 web-admin，废弃 pkg-merchant 小程序分包方案）
范围：campus-delivery-plugin 商家确认状态机与 admin API、web-admin 商家接单工作台、配送调度中心、租户权限目录 campus 组

## 一、实现内容

### 1. 后端（vendure campus-delivery-plugin + cjk-plugin）

- **hallStatus 状态机扩展**：`pending_merchant`（待商家接单）→ `accepted`（备餐中）→ `open`（入大厅）→ `grabbed`。向后兼容：`merchantConfirmEnabled` 默认 false，未开启渠道行为完全不变（下单直接入大厅）
- **campus_fulfillment_config 新增两列**：`merchantConfirmEnabled boolean`（商家确认模式开关）、`merchantAutoOpenMinutes int`（商家超时未处理自动入厅，默认 15min，由 dispatch job 兜底，campusCause='merchant_timeout'）
- **防超卖**：商家确认模式下预约时段容量锁定（slotLock）前移至分支判断之前，两种模式都先锁位再分流
- **admin API（权限 `CampusMerchant`）**：
  - `campusMerchantBoard`：看板查询（pending/cooking/awaitingRider/delivering 四类 + completedToday/Amount；渠道隔离 = ctx.channelId；DTO 不外泄 admin 内部字段）
  - `campusMerchantAcceptOrder`：pending_merchant → accepted
  - `campusMerchantCookingDone`：accepted → open（hallEnteredAt=now）
  - `campusMerchantSetPaused`：歇业开关（只改本渠道 config.paused）
- **dispatch job 扩展**：scan 范围扩为 `hallStatus IN ('open','grabbed','pending_merchant','accepted')`；商家超时卡单兜底自动入厅
- **权限目录**：cjk-plugin `PERMISSION_CATALOG` 新增 campus 组（CampusConfig / CampusMerchant / CampusViewDispatch / CampusAuditRider），web-admin 角色管理页动态渲染可配，BUSINESS_PERMISSIONS 白名单自动派生

### 2. 前端（web-admin，Vue3 uni-app H5）

- **pages/campus/merchant.vue 商家接单工作台**：顶部统计卡（今日完成单数/金额）+ 营业开关 + 未开启确认模式提示条 + 四栏 tab（待接单/备餐中/待取货/配送中，红色 badge）+ 订单卡（code/时间/route/楼栋/时段/明细/骑手/金额 + 接单|出餐完成按钮）+ 10s 轮询 + 新单 Web Audio 三短音提示
- **pages/campus/dispatch.vue 调度中心**：告警条（可跳订单详情）+ 歇业 banner + 三列（大厅待接/进行中/在线骑手）+ 强派（ActionSheet 选骑手）/回大厅 + 10s 自动刷新 + 终态标签（`no_rider_final`→「无人接单已退款」）
- **菜单/权限**：fulfillment 域新增两入口（tier 1，perm 校验 CampusMerchant / CampusViewDispatch），语言包 zh-Hans/en 同步（campusMerchant 19 词条 + campusDispatch 25 词条）

## 二、部署记录

| 端 | 提交 | 方式 |
|---|---|---|
| vendure | d2d4bf611（campus src+lib、cjk 权限目录均在其中）| 服务器 git pull + pm2 restart（零构建） |
| web-admin | 19236c3（主体）+ bd0927e（移动端布局修复 + 截图） | scripts/deploy.mjs 本地构建 scp 解压 |

- 生产验证：服务器 DB `information_schema` 确认两新列存在；merchant 页显示「0 今日完成 / ¥0 / 营业中 / 提示条 / 配送中 badge 11」；dispatch 页显示「大厅待接 0 / 进行中 31 / 已送达 / 无人接单已退款 chip」
- 测试基线：campus 插件 106 个 vitest 全绿
- **提交说明（已知事实，无需处理）**：d2d4bf611 提交消息为「fix(rider): 提现实体 reviewedAt…」（另一活跃会话并发提交所致），实际内容包含商家端全部后端改动，文件清单已核实完整，不做 force push

## 三、操作手册

### 商家接单工作台（/pages/campus/merchant）

1. **前置配置**：管理员在拾光达履约配置开启「商家确认模式」（merchantConfirmEnabled），可调「商家自动入厅时长」（默认 15 分钟）。未开启时本页显示提示条，订单照旧直接进大厅
2. **角色授权**：在「人员管理 → 角色管理」为商家账号勾选「拾光达·商家接单」（CampusMerchant）权限，用该账号登录 e.joho.cn/guanli
3. **日常流程**：新单落「待接单」tab（badge 红点 + 提示音）→ 点「接单」→ 单据流转「备餐中」→ 备餐完成点「出餐完成」→ 单据入大厅等待骑手（调度中心可见）→ 骑手接单后「待取货」→ 取走后「配送中」→ 完成计入顶部「今日完成」统计
4. **歇业**：顶部「营业中」开关一键置为本渠道歇业（paused），调度中心同步显示歇业 banner
5. **兜底**：商家超时未接单（merchantAutoOpenMinutes）系统自动入厅，订单标记 merchant_timeout，不会丢单

### 配送调度中心（/pages/campus/dispatch）

1. **入口权限**：「拾光达·调度中心」（CampusViewDispatch）
2. **三列视图**：大厅待接（可强派骑手）/ 进行中（可改派、可回大厅）/ 在线骑手；告警条置顶展示异常单（点击跳订单详情）
3. **操作**：强派 = 点订单「强派」→ ActionSheet 选骑手；回大厅 = 骑手异常时一键退回等待重新接单
4. **移动端**：390px 视口下三列自动堆叠为单列（2026-10-07 布局修复）

## 四、测试用例

| # | 用例 | 预期 | 结果 |
|---|---|---|---|
| 1 | 未开启 merchantConfirmEnabled 渠道下单 | 行为与旧版一致：直接入大厅 hallStatus=open | ✓（线上配送中 11 单可见） |
| 2 | 开启后商家确认模式下单 | hallStatus=pending_merchant，时段容量已锁（防超卖） | ✓（单测覆盖） |
| 3 | campusMerchantBoard 渠道隔离 | 仅返回 ctx.channelId 订单，无内部字段泄漏 | ✓ |
| 4 | 接单 → 出餐完成 状态流转 | pending_merchant→accepted→open，hallEnteredAt 落库 | ✓ |
| 5 | 无 CampusMerchant 权限访问 | GraphQL 403（@Allow 校验） | ✓ |
| 6 | 商家超时未处理 | 下一轮 dispatch tick（60s）自动入厅，campusCause=merchant_timeout | ✓（单测覆盖） |
| 7 | dispatch board 兼容新状态 | pending_merchant/accepted 单落入 activeOrders 可见 | ✓ |
| 8 | 终态单标签 | no_rider_final 显示「无人接单已退款」 | ✓（线上截图实证） |
| 9 | 390px 移动端布局 | 三列单列堆叠、订单号完整、chip 不重叠 | ✓（截图实证） |
| 10 | 角色管理页权限目录 | campus 组 4 项可勾选，保存后生效 | ✓ |

## 五、手机截图（390×844，dpr=2）

- 商家接单工作台：`docs/screenshots/wa-campus-merchant.png`
- 配送调度中心：`docs/screenshots/wa-campus-dispatch.png`

复跑脚本：`web-admin/scripts/_shot_campus_ops.py`（Playwright 登录 → 两页截图）

## 六、遗留与阶段二预告

- 订单节点微信通知（2.1）依赖公众号后台申请**订单类模板消息**，请提前在公众号申请
- 骑手位置上报（2.2）依赖小程序 `wx.getLocation` **位置权限类目**开通
