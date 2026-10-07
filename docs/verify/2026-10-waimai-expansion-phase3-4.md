# waimai 扩展阶段三 3.4 异常赔付验收（2026-10-07）

范围：设计文档《2026-10-06-waimai-expansion-design》阶段三 3.4——骑手 reportException 后，admin 侧「异常处理」视图支持**赔付金额/重派/退单三选一**：赔付 = 退差价（Vendure refund）或发补偿券；重派 = 回大厅；退单 = 全额退款 + 取消订单；全部动作写 Order customFields 操作记录留痕，用户端订单详情展示处理中/已处理提示条。
版式：用户选定「A+B 融合」——告警卡内联快捷处置（退差价/补偿券页签直接内联）+ 危险操作（退单）`uni.showModal` 二次确认 + 留痕区置底。
环境：**生产**（vendure campus-delivery-plugin → web-admin → waimai 全部已本地构建部署）。冒烟账号：用户 `smoke-order@yourbao.cn`、骑手 `smoke-rider@yourbao.cn`（脚本自建+approved）、admin superadmin。

## 提交清单

| 项 | vendure | web-admin | waimai |
| --- | --- | --- | --- |
| 3.4 异常赔付 | Order customFields 6 留痕字段（`exceptionAction/exceptionCompensation/exceptionCouponTemplateId/exceptionHandledNote/exceptionHandledAt/exceptionHandledBy`，启动自动同步物理列）+ `campusHandleException` mutation（@Allow CampusViewDispatch）+ board：`exception_final` 不进调度墙、单独输出 `handledOrders` 留痕（按 handledAt 倒序取 10）、exception 告警增 `exceptionNote/exceptionPhotos` + `refundAmount`（fork 无 core RefundService → `OrderService.refundOrder`+`settleRefund`，shipping/adjustment 显式传 0，Refund SUM 幂等防超额）+ `refundAllAndCancel`（差额退+`cancelOrder`，`campusCause='exception_refund'`）+ 券服务动态 require('@vendure/coupon-plugin') + Injector 解析 + SDL 同步声明（`33a7f632d` 修复 crash loop）+ 单测 13 例（全量 **147 绿**） | 调度台异常处置卡：异常类型 chip + 骑手说明 + 存证照片 previewImage + 三页签（退差价金额输入 yuanToFen / 补偿券 picker 惰性加载 / 退单红色警示 + showModal 二次确认）+ 重派 ghost 按钮 + `campusHandleException` API 封装 + 异常处置记录留痕区置底 + 双语 32 词条（`dd3e342`） | 订单详情异常提示条（处理中黄条「骑手上报异常，平台处理中」/ 已处理绿条「异常已处理」+ 赔付结果文案 4 种）+ ORDER fragment 增 exceptionType/exceptionAction/exceptionCompensation/exceptionHandledNote + `isExceptionFinal` + exception_final 停止骑手轮询 + 单测（`e14d042`） |

## 验收结果（生产实证）

冒烟脚本 `waimai/scripts/_smoke_exception.py` 一键四路径（每路径独立建单：10×可乐鸡排饭 R3 → COD 支付 → settlePayment → 入大厅 → 强派冒烟骑手 → `campusReportException('no_recipient')` → 处置 → 断言）：

### 四路径处置断言
| 路径 | 订单 | 断言要点 | 结果 |
| --- | --- | --- | --- |
| A 退差价 | SUPKP6F6VAWSHTSV | 留痕 `exceptionAction=refund_diff`/`exceptionCompensation=50`/`handledBy=1` + `hallStatus=exception_final` + `Refund(total=50, state=Settled)` | ✓ |
| B 补偿券 | BETV4S2LL1QPH4CB | `exceptionAction=coupon`/`exceptionCouponTemplateId=80`（无可用券模板时脚本自建）+ `exception_final` + grantCoupon 成功 | ✓ |
| C 全额退单 | 1TZ6CBLMYC7FBFUS | `state=Cancelled` + `campusCause=exception_refund` + 退款 2045 分 = 实付全额 | ✓ |
| D 重派 | ET8EBBCWTL7Y3S55 | 回大厅 `hallStatus='open'` + `deliveryStatus/assignedAt` 清空 + 留痕 reassign（不置 exception_final）；随后重新强派 + 再上报 + refund_all 收尾 Cancelled（防调度自动派单/真实骑手抢单） | ✓ |

