# 酒店客房变体与四级回退模板 设计文档

**日期**：2026-09-14
**范围**：S1 数据模型 + S4 前端模板（本阶段）；S2 真实计价 / S3 预订下单闭环为后续子项目
**原则**：不破坏原系统，新功能完全独立（变体 customFields 判定 + 新增第 4 版式，零侵入既有路径）

---

## 1. 背景与目标

在现有电商体系（vendure 后端 + nshop 前端 + vshop web-admin）上为酒店类商品提供：

1. 客房作为商品变体（商品=酒店，变体=房型，如标准间/豪华套房）
2. 房型下的物理房间明细（房间号、楼层、景观）
3. 常用规格标准件模板库（豪华套房等完整房型模板，后台预设、客户一键套用）
4. 节假日价格：日历价格表（日期 → 价格类型 → 系数/固定价），前端按入住/离店日期逐日估算总价展示
5. 前端「hotel」第 4 版式详情页，完整继承既有四级可回退风格体系 + 积木式 UI
6. 下单仍走普通购买流程：数量=预订晚数，单价=加权日均价（含节假日），零侵入订单系统

## 2. 关键决策记录

| # | 决策 | 结论 |
|---|---|---|
| 1 | 变体粒度 | 变体=房型；房间号/楼层为房型下物理房间明细列表 |
| 2 | 节假日价格形态 | 日历价格表 JSON（weekday/weekend/holiday/custom 段，系数或固定价） |
| 3 | 标准件范围 | 完整房型模板（含规格/房间模板/价格/预订规则），新实体管理 |
| 4 | 模板接入 | `layout='hotel'` 第 4 版式，复用 Renderer 与四级回退链，不动既有版式 |
| 5 | 存储方案 | 模板用实体 `RoomTemplate`（快照源）；商品侧业务数据落变体 customFields JSON（快照，改模板不影响已用商品） |
| 6 | 下单映射 | 数量=晚数 N，单价=加权日均价（逐日价格 / N），普通下单 |

## 3. 后端设计（vendure cjk-plugin）

### 3.1 新实体 `RoomTemplate`

复用既有 payment-template / shipping-template 的「实体-服务-resolver」模式，注册进 cjk-plugin 数据库配置。

| 分组 | 字段 | 说明 |
|---|---|---|
| 基础 | `id, code, enabled, sortOrder, coverAssetId` | code 唯一；coverAssetId 封面图 |
| | `name: LocalizedText` | 房型名（标准间/豪华套房…），多语言 |
| 规格 specs | `bedType: 'king'\|'twin'\|'single'\|'family'\|'suite'` | 床型枚举 code（前端 i18n 映射，禁止硬编码中文） |
| | `bedDesc?: string` | 床型描述（如 大床 2m / 双床 1.2m×2） |
| | `area: number` | 面积（㎡） |
| | `capacity: number` | 标准入住人数 |
| | `maxCapacity: number` | 最多入住（含加床） |
| | `addBed: boolean, addBedFeeCent?: number` | 可加床 + 加床费（分） |
| | `smoke: 'allowed'\|'forbidden'` | 吸烟政策 |
| | `window: 'has'\|'none'` | 有窗/无窗 |
| | `breakfast: 'included'\|'notIncluded', breakfastCount?: number` | 含早份数 |
| | `amenities: LocalizedText[]` | 设施（浴缸/行政酒廊/智能马桶/投影…） |
| | `tags: LocalizedText[]` | 特色标签（湖景/江景/亲子/蜜月/商务） |
| 房间模板 | `defaultRooms: [{ no, floor, view? }]` | 套用后生成实际房间明细，客户可再增删 |
| 价格 | `basePriceCent: number` | 平日基准价（分） |
| | `priceCalendar: [{ type: 'weekday'\|'weekend'\|'holiday'\|'custom', rate?: number, priceCent?: number, dates?: string[] }]` | 日历价格段：rate 系数或 priceCent 固定价二选一；holiday/custom 需 dates（YYYY-MM-DD 数组） |
| | `longStayDiscount: [{ minNights: number, rate: number }]` | 连住优惠（如 3 晚 9 折） |
| 预订规则 | `minNights, maxNights: number` | 最少/最多连住晚数 |
| | `advanceDays: number` | 最早可提前预订天数 |
| | `checkInTime: '14:00', checkOutTime: '12:00'` | 入住/离店时间 |
| | `cancelPolicy: { type: 'freeUntil'\|'nonRefundable', freeUntilHours?: number }` | 取消政策（如入住前 24h 免费取消） |
| | `depositType: 'none'\|'payAtHotel'\|'prepay'` | 押金/担保类型 |

