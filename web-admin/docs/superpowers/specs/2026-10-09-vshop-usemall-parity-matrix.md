# usemall → vshop 全功能差距矩阵

日期：2026-10-09 ｜ 方法：静态三层盘点 + 生产探针（见设计文档 §3）
判定口径：已具备 / 部分具备（标明缺层）/ 缺失 / 不适用（注明理由）

| 编号 | 功能 | usemall 证据 | vshop C端 | Vendure 后端 | web-admin | 判定 | 缺口/证据 | 批次建议 |
|---|---|---|---|---|---|---|---|---|
| F01 | 查看物流（物流跟踪） | readme L33 | 待盘点 | logistics-plugin@myOrderTracks,myOrderPackages,confirmOrderReceipt（注册:是）；logistics-api-plugin 仅 admin-api（快递100，注册:条件env）；delivery-gateway-plugin 无 shop-api（注册:是） | 待盘点 | 待盘点 | 待盘点 | - |
| F02 | 商品海报图（生成/分享/保存） | readme L34 | 待盘点 | 无（全仓无海报后端插件，预期前端生成） | 待盘点 | 待盘点 | 待盘点 | - |
| F03 | 钱包-充值 | readme L35 | 待盘点 | recharge-card-plugin@createRechargeOrder,createWechatRechargePayment,redeemRechargeCard（注册:是） | 待盘点 | 待盘点 | 待盘点 | - |
| F04 | 钱包-余额与流水 | readme L35 | 待盘点 | recharge-card-plugin@myRechargeBalance,myBalanceTransactions,myRechargeOrders（注册:是） | 待盘点 | 待盘点 | 待盘点 | - |
| F05 | 钱包-提现（余额/分销佣金） | readme L35-36 | 待盘点 | distribution-plugin@requestWithdrawal,myWithdrawalRequests（注册:是）；余额提现无；settlement-plugin@requestWithdrawal（注册:否） | 待盘点 | 待盘点 | 待盘点 | - |
| F06 | 领券中心 | readme L35 | 待盘点 | coupon-plugin@couponCentre,couponCentreUpcoming,claimCoupon（注册:是）；voucher-plugin 仅到店服务券@myVouchers（注册:否） | 待盘点 | 待盘点 | 待盘点 | - |
| F07 | 我的优惠券与下单用券 | readme L35,40 | 待盘点 | coupon-plugin@myCoupons,applyCouponToOrder,clearCouponFromOrder（注册:是） | 待盘点 | 待盘点 | 待盘点 | - |
| F08 | 分销中心（绑定/佣金/分销商海报） | readme L36,38 | 待盘点 | distribution-plugin@applyDistributor,myDistributorProfile,myCommissionRecords,myTeamSummary（注册:是）；affiliate-plugin@bindAffiliate,myAffiliate（注册:否） | 待盘点 | 待盘点 | 待盘点 | - |
| F09 | 多规格 SKU 选择 | readme L37 | 待盘点 | Vendure core product variants（optionGroups/variant 价格库存原生支持，无需插件） | 待盘点 | 待盘点 | 待盘点 | - |
| F10 | 注册/登录/隐私协议/修改密码 | readme L37-38 | 待盘点 | phone-auth-plugin@sendPhoneVerificationCode,registerCustomer（注册:条件env）；wechat-auth/douyin-auth 为认证策略无独立登录 Query（注册:条件env）；core authenticate/updateCustomerPassword | 待盘点 | 待盘点 | 待盘点 | - |
| F11 | 常见问题与意见反馈 | readme L37-38 | 待盘点 | 无（全仓无 feedback/FAQ 后端） | 待盘点 | 待盘点 | 待盘点 | - |
| F12 | 自定义头部/导航 | readme L37 | 待盘点 | core Channel customFields 装修 JSON（shopContent/detailConfig/page*Config，dev-config.ts L292-312）（注册:是） | 待盘点 | 待盘点 | 待盘点 | - |
| F13 | 积分商城（兑换） | readme L37,39 | 待盘点 | member-level-plugin@redeemPoints,myMemberInfo（注册:是）＋coupon-plugin@exchangeCouponWithPoints,pointsMallTemplates（注册:是）；shop-plugin 仅为多店铺@shops 非积分 | 待盘点 | 待盘点 | 待盘点 | - |
| F14 | 积分明细 | readme L39 | 待盘点 | member-level-plugin@myPointsHistory（注册:是） | 待盘点 | 待盘点 | 待盘点 | - |
| F15 | 瀑布流商品列表 | readme L37 | 待盘点 | 无（版式为 C 端实现，core search 承担数据） | 待盘点 | 待盘点 | 待盘点 | - |
| F16 | 产品列表二级分类筛选 | readme L38 | 待盘点 | 无专用插件（core Collection/facetValue 承担筛选） | 待盘点 | 待盘点 | 待盘点 | - |
| F17 | 会员中心/开通/会员价下单 | readme L39 | 待盘点 | member-level-plugin@myMemberInfo,myTier（注册:是）；会员价计算 vcash-pos MemberPriceCalculator 仅 admin/POS 侧（注册:是） | 待盘点 | 待盘点 | 待盘点 | - |
| F18 | 每日签到 | readme L39 | 待盘点 | checkin-plugin@checkinToday,myTasks,checkin,claimTask（注册:是） | 待盘点 | 待盘点 | 待盘点 | - |
| F19 | 购物圈（社区：列表/详情/赞/藏/分享/买同款） | readme L41-43 | 待盘点 | 无（community-plugin 为社区团购@myActivities,applyLeader 且注册:否；campus-jianghu 为校园江湖任务非社交 feed） | 待盘点 | 待盘点 | 待盘点 | - |
| F20 | 积分抽奖 | readme L44 | 待盘点 | 无（全仓无 lottery/抽奖插件） | 待盘点 | 待盘点 | 待盘点 | - |
| F21 | 快递费模板（运费模板） | readme L44 | 待盘点 | logistics-plugin 包裹级 shippingFee/splitShippingCalculator（注册:是）；delivery-plugin 为骑手配送仅 admin-api（注册:是）；无运费模板管理实体 | 待盘点 | 待盘点 | 待盘点 | - |
| F22 | 积分激励视频广告 | readme L44 | 待盘点 | 无（广告为端内能力） | 待盘点 | 待盘点 | 待盘点 | - |
| F23 | 秒杀/拼团（对齐计划已覆盖，复核） | 对齐计划全文 | 待盘点 | flash-sale-plugin@activeFlashSaleActivities,applyFlashSale（注册:是）＋group-buy-plugin@activeGroupBuyActivities,groupBuyActivity,myGroupBuyOrders,joinGroupBuy（注册:是） | 待盘点 | 待盘点 | 待盘点 | - |