### 用户端 H5（390×844 dpr=2 样张，存 `waimai/docs/screenshots/`）
- 处理中黄条：状态头下「骑手上报异常，平台处理中 / 我们会尽快为您处理，请留意通知」（#fff7e6/#c47b00）。截图 `wa-order-exc-pending.png`。
- 已处理绿条：refund_diff → 「**平台已赔付 ¥0.50（原路退回）**」（#ecfaf1/#0a9d58）。截图 `wa-order-exc-final.png`。
- 其余文案（组件 computed，绿条同款）：coupon → 「平台已发放补偿券，可在「我的-卡券」查看」；refund_all → 「订单已全额退款」；reassign → 「平台已重新安排配送」。
- 边界语义：提示条仅校园单（campusRoute 非空）渲染；`exception_final` 后骑手轮询自动停止。

### 调度台 web-admin（样张）
- 处置卡：异常告警内联三页签（退差价/补偿券/退单），金额输入、券选择器、退单警示与 `uni.showModal` 二次确认、重派按钮；骑手说明与存证照片直接展示。截图 `wa-admin-dispatch-exc-card.png`。
- 留痕区「异常处置记录」置底：订单号 + 动作标签 + 赔付金额/券/说明 + 经手人 + 时间（倒序）。截图 `wa-admin-dispatch-handled.png`（含四条新记录 + 早前残留单）。

### 单测
- campus-delivery-plugin 全量 **147 绿**（新 13：reassign 回大厅 / refund_diff 金额留痕 / 超额拒绝 / coupon 留痕 / refund_all 取消+campusCause / board 留痕输出等）。

冒烟+截图脚本：`waimai/scripts/_smoke_exception.py`（一键复跑：admin API 登录 → 骑手准备 → 四路径建单/上报/处置/断言 → 4 张手机截图 → 清理草稿单）。

## 排障沉淀

1. **COD 模板只授权不结算**（addPaymentToOrder 后 `state=PaymentAuthorized`）：`OrderService.refundOrder` 报 `REFUND_ORDER_STATE_ERROR`——退款/退单前必须先 admin-api `settlePayment`。真实微信支付单直接 Settled 不受影响；冒烟脚本已在建单后自动结算。
2. **fork 退款语义**：无 core RefundService，走 `OrderService.refundOrder` + `settleRefund`；Refund 表 shipping/adjustment 列 NOT NULL 必须显式传 0；幂等保护 = SUM(已退) + 本次 ≤ payment.amount。
3. **SPA hash 路由同 URL goto 不重载**（3.2 沉淀 #4 复证+扩大）：处置前后两次进入同一订单详情页必须 `pa.reload()`，否则拿到旧 DOM 断言假失败。
4. admin-api `me` 返回 CurrentUser 平铺字段（`me { id }`），不是 `me { user { id } }`。
5. vendure 启动自动同步 Order customFields 物理列，无需手工 ALTER（riderLat 先例复证）；plugin 内 SDL 声明必须与 resolver 同步，否则启动 crash loop。
6. Order customFields 留痕更新必须嵌套传 `{ customFields: patch }`（嵌入式列包裹）。

## 遗留补全（2026-10-07 下午：骑手异常类型扩展 + 处置完结 push）

### 1. 骑手端异常类型扩展（H5 页内上报面板，方案 B）

`rider-delivering.vue` 一键硬编码 `no_recipient` 升级为**页内上报面板**：类型 chips + 备注 textarea + 拍照存证（复用 `takePhoto`/`uploadCustomerAsset`，上限 3 张，可删可预览）+ 提交按钮。

四类型定稿（按 `deliveryStatus` 过滤，防误报）：

| 类型 | 语义 | 可见状态 | 校验 |
| --- | --- | --- | --- |
| `merchant_issue` | 商家无法出餐 | assigned（待取货） | — |
| `no_recipient` | 联系不上收件人 | in_progress（配送中） | — |
| `food_spilled` | 餐品洒漏损坏 | in_progress（配送中） | **未拍照不可提交** |
| `other` | 其他 | assigned + in_progress | **备注必填** |

后端 `campusReportException(orderId, type, photos, note)` 签名本就通用，零改动。状态推进后重开面板自动清掉不在当前可选列表的已选类型。

### 2. 处置结果 push 通知（CampusNotifyService.exceptionHandled）

