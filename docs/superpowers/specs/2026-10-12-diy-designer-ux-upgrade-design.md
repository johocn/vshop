# DIY 串珠设计器体验升级（P7）设计文档

> 日期：2026-10-12　状态：待用户审阅
> 背景：对标「珠了个珠」小程序设计器（4 张参考截图）+ 用户三条新增硬需求，在 P6 交付的设计器基础上做体验升级。
> 前置约束：仍走 vshop uni-app 主线 pkg-diy 分包；后端 diy-plugin shop-api 零改动；@diy/calc 纯函数不动；金额分/毫米口径不变；i18n 五语言同步。

## 1. 目标与非目标

**目标**
1. 方案 C 双层融合：默认「直觉流」画布（点卡即上珠），轻量 chips 一键切专业模式（定手围/定颗数/混搭），两层共享同一序列数据。
2. 画布交互：珠子/隔片**拖拽换位**、**拖出删除**、点选快删；序列条与环上状态双向同步。
3. **预览全貌修复**：任意颗数/规格下整串手环完整可见（当前固定比例会裁切，只能看见一部分）。
4. 选料面板重构：分类侧栏 + 3 列素材网格卡 + 珠子/配饰双 tab + 搜索框 + 选中 ×n 角标 + 长按看素材详情。
5. 运营氛围：顶部实时胶囊（手围约/内孔周长 + 状态词 + 价格 + 帮助）、操作行（清空/暂存/推荐/完成设计）、画布品牌水印。

**非目标（本期不做）**
- 语音讲解/音效（参考图音量按钮，YAGNI 后续再看）
- 广场/详情/下单链路改动（P6 已交付，不动）
- 后端任何接口/字段变更
- 素材 admin 后台改造

## 2. 信息架构（方案 C）

```
designer.vue
├── 顶部胶囊条（常驻）：[手围约 X cm · 状态词] [¥价格] [帮助?]
│     └─ 专业模式下为 [内孔周长 X cm · 状态词]，点击开计算明细抽屉（保留 P6 能力）
├── 模式 chips：直觉流(默认) | 定手围 | 定颗数 | 混搭
│     └─ 原「自由拖拽」并入直觉流（下文 3.1）；chips 即 P6 四模式入口的重组
├── 画布区（BeadRing v2）
│     ├─ 全貌自适应缩放（3.3）
│     ├─ 珠子拖拽换位 / 拖出删除（3.2）
│     └─ 中心品牌水印（低透明度，店铺名/品牌字，从全局配置取，取不到则显示纯圆环）
├── 操作行：清空 | 暂存 | ↻推荐 | 完成设计（=保存方案·¥X，跳服务端复算报价）
└── 选料面板（MaterialPanel v2，4.）
```

**模式映射（对 useDesigner 的改动）**
- 新增 `mode: 'intuitive'`（默认）。直觉流 = free 模式超集：序列数据结构完全复用 `sequence`（string[]），追加=push 尾部；若 P6 序列含对称镜像逻辑则原样保留并加开关（默认沿用现状），无则不新增。
- `byWrist / byCount / pattern` 三个专业模式逻辑不变；从直觉流切入时，以当前 sequence 反推槽位配置（沿用 P6「pattern→free」的反向解析，方向改为 free→pattern 归一化）。
- 状态词统一由 calc v2 输出的内孔周长与目标手围差值计算：`过短(<−20mm) / 偏短(−20~−4) / 合适(−4~+4) / 偏长(+4~+20) / 过长(>+20)`（阈值随松紧档联动，具体以 easeOf 档位值 4/10/20 为基准）。

## 3. 画布交互与全貌修复

### 3.1 直觉流上珠
- 点击素材卡：按卡上选中规格追加一颗到序列尾部，画布立即渲染新珠（带 120ms 落位动画，reduced-motion 时跳过）。
- 已选计数：素材卡右上 ×n 角标实时累计（按素材 id 统计 sequence + decor）。
- 配饰 tab：流苏/吊坠等 decor 项，点击挂到画布预留位（不进几何，同 P6）。

### 3.2 拖拽换位与删除
- **命中**：touchstart 命中检测——触点转极坐标，取与珠心角距最近且半径差 < 珠半径的珠。
- **换位**：拖动中显示 ghost 珠跟随手指，原位半透明；落点角度落到相邻两珠之间即插入该索引（sequence 重排，splice+insert）。松紧反馈/价格实时重算。
- **删除**：拖出环心距 > 1.6×环半径时显示红色 ✕ 吸附态，松手删除该颗；mp 端用同套 touch 事件（uni touchstart/move/end）。
- **点选快删**：单击珠子弹出迷你气泡（删除 / 换成该类其他规格），避免误触拖拽（位移阈值 6px 内视为点选）。
- **对称镜像**：开启 palindrome 时拖拽/删除按镜像联动（两颗同步动），气泡提示「已联动镜像位」；可关闭。
- 序列条（SequenceStrip）保留，与环上拖拽共用同一 sequence，双向同步高亮。

### 3.3 全貌自适应缩放（修复要点）
- 现状问题：BeadRing 以固定比例（真实直径像素化）绘制，颗数多/珠径大时环外径超出 canvas 视口，只能看到一部分。
- 修复算法：
  ```
  centerR  = calc v2 收敛后的环中心线半径（已有）
  outerR   = centerR + max(珠半径) + decor 最大外伸
  scale    = clamp( (min(canvasW, canvasH)/2 - padding 12) / outerR , 0.4, 1.15 )
  绘制     = 所有几何 × scale；scale 变化用 160ms 过渡（reduced-motion 跳过）
  ```
