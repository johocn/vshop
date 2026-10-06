# waimai 扩展阶段三 3.2 满减/配送费减免验收（2026-10-07）

范围：设计文档《2026-10-06-waimai-expansion-design》阶段三 3.2——「满 X 元免配送费」全链路（门店配置 → calculator 满免出价 → 结算页减免明细）；券体系（FIXED/PERCENT/FULL/FREE_SHIPPING + grantCoupon 发放 + web-admin 券管理）此前已具备，本阶段复用不重建。
环境：**生产**（vendure campus-delivery-plugin + waimai H5 + web-admin 全部已部署，部署顺序 vendure → web-admin → waimai）。冒烟账号：`smoke-order@yourbao.cn`（Wm@Smoke123）。

## 提交清单

| 项 | vendure | waimai | web-admin |
| --- | --- | --- | --- |
| 3.2 满X免配送费 | `CampusFulfillmentConfig.freeShippingThreshold`（分，nullable，null/0=不启用）+ `campusErrandCalculator` R1/R3 满免分支（`subTotalWithTax ?? subTotal >= threshold` → price 0 + metadata `{freeShipping, originalPrice, threshold}`，R5 跑腿不参与）+ waimaiStoreList/店铺配置链路透出 + 单测 6 例（全量 138 绿） | checkout 方案A「运费行内减免明细」：达标=划线原价+¥0.00+「满¥X免配送费」标签；未达标=品牌色差价提示「满 ¥X 免配送费，再买 ¥Y 即免」；WAIMAI_STORE_LIST 加 freeShippingThreshold | 拾光达配置页「满X元免配送费（元）」字段（留空=不启用，负数校验，中英文案） |

## 验收结果

### 配置链路（web-admin → admin-api → DB → shop-api）
| 步骤 | 结果 |
| --- | --- |
| web-admin 拾光达配置 canteen-a 填 20 保存 | ✓（截图 wa-admin-freeship-config.png） |
| waimaiStoreList 回读 | canteen-a `freeShippingThreshold=2000`；canteen-b null（未配置不启用）✓ |

### calculator 满免出价（生产实证，campus-errand-smoke 方式）
| 步骤 | 结果 |
| --- | --- |
| 未达标：8×¥2.05-促销=1636 分（≥起送 1500 < 2000） | eligible 报价 **200**（¥2.00 照收）✓ |
| 达标：10×¥2.05-促销=2045 分 ≥ 2000 | eligible 报价 **0** → setOrderShippingMethod 后 `shippingWithTax=0`、shippingLine priceWithTax=0 ✓（metadata freeShipping 链路同单测） |

### 用户端 H5（390×844 dpr=2，方案A 落地样张）
- 未达标：商品总额 ¥16.36 · 运费行 **¥2.00** · 提示「**满 ¥20.00 免配送费，再买 ¥3.64 即免**」（品牌色，随差价实时计算）· 应付 ¥18.36。截图 `wa-checkout-freeship-short.png`。
- 达标：商品总额 ¥20.45 · 运费行 **~~¥2.00~~ ¥0.00 + 标签「满¥20.00免配送费」** · 差价提示消失 · 应付 ¥20.45（与商品总额一致，运费全免）。截图 `wa-checkout-freeship-on.png`。
- 边界语义：仅 R1/R3 外卖单参与（campus tab + 路由判定），R2 快递/R4 自提/R5 跑腿不显示满免明细；门槛 null/0 恒不启用（回退现状）。

### 单测
- campus-delivery-plugin 全量 **138 绿**（原 132 + 新 6：R1 达门槛 price 0 + metadata 匹配 / R1 未达标照收分区运费 / 门槛 0 与 null 不启用 / R5 跑腿不参与；waimai-store.service 负数拒绝 + 持久化回读 null）。

截图均存 `waimai/docs/screenshots/`；冒烟+截图脚本 `waimai/scripts/_smoke_freeship.py`（一键复跑：admin 配置 → API 断言 → 两态截图 → 清理草稿单）。

## 排障沉淀

1. **本 vendure fork 鉴权只认会话 cookie，Authorization Bearer 头被忽略**（API 实验三连证实：无 cookie 的 bare Bearer uid → activeOrder null；带 cookie 的新会话登录 → 可见用户级 activeOrder）。此前 3.1 截图脚本「localStorage 注入 auth_token=uid」实际一直跑在匿名会话——checkout 汇总块（v-if cart.order）从未渲染，只是当时断言未覆盖到。**正确姿势：页面上下文 `fetch` 内完成 login + 加购 + setDeliveryTarget + setOrderShippingMethod（同一会话 cookie）**，页面应用与脚本操作共享登录态。
2. **`campusSetDeliveryTarget` 读 `ctx.session.activeOrderId`**：跨会话裸调用报「购物车为空」；且运费出价在提交链路（eligible 报价 → setOrderShippingMethod）才发生，setTarget 只写 customFields——e2e 断言勿在 setTarget 后直接查 shippingWithTax。
3. **uni-app H5 组件选择器**：`<button>`/`<input>` 渲染为 `uni-button`/`uni-input` 自定义元素（class 挂外层，native input 在内部）——选择器写 `uni-button.save`、`.login-page__input input`，别写 `button.save`。
4. **SPA hash 路由 `goto` 同 URL 不触发重载**：脚本构造完订单状态后必须 `pa.reload()`，否则 onMounted 不重跑、cart.order 仍为空。
5. canteen-a 商品有既存促销（毛额 1640 → subTotal 1636）：差价提示文案按 `subTotalWithTax` 动态计算，测试断言勿写死「¥3.60」。

## 遗留（下一轮）

- 3.1 遗留照旧：i18n 业务错误透出、checkout 过期日期 chip 过滤（样张中「10-06」仍可见）、订单详情横幅与预约态并存语义。
- 满免门槛与优惠券叠加语义（FULL/FREE_SHIPPING 券与满免运费并存时的展示顺序）留待 3.3/3.4 一并评估。
- 阶段三后续：**3.4 异常赔付 → 3.3 多单合并**。