- `CampusNotifyEvent` 联合类型 + `TEMPLATE_FIELD` 增 `exceptionHandled → notifyTemplateExceptionHandled`（渠道可配模板 ID，未配置 = 静默跳过，fire-and-forget 不阻塞处置主流程）。
- `user()` 增第 4 参 `text?: string` 动态覆盖 thing1（超 20 字符自动截断）；`buildData` 同步。
- `DispatchAdminService.handleException` 构造器注入 `CampusNotifyService`，写留痕后按 action 推送：`refund_diff→异常已处理，差价原路退回` / `coupon→异常已处理，补偿券已发放` / `refund_all→订单已全额退款` / `reassign→平台已重新安排配送`（重派也通知）。
- `CampusFulfillmentConfig` 增 `notifyTemplateExceptionHandled` nullable 列 + `create-campus-tables` 幂等 ALTER；`campusStoreConfigsWithChannel` SDL/接口/逐字段赋值/视图四处同步透出。

### 3. web-admin 配置页 + 调度台标签

- 店铺配置页「节点通知模板」区增第 5 项「异常处置完结」输入框（照抄 Delivered 模式四处）；双语词条 `campusConfig.notifyExceptionHandled`。
- 调度台异常卡类型标签映射补 `food_spilled/merchant_issue/other`（双语 `campusDispatch.excType*`）。

### 4. 冒烟扩展 + 截图（全 PASS，生产实证）

`_smoke_exception.py` 扩展（本轮冒烟订单：A `YAYR788XNAV1AXX1` / B `A3H6EL9ZC5M5HX3W` / C `ML7MESFEPUHGE5NJ` / D `EP9YK9CGH4HEX5RA` / E `65GCZQELX8NA9L6M`）：

- **B 路径升级 food_spilled + 拍照存证**：骑手会话 graphql-upload multipart 真实上传 1×1 PNG（`uploadCustomerAsset`）→ 上报带 photos → 断言 `customFields.exceptionPhotos` 落库 + 调度墙 `alerts[].exceptionPhotos` 透出 → 处置卡截图（A/B 双卡同墙，B 卡带存证照片）。
- **E 路径（新增）骑手面板 UI 验证**：H5 登录页真实登录（账号登录表单）→ redirect 任务卡渲染 → 点「异常上报」断言 assigned chips = 商家无法出餐/其他（且**无**联系不上收件人）→ 截图；API 代劳 `campusStartTask` → UI 8s 轮询带出 in_progress → 再开面板断言 chips = 联系不上收件人/餐品洒漏损坏/其他 → 截图；收尾 refund_all。
- 处置完结 push 服务端链路：6 次处置全部命中新部署 `handleException`（pm2 日志 `Order X exception handled: <action>` ×6）；冒烟渠道未配置 `notifyTemplateExceptionHandled` → 设计语义静默跳过（Logger.debug），调用断言由单测覆盖。

截图（390×844 dpr=2，存 `waimai/docs/screenshots/`）：
- `wa-rider-exc-panel-assigned.png`：待取货态面板（商家无法出餐/其他 chips；登录成功 toast 残留在画面上，面板主体不受影响）
- `wa-rider-exc-panel-inprogress.png`：配送中态面板（联系不上收件人/餐品洒漏损坏/其他 三 chips）
- `wa-admin-dispatch-exc-card.png`：调度台异常卡（B 单带存证照片缩略图）

### 5. 单测

campus-delivery-plugin 全量 **149 绿**（+2：`handleException` 后 `notify.user` 按 action 带正确文案断言（coupon/refund_diff）、`exceptionHandled` 动态文案覆盖 thing1；spec 构造器同步注入 notify mock）。

## 排障沉淀（本轮新增）

7. **骑手 H5 截图不能靠 localStorage 注入 token**：任务页 `onShow` 无 token 即 `redirectTo` 登录页，hash 路由同 URL goto 不重载、追加 query 强制刷新后 restoreSession 时序仍不稳——正解走**登录页 UI 真实登录**（`.login-page__submit:not([disabled])` 定位提交钮），登录成功自动 redirect 回任务页。
8. **页内面板开合的 toggle 陷阱**：面板开着时 UI 轮询 refresh 重渲染不清状态，第二次 `click(异常上报)` 会把面板**关掉**——两次展开截图之间必须先点一次收起。
9. UI 按钮点击推进状态（如「我已到店·开始取货」）受 toast/轮询竞态影响不稳定，冒烟中**状态推进一律 API 代劳**，UI 只验证展示与面板交互。

## 3.3 多单顺路合并验收（2026-10-07，阶段三收官）

设计：不建独立路线实体——调度/强派/退款/异常全以 Order 为中心，独立实体需双写状态同步不成比例。**routeGroupId 方案**：Order customFields 新增 `routeGroupId`（string nullable，启动自动建列），路线组 = 同 gid 的单集合，前端/调度台纯聚合。

