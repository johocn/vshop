# 盘库运营增强（分页 / 统计 / 草稿 / 导出）设计稿

- 日期：2026-09-25
- 状态：设计已定稿（用户已确认范围与三处版式），待评审通过后进入实施计划
- 修订（2026-09-25，评审反馈）：§3.5 由「不承诺像素级一致」改为「受控渲染下像素级一致 + 跨机/物理打印机分层限定」；新增 §7.5 打印版式规范（像素级）与 §10.5 打印像素基线；同步 §1.1/§1.2/§8.3/§9/§10.2/§10.4/§11/§12
- 相关资产：`vshop/web-admin`（后台前端）、`vendure/packages/cjk-plugin`（后端插件）
- 承接：`docs/superpowers/specs/2026-09-23-stocktake-collab-design.md`（协同盘库主设计，本文只做**增强**，不改其核心决策）
- 体例承接：本文沿用主设计的「决策记录 + 被否方案 + 代价」写法

---

## 1. 目标与非目标

### 1.1 目标

协同盘库上线后，用户指出四类待完善处，本文收敛为 6 项交付：

| 需求原文 | 落法 | 章节 |
|---|---|---|
| 任务多了翻不到旧任务 | 看板列表分页 + 触底加载；服务端补多状态过滤以消除「已结束」串页 | §6.1 / §8.1 |
| 想知道哪些库位没盘、谁盘得少 | 任务详情新增「统计」页签（按库位 / 按盘点人，**只做作业量**） | §6.3 / §7.3 / §8.2 |
| 想先把范围存下来、复核后再发 | 草稿（`DRAFT`）：新建时可选「存为草稿」，**发布时才物化**盘次与应盘行 | §5 / §6.2 / §7.2 |
| 盘点结果要带走做账 / 贴单 | 双轨导出（前端当前视图 CSV + 后端全量 CSV）+ 打印视图（版式按 mm/pt 钉死，受控渲染下像素级一致） | §6.4 / §7.4 / §7.5 / §8.3 |

### 1.2 非目标（本轮明确不做）

- **不做库位级差异**：不把差异数量/金额摊到库位或盘点人（理由见 §3.3）。
- **不做 XLSX**：后端导出只出 CSV，不引入 `exceljs`/`xlsx` 依赖（理由见 §3.4）。
- **不做服务端 PDF 生成**：打印走浏览器 `window.print`，不引入无头浏览器/PDF 服务（理由见 §3.5）。**但版式一致性不因此放弃**：打印版式用绝对单位钉死并做像素基线（§7.5 / §10.5）。
- **不做自适应打印排版**：打印列宽 / 行高 / 字号固定，不接受「按内容或视口自适应」（这是版式可复现的前提，§3.5 代价）。
- **不做编辑已发布任务的范围**：`updateStocktakeTask` 仅对 `DRAFT` 生效；已 `OPEN` 的任务范围仍不可改（与主设计一致）。
- **不做周期轮盘 / 多轮复盘 / 过账审核流**：仍在主设计 §1.2 的非目标里，未变。
- **不做小程序/App 端导出**：`web-admin` 只构建 H5（`build:h5`），导出与打印按 H5 实现，非 H5 平台隐藏入口。

---

## 2. 现状核查（均已核实，非推测）

| 事实 | 证据 | 影响 |
|---|---|---|
| 列表已返回总数、排序稳定、`pageSize` 上限 100 | `stocktake.service.ts:123-136`（`findAndCount` + `order: { id: 'DESC' }` + `Math.min(..., 100)`） | 分页是**前端欠账**，后端只需补多状态过滤 |
| 服务端 `state` 只支持单值等值过滤 | 同上：`if (options?.state) where.state = options.state` | 「已结束」页签现由前端过滤 POSTED/CANCELLED（`index.vue:172-183`），**一加分页必然串页** |
| 前端写死 `page: 1, pageSize: 50` 且丢掉 `totalItems` | `index.vue:175-180` | 「共 N 条」与触底加载都缺 |
| 行实体已带库位与盘点人 | `StocktakeLine`：`zoneCode/binCode/countedById/countedByName/countedAt/isExtra` | 统计与导出**无需新增字段** |
| 差异行是变体口径，且无盘点人字段 | `StocktakeVarianceRow`（含 `targetBinCode` 但无 `countedByName`） | 「按盘点人看差异」不可做；「按盘点人看作业量」可以 |
| 盘点 mutation 共 10 个，无 open/update | `stocktake.admin.resolver.ts:69-125` | 草稿需**新增 2 个 mutation**，不是前端补按钮 |
| 本仓无 `exceljs`/`xlsx`/`fast-csv` 依赖 | `cjk-plugin/package.json`、`vendure/package.json` 均无 | 后端 XLSX 需新增依赖 → 与部署铁律冲突（§3.4） |
| `web-admin` 只有 `dev:h5`/`build:h5` 两个脚本 | `web-admin/package.json` | 回归靠临时脚本，需固化命令（§11） |
| 仓内无像素基线约定 | `web-admin/_e2e/` 只有一次性脚本与散图，**无** `baselines/` 目录、无基线比对脚本 | 打印像素基线需新建目录与比对脚本（§10.5），并建立「改环境即重录」纪律 |

