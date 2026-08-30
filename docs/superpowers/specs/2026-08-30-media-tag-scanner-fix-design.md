# 媒体库标签常驻 + 扫码相机交互改进（设计）

日期：2026-08-30
状态草稿，待复核

## 背景与根因

两个线上体验问题（web-admin，H5 手机视图）：

1. **媒体库看不到分类标签**：`MediaLibraryModal.vue` 顶部分类过滤栏只渲染后端 `assetTags` 聚合出的「已存在」标签（`v-for="t in availableTags"`），全新媒体库没有图片带标签 → 过滤栏只剩「全部」。预设的 18 个分类（`PRESET_ASSET_TAGS`）仅在**选中图片后**才在底部「常用分类」出现（`v-if="selected.length"`）。结论：打开媒体库第一眼看不到任何标签体系。

2. **扫码相机无操作引导**：`utils/scanner.ts` 的 H5 分支只放一个全屏 `<video>` + 一个「取消扫码」按钮。没有取景框、没有「对准条形码」提示、没有识别成功/失败反馈，也没有「手动输入」入口；要扫中才自动填入。用户开着相机不知对准哪里。

## 目标

让「分类标签」在媒体库打开即可见可筛；让 H5 扫码相机有清晰的取景框、操作提示、结果反馈与「手动输入」兜底，且不支持扫码的环境不再白屏报错。

## 非目标 / 范围外

- 不改后端 `assetTags` / `assetLibrary` 接口语义（聚合接口已够用）。
- 不改 App 原生 `uni.scanCode` 分支（App 走系统扫码，已有原生交互）。
- 不引入第三方扫码库（保持免装依赖）。
- 不接 OSS / 不管上传路径。

## 设计

### A. 媒体库标签常驻呈现（`MediaLibraryModal.vue`）

顶部分类过滤栏改为：常驻「全部 + 18 预设分类 + 额外非预设标签（若有）」。

- **展示**：`[全部]` 置于首位；随后按 `PRESET_ASSET_TAGS` 顺序渲染 18 个预设，横滑；若后端聚合出不属于预设的标签，按聚合顺序追加在末尾，与预设去重。
- **计数**：`fetchAssetTags()` 结果构成 `Map<name,count>`；每个预设/额外标签显示命中数（无命中显示 `0`）。计数在**各刷新节点**重新拉取：打开弹层 `watch(visible)`、上传成功后（`chooseAndUpload` 的 `load(false)` 之后）、删除成功后（`onDelete` 内）均调用 `loadTags()`（现状 `loadTags()` 仅在打开时调用，需补全这三处）。
- **筛选**：点标签 = 顶部筛选（沿用现有 `activeTag` + `filteredItems` 过滤逻辑），高亮当前选中。点「全部」清除筛选。
- **语义区分**：顶部标签 = 过滤（只读）；底部「常用分类」（选图后出现）= 打标编辑（点选/自由输入）。两者共用预设清单但互不影响。
- **空态**：选中某标签但无匹配图时，网格区显示「暂无【XX】图片」（复用 `mlm__empty` 样式补充文案）。
- **图片标签徽标**：已有（`mlm__cell-tags`）保留。

### B. 扫码相机交互（`utils/scanner.ts` + 上层 `ProductVariantMatrixTab`）

B1. `scanner.ts` 改造（仅 H5 `scanOnH5`/`scanWithCamera`）：
- **取景框**：相机全屏后，中央渲染一个约 `min(78vw, 420px)` 见方的取景框——框线亮色 + 四角角标，框外两侧加半透明暗化遮罩（用 CSS 覆盖在 video 上，不改动 `<video>` 本身内容实时性）。
- **提示**：顶部条「将条码对准框内」常驻；识别成功时顶部改为「识别成功」+ 框线变绿 + `navigator.vibrate?.(50)`；持续约 8s 未识别显示「未识别到条码，可对准更清晰或点【手动输入】」。
- **按钮**：顶部「✕ 取消」（现状保留）；底部常驻「📷 手动输入」。
- **手动输入信号**：点「手动输入」→ 清理相机 DOM/stream/timer → `reject` 一个带 `code` 的错误（见 B3）。
- **降级不白屏**：无 `BarcodeDetector`、无 `getUserMedia`、非 `secure context`、或是微信内置浏览器（未接 jssdk）时，**不再直接报错白屏**，而是立即 `reject` 一个 `code:'MANUAL'`，交由上层弹手动输入框。
- **清理**：所有退出路径（成功/取消/手动/摄像头失败）都统一 `cleanup()`：清 `setInterval`、`video.srcObject=null`、`stream.getTracks().stop()`、移除 video 与按钮 DOM，防内存/摄像头占用泄漏。

B2. `scanner.ts` 结构与错误码：
- 顶部导出新增 `class ScannerError extends Error { code: string }`。
- `scanCode()` 对所有 fallback/失败路径统一 reject `ScannerError`：
  - `code:'MANUAL'` —— 无能力/用户点手动输入/微信内置 → 上层弹手动输入。
  - `code:'CANCEL'` —— 用户点「取消」→ 上层静默关闭。
  - `code:'FAILED'` —— 摄像头打开失败等 → 上层提示后转手动输入。
- 保留 App 分支（`uni.scanCode`）与原生 reject 文案不变语义。

B3. 上层 `ProductVariantMatrixTab`（二维码/条码/内码输入的扫码按钮）：
- 原来 `catch` 仅 `uni.showToast("扫码失败")`，改为：
  - `err.code==='MANUAL' || err.code==='FAILED'` → 弹手动输入（复用条码/内码输入弹层：一个居中 input overlay，确认后写入当前输入字段）。
  - `err.code==='CANCEL'` → 静默关闭。
  - App 原生路径原样。
- 手动输入弹层：固定采用 uni-app 的 **`uni.showModal({ editable: true })`** 可编辑弹层（H5/App 均支持），content 预填当前输入字段已有值，确认后将输入文本写回该字段；`editable` 不可用的极端环境回退到普通 `uni.showModal`（无编辑）并 toast 提示。以「能录入条码文本到当前字段」为准。

### C. 测试交付（三件套）

- 媒体库顶部标签：用 `docs/demo/skeleton` 骨架起手机视口（390×844 @2x），登录超管后打开媒体库截图，断言顶部出现预设标签横条与计数、点标签筛选生效。
- 扫码：headless 无法真调摄像头，用真机/Chrome 手机开发者工具人工验证「取景框 → 对准 → 成功反馈 → 手动输入」路径；自动化仅验证「不支持环境直接进手动输入弹层」的降级分支。
- 命令与截图归档到 `docs/demo/playwright/` + `web-admin/src/static/manual/`（操作手册），并把手机截图补充进手册。

## 关键文件

- `d:\zhao\vshop\web-admin\src\components\MediaLibraryModal.vue`
- `d:\zhao\vshop\web-admin\src\utils\scanner.ts`
- `d:\zhao\vshop\web-admin\src\components\product-tabs\ProductVariantMatrixTab.vue`（扫码按钮 + 手动输入弹层）

## 取舍说明

- 顶部常驻预设而非只显示「已存在标签」：让运营第一眼看到分类体系、也知道该给图分什么类；计数提供「哪类没图可补」的信息。缺点：预设较多时横条较长，用 `scroll-x` 横滑缓解。
- 扫码不引第三方库：BarcodeDetector 已覆盖主流 Chrome/Android 常用条码（EAN/UPC/Code128 等），保持免装依赖；不支持环境一律走手动输入，保证功能始终可用。