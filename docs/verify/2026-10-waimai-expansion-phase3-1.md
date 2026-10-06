# waimai 扩展阶段三 3.1 预约单验收（2026-10-07）

范围：设计文档《2026-10-06-waimai-expansion-design》阶段三 3.1 预约单——下单页送达时段支持未来日期；支付后未到放量时间不进调度大厅（hallStatus='scheduled'）；到点前 30 分钟 dispatch-job 自动放量。
环境：**生产**（vendure campus-delivery-plugin + waimai H5 + web-admin 全部已部署）。冒烟账号：`smoke-order@yourbao.cn`（Wm@Smoke123）。

## 提交清单

| 项 | vendure | waimai | web-admin |
| --- | --- | --- | --- |
| 3.1 预约单 | Order customFields.scheduledFor + HallService.onOrderPlaced 闸门（距今>30min → hallStatus='scheduled'）+ releaseScheduled 放量 + dispatch-job 每 60s 扫描放量 + 商家板 scheduled 列（MerchantBoardOrder.slotText）+ 单测 | checkout 送达时段两级选择（日期 tab→时段 chip）+ 预约提示条 + order-detail 时间线预约态（收尾补：scheduled 隐藏骑手等待卡） | 商家工作台「预约单」tab（campusMerchant.tabScheduled，徽标计数+卡片） |

## 验收结果

### 后端闸门 + 放量（生产实证，订单 279 / code 8F97CQVXREKKLE9X）
| 步骤 | 结果 |
| --- | --- |
| adjustOrderLine（line 365 qty=10） | subTotal 2045 分 = ¥20.45 ≥ 起送价 ¥15 ✓ |
| campusSetDeliveryTarget（zone 2 / building 2 / R3 / slot 12） | scheduledFor=2026-10-08T03:00Z（北京 11:00-11:30）✓ |
| transitionOrderToState ArrangingPayment | ✓ |
| addPaymentToOrder（cod-payment-template） | PaymentAuthorized；DB：**hallStatus='scheduled'、hallEnteredAt 空、campusCause 空**（闸门生效，未进大厅）✓ |
| dbtool 前移 scheduledFor → now+2min | ~75s 后 tick：**hallStatus='open' + hallEnteredAt 落库**（merchantConfirmEnabled=false 直接入厅）✓ |

- 插件单测全量 132 绿；vendure 构建/提交/推送/部署完成（pm2 "vendure"，端口 3020）。
- dispatch-job 确认跑在 **server 进程内**（start(60_000) setInterval），生产无 worker 进程亦正常 tick。

### 用户端 H5（390×844 dpr=2）
- checkout：日期 chips（尽快送/今天/明天）→ 点「明天」→ 时段 chip「11:00-11:30 剩19位」→ 选中后出现提示「**预约单将在送达时段前 30 分钟自动进入配送调度**」。截图 `wa-checkout-schedule.png`。
- order-detail 预约时间线：首节点「**预约单 · 到点前30分钟自动进入调度**」active + 「送达时段：2026-10-08 11:00-11:30」；收尾修正 scheduled 态隐藏骑手等待卡（原误显「等待传信者接单…」，已重新部署并复验）。截图 `wa-order-detail-scheduled.png`。

### 商家工作台（web-admin）
- 「预约单」tab 徽标 1，卡片：8F97CQVXREKKLE9X / 东区 桂1栋 / 2026-10-08 11:00-11:30 / R3 / ×10 / ¥20.1。截图 `wa-admin-merchant-scheduled.png`。

截图均存 `waimai/docs/screenshots/`；截图脚本 `waimai/scripts/_shot_schedule.py`、链路冒烟 `waimai/scripts/_smoke_schedule.py`。

## 排障沉淀

1. **OrderProcess onTransitionStart 抛错被 i18n 怪癖吞成通用转移文案（本阶段最大坑）**：campusMinOrderProcess 抛 UserInputError「未满起送价 ¥15」→ order.service transitionToState catch → `txCtx.translate(e.message)`（i18next nsSeparator:false + fallbackLng en）缺键 → API 返回通用 `Cannot transition Order from AddingItems to ArrangingPayment`，完全掩盖业务原因，先后误导怀疑 marketplace shippingLineId 校验、FSM canTransitionTo 合并表。定位法：服务器 dist 插桩（finite-state-machine / order-state-machine 两文件加 console.error → pm2 restart → 冒烟 → 读日志 → `git checkout --` 还原）；`nextOrderStates` 查询可轻量探运行时 FSM 合并表（证明合并正常、排除闸门因素）。业务侧修法：冒烟单凑够起送价。
2. **customFields 物理列名两套写法**：order 表 customFields 列 = `customFields+字段名首字母大写+其余小写`（scheduledFor→`"customFieldsScheduledfor"`）；delivery_slot 表列 = quoted camelCase（`"slotDate"`）。混用即 column not exist。
3. **dbtool 支持多语句批量**（psql -f）：SELECT+UPDATE+SELECT 一次 run，首查询即改前留痕。
4. **H5 渠道注入最干净方式**：URL `?tenant=canteen-a-token`（tenant store resolveTenantFromUrl 优先级最高），避免 uni storage 包装格式歧义；登录态仍走 requests login + localStorage auth_token/auth_userId 注入。

## 遗留（下一轮）

- **i18n 怪癖修复**：process 抛的业务 UserInputError 被 order.service catch 翻译成通用转移错误文案（cosmetic 但严重误导排障），应原样透出业务消息。
- checkout 日期 chips 未过滤过期日期（可见昨日 10-06 时段 chip，余量>0 即显示）——建议 slotDates 过滤 slotDate ≥ today。
- 订单详情顶部状态横幅按 order.state 渲染（PaymentAuthorized→「待发货/商家正在处理」），与预约态并存；预约期间语义以时间线为准。
- 阶段三后续：**3.2 满减 → 3.4 异常赔付 → 3.3 多单合并**。
