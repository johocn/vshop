# 媒体库标签完善 + 扫码重构 V2 设计

> 范围：web-admin 前端（MediaLibraryModal.vue / scanner.ts / ProductVariantMatrixTab.vue）
> 结论前置：按用户 2026-08-30 决策拍板——扫码换 html5-qrcode 成熟库、标签分组多行网格、识别约 1 秒 1 次、手动对焦探测可用才展示。

## 一、媒体库标签：分组多行网格

### 1.1 顶部布局（替换现有单行横条）
- 顶部改为「全部」+ 6 大分组集中网格：
  - 商品图 / 富媒体 / 营销 / 店铺 / 资质 / 通用（组行已含在 `PRESET_ASSET_TAGS` 的 20 个预设）
- 每组一个**小标题**（如「商品图」）+ 该组内标签 **chips 网格**（多行网格、非单行横滚），每个 chip 带计数。
- 点选 chip = 筛选（`activeTag`）；再次点=取消；点「全部」清空。
- 分组可**折叠/展开**（默认展开，组头带箭头），避免顶部过高遮挡图片区；外层 scroll 整体可下滑露出更多组。
- 额外非预设标签归入「自定义」组追加显示。

### 1.2 滚动刷新
- **上拉**：触底自动加载下一页（现 `loadMore`，保留）。
- **下拉刷新**：顶部下拉手势重新拉取列表与标签计数（自定义手势；H5 弹层内手动实现 touch 序列，阈值触发 `refresh()`）。保留右上角「刷新」图标按钮兜底（移动端下拉手势可能被压缩/遮挡时使用）。
- 每次筛选切换/上传/删除成功后刷新计数（现有 `loadTags()` 机制保留）。

### 1.3 打标签流程（明确化）
1. 图片勾选（点选/多选，`selected`）。
2. 底部**操作条**常驻显示「已选 N」+ 主按钮「**打标**」。
3. 点「打标」→ **弹出分类面板**：分组展示全部分类 chips（复选）；已选图片的现有标签标「已有」；可勾选多个分类批量应用到全部已选图片；底部可新增自定义分类码。
4. 确认 → `setAssetTags(ids, tags)` 一键写入 → 关闭面板、刷新顶部计数（`loadTags()`）。

> 兜底：未勾选图片时「打标」禁用并提示「请先选择图片」。

## 二、扫码重构：html5-qrcode

### 2.1 依赖与架构
- 引入 `html5-qrcode`（约 45KB JS，1D+2D 通用），**替换自研 BarcodeDetector 循环**。
- `scanner.ts` 结构：
  - H5 → `Html5Qrcode` 类 + 自绘居中取景框（沿用上轮遮罩/角标/提示/反馈/手动输入 UI，CSS 重做居中）。
  - `#ifndef H5` → App/小程序仍 `uni.scanCode` 原生。
- 解码配置：
  - `{ facingMode: 'environment' }`
  - **`fps: 1`（每秒 1 次，命中即停）**
  - `qrbox` 尺寸取景框宽约 78% 宽、正方形；
  - `formatsToSupport`: QR_CODE + EAN_13/8 + CODE_128 + UPC_A/E + CODE_39 + ITF（商品条码全覆盖）。
- 命中 `onSuccess(raw)` → `codeReader.stop()` → resolve 条码。

### 2.2 取景框居中（修「不在中间」）
- 全屏 video + overlay；取景框相对**可视视口**绝对居中，`margin-top` 适配顶部刘海/URL 条，底部预留操作条 + `safe-area-inset-bottom`。
- 不再用 `window.innerHeight` 裸算，改用 `window.visualViewport` 高度 + `env(safe-area-*)`，真机居中稳定。

### 2.3 手动对焦（探测可用才展示）
- 拿到流后 `track.getCapabilities()`：
  - 若 `focusMode` 含 `manual`/`continuous`（Chrome for Android）→ 展示对焦控件：
    - **点按画面** → `applyConstraints({ focusMode:'manual', focusDistance: cap.focusDistance.max*0.5 })`；
    - **对焦距离滑块**：范围 `cap.focusDistance.{min,max,step}`，微调；
  - 能力不存在（iOS Safari / 桌面 Chrome 等）→ **不渲染对焦控件**，置 `focusMode:'continuous'` 自动对焦，全程不白屏。
- 对焦控件文案默认中文。

### 2.4 降级链（不白屏）
- 无 `navigator.mediaDevices` / 相机权限失败 / html5-qrcode 不支持环境 → 一律回 `ScannerError` 分级：
  - `CANCEL`：用户取消，静默。
  - `MANUAL`：能力不足/点手动输入 → 上层弹 `showModal({editable:true})` 手动录入。
  - `FAILED`：相机打开失败 → toast 提示。
- `ScannerError` 类保持导出，`ProductVariantMatrixTab` 现有 code 分流逻辑不动。

## 三、构建与部署

- `npm i html5-qrcode`（web-admin，agent 可构建；不触碰 HBuilderX 三目录）。
- 本地 `npm run build:h5` → 产物 grep 含新增解码器特征号（体积可能 +~50KB，可控）。
- 提交 git → `deploy.mjs` 上线（仅前端）。

## 四、验收（测试/交付规则）

- **媒体库**：手机视口截图补手册——顶部分组网格/折叠、下拉刷新、勾选→打标→面板→写入→计数刷新各一步一图。
- **扫码**：真机（Android Chrome）验证——取景框居中、对准 EAN-13/QR 每秒识别、命中自动填入、点按对焦+滑块（Android）、手动输入降级正常。
- 产出《媒体库打标签》《商品扫码》两个手机截图手册章节。

## 五、非目标
- 不做纯前端 OCR 图片识别增强；不接 OSS；不改 icon 库。