---

## 3. 核心决策记录

### 3.1 分页：服务端补 `states` 多值，而不是前端凑页

**决策**：`StocktakeTaskListOptions` 增 `states: [String!]`；`state`（单值）优先，其次 `states`，两者都无则不过滤。「已结束」页签改下发 `states: ['POSTED','CANCELLED']`。

**理由**：前端本地过滤 + 分页的组合会串页——被过滤掉的行占掉了页内位置，第 2 页会「看起来缺人」。多值过滤让服务端分页与 `totalItems` 天然一致，前端只剩追加渲染。

**被否方案**：前端在「已结束」页签下继续翻页直到凑满一屏（逻辑绕、仍与 `totalItems` 对不上、请求次数不可控）。

**代价（已接受）**：`states` 与 `state` 两个参数并存，需要在服务端明确优先级并写单测锁住语义。

### 3.2 草稿：发布时才物化盘次与应盘行

**决策**：`createStocktakeTask` 增可选 `state`（默认 `OPEN`）。`state=DRAFT` 时**只写任务头**（任务号、名称、活动码、仓库、备注、原始圈范围 JSON、创建人），不解析范围、不生成盘次与应盘行；新增 `openStocktakeTask(id)` 在同一事务内完成「解析范围 → 双源合并 → 生成盘次与行」。

**理由**：草稿的价值是「先把范围存下来、复核后再发」。若建草稿即冻结应盘清单，草稿停留期间库存与商品集合持续变化，发布后拿到的是**过期快照**——过账差异会被这层过期污染，且很难解释。

**连带规则**：
- `binModeAtCreate` 在 **DRAFT 阶段留空**，发布时按当时的渠道 `binMode` 写入——草稿期间改档不会让语义漂移；已发布任务仍保持「建任务时档位」语义。
- 草稿不计入任何进度/差异统计（无行可算）；草稿详情页只显示范围与「发布任务」。
- 发布幂等：对非 `DRAFT` 任务调用 `openStocktakeTask` 明确报错，不静默返回。

**被否方案**：建草稿即物化（快照冻结），发布只改状态——好处是「预约盘点」可提前锁快照，但过期快照的账务风险更高，且主设计 §3.5 已确立「以过账时当前账面重算」的口径，没必要再引入快照时点分歧。

**代价（已接受）**：`createTask` 需拆成「建头」与「物化」两段（§7.2），是本文唯一的结构性重构。

### 3.3 统计：只做作业量，且聚合在后端纯函数

**决策**：新增 `stocktakeStats(taskId)`，返回**按库位**与**按盘点人**两组**作业量**（应盘行数 / 已盘 / 未盘 / 盘盈 / 涉及盘次 / 最后活动时间），聚合逻辑写成后端纯函数。

**理由**：
1. **口径必须与主设计一致**：主设计 §6.2 规定「以变体为最小比对单位，不逐行相减」，§3.1 明确「不引入库位级账面数」。把差异摊到库位或盘点人，等于让同一个变体的差异在多行、多人、多库位之间重复计数——算出来的数没有意义。
2. **聚合放后端**：同一份口径要供「前端统计视图」「后端导出 CSV」「打印视图」三处消费；放前端会漂移到三份实现。

**被否方案**：前端拉全量明细行自行聚合（三处口径有漂移风险，且大任务下前端拉全量成本更高）。

**代价（已接受）**：统计口径只回答「哪里没盘完、谁盘得少」，回答不了「哪个库位错得多」——后者需要库位级账面数，属主设计非目标。

### 3.4 导出：双轨，且后端只出 CSV

**决策**：
- **前端 CSV**（即时）：基于当前视图内存数据生成，落盘即走，不等待网络；定位是「看什么导什么」。
- **后端 CSV**（全量）：`stocktakeExport(taskId, kind)` 返回文件内容字符串，供全量导出、归档、外部系统按需拉取。

