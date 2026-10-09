# usemall → vshop 全功能对照与补齐 设计文档

日期：2026-10-09
状态：已经用户确认（口径=全功能对照；终点=直接补齐；优先级=低垂果实优先；方案=B 静态审计+生产探针）

## 1. 背景与目标

usemall（用云电商 uniCloud 模板，`d:\zhao\usemall`）readme 列出 10 组功能。vshop（uni-app 3 + Vendure 3.6.4，`d:\zhao\vshop`）已于 2026-09-24 完成《对齐 usemall 版式实施计划》（`web-admin/docs/superpowers/plans/2026-09-24-vshop-usemall-alignment-plan.md`，19 任务 97 步骤全部勾选），但该计划仅覆盖**商品与交易主链版式对齐**。

本设计目标：以 usemall **功能全集**为源清单，逐项判定 vshop 三层落地状态（Vendure 后端 shop-api / vshop C 端 / web-admin 后台），产出差距矩阵，并按低垂果实优先分批补齐。

## 2. 已核实的现状事实（写计划时直接引用，不要再猜）

- vshop C 端已有页面：主包 pages（home/category/cart/profile/login/register/landing/webview/admin）+ 分包 pkg-after-sale、pkg-order（checkout/orders/invoice*/payment/pay-result/evaluate）、pkg-product（detail/list/evaluate）、pkg-promotion（coupon-code/coupon-mall/coupons/flash-sale/group-buy/live-list/live-room）、pkg-user（addresses/balance-history/distribution/invoice-titles/logistics/member-center/my-reviews/points-history/points-mall/profile/recharge）
- Vendure 后端既有插件（与 usemall 功能相关）：distribution-plugin（分销）、checkin-plugin（签到）、member-level-plugin（会员）、eco-plugin（积分/环保）、voucher-plugin、coupon-plugin、community-plugin（社区/购物圈）、favorite-plugin、review-plugin、recharge-card-plugin、vcash-pos/offline、live-streaming-plugin、logistics-plugin、delivery-plugin
- vshop 首页模板体系：`src/pages/home/index.vue` 按 templateCode 切 DefaultHome/FreshHome/MarketplaceHome + `src/templates/shared/DynamicHome.vue` 装修 sections（banner/notice/nav/goods/richText/flash）；模板配置经 `src/stores/tenant.ts` 从 `getShopTemplate('vshop')` / `getShopGlobalConfig('vshop')` 合并
- vshop package.json 仅有 dev:h5 / build:h5 / dev:mp-weixin / build:mp-weixin / dev:app / build:app，**无 deploy 脚本**——部署方式待写计划时查证
- C 端无单测框架、i18n 运行时仅 zh-CN（但 5 语言包文件需同步）、无 codegen（手写 GraphQL 字符串）——沿用对齐计划 §0 的全部验证口径
- usemall 10 组功能源清单（readme L32-45）：0 查看物流（快递100）；1 商品海报图（生成/分享/保存）；2 钱包（充值/余额/提现）+领券中心+我的优惠券；3 分销中心（绑定/佣金返利/提现）；4 多规格SKU+注册登录隐私协议+常见问题+自定义头部+积分商城+瀑布流；5 统一UI+意见反馈+修改密码+分销商海报+二级分类筛选；6 会员中心+会员商品+开通会员+会员价下单+每日签到+积分商城+积分兑换；7 领券中心+兑换+商品领券+用券；8 购物圈（类逛逛：列表 tab+swiper、详情 swiper+video、点赞/收藏/分享/买同款）；9 积分抽奖+激励视频广告+快递费模板

## 3. 审计方法（方案 B：静态 + 探针双验证）

- **静态层**：对每个功能项盘点三层证据并附文件路径——vshop C 端（页面/组件/路由/GraphQL 调用）、Vendure 后端（插件存在性 + shop-api SDL 是否暴露）、web-admin 后台（配置/管理入口）
- **探针层**：新建 `web-admin/scripts/_smoke_usemall_parity.py`（仿既有 `_smoke_usemall_align.py` 的只读探针模式）打生产 `/shop-api`，对每个「静态判定后端已有」项做真实查询验证（如 distribution 树、checkin 配置、community feed、voucher 列表等），产出探针输出作为矩阵证据
- **判定规则（能力等价，非逐文件复制）**：
  - `已具备`：三层通或存在等价实现（附证据路径/探针输出）
  - `部分具备`：缺某一层，标明缺哪层
  - `缺失`：无对应能力
  - `不适用`：uniCloud 特有能力（如激励视频广告）或与 vshop 产品定位冲突，注明理由
- **预期初步画像（以审计结论为准）**：物流/钱包/领券/SKU/积分/会员/分销/秒杀/拼团大概率已具备；签到入口、购物圈、提现、商品海报、会员价下单、瀑布流、意见反馈/常见问题、积分抽奖、快递费模板（后台运费配置）为疑似缺口

## 4. 补齐分批规则（低垂果实优先）

- **批次 1**：后端插件已有 shop-api 能力 + web-admin 可配置，仅缺 vshop C 端入口/页面——成本最低
- **批次 2**：后端已有插件但需 shop-api 补字段/查询（Vendure src+lib 双提交，服务器 git pull + pm2 restart，不在服务器构建）
- **批次 3**：需新建后端能力（如商品海报生成、积分抽奖）
- `不适用`项存档不迁移；批次拆分在矩阵产出并经用户确认后进行
- 每批独立流程：writing-plans 出计划 → 子代理逐任务执行 → 验证三件套 → 提交/部署收尾（一气呵成）

## 5. 验证口径

- `npm run build:h5` 0 error（warn 可接受）
- 只读探针 `python web-admin/scripts/_smoke_usemall_parity.py`
- 手机截图：Playwright 390×844、dpr=2，存 `web-admin/docs/superpowers/manual/`（或 manual/<topic>/ 子目录），并入操作手册
- i18n：新增词条同步 5 个语言包（zh-CN/zh-TW/en/ja/ko），新组件用 `useI18n()` 组合式 API（无 globalInjection）
- 硬约束：分包结构不动；新公共组件放主包 `src/components/`；不动既有业务逻辑（分箱/支付合并/COD 核销/台账）

## 6. 交付物

1. 差距矩阵报告：`web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-matrix.md`（功能 × 三层状态 × 证据，含探针输出摘要）
2. 批次 1 实施计划：`web-admin/docs/superpowers/plans/2026-10-09-vshop-usemall-parity-batch1.md`（writing-plans 产物；后续批次编号递增）
3. 补齐代码 + 操作手册 + 手机截图
4. 探针脚本 `web-admin/scripts/_smoke_usemall_parity.py`

## 7. 待核实项（写批次计划时确认）

- vshop C 端 H5 产物的部署方式（仓库无 deploy 脚本）
- 微信小程序端是否随批次同步发版（涉及提审周期，默认先 H5）

## 8. 流程衔接

审计与矩阵产出为第一份实施计划（独立 writing-plans → 执行）；矩阵经用户确认后，按批次先后逐份出补齐计划。
