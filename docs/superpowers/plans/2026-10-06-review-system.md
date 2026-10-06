# 评价系统 Implementation Plan（三期 #1）

**Goal:** 打通 waimai 评价闭环：订单完成 → 评价（先审后显）→ 店铺评论 tab 展示 → web-admin 审核/回复。复用 `@vendure/review-plugin`（生产已启用，`ReviewPlugin.init()` 无参 = autoApprove:false）。

**定稿决策（2026-10-06 用户拍板）：** 创建页 A 经典分节 / 评论 tab A 摘要卡 / 先审后显（pending→approve）。

## 后端 review-plugin（唯一缺口：店铺级查询）

- `ReviewListOptions` 加 `hasImages?: boolean`（C 端有图筛选）。
- 新 shop query `channelReviews(options)`：ctx.channelId 过滤 + `status=approved` + `parentId IS NULL` + ratingMin/ratingMax/hasImages，分页。Review 实体已有 `channelId` 列 + `channels` 关系（listQueryBuilder channelId 参数即可）。
- 新 shop query `channelReviewStats`：当前渠道全店统计（totalCount/goodRate/averageRating/ratingDistribution/topTags）。
- service：`getChannelReviews` / `getChannelReviewStats`；单测覆盖 hasImages 过滤、channel 隔离、approved+主评约束。
- SDL：shop `ReviewListOptions` 加 hasImages；新 Query 两个；`ChannelReviewStats` 复用 `ReviewStats` 类型。

## waimai C 端（uni-app）

- `api/queries/reviews.ts`：`channelReviews`（分页 options）/`channelReviewStats`/`productReviews`/`myReviews`；`api/mutations/reviews.ts`：`createReview`/`deleteReview`。
- `pkg-order/pages/review-create.vue`（A 版式）：参数 `productId, orderLineId, variantId, title, thumb`；五星（默认 5）+标签 chips（口味赞/分量足/配送快/包装好，可多选）+内容 textarea（必填）+ImageUpload（复用组件，≤3 图）+匿名 switch；提交成功 → back + toast。重复评价走后端报错 toast。
- `pkg-order/pages/my-reviews.vue`：`myReviews` 列表（星+内容+图+状态标签 pending/approved/rejected）+ 删除确认；入口：profile 页。
- `pages/shop/menu.vue` 评论 tab（A 版式）：摘要卡（大均分+条数+5 档分布条+好评率）+ chips（全部/有图/好评=ratingMin4/差评=ratingMax3）+ 评论列表（头像圈=昵称首字/匿名、星+标签、内容、图缩略、商家回复气泡）+ 触底加载更多 + 空态保留。
- 商品卡评分角标：菜单商品 query 补 `customFields { reviewRating reviewCount }`（review-plugin 已注册 Product customFields，shop-api schema 自动透出）；有评价时星+分数，无则不渲染。
- `pkg-order/pages/order-detail.vue`：「去评价」→ `navigateTo review-create`（带商品行参数）。
- pages.json 注册 2 新页；i18n zh/en 全词条。

## web-admin

- `apis/review.ts`：`reviews(options)`/`replyReview`/`approveReview`/`rejectReview`。
- `pages/review/index.vue`：status chips（pending 默认/approved/rejected）+ 列表卡（客户/商品 id/星/内容/图/回复）+ 操作按钮 + 分页；菜单入口（pages.json + 菜单组件参照 campus 页注册方式）。
- i18n zh/en。

## 部署与验证（收口铁律）

1. review-plugin 单测全绿 + `npm run build`（lib 产物 git 跟踪）。
2. vendure 提交推送 → ssh joho `git pull && pm2 restart vendure`。
3. E2E 冒烟（参照 campus-r2r4-profile-verify.cjs 模式）：冒烟订单走 R4 → 支付态流转至 Delivered → createReview（断言 pending、myReviews 可见）→ admin approve → productReviews/channelReviews 可见 + reviewStats 正确 → deleteReview 软删断言。还原现场。
4. web-admin `npm run build:h5` + deploy.mjs；waimai `npm run build:h5`（tar dist/build/h5 → scp → 原子替换 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/yourbao/waimai`）。
5. 手机截图（390×844 dpr=2）：评价创建页 / menu 评论 tab / 我的评价 / web-admin 审核页 → docs/screenshots/waimai/11-*.png。
6. 手册新增三期评价章节；三仓提交推送收口。

## 风险与边界

- 评价创建要求订单态 Delivered/Completed 且 orderLine 归属登录用户——冒烟需把订单真实流转到 Delivered（admin transition 链）。
- `channelId` 列由 createReview 写入 ctx.channelId，历史无数据（totalItems=0），无迁移负担。
- 先审后显：pending 不出 C 端列表、不计入聚合；myReviews 全状态可见（本人）。
- 图片 URL：复用 uploadCustomerAsset 返回地址（与骑手拍照同源）。