**理由**：前端导出让日常动作零等待；后端导出不受浏览器内存与前端分页限制，且可被外部系统调用（GraphQL 即可，无需另开 REST）。**两者共用同一份列定义与转义规则**（§7.4），且后端 CSV 由 `stocktakeStats`/`buildDiff` 的同源数据生成，避免两套口径。

**为什么后端不出 XLSX**：本仓无 `exceljs`/`xlsx` 依赖，新增依赖需要在服务器装包，而项目部署铁律是「**本地构建，服务器只解压 / `pm2 restart`，绝不在服务器构建**」。为零依赖守住铁律，XLSX 用 Excel 打开 CSV 替代。

**被否方案**：后端生成 XLSX（破坏部署铁律）；只做前端导出（大任务拉不全、外部系统拿不到）。

**代价（已接受）**：CSV 无多工作表，四类数据是四个文件；中文需靠 UTF-8 BOM 兜住 Excel 乱码。

### 3.5 打印：浏览器打印，不做服务端 PDF；版式在受控渲染下达到像素级一致

**决策**：差异页增加打印模式（`@media print`），`window.print()` 出纸；打印内容 = 任务头 + 四宫格汇总 + 差异表 + 未盘清单 + 页脚。**版式不由浏览器打印设置决定**——页面几何、字号、行高、列宽、分页、颜色全部用绝对单位（mm / pt）钉死，见 §7.5。

**理由**：仓内贴单与纸质归档只要求「能出纸、内容不多不少」，浏览器打印零依赖、零运维；服务端 PDF 需要无头浏览器，与部署铁律和资源占用都不划算。**「不引入 PDF 服务」不等于「放弃版式确定性」**：只要打印样式不依赖用户缩放与浏览器默认页边距（`@page` 显式声明 + `table-layout: fixed` + 固定列宽行高 + 固定缩放 100%），同一渲染引擎的打印渲染就是确定性的。

**像素级一致性的适用范围（三层，逐层收窄，不允许含糊）**：

| 场景 | 承诺 | 方法 |
|---|---|---|
| 受控渲染（CI / 本机脚本） | **像素级一致**：逐像素零容差 | Playwright Chromium + `emulateMedia({media:'print'})` + `dpr=2` 光栅化，与 `_e2e/baselines/print/` 基线 diff（§10.5） |
| 跨操作系统 | **结构一致**（不做像素比对） | 字体回退链在不同 OS 字形不同，自动降级为「页数 / 表格几何 / 文本内容 / 无溢出」断言并标注 `SKIP pixel` |
| 物理打印机 | **版式一致**（不做像素比对） | 用户打印机驱动、纸张、缩放档位无法被网页控制，只人工走查几何与分页与基线相同 |

**代价（已接受）**：为钉死版式必须放弃「随内容自适应」排版（列宽按 mm 固定、长文本换行而非收缩列宽）；并承认像素基线只在录制时的同一渲染环境（浏览器版本 + OS 字体）内有效，环境变更须重录基线而不是放宽容差。

---

## 4. 数据模型影响

**无新表、无新字段。** `stocktake_task.state` 已含 `DRAFT`（主设计 §4.1），`stocktake_line` 已具备统计与导出所需全部字段（§2）。生产 postgres 走 `synchronize: true` 开机同步，**不手写 migration**（遵循项目数据库策略）。

草稿期的数据约束：`DRAFT` 任务**没有** `stocktake_wave` / `stocktake_line` 行，因此任何按 `taskId` 聚合行的查询都要对「零行」返回空结构而不是报错（§9）。

---

## 5. 状态机与门禁

任务状态机不变，只补草稿出口：

```
DRAFT ──openStocktakeTask──> OPEN ──> COUNTING ──> COUNTED ──> POSTED（终态）
  │                            │
  └── cancelStocktakeTask ──> CANCELLED（终态）        └── cancel ──> CANCELLED
```

| 动作 | 允许的当前状态 | 权限点 | 备注 |
|---|---|---|---|
| `updateStocktakeTask` | 仅 `DRAFT` | `StocktakeCount` | 可改名称 / 活动码 / 备注 / 仓库 / 圈范围 |
| `openStocktakeTask` | 仅 `DRAFT` | `StocktakeCount` | 幂等拒绝：非 DRAFT 报「任务已发布」 |
| `cancelStocktakeTask` | 非终态 | `StocktakeCount` | 现有行为，覆盖 DRAFT |
| 统计 / 导出 / 打印 | `OPEN`/`COUNTING`/`COUNTED`/`POSTED` | `ReadCatalog` | DRAFT 无行，前端不展示入口 |

