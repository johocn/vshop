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

## 遗留（下一轮）

- 骑手端异常类型目前仅 `no_recipient`（联系不上收件人），餐损/超时等类型待骑手端扩展后与处置文案联动。
- 处置结果通知（用户/骑手 push，复用 CampusNotifyService 模板）未接，当前靠用户主动查看订单详情横幅。
- 阶段三收尾：**3.3 多单合并**（最后一项）。
