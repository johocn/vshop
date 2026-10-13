# DIY 设计器 P7.2：拖拽换位（swap）修正 + 常驻面板布局改造

> 日期：2026-10-13　状态：设计已确认（用户选定方案 B 常驻面板）
> 关联：2026-10-12-diy-designer-ux-upgrade.md（P7）、2026-10-13-diy-designer-canvas-color-fix-design.md（P7.1）

## 1. 背景与问题

1. **拖拽语义与设计文档不符（核心错误）**：设计文档要求「手串上的珠子可自由拖拽，松手与目标互换位置」；当前 `BeadRing.vue` 松手实现是 splice 插入语义（`insertIndexAt` + `moveBead`），其余珠子顺移而非互换。
2. **布局与竞品差距**：参考竞品「珠了个珠」四图（桌面 1-4.jpg）优点——底部常驻选料面板（左分类列 + 3 列实拍卡 + 计数 + ×n 已用角标）、细轨道圆、环心品牌水印、图标化操作行。当前为弹层选料、无轨道圆/水印、文字操作行 + 固定底栏 CTA。

## 2. 目标

1. 画布珠子拖拽改为混合三态语义（用户已确认）：**压珠=互换、落隙=插入、出环=删除**，拖拽过程三态实时预览。
2. 布局改方案 B：底部常驻选料面板，页面 100vh flex 不滚动。
3. 画布增强：660rpx + 细轨道圆 + 环心品牌水印。
4. 操作行图标化，完成设计主按钮移入操作行。
5. 非 free 模式参数/槽位默认折叠为摘要条。
6. 五语言词条同步；回归验证 + 手机截图 + 手册更新 + 部署。

## 3. 方案

### 3.1 swap 拖拽三态（BeadRing.vue / useDesigner.ts / designer.vue）

松手判定优先级（`onTouchEnd`）：

| 优先级 | 条件 | 行为 |
|---|---|---|
| 1 出环 | dist(松手点, 环心) > ringR×1.6 | `emit('bead-remove', index)`（现有） |
| 2 压珠 | `hitBead(x,y)` 命中且 ≠ 拖起珠自身 | `emit('bead-swap', from, to)`（**新增**） |
| 3 落隙 | 未压珠但在环内 | `emit('bead-move', from, to)`（保留 splice 插入） |

- 拖拽过程实时预览（`render()` drag 分支 + `onTouchMove` 更新 `drag.phase`）：
  - `swap`：目标珠画 brand 色虚线圈（半径 +4）；
  - `insert`：落点间隙画插入指示（小虚线圈）；
  - `delete`：红圈 ✕（现有）。
  - `DragState.phase` 由 `'move' | 'delete'` 扩展为 `'swap' | 'insert' | 'delete'`。
- `useDesigner.ts` 新增 `swapBead(from, to)`：`[next[from], next[to]] = [next[to], next[from]]`，收尾与 `moveBead` 同路径（重算/状态更新）；`from === to` 或越界早退。
- `designer.vue`：`@bead-swap="onBeadSwap"` → `d.swapBead(from, to)`。
- **序列条（SequenceStrip.vue）保持实时顺移不变**：画布环与序列条是两个交互面，列表拖拽实时顺移为惯例；设计文档「拖拽换位」以画布环为准（用户已确认）。

### 3.2 布局 B：常驻面板（designer.vue / MaterialSheet → MaterialPanel）

```
designer（100vh flex column，overflow hidden，不整页滚动）
├─ designer__top（flex-shrink: 0）
│  ├─ 胶囊行（现有 capsules：手围/内孔+松紧 · 价格 · 帮助?）
│  ├─ BeadRing（690 × 660rpx）
│  ├─ 操作行：🗑清空 · ✓暂存 · ↻推荐 · [完成设计 · ¥X]（主按钮右置）
│  ├─ ModeChips（4 模式）
│  └─ 序列条（free）/ 参数摘要条（非 free，点开浮层展开滑杆与槽位）
└─ designer__panel（flex: 1，min-height: 0，内部滚动）
   └─ MaterialPanel（常驻）
```

- 原 fixed 底栏 CTA 删除；「完成设计」主按钮沿用 `onSave` 全部逻辑（canSave / 登录拦截 / 服务端复算比对不变）。
- 非 free 参数/槽位：默认摘要条（手围 · 松紧 · 间隙一行 + 展开▾），展开为绝对定位浮层覆盖面板上方；槽位选料 = 点槽位 → `activeSlotIdx` 高亮 → 点面板卡指派 `assignSlot(activeSlotIdx, id)`。
- `MaterialPanel`（由 `MaterialSheet` 改造）：珠子/配饰 tab + 搜索框 + 「共 N 款」计数 + 左分类竖列（全部 + categories）+ 右 3 列素材卡（`renderUrl` 实拍图，缺失回退 preset 色块/组色板）+ ×n 已用角标（`pickCounts` 已有）。
- 点卡行为：free → `d.appendBead(id)`；非 free → `assignSlot`。
- 面板底部 `env(safe-area-inset-bottom)` 安全区。

### 3.3 画布增强（BeadRing.vue render()）

- 轨道圆：珠心轨迹细线 `rgba(0,0,0,0.08)`，半径 = ringR，先于珠子绘制。
- 环心水印：两行文本（品牌名 + 英文标语），透明度 ~0.10-0.12；文案 props 传入，designer.vue 从 tenant store 取（`shopName` / `rawGlobalConfig` 品牌字段），i18n `diy.brandWatermark` / `diy.brandSlogan` 兜底。
- **H5 hidpi 铁律（P7.1 结论）**：H5 端单位矩阵 + CSS px 坐标，禁止手动 `scale(dpr)`；新绘制代码一并遵守。

### 3.4 多语言

新词条（`diy.*`）：`searchMaterial`、`materialCount`（共 {n} 款）、`catAll`、`brandWatermark`、`brandSlogan`、`paramSummary` 等；zh-CN / zh-TW / en / ja / ko 全量同步，禁止单语言写死。

### 3.5 错误处理

- 素材贴图加载失败 → preset 色块回退（现有 imageLoader reject 路径）。
- 全局配置缺失/接口失败 → i18n 兜底文案。
- swap 目标无效（from=to / 越界）→ `swapBead` 早退。
- 面板素材为空 → 空态提示（复用 `diy.emptyHint`）。

## 4. 验收（回归判据）

Playwright 手机视口 390×844 dpr=2，重写验证脚本（旧脚本已清理，不恢复）：

1. **swap**：拖 i0 珠压到 i3 珠松手 → 序列两位置互换，其余不动。
2. **落隙**：拖到两珠间隙 → 插入语义，其余顺移。
3. **出环删除**：拖出环 → 移除。
4. **实时预览**：拖拽中目标虚线圈 / 红圈渲染。
5. **常驻面板**：面板可见、点卡 free 追加、×n 角标计数更新、分类/搜索可用。
6. **轨道圆 + 水印**：渲染存在。
7. **bbox 居中回归**（P7.1 判据）。

交付：手机截图 ≥5 张补操作手册、测试用例清单更新、本地构建 → commit → push → 部署 e.joho.cn → 线上抽查。

## 5. 范围外

- 序列条改 swap（用户未要求，保持实时顺移）。
- 面板高度拖拽调节/折叠。
- 小程序端 MaterialPanel 适配细节（H5 优先，沿用现有平台降级分支）。
