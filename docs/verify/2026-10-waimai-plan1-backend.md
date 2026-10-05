# waimai Plan 1 后端缺口 — 验收手册

> 2026-10-05 · campus-delivery-plugin 增补 5 项能力并部署生产（`9fabc9984` → `4925a1291`）

## 变更清单（vendure 仓库）

| 项 | Commit | 内容 |
|---|---|---|
| T1 | `3d974bf4f` | Channel customFields 四字段（waimaiTags/waimaiMonthlySales/waimaiLogo/**waimaiPromoText**）+ Order 转单存证字段 |
| T2 | `0b3b48008` | `waimaiStoreList` 店铺列表聚合查询（channels × 履约配置，waimai-store.service） |
| T3 | `9ef50a28a` | `campusOrderRider` 订单骑手卡查询（realName+credit，不含联系方式） |
| T4 | `71106a64b` | `campusTransferTask` 转单（assigned 直回大厅；已取货强制拍照交接） |
| T6 | `83742a575`+`b433e26cd` | `campusSetDeliveryTarget` 扩展 route/slotId（补 C 端时段+路线写入路径，slot 余量/跨渠道/非法 route 服务端校验） |
| lib | `4925a1291` | 插件 lib 产物入库（服务器零构建） |

测试基线：45 → **59 全绿**（15 文件）。dev-server dist 重编无 diff（宿主源码未变，插件经 symlink 生效）。

## 生产冒烟证据（2026-10-05 部署后实测）

1. `waimaiStoreList`：

```json
{"data":{"waimaiStoreList":[{"channelId":"1","channelToken":"cnx87ezvmjx8nn3bth6c","name":"__default_channel__","tags":[],"monthlySales":0,"promoText":null,"paused":false,"routesEnabled":["R1","R3","R4","R5"]}]}}
```

   promoText 字段已出现（造数后此处将列出真实店铺）。

2. `campusSetDeliveryTarget(zoneId:"0", buildingId:"0", route:"R3", slotId:1)` → `USER_INPUT_ERROR "分区不存在"`：新参数被正常接受并进入业务校验链。

## 复跑命令

```powershell
# 店铺列表
$body = '{"query":"query { waimaiStoreList { channelId channelToken name tags monthlySales promoText paused routesEnabled } }"}'
Invoke-RestMethod -Uri 'https://e.joho.cn/shop-api' -Method Post -ContentType 'application/json' -Body $body

# 全插件单测
cd e:\zhao\vendure\packages\campus-delivery-plugin && npx vitest --config vitest.config.mts --run
```

## 已知待办

- 店铺/分区/楼栋/时段造数在 Plan 3 Task 5（waimai-e2e-prepare.cjs）
- 部署脚本存档 `e:\zhao\vendure\.secrets\deploy-waimai-plan1.sh`
