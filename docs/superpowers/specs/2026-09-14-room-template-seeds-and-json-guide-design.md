# 房型模板库默认房型与 JSON 录入引导 设计文档

## 1. 目标与范围

为酒店客房能力补齐两块：

1. **默认房型模板库**：内置一份国内常用房型完整清单（种子数据），客户开箱即用、可改可删。
2. **JSON 录入引导**：在 web-admin「房型模板库」新建/编辑模板的 JSON 字段下方增加引导条，帮助客户快速完成 JSON 录入（一键插入预设片段 + 快捷输入房间明细 + 引导选项按钮），一键插入与引导输入并存。

本设计仅增量补强既有 `RoomTemplate`/`hotelRoomConfig` 体系，不改变既有模板快照架构、不变更 GraphQL 契约、不影响普通商品路径。

## 2. 默认房型清单（18 种）

按国内酒店常用场景分类预置。每种包含：规格（床型 `bedType`/床描述 `bedDesc`/面积/可住人数 `capacity`/最多 `maxCapacity`/加床 `addBed`+`addBedFeeCent`/吸烟/窗户/含早 `breakfast`+`breakfastCount`/设施 `amenities`/特色标签 `tags`）+ 示例房间明细 `defaultRooms` + 基准价 `basePriceCent` + 价格段 `priceCalendar` + 连住优惠 `longStayDiscount` + 预订规则（min/max 晚数、advanceDays、入住离店时间、取消政策 `cancelPolicy`、押金 `depositType`）。

| # | code | 房型 | 床 | 面积 | 人数 | 含早 | 特色标签 | 基准价(¥) |
|---|---|---|---|---|---|---|---|---|
| 1 | standard-twin | 标准双床房 | 双床 1.2m×2 | 28 | 2 | 2 | 安静,禁烟 | 288 |
| 2 | standard-king | 标准大床房 | 大床 1.8m | 28 | 2 | 2 | 安静,禁烟 | 288 |
| 3 | superior-king | 高级大床房 | 大床 1.8m | 35 | 2 | 2 | 城景,宽敞 | 358 |
| 4 | superior-twin | 高级双床房 | 双床 1.35m×2 | 35 | 2 | 2 | 城景 | 358 |
| 5 | deluxe-king | 豪华大床房 | 大床 2.0m | 42 | 2 | 2 | 湖景,高层 | 458 |
| 6 | deluxe-twin | 豪华双床房 | 双床 1.5m×2 | 42 | 3 | 2 | 湖景 | 458 |
| 7 | business-king | 商务大床房 | 大床 1.8m | 38 | 2 | 1 | 办公区,静音 | 428 |
| 8 | business-twin | 商务双床房 | 双床 1.35m×2 | 38 | 2 | 1 | 办公区,静音 | 428 |
| 9 | triple | 三人间 | 1.2m×3 | 45 | 3 | 3 | 宽敞,家庭 | 398 |
| 10 | family-child | 家庭亲子房 | 1.8m+1.2m | 50 | 3 | 3 | 亲子,卡通 | 518 |
| 11 | executive-king | 行政大床房 | 大床 2.0m | 46 | 2 | 2 | 行政酒廊,高层 | 688 |
| 12 | executive-suite | 行政套房 | 大床 2.0m | 65 | 2 | 2 | 行政酒廊,会客区 | 888 |
| 13 | deluxe-suite | 豪华套房 | 大床 2.0m | 75 | 3 | 2 | 客厅,浴缸 | 1188 |
| 14 | presidential-suite | 总统套房 | 大床 2.0m | 130 | 4 | 4 | 顶层,管家服务 | 3888 |
| 15 | theme-game | 电竞主题房 | 双床 1.2m×2 | 40 | 2 | 0 | 电竞,高配电脑 | 498 |
| 16 | theme-movie | 影音主题房 | 大床 1.8m | 40 | 2 | 0 | 影音,影院 | 468 |
| 17 | theme-romantic | 情侣蜜月房 | 大床 2.0m | 45 | 2 | 2 | 蜜月,浴缸 | 588 |
| 18 | apartment-family | 公寓家庭套房 | 1.8m+1.5m | 80 | 4 | 4 | 厨房,洗衣机 | 728 |

统一价格段默认（个别房型可略差异，如主题房含早 0 份）：
```
priceCalendar: [
  { type: 'weekday', rate: 1.0 },
  { type: 'weekend', rate: 1.2 },
  { type: 'holiday', rate: 1.8, dates: ['2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05'] }
]
longStayDiscount: [{ minNights: 3, rate: 0.9 }, { minNights: 5, rate: 0.8 }]
规则: minNights:1 maxNights:30 advanceDays:30 checkInTime:'14:00' checkOutTime:'12:00'
cancelPolicy: { type:'freeUntil', freeUntilHours:24 } depositType:'payAtHotel'
```

## 3. 承载方式：后端 seed + 前端预设清单（都要）