### 实现

| 端 | 内容 |
| --- | --- |
| vendure | ① 调度 job **T1.5 打包**（scan() 内 T2 前）：同渠道 `hallStatus=open` 的 R1/R3 配送单（errand 不参与），按 `buildingId+deliverySlotId` 分桶；无 slot 即时单按 `hallEnteredAt` 升序相邻差 ≤10min 聚类；每批 ≥2 单写同一 gid（`rg-{ts}-{rand6}`），批内已有 gid 复用不重生成。② `grab()` **整组抢单**：主单锁内加载后，同 gid open 单按 id ASC 悲观锁一并写同骑手（加锁顺序一致防 PG 死锁）；组内骑手自己的单跳过留大厅；逐单 notify riderAssigned。③ 零改动：T2 强派逐单 grabByRider 同轮同组天然同骑手；T1 超时回厅/转单/异常/退款单单语义，回厅清指派即自然脱组；分成每单独立 (shipping+tip)×rate |
| waimai | 骑手任务页多任务化（**方案 A 组卡聚合**，用户选定）：任务列表 ref；组卡 = 组头（楼栋 + 「路线任务 · N 单」badge）+ gmeta（期望时段 + 已送达 x/y + 催单警示）+ 子单行（✓圆圈仅配送中可勾选、点行展开开始取货/单独送达/转单/异常上报）+ 组级主按钮（整组待取货→「开始取货（N 单）」；配送中→「送达勾选的 N 单 · 拍照存证」，批量送达一次拍照逐单调 deliver）；报告位置对全部活动单循环上报；大厅 rider-home 加「顺路 N 单」badge（同 gid open 单数） |
| web-admin | 调度台大厅/进行中订单卡「顺路 N 单」badge + 双语词条；**踩坑修复**：`DISPATCH_ORDER_FIELDS` gql 选择集漏 routeGroupId 致 badge 不渲染 |

单测 campus-delivery-plugin 全量 **161 绿**（新 12：打包 5 + 整组抢单 3 + exitHall 取消脱厅 4）。

### 冒烟（生产实证，`waimai/scripts/_smoke_route_group.py` 一键复跑）

A/B 两单（同楼栋桂1栋 R3 即时单）→ 3s 打包同 gid → 调度台/骑手大厅 badge → UI 抢单一次整组接走（两单 assigned 同 deliveryStaffId=150、hall=grabbed）→ 批量开始 → 勾选 2 子单 →「送达勾选的 2 单」→ 送达 A 组进度「已送达 1/2」→ 送达 B 组卡离场 → riderEarning 写入（本店 shipping=0 → 分成 0 合法，0 分成单跳过入账为既定设计）。

截图（390×844 dpr=2，`waimai/docs/screenshots/`）：`wa-admin-dispatch-route-badge.png` / `wa-rider-hall-route-badge.png` / `wa-rider-task-group.png`（组卡全景）/ `wa-rider-task-group-checked.png` / `wa-rider-task-group-delivered.png`。样张中下方历史组卡为冒烟多轮运行残留。

### 冒烟迭代踩坑沉淀（7 轮）

10. **TypeORM `setLock('pessimistic_write', undefined, tables)` 的 lockTables 原样 join 不加引号**（`" OF " + tables.join(", ")`），别名 `order` 是 PG 保留字 → `syntax error at or near "order"`；单测 mock QueryBuilder 测不出，生产实测暴露。单表查询直接 `setLock('pessimistic_write')`（FOR UPDATE 语义等价）修复；find-options 路径 `lock.tables` 会正确解析别名不受影响。
11. 抢单响应/送达响应返回**更新前加载的旧实体快照**（deliveryStatus 仍是旧值），落库断言必须回查 admin order。
12. 骑手大厅页需先点「接单中」开关上线才拉取列表；大厅排序加急置顶（滞留 >5min），UI 抢单必须按单号定位卡片，不能 `.grab first`。
13. 骑手上线后 T2 强派会把滞留单派给冒烟骑手——多轮冒烟残留任务卡在任务页，断言必须**以目标单所在组卡为作用域**（`.task-card.group` filter hasText 单号），不能 body 级全文匹配。
14. 本店测试渠道配送费为 0（shippingWithTax=0）→ 分成 0 合法（deliver 写 earning=0 且跳过 RiderEarning 记录）。

### 复跑冒烟收口（2026-10-07 下午：修复 1 真缺陷 + 1 数据伪影，第 5 轮 PASS）

