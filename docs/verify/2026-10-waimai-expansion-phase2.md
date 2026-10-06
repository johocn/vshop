# waimai 扩展阶段二验收（2026-10-06/07）

范围：设计文档《2026-10-06-waimai-expansion-design》阶段二 4 项——2.1 订单节点微信通知 / 2.2 骑手位置上报+地图 / 2.3 骑手入驻审核 / 2.4 催单+联系商家。
环境：**生产**（vendure campus-delivery-plugin + waimai H5 + web-admin 全部已部署）。冒烟账号：`smoke-order@yourbao.cn` / `smoke-rider@yourbao.cn`（Wm@Smoke123）。

## 提交清单

| 项 | vendure | waimai | web-admin |
| --- | --- | --- | --- |
| 2.1 节点通知 | campus-notify.service（fire-and-forget，订阅消息）+ 店铺配置模板 ID 四字段 + merchant 配置页 | — | — |
| 2.2 位置+地图 | Order customFields riderLat/riderLng + `campusRiderReportLocation`（本人+配送中校验）+ orderRider 仅 assigned/in_progress 暴露 location + deliver/transfer 清坐标 | 配送页 10s gcj02 上报 + 订单详情 `<map>` Marker+callout | — |
| 2.3 骑手审核 | riderApplications 查询（riderStatus 域）+ campusSetRiderStatus | pkg-rider 入驻表单 | rider-audit 页（tabs+证照预览+通过/拒绝/暂停/恢复，perm CampusAuditRider） |
| 2.4 催单 | Order customFields urged/urgedAt + `campusUrgeOrder`（归属/状态/10min 频控） | 订单详情催单按钮+已催单标签+联系商家拨号；骑手端任务卡催单横幅（8s 轮询） | — |

## 验收结果

### 2.1 节点通知
- 单测 `campus-notify.service.spec.ts` 4 用例通过；配置字段经 merchant 店铺配置页可填（notifyTemplateAccepted/RiderAssigned/CookingDone/Delivered）。
- **待办**：公众号后台申请订单类模板消息后，将模板 ID 填入配置即可生效（无模板 ID 时静默跳过）。

### 2.2 骑手位置 + 地图
- 单测 15 用例（orderRider 位置过滤 3 + reportLocation 3 + transfer 清坐标等）通过，插件全量 121 绿。
- 生产实证：订单 261 塞坐标 in_progress → `campusOrderRider` 返回 `location{30.123456,120.654321}`；delivered → `location:null`（隐私过滤）；送达/转单后坐标列清空。
- 截图：`waimai/docs/screenshots/wa-order-detail-urged.png`（骑手地图 Marker）。

### 2.3 骑手入驻审核
- web-admin 骑手入驻审核页上线（已部署），tabs：审核中/已通过/已暂停。
- 截图：`waimai/docs/screenshots/wa-rider-audit.png`（390×844 dpr=2，三 tab 校验通过）。
- 冒烟账号 smoke-rider 即经该链路 approved（riderCredit 100）。

### 2.4 催单 + 联系商家
- 单测 6 用例（本人催单写库/未登录/非本人/无 deliveryStatus/delivered 拒绝/10min 频控）通过。
- 生产冒烟（cookie 会话，canteen-a 渠道）：
  | 步骤 | 结果 |
  | --- | --- |
  | login smoke-order | CurrentUser id=160 |
  | me（会话校验） | id=160 ✓ |
  | campusUrgeOrder #1 | `{ id: 261 }` ✓，DB `customFieldsUrged=t` + `customFieldsUrgedat` 写入 |
  | campusUrgeOrder #2 | `已收到催单，请耐心等待`（10min 频控）✓ |
  | campusOrderRider | realName=冒烟骑手 + location 坐标 ✓ |
- 截图（390×844 dpr=2）：`wa-order-detail-urge-btn.png`（催单按钮+联系商家）/ `wa-order-detail-urged.png`（已催单标签+地图）/ `wa-rider-delivering-urge.png`（骑手端「⚠ 用户已催单」横幅）。

## 排障沉淀

1. **Vendure customFields 列启动自动同步**：新增字段 pm2 restart 即建列，命名规则 `customFields+字段名首字母大写+其余小写`（riderLat→`customFieldsRiderlat`，urged→`customFieldsUrged`，urgedAt→`customFieldsUrgedat`）。**勿手工 ALTER**（PascalCase 手工列属冗余，曾建后删除）。
2. **Customer 实体无 userId 标量属性（催单归属校验 P0 bug）**：`order.customer?.userId` 恒 undefined → 线上恒 FORBIDDEN，单测 mock `{ userId: 42 }` 掩盖了真实行为。Customer.user 是 eager @OneToOne，归属比对必须用 `order.customer?.user?.id`（vendure b23a375a8）。物理列 `customer."userId"` 是 JoinColumn 外键，实体层面不存在该属性。
3. **GraphQL customFields 未选择字段=前端 undefined**：ORDER_FRAGMENT 与 MY_TASKS 未选 `urged` → 催单状态到不了前端（同坑 11 riderEarning）。新增 customFields 后必须同步补查询选择器。
4. **waimai H5 登录页已被「星枢通行」SSO 接管**：Playwright 无法再用 Vendure 账号走 UI 登录。截图/自动化方案：`requests` 调 shop-api `login` mutation 取 `vendure-auth-token` 响应头 → `add_init_script` 注入 `localStorage.auth_token/auth_userId`（uni setStorageSync 对应键）→ 直接 goto 目标页。截图脚本 `waimai/scripts/_shot_urge.py` 已沉淀。
5. **uni-app H5 goto 相同 hash URL 不触发页面重载**：SPA 页面实例复用，需新开 context 或先 goto about:blank 再回目标页。
6. **uni-h5 表单自动化**：placeholder 属性不落在原生 input（uni-input 包裹），按 `input` 序号定位；uni-button 无 button role，类名/文本定位。
7. **PowerShell ssh 引号坑（跨会话重复踩）**：内层 JSON 双引号被吞 → ssh 把 `-w` 等参数吃掉报 `Enter host password for user 'tFormat'`。**一律本地写脚本文件 → scp → `sed -i 's/\r//g'` → bash**；或 here-string base64 编码后传。
8. **催单通知通道一期取舍**：骑手无可靠模板消息通道，urged 标记 + 骑手端 8s 轮询横幅替代推送；订阅消息/虚拟号留下一轮。
9. **联系商家实现**：复用 `waimaiStoreList`（含 storePhone），按 `order.channelToken` 精确匹配店铺、回退第一家，`uni.makePhoneCall` 拨号。

## 遗留（下一轮）

- 公众号申请订单/骑手模板消息 → 配置模板 ID（2.1 完整生效）
- wx.getLocation 类目权限申请（小程序端位置上报）
- web-admin 调度中心催单徽标（urged 订单高亮）
- 阶段三：3.1 预约单 → 3.2 满减 → 3.4 异常赔付 → 3.3 多单合并