### 3.1 后端种子（vendure cjk-plugin）
- 新建 `packages/cjk-plugin/src/hotel/room-template-seeds.ts`：导出 `ROOM_TEMPLATE_SEEDS: Array<Omit<RoomTemplate,'id'>>`，18 种模板 `Omit` 化（不含 id/createdAt/updatedAt）。
- 新建 `room-template.seed.service.ts`（或并入 `room-template.service.ts` 的 `seed()` 方法）：遍历种子，对每个 `code` 查 `RoomTemplate`——
  - 存档存在且 code 相同 → **跳过**（不覆盖客户改动）
  - 客户删除过该 code → **跳过且不再补回**（删除时应记录 `deletedRoomTemplateCodes`，见 §3.3）
  - 不存在 → `create(input)` 插入（复用既有 `validateHotelConfig` 校验）。
- 在 cjk-plugin `onApplicationBootstrap`（或既有 init 钩子）调用 `seed()` 一次，**幂等**。

### 3.2 前端预设片段库（vshop web-admin）
- 新建 `web-admin/src/constants/room-template-presets.ts`：导出
  - `PRICE_SEGMENT_PRESETS`：平日/周末/国庆/春节/寒暑假等常用 JSON 片段
  - `LONG_STAY_PRESETS`、`CANCEL_POLICY_PRESETS`：连住优惠、取消政策片段
  - `BED_OPTIONS` / `SMOKE_OPTIONS` / `WINDOW_OPTIONS` / `BREAKFAST_OPTIONS` / `DEPOSIT_OPTIONS` / `ADD_BED_OPTIONS` / `TAG_OPTIONS`：引导选项按钮的取值与文案
  - `VIEW_PRESETS`：特色景观常用词（湖景/江景/城景/海景/山景/园景/夜景）

### 3.3 删除不再补回（幂等关键）
`room-template.service.ts` 的 `delete()` 在删除实体前，把 `code` 记录到持久化存储：
- `RoomTemplateControl` 新实体（`code` 唯一 + `deleted` 布尔 + `deletedAt`），`delete()` 时 upsert 置 deleted=true；`seed()` 对 deleted=true 的 code 跳过且不补回。
- 不生成 SDL/GraphQL（纯内部表，避免扩大面）。

## 4. JSON 录入引导区（web-admin）

### 4.1 位置
`pages/platform/room-templates/index.vue` 新建/编辑弹层表单内，在各 JSON textarea（`specs`、房间明细 `rooms`、价格段 `priceCalendar`、连住优惠 `longStayDiscount`、规则 `ruleJson`）**下方**插入引导条。表单保留原 JSON 编辑能力，引导区仅辅助。

### 4.2 三合一引导条
1. **一键插入预设片段**：`PRICE_SEGMENT_PRESETS` / `LONG_STAY_PRESETS` / `CANCEL_POLICY_PRESETS` 渲染为胶囊按钮组，点击把选中片段以「追加 / 覆盖所选键」方式写入目标 textarea（若字段当前为空则以数组元素追加；含 `dates` 的 holiday/custom 段自动转补全当天）。插入后即时 `JSON.parse` 格式化回填，失败不落盘、toast 提示。
2. **快捷输入房间明细**：一行式输入（房间号 + 楼层 picker + 特色景观输入 + 「＋添加」），点添加把 `{no,floor,view}` 一条 append 进 rooms textarea（保留已有内容），房间号非空校验、楼层缺省取上一间同楼层。已添加数量角标展示。
3. **引导选项按钮**：床型/含早/押金/可加床/吸烟/窗户/特色标签 单选或多选按钮组，点选生成对应 JSON 片段：
   - 单选组（床型/含早/押金/加床/吸烟/窗户）：同一键互斥，点选覆盖 `specs` 或规则字段对应键
   - 多选组（特色标签/设施）：可多选，追加进 `specs.tags` 数组（去重）

### 4.3 数据流与保存
- 所有引导操作直接读写各 JSON textarea 的当前值 → 用户可在引导生成后继续手工微调 JSON。
- 提交保存逻辑不变：`JSON.parse` 逐 JSON 字段校验，失败 toast 中断；`basePriceYuan ×100` 转 `basePriceCent`。

## 5. 边界与不破坏原则

- seed 仅在缺 code 时补充，绝不覆盖/绝不删除客户改动；删除的模板不因重启补回。
- 引导区为纯增量 UI，不影响既有 JSON 编辑、校验、保存与后端契约。
- 电竞/影音等不含早/可加床的主题房，`breakfast`/`addBed` 给合理默认（如含早 0 份）。
- `RoomTemplateControl` 不暴露 GraphQL，不影响店铺端/管理端既有接口。

## 6. 测试与交付

- 后端：`seed()` 幂等单测（首次插入 N / 二次跳过 / 客户删除后不补回 / 校验失败回滚）；`delete()` 记录 deleted。
- 前端：引导区生成 JSON 的纯函数单测（追加 vs 覆盖、楼层缺省、标签去重、含 dates 段补全）。
- 两端本地构建验证 → 部署（vendure `_deploy.ps1` 服务器 pull/restart；web-admin deploy.mjs）。
- 手机视口（390×844）回归截图：模板库列表显示 18+ 默认模板；新建弹层引导条三区块；引导后 JSON 已填充。
- 操作手册 op-17 追加：默认房型清单说明 + JSON 录入引导使用截图。

## 7. 非目标（YAGNI，留待后续）

- 在线改期/协议价/实时房态库存等 OTA 深度能力。
- 引导区做成完整可视化表单编辑器（当前保 JSON + 引导并存）。
- 房型清单的客户自定义分组/排序管理。