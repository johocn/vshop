# 校园配送 Plan 1（后端地基）部署与冒烟验收

日期：2026-10-05
范围：vendure campus-delivery-plugin（分区/宿舍楼/履约配置/骑手入驻/抢单大厅/送达分成）
生产：e.joho.cn admin-api / shop-api（vendure pm2，端口 3020）

## 部署记录

- vendure master 推送 ca37ca393 → b93a76c1f（campus 插件 12 commit）
- 服务器零构建：git pull + node_modules/@vendure/campus-delivery-plugin symlink（root 与 dev-server 两处，照 coupon-plugin 先例）+ pm2 restart（cwd=/www/apps/vendure/packages/dev-server）
- build-prod.ps1 的 bizPkgs 已加入 campus-delivery-plugin（后续重建 dist 覆盖）
- 生产 dist 由本地 `npx tsc -p tsconfig.prod.json` 重建入库（dev-config.js 注册 CampusDeliveryPlugin）

## 部署中发现并修复的三个问题

1. **服务器 dist 未含 campus**：dev-server 生产跑 dist/index（编译产物），首次部署后插件未生效 → 本地重建 dist 入库（45e6dc73d）
2. **实体 ID 关联列 PG 不支持**：`@Column() zoneId: ID` 在 PG 报 DataTypeNotSupportedError crash-loop → 4 实体关联列全部显式 `@Column('int')`（45140c9f6、a49cac05d）
3. **QueryBuilder 裸列查询**：`order.hallStatus` 等裸列在 PG 不存在（customFields 为嵌入式物理列 customFieldsHallstatus）→ 改 embedded 路径 `order.customFields.hallStatus`（b93a76c1f，与 delivery-plugin 同写法）

> **事实修正**：此前记录「customFields 是扁平物理列，查询用 order.hallStatus」不准确——customFields 是 TypeORM **embedded** 结构（实体访问 `order.customFields.hallStatus`，物理列名 `customFieldsHallstatus` 驼峰保留），QueryBuilder 字符串路径必须写 `order.customFields.hallStatus`。

## PG 结构验证

- 4 表建成：campus_zone / campus_building / rider_earning / campus_fulfillment_config（幂等迁移 onApplicationBootstrap）
- customFields 物理列自动补齐：order 表 customFieldsHallstatus/Fulfillmentroute/Orderkind/Buildingid/Campuszone/Hallenteredat/Riderearning/Tip；customer 表 customFieldsRiderstatus/Riderrealname/Riderstudentno/Ridercampus/Rideridimg/Ridercredit

## 冒烟结果（9 步全过）

复跑脚本：`e:\zhao\vshop\.secrets\campus-smoke1.cjs`（配置+入驻）、`campus-smoke2.cjs`（审核+抢单+送达）

| # | 步骤 | 结果 |
|---|---|---|
| 1 | admin campusCreateZone(A区, 200分) | ✓ id=1 |
| 2 | campusCreateBuilding(桂3栋, zone 1) | ✓ id=1 |
| 3 | campusUpdateConfig(R1/R3/R4/R5, rate 100) | ✓ |
| 4 | shop applyRider → DB pending | ✓ customer 132, riderCredit=100 |
| 5 | admin campusSetRiderStatus(approved) + riderApplications | ✓（embedded 查询回归点） |
| 6 | campusHall 可见 open 单 + campusGrabOrder | ✓ hallStatus=grabbed, deliveryStatus=assigned, staffId=132 |
| 7 | campusStartTask | ✓ DB in_progress（返回值为更新前快照，已知形态） |
| 8 | campusDeliverTask(photos) | ✓ DB delivered + 照片 + rider_earning amount=100(tip 100×100%) status=credited + 余额 200→300 |
| 9 | 重复 grab 报「手慢了」 | ✓ 状态守卫生效 |

说明：入厅数据为 DB 直改桩（订单 12 hallStatus=open, tip=100）；支付事件自动入厅（hall.service）由 Plan 3 e2e 覆盖。第 9 步为同单重抢验证状态守卫；真双骑手并发抢单由 Plan 3 e2e（两个 shop token 同时 grab）覆盖。

## 遗留

- 无阻塞遗留。下单支付全链路入厅、双骑手并发、无人接单降级阶梯（T0-T4）→ Plan 3
