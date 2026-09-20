# POS 电子小票 - 设计

**目标页面**：`src/pages/pos/index.vue`

**背景**：门店收银确认收款完成后，目前仅 toast 提示，无凭据留存/分享，商户期望给顾客一张电子小票。

**需求**
1. 收款成功（`claimRedemption(collect=true)` 后 `rr.ok && claimed`）时，弹出小票结果卡：
   - 门店/渠道名、订单号 `code`、收款方式（固定聚合码收款）、应付金额、商品明细（name×qty、小计）、实收总额、收款时间。
   - 按钮「复制小票」：将上文拼成纯文本写入剪贴板并 toast。
   - 按钮「完成」：关闭并 reset。
2. 收款时间取 `dateTime` 本地格式化（复用 `utils/csv#fmtDateTime` 风格）。

**架构**：页面内自包含；小票为一纯字符串/展示对象，不落库（台账已有 `settleLedger` 归集）。

**数据流**：claimRedemption 成功 → `buildReceipt()` 组装 → 展示 modal/card → 复制或关闭。

**错误处理**：复制失败 toast；无 lines 显示「无商品明细」。

**测试**：build:h5；手机视口截图 收款成功小票卡（用 mock 结果渲染预览以可复现）。