前端门禁沿用既有 `useStocktakeScope.ts`：读写用 `canCount`（`isSuperAdmin || hasPermission('StocktakeCount')`），过账仍单独看 `StocktakePost`（**能盘 ≠ 能过账**，本设计不放松）。

---

## 6. 接口设计（SDL 增删）

### 6.1 修改：`stocktakeTasks`

```graphql
input StocktakeTaskListOptions {
    page: Int
    pageSize: Int
    state: String          # 既有：单值等值过滤
    states: [String!]      # 新增：多值过滤（state 优先）
    activityCode: String
    stockLocationId: ID
}
```

语义（必须写单测锁住）：`state` 存在 → 用它；否则 `states` 非空 → `In(states)`；否则不过滤。`pageSize` 仍由服务端 `Math.min(..., 100)` 兜底。

### 6.2 修改 / 新增：任务写路径

```graphql
# 修改：input 增可选 state（'DRAFT' | 'OPEN'，缺省 OPEN）
createStocktakeTask(input: StocktakeTaskInput!): StocktakeTask!

# 新增：草稿发布（物化盘次与应盘行）
openStocktakeTask(taskId: ID!): StocktakeTask!

# 新增：仅 DRAFT 可改
updateStocktakeTask(taskId: ID!, input: StocktakeTaskUpdateInput!): StocktakeTask!
```

`StocktakeTaskInput` 增 `state: String`；`StocktakeTaskUpdateInput` = 名称 / 活动码 / 备注 / 仓库 / 圈范围（不含 `state`，状态只能经 open/cancel 变更）。

### 6.3 新增：统计

```graphql
type StocktakeBinStat {
    zoneId: ID
    zoneCode: String
    binId: ID
    binCode: String
    expectedLines: Int!
    countedLines: Int!
    uncountedLines: Int!
    extraLines: Int!
}

type StocktakeCounterStat {
    countedById: String
    countedByName: String
    countedLines: Int!
    extraLines: Int!
    waveCount: Int!
    lastCountedAt: DateTime
}

type StocktakeStats {
    expectedLines: Int!
    countedLines: Int!
    byBin: [StocktakeBinStat!]!
    byCounter: [StocktakeCounterStat!]!
}

extend type Query {
    stocktakeStats(taskId: ID!): StocktakeStats!
}
```

### 6.4 新增：导出

```graphql
type StocktakeExportFile {
    filename: String!
    mimeType: String!
    content: String!      # 完整 CSV 文本（含 BOM）
    totalRows: Int!
    truncated: Boolean!
}

extend type Query {
    # kind ∈ variance | lines | by_bin | by_counter
    stocktakeExport(taskId: ID!, kind: String!): StocktakeExportFile!
}
```

`kind` 用 `String` 而非新枚举，与既有 SDL 风格一致（现有 SDL 大量使用 `String` 表示状态/类型）。未知 `kind` 抛 `UserInputError`。

### 6.5 注册范围

新增 query/mutation **只注册进 `adminApiExtensions`**，`shopApiExtensions` 保持不含盘库字段（主设计 §3.8 的有意单侧注册），并由只读冒烟断言「shop-api 未泄漏」。

---

## 7. 核心算法

### 7.1 状态过滤解析（纯函数）

```
parseStateFilter({ state, states }) -> { mode: 'none' | 'one' | 'many', values: string[] }
```
- `state` 非空 → `one`
- 否则 `states` 非空（过滤掉空串）→ `many`
- 否则 → `none`

### 7.2 任务物化（结构性重构）

把现有 `createTask` 拆为两段，供「直接创建」与「草稿发布」共用：

```
createTask(input):
  task = buildTaskHead(input, operator, binModeAtCreate=input.state==='DRAFT' ? null : 当前档位)
  if input.state === 'DRAFT': 落库并返回（不物化）
  else: materializeTask(ctx, task)  →  落盘盘次与应盘行  →  state=OPEN

openStocktakeTask(id):
  任务必须为 DRAFT（否则 UserInputError）
  binModeAtCreate = 当前渠道档位
  materializeTask(ctx, task)        # 解析原始 scope → 双源合并 → 建盘次与行（一个事务）
  state = OPEN
```

`materializeTask` 内部沿用主设计 §6.1 的清单生成算法（含 `autoSplitByZone` 三分支），**算法本身不改**，只换调用位置与档位来源。