### 3.2 变体 customFields `hotelRoomConfig`

cjk-plugin 向 ProductVariant 注册 `hotelRoomConfig: json`。结构为模板完整快照 + 实际房间明细：

```json
{
  "templateCode": "suite",
  "specs": { "bedType": "suite", "bedDesc": "大床 2m", "area": 60, "capacity": 2,
             "maxCapacity": 3, "addBed": true, "addBedFeeCent": 12000,
             "smoke": "forbidden", "window": "has",
             "breakfast": "included", "breakfastCount": 2,
             "amenities": [{ "zh-CN": "浴缸" }, { "en-US": "Bathtub" }],
             "tags": [{ "zh-CN": "湖景" }, { "en-US": "Lake view" }] },
  "rooms": [ { "no": "801", "floor": 8, "view": "湖景" },
             { "no": "802", "floor": 8, "view": "湖景" } ],
  "basePriceCent": 88800,
  "priceCalendar": [
    { "type": "weekday", "rate": 1.0 },
    { "type": "weekend", "rate": 1.2 },
    { "type": "holiday", "rate": 1.8, "dates": ["2026-10-01", "2026-10-02", "2026-10-03"] }
  ],
  "longStayDiscount": [ { "minNights": 3, "rate": 0.9 }, { "minNights": 5, "rate": 0.8 } ],
  "minNights": 1, "maxNights": 30, "advanceDays": 30,
  "checkInTime": "14:00", "checkOutTime": "12:00",
  "cancelPolicy": { "type": "freeUntil", "freeUntilHours": 24 },
  "depositType": "payAtHotel"
}
```

- 变体是否酒店房型 = `hotelRoomConfig != null`；普通商品为 null，零影响
- 模板套用 = 深拷贝快照（含 templateCode 来源标识），后续改模板不影响已用商品

### 3.3 GraphQL 接口

- 管理端：`roomTemplates`（列表/详情）、`createRoomTemplate`、`updateRoomTemplate`、`deleteRoomTemplate`、`applyRoomTemplate(variantId, templateId): Boolean`（生成快照写入变体 customFields）
- 店铺端：变体查询自动携带 `hotelRoomConfig`（customFields 已存在机制，无需额外字段声明）
- SDL：`RoomTemplate` 类型 + 相关 mutation 写入 cjk-plugin `plugin.ts` SDL（注意同步 src 与 lib 产物）

## 4. 前端设计（nshop hotel 第 4 版式）

### 4.1 接入方式

- `DetailConfig.layout` 新增 `'hotel'`；`ProductDetailRenderer` 按 layout 组装
- 完整继承四级回退链：L1 全局配色 token → L2 DetailConfig 页面配置（新增 hotelDefaults）→ L3 块级定制字段（fontScale/imageWidth/radius/title/text 等）→ L4 兜底链（块定制 → 块内建默认 → 全局默认；文案：当前 locale → defaultLocale → 首个值 → 内建占位 → i18n 字典）
- 不触碰 classic/floor/dualBuy 既有版式与既有积木块

### 4.2 新增积木块（`nshop/layers/base/app/components/product-detail/`）

| 积木块 | 职责 |
|---|---|
| `ProductDetailDateBar` | 入住/离店日期选择 → 晚数 N；连住优惠提示；受 advanceDays/minNights/maxNights 约束 |
| `ProductDetailRoomList` | 房型卡片：床型/面积/人数/含早/设施/特色标签；房间明细（房间号/楼层/景观）默认折叠、点击展开；选中房型高亮 |
| `ProductDetailPricePreview` | 逐日计价：priceCalendar 匹配 → 每日单价 → 加权日均价 + 总价（标注节假日溢价/连住折扣） |
| `ProductDetailPolicy` | 预订规则卡：入住/离店时间、取消政策、押金类型、加床费 |
| 复用 | Gallery、PriceBlock（日均价）、ServiceBlock、ReviewsSection、PurchaseBar（数量=晚数，单价=加权日均价，普通下单） |

