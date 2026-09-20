# POS 上线 · Plan 3：web-admin 加 POS 收银入口 + 主流程验收 - 设计

**目标仓库**：`d:\zhao\vshop\web-admin`（uni-app H5 多租户管理后台）
**背景**：POS 后端（Plan 1）与桌面 POS 前端（Plan 2）就绪后，需在 web-admin 提供「门店收银 POS」入口，并对收银主流程做线上回归。

**需求**
1. **入口**：在 web-admin 菜单/工作台新增「门店收银 POS」入口，跳转到在线桌面 POS（同域路径）。
   - 现有 `src/pages/pos/index.vue` 是移动端「核销提现」轻量页，保留不动；新增的是指向桌面 POS 电脑版的独立入口（新增一个菜单项或工作台卡片），二者不冲突。
   - 跳转方式：`window.location.href`（或 uni 外部跳转）携同域相对路径打开桌面 POS；因同 origin，POS 自动读取共享 localStorage 令牌，无需传 token。
2. **主流程回归（功能不变）**：在共享后端数据下验收 Cashier 收银 / Checkout 结账 / Shift 交班 / Refund 退款 / Promotion 促销（满减/折扣/买赠，scope=collection 按现状存而不检）/ Report 报表（todayOverview/sales/monthly/topProducts）。
3. **截图补手册**：电脑版取桌面视口截图；web-admin 入口本身按移动视口截图，纳入操作手册。

**架构**：web-admin 侧仅新增入口导航；POS 桌面页为独立部署的 SPA，二者同域共享令牌，通过 URL 跳转衔接。

**数据流**：web-admin（已登录 + 已选店）→ 点击入口 → 同域打开桌面 POS → POS 读共享 token/channel 直连共享 admin-api → 完成收银全流程。

**错误处理**：
- 未登录/未选店时进入入口 → 提示回登录/选店。
- 桌面 POS 页面与移动端 pos 页路径不同，避免路由覆盖。

**测试**：web-admin 入口移动端截图；POS 电脑版各主流程截图 + API/e2e 回归（建单-结账-交班-退款-促销-报表各至少一条）；无 schema 冲突、实收/台账/订单落库一致。