### 7.3 统计聚合（纯函数，口径写死）

行集 = 该任务**全部** `wave` 下的全部 `line`（含 `isExtra`）。

```
aggregateByBin(lines):
  按 (zoneId, binId) 分组；两者皆空的行归入「未归位」组（zoneCode/binCode 输出 null）
  expectedLines  = 组内 !isExtra 的行数
  countedLines   = 组内 !isExtra 且 countedQty !== null 的行数
  uncountedLines = expectedLines - countedLines
  extraLines     = 组内 isExtra 的行数
  排序：zoneCode, binCode 升序，未归位组置末

aggregateByCounter(lines):
  仅统计 countedQty !== null 的行；按 (countedById, countedByName) 分组
  countedById 为空 → 归入「未知」组（输出 null）
  countedLines  = 行数（含 isExtra，因为这些行确实被人盘过）
  extraLines    = 其中 isExtra 的行数
  waveCount     = 组内 distinct waveId 数
  lastCountedAt = 组内 countedAt 最大值
  排序：countedLines 降序
```

**明确不输出**：任何形式的差异数量/金额（§3.3）。

### 7.4 CSV 生成（纯函数，前后端同一规则）

```
toCsv(rows: (string|number|boolean|null)[][]) -> string
  1) 首字符前置 BOM（\uFEFF）
  2) 行尾 CRLF
  3) 字段转义：含 " , \n \r 时，整体用双引号包裹，内部 " 变 ""
  4) null/undefined → 空字段；boolean → 是/否；DateTime → ISO 字符串
  5) 行数上限 20000：超出即截断并置 truncated=true（前端导出当前视图不受此限，仅列定义对齐）
```

列定义（前后端一致）：

| kind | 列 |
|---|---|
| `variance` | 库位编码 / 库位 / 变体 SKU / 变体名称 / 盘点数 / 快照账面 / 过账账面 / 差异 / 盘盈 / 账面变动 |
| `lines` | 库位编码 / 库位 / 变体 SKU / 变体名称 / 账面数 / 实盘数 / 是否盘盈 / 盘点人 / 盘点时间 / 备注 |
| `by_bin` | 库区 / 库位 / 应盘 / 已盘 / 未盘 / 盘盈 |
| `by_counter` | 盘点人 / 已盘 / 盘盈 / 涉及盘次 / 最后活动时间 |

文件名：`stocktake-{任务号}-{kind}-{yyyymmddHHmm}.csv`；`mimeType = text/csv;charset=utf-8`。

### 7.5 打印版式规范（像素级，§3.5 的实现口径）

本节是打印样式的**唯一出处**：样式表必须逐条落实下列参数；任何未列出的排版自由度（自适应列宽、随视口缩放、跟随主题色）都视为实现偏差。

**受控渲染环境（基线契约）**

| 项 | 值 |
|---|---|
| 渲染引擎 | Playwright Chromium（版本与基线同录于 `_e2e/baselines/print/<case>/env.json`） |
| 媒体模拟 | `page.emulateMedia({ media: 'print' })` |
| 视口 | `794 × 1123`（A4 @96dpi），`deviceScaleFactor: 2` |
| 出纸 | `page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: 0 })` |
| 缩放 | 固定 100%（样式表内**不得出现** `transform: scale` / `zoom` / `vw` 字号） |

**页面几何**

| 项 | 值 |
|---|---|
| `@page` | `size: A4 portrait; margin: 12mm 12mm 14mm 12mm` |
| 内容区 | `186mm × 271mm` |
| 表格 | `table-layout: fixed; border-collapse: collapse; width: 186mm` |
| 单位纪律 | 边距/内距只用 `mm`，字号只用 `pt`；打印样式表内禁止 `px` / `rem` / `em` / `%`（表格宽度除外） |

**字号与行高**

| 元素 | 字号 / 行高 |
|---|---|
| 任务头主行（任务号 + 名称） | `14pt` / `18pt` |
| 任务头副行（仓库 / 活动码 / 打印时间） | `8.5pt` / `12pt` |
| 四宫格数值 | `12pt` / `14pt` |
| 表头 / 正文 / 未盘清单 | `8.5pt` / `12pt` |
| 页脚 | `7.5pt` / `10pt` |
| 差异表数据行 | 固定 `6mm` 高（`line-height: 12pt` + `padding: 0.8mm 1mm`） |

**差异表列宽（固定分配，合计 186mm）**