- 画布高度：预览区高度 = min(62vh, 420px)；宽屏（>768px）居中限宽 480px。
- 验收口径：12mm×20 颗、8mm 混 12mm×28 颗、含吊坠 decor 三种极限 case 整环均完整可见且留白 ≥12px。

## 4. 选料面板重构（MaterialPanel v2）

- **结构**：`珠子 | 配饰` 双 tab + 搜索框（按名称/别名模糊，显示「搜索 N」计数）+ 左侧分类竖滑栏（来自 diyCategories，当前类高亮左侧 brand 竖条）+ 右侧 3 列素材网格卡。
- **素材卡**：圆珠缩略图（renderUrl→preset→纯色三级回退，复用 bead-render）+ 名称 + `规格 ¥价格`（主规格直显；多规格卡上以 chips 微切换或点卡弹出规格选择——默认直显最小规格，点卡若多规格先弹规格行）。
- **选中态**：border brand + ×n 角标。
- **长按详情**：长按 350ms 弹素材详情半屏弹层（大图 + 介绍文案 + 全规格价格列表 + 「选它」按钮）；H5 用 contextmenu/长按计时器，mp 端 longpress。
- **性能**：网格用分页/虚拟滚动（每类首屏 20 个，滚动加载）；图懒加载。

## 5. 运营氛围

- **推荐 ↻**：一键灵感——按当前目标手围从素材库规则化生成一套搭配（主珠按分类热度 + 隔片互补色/径 + seeded 随机可复现），生成后以直觉流序列填充，toast「已生成推荐搭配，可继续调整」。纯前端，不新增接口。
- **暂存**：未登录可暂存本地（localStorage/uni storage，单草稿），登录后保存走 P6 createDiyPlan；「完成设计」= P6 保存+复算报价链路，文案改「完成设计」。
- **清空**：二次确认弹层（防误触）。
- **帮助 ?**：半屏弹层，图文 4 步玩法说明（i18n）。
- **水印**：画布中心低透明度品牌字/圆环（取 ShopGlobalConfig 店铺名，P6 已有 L1 配置链），不遮挡交互。

## 6. 数据模型与状态

- `useDesigner` 扩展：`mode` 加 `'intuitive'`；`sequence` 仍为唯一真源；新增 `capsule`（状态词+目标手围）、`recommendSeed`。
- 序列操作 API 统一收敛：`appendBead(materialId, specId) / moveBead(from, to) / removeAt(i) / replaceAt(i, specId) / applyRecommend(seed)`；pattern 模式内部仍走槽位归一化，切出直觉流时 sequence 为准。
- 兼容：URL 带 planId 进入仍走 P6 详情/复刻链路；草稿恢复（storage）进直觉流。

## 7. i18n

新增词条（五语言同步）：`diy.designer.intuitive / capsule.tooShort / capsule.slightlyShort / capsule.fit / capsule.slightlyLong / capsule.tooLong / action.clear / action.draft / action.recommend / action.finish / help.title / help.step1..4 / material.longPressHint / bead.mirrorLinked / confirm.clear / recommend.toast` 等，预计 ~20 条。

## 8. 边界与降级

- decor（吊坠）参与 outerR 计算但不参与拖拽换位（仅可点选删除/替换）。
- 单珠序列（1 颗）不允许拖拽换位（无可交换位置）；空序列画布显示引导态「点击下方素材开始」+ 首选推荐位。
- mp-weixin：touch 事件与 canvas 2d 同套逻辑； movable-area 方案仅用于序列条（沿用 P6）。
- 老旧机型 canvas 帧率：拖动中仅重绘 ghost 层，落位才全量重绘。

## 9. 验收标准

1. 手机视口（390×844 dpr=2）截图：直觉流空态/12 颗/20 颗/含吊坠，整环全貌可见。
2. 拖拽换位、拖出删除、点选删除、镜像联动全链路可用（H5 实测 + mp 构建通过）。
3. 直觉流 ⇄ 专业模式往返切换，序列/价格/明细一致。
4. 推荐一键生成、暂存、清空、帮助弹层可用。
5. 搜索、分类侧栏、长按详情、×n 角标可用。
6. 五语言无缺漏 key；`pnpm build:h5` 与 `build:mp-weixin` 通过。
7. P6 手工用例 16 条回归通过（模式重组后用例 3/4/5/6/7 更新为直觉流路径）。

## 10. 涉及文件（预估）

- `src/pkg-diy/pages/designer.vue`（模式 chips/胶囊条/操作行/水印）
- `src/pkg-diy/components/BeadRing.vue`（v2：fit 缩放 + 拖拽命中/ghost/删除）
- `src/pkg-diy/components/SequenceStrip.vue`（同步微调）
- `src/pkg-diy/components/MaterialPanel.vue`（重构 v2）+ 新增 `MaterialDetailPopup.vue` / `HelpPopup.vue`
- `src/pkg-diy/composables/useDesigner.ts`（intuitive 模式 + 序列操作 API + 状态词）
- `src/pkg-diy/utils/recommend.ts`（新增，seeded 推荐）
- `src/i18n/locales/*.json`（五语言词条）
