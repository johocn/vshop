# 校园配送 Plan 3（时段容量 + T0-T4 降级阶梯 + R5 跑腿链路）部署与冒烟验收

日期：2026-10-05
范围：vendure campus-delivery-plugin（DeliverySlot 时段容量/乐观锁防超卖、T0 运力预检、T1 置顶、T2 自动强派 job、骑手信用分与拒单、T3 调度看板手动派单改派、T4 自动退款补偿、R5 跑腿单完整链路、R2 到校确认标记）
生产：e.joho.cn admin-api / shop-api（vendure pm2，端口 3020）

## 部署记录

- vendure master：campus 插件共 7 个修复 commit（a439e8a77 → 9fabc9984）+ plan3 主体（Task 0-10：5357c76a2 / 45adf7c23 / 29245548 / d2de0fc8b）
- 服务器零构建：git pull + node_modules/@vendure/campus-delivery-plugin symlink（root 与 dev-server 两处，plan1 已建）+ pm2 restart（cwd=/www/apps/vendure/packages/dev-server）
- 测试基线：45/45（campus 插件 vitest，新增 DeliverySlot/信用分/强派/退款/跑腿/R2 标记/分配策略/幂等用例）

## 本轮部署中发现并修复的四个生产缺陷

1. **跑腿单运费线消失（孤儿线）**：cjk-plugin 将全局 ShippingLineAssignmentStrategy 覆盖为 BoxShippingLineAssignmentStrategy（按配送档案分箱）。跑腿 0 元载体变体（CAMPUS-ERRAND-BASE）无档案绑定 → 回退租户默认档案 → 档案允许方法不含跑腿方式 → 策略返回 [] → setShippingMethods 的 assignment UPDATE 落空（WHERE 0=1）→ order_line.shippingLineId 不落库 → OrderService.save 级联 diff 把 INSERT 成功的 shipping_line 解绑（orderId=NULL）。**修复**：campus 插件注册 CampusErrandShippingLineAssignmentStrategy 包装策略（errand 单全量分配，其余委托原策略，init 转发）——campus 在 dev-config 插件数组中位于 CjkPlugin 之后，configuration 钩子后执行（a439e8a77）
2. **campusSetErrandInfo 小费 surcharge 不幂等**：同单重复设置（改小费/改地址）叠加多条「跑腿小费」计费。**修复**：清旧补新（按描述识别，tip=0 只清不加）（c8fd2808d）
3. **T2/T4 dispatch job 三连修**：① refundOrder input 补 shipping=0 / adjustment=0（fork refund 表两列 NOT NULL，payment.service createRefund 透传）② tick ctx 必须查完整 Channel（含 defaultTaxZone）——手工 new Channel({id}) 在订单重算价时报 error.no-active-tax-zone ③ 幂等重试：上轮退款成功但 transition 失败的残留单，跳过 refundOrder 只做取消（4cfe997d7 / 0b354a6eb / aa94f69cb / 828a20162）
4. **T4 取消被静默拒绝**：transitionToState(Cancelled) 在默认 checkAllItemsBeforeCancel 下因订单行未取消返回 ErrorResult（不抛异常），代码未检查 → 静默跳过。**修复**：改用 orderService.cancelOrder（内部完成行取消+状态转换），并对返回值做 errorCode 检查（9fabc9984）

## 冒烟结果（13 段全过）

复跑脚本：`e:\zhao\vshop\.secrets\campus-smoke3.cjs`（段1-4：槽位/载体/运费/支付）、`campus-smoke4.cjs`（段5-8：强派前置）、`campus-smoke4b.cjs`（段9-13：拒单→退款→看板→还原）、`campus-smoke-surcharge.cjs`（surcharge 幂等）。dispatch tick 间隔 60s，强派/退款需等待 1-2 轮 tick（脚本 sleep 70s/150s）。

| # | 步骤 | 结果 |
|---|---|---|
| 1 | campusCreateSlot（明天 11:00-11:30 容量2） | ✓ id=6 |
| 2 | campusEnsureErrandProducts ×2 幂等 | ✓ 同 variantId |
| 3 | 跑腿 ShippingMethod 幂等化（查已有则复用） | ✓ method 35 |
| 4 | 载体加购→setErrandInfo→运费 200→ArrangingPayment→COD 支付→进大厅 | ✓ hallStatus=open, fulfillmentRoute=R5 |
| 4' | surcharge 幂等：tip 100→200→0→150 连续设置 | ✓ 最终只留 1 条 150 |
| 5 | campusUpdateConfig(autoAssign=1, autoRefund=1) | ✓ 热更即时生效 |
| 6 | 新 errand 单支付进大厅 | ✓ orderId=224, hallEnteredAt 落库 |
| 7 | 骑手注册→applyRider→审核 approved→riderOnline | ✓ rider 142 |
| 8 | T2 强派（70s 后） | ✓ auto-assigned to rider 142（tick 日志实证） |
| 9 | campusRejectAssignment → 回大厅 + 信用分 | ✓ riderCredit 100→95, hallStatus=open, deliveryStatus 清空 |
| 10 | campusRiderOnline(false) | ✓ |
| 11 | T4 自动退款（150s 后） | ✓ state=Cancelled + campusCause=no_rider + hallStatus=no_rider_final + refund 300 Settled |
| 12 | campusDispatchBoard | ✓ paused/alerts/hall/active/riders 结构完整 |
| 13 | 配置还原（autoAssign=10, autoRefund=30） | ✓ |

## 关键运维事实

- **COD（cash-on-delivery）支付的单无法自动全额退款闭环**：payment 停在 PaymentAuthorized（未 settle）时 refundOrder 报 REFUND_ORDER_STATE_ERROR；T4 走降级 mark（campusCause=no_rider + hallStatus=no_rider_final）留人工。要验证退款主链路需先 admin transitionPaymentToState(Settled)。线上已实证两条路径（216 降级 / 224 主链路）
- dispatch tick 默认 60s 间隔（dispatch-job.service start(60_000)），autoAssignMinutes/autoRefundMinutes 语义为「到期后的下一轮 tick 生效」，端到端延迟最长 = 阈值 + 60s
- cjk 配送档案系统（shipping_profile）与 campus 跑腿方式解耦：跑腿方式无需挂档案，由包装策略全量分配
- refund 表（fork 定制）shipping/adjustment 列 NOT NULL——任何插件调 refundOrder 必须显式传 0
- 排查手段沉淀：dev-config `SQL_LOG=1`（+显式 logger: 'simple-console'）可绕过 TypeOrmLogger 的 vendure Logger.debug 生产滤除，直出 SQL；dist 插 console.log（.bak_dbg 备份）可拿策略运行时返回值

## 测试残留清理

- 孤儿 shipping_line 全清（10 条本次 + 历史挂 method 1/9/30/34 的 48 条保留为历史证据未动）
- 重复 method 36 已删（保留 35 唯一）；探针单 222 已清行
- 探针用户 campus-probe-*/campus-rider-*（test.local）留存：rider 142 credit=95 为拒单扣分实证
- 服务器调试桩已全部还原：order-modifier.js（diff 空）、typeorm 0.3.31（.pnpm 实体目录回滚）、SQL_LOG=0、.bak 与 /tmp 脚本已删