| 列 | 宽 | 对齐 |
|---|---|---|
| 库位编码 | 22mm | 左 |
| 库位 | 30mm | 左（`overflow-wrap: anywhere`） |
| 变体 SKU | 38mm | 左（`overflow-wrap: anywhere`） |
| 变体名称 | 17mm | 左 |
| 盘点数 | 17mm | 右 |
| 快照账面 | 17mm | 右 |
| 过账账面 | 15mm | 右 |
| 差异 | 12mm | 右 |
| 盘盈 | 18mm | 右 |

超宽内容**换行、不收缩列宽**（`table-layout: fixed` 的必然结果，也是版式可复现的前提）。

**分页**

| 项 | 规则 |
|---|---|
| 续页表头 | `thead { display: table-header-group }`（每页自动重复） |
| 行不跨页 | `tr { break-inside: avoid }` |
| 分区不跨页 | 四宫格、差异表、未盘清单各自 `break-inside: avoid` 于块级外壳 |
| 任务头 | 只在第一页（`position: static`，禁用 `fixed`） |
| 页码 | **如实限制**：Chromium 不支持 `@page` margin box 的 `counter(page)`，`window.print()` 下**无页码**；页码仅在 PDF 生成侧用 `footerTemplate` 补，属可选增强、不计入基线 |

**颜色与边框**

| 项 | 值 |
|---|---|
| 文字 | `#000`（打印样式内不得继承主题变量） |
| 边框 | `0.2mm solid #000`（表头上下边 + 行底线 + 四宫格分隔） |
| 底色 | 仅表头 `#F2F2F2`，并 `print-color-adjust: exact` 强制输出 |
| 斑马纹 | 关闭（打印样式内禁用 `nth-child` 底色） |

**字体**

| 项 | 值 |
|---|---|
| 打印字体栈 | `"PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`（显式声明，不依赖系统默认） |
| 数值对齐 | 数值列 `font-variant-numeric: tabular-nums` |
| 缺字回退 | 交由字体栈顺序回退；回退导致的字形差异属跨 OS 场景，不做像素比对（§3.5） |

**断言与容差（脚本化口径，脚本见 §10.5）**

| 断言 | 容差 |
|---|---|
| 同机基线 diff | **0 像素差**；超差即 FAIL 并输出 diff 图到 `_e2e/baselines/print/_diff/` |
| PDF 页数 / 页尺寸 | 页数 = 基线值；每页 `595.276 × 841.89pt`（A4）±0.5pt |
| 文本可复制 | 从 PDF 抽取文本，必须含「任务号 / 差异 / 未盘」等关键字（证明未图片化出纸） |
| 无横向溢出 | 逐页断言无元素 `right > 186mm`，无 `scrollWidth > clientWidth` |
| 跨 OS | 自动跳过像素比对，只跑上面三项结构断言并输出 `SKIP pixel` |

---

## 8. 前端改造点

### 8.1 看板 `src/pages/inventory/stocktake/index.vue`

- `reload()` 支持 `page`；`onReachBottom` 追加下一页（不重置已有列表）；下拉刷新回到第 1 页。
- 页脚显示「已加载 x / 共 y 条」；加载中禁用触底（防重复请求）。
- 「已结束」页签改下发 `states: ['POSTED','CANCELLED']`，删除前端过滤分支。
- 新增「草稿」页签（`states: ['DRAFT']`）。
- 新建抽屉底部改双动作：「存为草稿」（次按钮）/「创建并发布」（主按钮，保持默认习惯）。

### 8.2 任务详情 `src/pages/inventory/stocktake/task.vue`

- 新增「统计」页签（与「盘次」「差异」并列，**版式 A：详情内新页签**——已定稿）。
- 统计页签内两个分段：按库位 / 按盘点人，各自渲染 `stocktakeStats` 的两张表。
- 草稿态：隐藏盘次/差异/统计，显示范围摘要 + 动作条「编辑范围 / 发布任务 / 取消任务」；「编辑范围」复用新建抽屉并预填。

### 8.3 差异页 `src/pages/inventory/stocktake/diff.vue`

- 顶部工具条三按钮：**导出 CSV**（当前视图即时落盘）/ **完整导出**（`stocktakeExport`，含行数与截断提示）/ **打印**。
- 打印模式：`@media print` 隐藏导航、页签与按钮；打印区 = 任务头 + 四宫格 + 差异表 + 未盘清单 + 页脚（任务号 / 打印时间）。
- 打印样式独立成块并**逐条落实 §7.5**（绝对单位、`table-layout: fixed` + 固定列宽、`thead` 重复、行不跨页、`print-color-adjust: exact`、固定 100% 缩放）；打印样式内**不引用主题变量**，颜色写死 `#000` / `#F2F2F2`。
- 空数据时输出说明行（如「本次无差异」），避免出白页。