**缺陷：取消订单不脱厅（真缺陷，已修复）**——复跑清场取消 4 张残留单后，已 `Cancelled` 订单仍挂骑手大厅（badge 累计「顺路 6 单」）、新单 T1.5 打包继续复用同 gid、骑手可抢已取消单。根因：`hallStatus` 是全链路过滤键（大厅/打包/整组抢单/调度台），但取消路径无人清它。修复（vendure `b8cb0c058`）：`HallService.exitHall`（读 DB 当前 hallStatus，仅流转态 open/pending_merchant/accepted/scheduled/grabbed 清为 `cancelled`；grabbed 连带清指派字段防任务卡残留；**不碰 T4 `no_rider_final` 防竞态覆盖**）+ plugin.ts 既有 `OrderStateTransitionEvent` 订阅追加 `toState === 'Cancelled'` 分支 + 单测 4 例。生产实证：cancelOrder 后日志 `exited hall (open → cancelled)`、DB hallStatus=cancelled、新单打包不再并入取消单。

**数据伪影：骑手信用分被残留单循环扣穿**——修复后第 4 轮 UI 抢单仍失败（停留大厅），API 探针实锤 `campusGrabOrder → FORBIDDEN "not currently authorized"`：`assertApprovedRider` 对 `riderCredit < 60` 抛 ForbiddenError，冒烟骑手信用分已被扣到 28。扣分源 = 历史冒烟残留 grabbed 单（10-05/10-06 遗留 19 张）：T3 扫描 assigned 超 15min → 回大厅 + `timeout_not_picked` -10 → 回到 open 后 T2 又强派给在线冒烟骑手 → 再超时再扣……**循环放血直到跌破抢单门槛**。处置：SQL 清残留 20 张（hallStatus=cancelled + 清指派字段）+ 信用分复位 100（测试骑手，扣分均为冒烟伪影）→ 第 5 轮冒烟全 PASS（A=CDF4KNTRVH3T7DQG B=RRU9VTTBAECNNF17 组 rg-1791349084682-890of2）。教训：**冒烟残留单必须清到终态**（delivered/cancelled），中途态（open/grabbed）会被调度 job 持续再消费；UI 抢单失败先查信用分门槛，不要盲试时序。

### 运维事件（本轮发生，已处置 + 遗留）

冒烟期间服务器全局 OOM：**strapi 每次重启都会拉起 playwright chrome-headless**（total-vm 55GB），1.8GB 内存主机被打爆 → 内核 OOM killer 连杀 node → vendure/strapi 双双崩溃循环（~50s 一轮）、shop-api/admin-api 502。处置：`pm2 stop strapi` 后 chrome 清空、vendure 稳定。

**已根治（2026-10-07 下午）**：根因 = zhao-wealth 插件 bootstrap 里 eager `initBrowser()`（服务器无系统 Chrome → playwright 自带 chromium_headless_shell-1228，dmesg 实锤全局 OOM）。按方案 A 落地：browser-manager 上移 zhao-common 共享服务（**惰性启动** + 并发闸 `PLAYWRIGHT_MAX_PAGES` 默认 2 + 空闲回收 `PLAYWRIGHT_IDLE_CLOSE_MS` 默认 10min + 内存守门 `PLAYWRIGHT_MIN_FREE_MB` 默认 500（不足则优雅跳过当日采集）+ 每任务独立 BrowserContext/storageState 隔离），zhao-wealth 的 playwright-manager 改薄网关（collectors/单测零改动），strapi 提交 `8198ecd913`。服务器内存同步扩容：+2G swapfile2（fstab nofail，共 4G swap）、`vm.swappiness=80`（/etc/sysctl.d/99-memory-tuning.conf）、pgAdmin 彻底卸载（曾烧满 1 核 CPU + 白占 112MB）。复启验证：240s `/_health` 全 204、chrome 进程 0、strapi RSS 362MB、vendure/nshop 未受影响。经验教训：swap 救不了启动期突发分配（落盘 15MB/s 跟不上 400MB/14s），物理余量才是关键；**严禁任何插件 bootstrap eager 启动浏览器**。

## 遗留（下一轮）

- 阶段三 3.3 已收官，**阶段三全部完成**。
- ~~服务器 strapi 停机待排查~~ **已根治**（2026-10-07：方案 A 移除 eager 启动 + 服务器内存扩容，见 3.3 运维事件），strapi/vendure 均稳定在线；复跑冒烟第 5 轮全 PASS（期间修复取消脱厅缺陷 + 清理信用分循环扣分残留，见「复跑冒烟收口」）。