### 4.3 核心纯函数 `hotel-pricing.ts`（SSR 友好）

```ts
calcNightPrices(config, checkIn: Date, checkOut: Date):
  { nights: { date: string; priceCent: number; type: 'weekday'|'weekend'|'holiday'|'custom' }[],
    totalCent: number, avgCent: number } | null
```

- 晚数 N = 离店日期 − 入住日期（天数差，入住当日计第 1 晚；N ≥ 1）
- 逐日类型判定优先级：custom > holiday > weekend（周五~周日）> weekday（周一~周四）；holiday/custom 的 dates 段优先于星期类
- 单价 = basePriceCent × rate（或直接 priceCent）；总价 = Σ 每日单价，再套连住折扣（longStayDiscount 取满足的最高档）；日均价 = 折扣后总价 / N
- 坏 JSON/缺字段/日期非法返回 null，逐级退回默认（L4 链）
- 纯函数，无 DOM/无副作用，可单测

### 4.4 i18n

- 12 个语言包同步新增词条：入住/离店/晚/含早/不含早/免费取消/不可取消/加床费/免押金/到店付/预付/有窗/无窗/可吸烟/无烟 等
- 枚举型展示（床型/吸烟/窗户）用 code + i18n 字典映射，禁止硬编码中文
- LocalizedText 字段（amenities/tags/name）走 `localizeText()` 逐级回退

## 5. web-admin 配置管理（vshop）

### 5.1 房型模板库管理页

- 路径：`pages/platform/room-templates/`；入口：平台管理菜单「房型模板库」
- 列表：code/名称/启用/基准价/排序；新建/编辑表单分组：
  1. 基础信息：名称（多语言 tab）、封面图、启用
  2. 房型规格：床型枚举/面积/人数/加床/吸烟/窗户/含早/设施/特色标签
  3. 房间明细模板：可增删行（房间号/楼层/景观）
  4. 价格体系：基准价、日历价格段编辑器（weekday/weekend 系数 + holiday/custom 日期段）、连住优惠
  5. 预订规则：最少/最多晚数、提前天数、入住离店时间、取消政策、押金类型

### 5.2 商品编辑页接入

- 变体编辑区新增「酒店房型配置」分组（仅当变体已有 hotelRoomConfig 或用户选择模板时显示）
- 选择房型模板 → `applyRoomTemplate` 一键套用生成快照 → 快照可编辑房间明细/日历价格段/规则
- 未配置变体完全无感知

### 5.3 版式选择

- 店铺设置 → 详情页版式：新增 `hotel` 选项（沿用既有 DetailConfig 设置入口）

## 6. 错误处理与边界

- 模板套用 = 深拷贝快照：模板删除/改名不影响已用商品（商品展示用快照）
- 日历价格段校验：日期非法/重复 → 保存拦截；判定冲突时「custom > holiday > weekend > weekday」优先级
- 日期选择边界：`advanceDays` 限最早可订；`minNights/maxNights` 限区间；入住=离店（0 晚）禁止
- 非酒店商品（hotelRoomConfig=null）走原版式渲染；hotel 版式仅当 layout=hotel 且存在酒店变体时启用
- 前端解析函数为纯函数：坏 JSON/缺字段返回 null，逐级退回默认（L4 链），SSR 安全

## 7. 测试与交付

- 后端：`calcNightPrices` 纯函数 Vitest 单测（节假日优先/跨周末/连住折扣/非法输入/坏 JSON）
- 两端本地构建验证（部署铁律：本地构建，服务器只解压/restart）
- 部署：vendure 构建 + 推送 + 服务器 pull/restart；web-admin `deploy.mjs`
- 手机视口（390×844，dpr=2）回归截图：酒店详情页（日期选择→房间明细展开→总价预估→数量=晚数）、房型模板库管理页、商品编辑酒店配置分组
- 操作手册新增章节（房型模板库使用、商品挂酒店配置、酒店版式详情页操作）

## 8. 非目标（YAGNI，留待后续子项目）

- 会员价/协议价/多房价方案（rate plan）
- 房态实时库存与锁房
- 在线改期/取消退款闭环
- 真实预订计价接入订单系统（S2：节假日价格参与结算；S3：预订下单闭环）