### 8.4 接口与文案

- `src/apis/stocktake.ts`：新增 `fetchStocktakeStats` / `stocktakeExport` / `openStocktakeTask` / `updateStocktakeTask`；`fetchStocktakeTasks` 增 `states`；`createStocktakeTask` 增 `state`。
- `src/locale/zh-Hans.json` 与 `src/locale/en.json` **同步**新增词条：`stocktake.board.*`（draft 页签、`loadedOf` 分页计数、新建双按钮）、`stocktake.task.stats.*`（页签、两个分段、表头、空态）、`stocktake.diff.*`（三个按钮、导出成功/截断/失败提示、打印）。
- 非 H5 平台（条件编译）隐藏导出与打印按钮，并给出「请使用完整导出」提示。

---

## 9. 错误与边界

| 场景 | 行为 |
|---|---|
| 草稿发布时任务已被取消 / 已发布 | `UserInputError`，草稿状态保持不变（不静默降级、不半物化） |
| 草稿发布的仓库已不存在 | `UserInputError`，草稿保留，提示先改仓库 |
| 草稿期间渠道档位变化 | 以**发布时**档位为准（`binModeAtCreate` 在发布时写入），并允许界面在草稿详情显示「发布时按当前档位生成盘次」 |
| `stocktakeStats` 对 DRAFT / 零行任务 | 返回全零与空数组，不报错 |
| `stocktakeExport` 未知 kind | `UserInputError` |
| 导出行数超 20000 | 截断 + `truncated: true`，前端提示「已截断，请按筛选分批导出」 |
| 打印时无差异 / 无未盘 | 输出说明行，不出白页 |
| 打印内容超出一页 | 靠 `thead` 重复 + 行 `break-inside: avoid` 自动分页；**不缩放、不缩字、不裁列**（§7.5） |
| 打印样式命中缺字字体 | 按字体栈顺序回退；字形差异归跨 OS 场景，像素比对自动降级为结构断言 |
| 渲染环境变化（浏览器版本 / OS 字体） | 像素基线判定失效：同机换版本须**重录基线**（不调容差），跨机自动降级为结构断言并记 `SKIP pixel`（§10.5） |
| 分页触底并发 | 前端加载中锁 + 服务端 `id DESC` 稳定排序，避免重复或漏项 |

---

## 10. 测试与验收

### 10.1 后端单测（vitest，`npm test`）

| 用例 | 覆盖 |
|---|---|
| `parseStateFilter` 单值优先 / 多值 / 空数组不过滤 | §7.1 |
| 统计聚合：同变体多行不重复计数、未归位行单列、`countedQty === null` 不计入已盘、`isExtra` 计入盘盈 | §7.3 |
| 按盘点人：`countedById` 为空归「未知」、`waveCount` 去重、`lastCountedAt` 取最大 | §7.3 |
| CSV：逗号 / 引号 / 换行转义、BOM 前置、20000 行截断标志 | §7.4 |
| 草稿门禁纯函数：仅 DRAFT 可 open/update | §5 |

DB 级物化（`materializeTask`）不在单测内，用只读冒烟 + 端到端走查覆盖（与既有做法一致）。

### 10.2 前端回归（手机视口 390×844 dpr=2，输出 780×1688）

新增截图编号 **T46–T53**（T40/T41/T45 已占用）：分页触底（含「已加载 x / 共 y」）、草稿页签 + 草稿详情动作条、新建抽屉双按钮、统计页签·按库位、统计页签·按盘点人、差异页工具条、导出落盘提示（含截断）、打印工具条与打印区（手机视口截图，证明入口与分区）。每张断言 `0 pageerror / 0 console.error`。

打印的**版式正确性**不由手机截图承担（手机视口证明不了 A4 几何），由 §10.5 的 A4 PDF 像素基线承担。

### 10.3 只读冒烟（`scripts/_smoke_stocktake_live.py` 扩展）

新 query/mutation 是否注册于 `/admin-api`、`shop-api` 未泄漏、`stocktakeStats` 与 `stocktakeExport` 可只读调用、`states` 多值过滤可用。生产**只读**：不建任务、不发布、不导出写盘（导出只取内容不落盘）。

### 10.4 验收标准

- 单测全绿；手机截图齐全且无 JS 异常；线上只读冒烟 PASS（不可验证项如实记 `SKIP`，沿用偏差 #50 先例）。
- 打印：§10.5 基线 diff **0 像素差**（同一渲染环境）；跨机自动降级为结构断言并如实记 `SKIP pixel`；物理打印机只做人工走查（几何与分页与基线一致），不做逐像素比对。
- 端到端：草稿创建 → 编辑范围 → 发布 → 认领 → 录入 → 提交 → 统计/导出/打印 → （本地可逆闭环，生产不调 `postStocktake`）。

### 10.5 打印像素基线（新增）

| 项 | 约定 |
|---|---|
| 基线目录 | `web-admin/_e2e/baselines/print/<case>/`，内含逐页 `page-N.png` + `env.json`（Chromium 版本 / 视口 / dpr / PDF 参数 / 字体栈 / 录制时间） |
| 用例 | `diff-a4`（有差异且跨页）、`empty-a4`（无差异说明行）、`big-a4`（多页 + 续页 `thead` 重复） |
| 脚本 | `_e2e/_verify_print_baseline.py`：`--record` 录基线，默认比对；逐页 diff **容差 0**；超差输出 `_diff/` 对比图并退出非 0 |
| 跨机降级 | 检测到渲染环境指纹与 `env.json` 不符时，跳过像素比对，只跑「页数 / 页尺寸 / 文本可复制 / 无横向溢出」并输出 `SKIP pixel`（不虚报为 PASS） |
| 环境变更 | 改 Chromium 版本 / 字体栈 / PDF 参数 = 基线失效，必须重录，并在偏差说明区记录（不允许放宽容差蒙过） |

---

## 11. 交付物与部署

| 交付物 | 说明 |
|---|---|
| 后端 `cjk-plugin` | 改 `src` → `npm run build` 重建 `lib/`（`lib/` 是 git 跟踪产物，提交 src+lib）→ 服务器 `git pull` + `pm2 restart` |
| 前端 `web-admin` | `node scripts/deploy.mjs`（本地构建 → 校验 → scp → 解压 → nginx reload） |
| 规格 / 计划 | 本文 + `docs/superpowers/plans/2026-09-25-stocktake-ops-enhancement-plan.md` |
| 修复手册 | `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` 新增一章（含截图与线上复验记录） |
| 线上用户手册 | `src/static/manual/index.html` 新增 op-39（用户向：分页、草稿、统计、导出与打印），引用新截图 |
| 回归脚本 | `web-admin/package.json` 增 `test:smoke:live` / `test:e2e:stocktake` / `verify:manual` / `verify:print`；脚本内自检 python/playwright 可用性并以退出码表达结果 |
| 打印基线 | `_e2e/baselines/print/<case>/`（逐页 PNG + `env.json`）与 `_e2e/_verify_print_baseline.py`（§10.5） |

---

## 12. 风险与已知取舍

| 风险 | 说明 | 缓解 |
|---|---|---|
| 列表 N+1 | `listTasks` 对每条任务调 `buildTaskView`；分页放大到 100 会把开销放大 | 前端 `pageSize` 保持 50；若实测变慢，再单开一轮做批量查询（本轮不做） |
| `states` 与 `state` 并存 | 语义歧义风险 | 单测锁住优先级；前端只下发 `states` |
| 草稿范围漂移 | 发布时才解析范围，草稿停留久则发布结果与建草稿时的直觉不同 | 草稿详情显式提示「发布时按当前库存与商品集合生成应盘清单」 |
| CSV 中文乱码 | Excel 对无 BOM 的 UTF-8 CSV 会乱码 | 强制前置 BOM；验收含中文列名与实际打开 |
| 打印版式漂移 | 版式已用绝对单位钉死（§7.5），但渲染环境（Chromium 版本 / OS 字体）变化会使像素基线失效 | 版式侧消除自适应（`table-layout: fixed` + mm/pt 固定几何）；像素基线只在录制环境生效，跨机自动降级为结构断言，环境变更须重录基线 |
| 打印基线维护成本 | 3 个用例 × 多页 PNG 进仓，且每次改打印样式都要重录 | 用例只覆盖「跨页 / 空态 / 多页续表头」三类边界；基线图不入构建产物（`_e2e/` 不参与 `build:h5`） |
| 导出无鉴权粒度 | 沿用 `ReadCatalog`，能看盘点结果即可导出 | 与既有只读口径一致；如需更细粒度另开权限点 |