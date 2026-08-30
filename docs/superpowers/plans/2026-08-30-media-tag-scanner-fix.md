# 媒体库标签常驻 + H5 扫码相机交互改进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让媒体库打开即可看到并筛选「全部+18预设分类+额外标签」的分类体系；给 H5 扫码相机加取景框、对准提示、成功/失败反馈与「手动输入」兜底，且不支持扫码的环境不白屏。

**Architecture:** 三处本地改动、后端口径不变。（A）`MediaLibraryModal.vue`：顶部过滤栏改为常驻渲染「全部 + 预设 + 额外标签」并显示计数（计数来自现成 `fetchAssetTags()` 聚合），上传/删除后刷新；点顶部=筛选，底部=打标，语义分离。（B）`scanner.ts`：H5 分支在全屏 video 上叠加取景框/角标/提示/按钮 DOM，识别成功变绿+振动；用 `ScannerError(code)` 统一结果态（MANUAL/CANCEL/FAILED），不支持扫码即刻 `reject(MANUAL)` 不白屏。（C）`ProductVariantMatrixTab.vue`：`scanSkuField` 按 code 分流，MANUAL/FAILED 走 `uni.showModal({ editable:true })` 手动输入。

**Tech Stack:** uni-app（H5 构建，vue3 + TS + scss）、Vendure 后端已有 `assetLibrary/assetTags/setAssetTags`；`docs/demo/skeleton` Playwright 手机视口（390×844 @2x）用于验证与手册截图。

---

## 文件结构

- Modify: `web-admin/src/utils/scanner.ts` — H5 扫码相机交互（取景框/提示/反馈/手动输入/降级 + `ScannerError`）。
- Modify: `web-admin/src/components/product-tabs/ProductVariantMatrixTab.vue` — `scanSkuField` 按 `ScannerError.code` 分流 + `uni.showModal` 手动输入。
- Modify: `web-admin/src/components/MediaLibraryModal.vue` — 顶部标签常驻渲染 + 计数刷新 + 空态文案。
- Verify: `docs/demo/skeleton`（复用）起手机视口截图断言媒体库顶部标签。

> 说明：本项目（uni-app H5 组件 + DOM 相机）无既有单测框架，验证以「`npm run build:h5` 编译通过 + Playwright 手机截图（媒体库标签）」为主；相机真实识别用真机/Chrome 手机开发者工具人工过（headless 无法调摄像头）。

---

## Task 1: scanner.ts — 扫码相机交互改进

**Files:**
- Modify: `web-admin/src/utils/scanner.ts`（整体重写为下方实现）

- [ ] **Step 1: 重写 scanner.ts**

```typescript
// 扫码工具：App/小程序用 uni.scanCode 原生；H5 优先用浏览器原生 BarcodeDetector（Chrome 内置，免装依赖），
// 并叠加取景框/对准提示/识别反馈/手动输入入口；能力不足时降级为手动输入信号（code='MANUAL'），不白屏。
// 统一返回 Promise<string>；失败 reject ScannerError，上层按 e.code 分流。
export class ScannerError extends Error {
  code: string;
  constructor(code: string, msg: string) {
    super(msg);
    this.name = 'ScannerError';
    this.code = code;
  }
}

const MANUAL = 'MANUAL';   // 能力不足/用户手动输入/微信内置 → 上层弹手动输入
const CANCEL = 'CANCEL';   // 用户取消
const FAILED = 'FAILED';   // 摄像头打开失败等

// #ifdef H5
function isWechat(): boolean {
  return typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent || '');
}
// #endif

export function scanCode(): Promise<string> {
  // #ifdef H5
  return scanOnH5();
  // #endif
  // #ifndef H5
  return scanNative();
  // #endif
}

// #ifndef H5
function scanNative(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof uni.scanCode !== 'function') {
      reject(new ScannerError(MANUAL, '当前环境不支持扫码，请手动输入'));
      return;
    }
    uni.scanCode({
      success: (res: any) => resolve((res?.result ?? '').trim()),
      fail: () => reject(new ScannerError(CANCEL, '扫码取消或失败')),
    });
  });
}
// #endif

// #ifdef H5
function scanOnH5(): Promise<string> {
  const Detector: any =
    (typeof window !== 'undefined' && ((window as any).BarcodeDetector)) || undefined;
  // 能力不足（无 Detector / 非安全上下文 / 微信内置）→ 直接给手动输入信号，不白屏
  const secure = typeof window !== 'undefined' && window.isSecureContext !== false;
  if (!Detector || !secure || isWechat()) {
    return Promise.reject(new ScannerError(MANUAL, '请在支持扫码的浏览器使用，或手动输入'));
  }
  return scanWithCamera(Detector);
}

function scanWithCamera(Detector: any): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      reject(new ScannerError(MANUAL, '当前环境无法访问摄像头，请手动输入'));
      return;
    }
    let video: HTMLVideoElement | null = null;
    let stream: MediaStream | null = null;
    let detector: any = null;
    let timer: any = null;
    let timeout: any = null;
    let settled = false;

    const frameBox = () => Math.floor(Math.min(window.innerWidth * 0.78, 420));
    const cleanup = () => {
      if (timer) clearInterval(timer);
      if (timeout) clearTimeout(timeout);
      if (video) video.srcObject = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      document.querySelectorAll('.scanner-ui').forEach((el) => el.remove());
    };
    const finished = (code: string, msg: string, val?: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code && msg && val === undefined) reject(new ScannerError(code, msg));
      else if (val !== undefined) resolve(val);
      else reject(new ScannerError(code, msg));
    };

    // —— 相机层 ——
    video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.position = 'fixed';
    video.style.inset = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.zIndex = '9999';
    video.style.background = '#000';
    document.body.appendChild(video);

    // —— UI 覆盖层（取景框/暗化/角标/提示/按钮）——
    const overlay = document.createElement('div');
    overlay.className = 'scanner-ui';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:10000;pointer-events:none;font-family:system-ui,sans-serif;';
    const fb = frameBox();
    const edge = (vn: string, top: number, left: number, border: string) => {
      const d = document.createElement('div');
      d.style.cssText =
        `position:absolute;width:44px;height:44px;top:${top}px;left:${left}px;border:4px solid #5eead4;${border};pointer-events:none;`;
      d.id = vn;
      return d;
    };
    overlay.appendChild(edge('scanner-corner-tl', 0, 0, 'border-right:none;border-bottom:none;'));
    overlay.appendChild(edge('scanner-corner-tr', 0, fb - 44, 'border-left:none;border-bottom:none;'));
    overlay.appendChild(edge('scanner-corner-bl', fb - 44, 0, 'border-right:none;border-top:none;'));
    overlay.appendChild(edge('scanner-corner-br', fb - 44, fb - 44, 'border-left:none;border-top:none;'));
    // 暗化遮罩（三明治：上下 + 左右露出取景框）
    const mask = (top: number, height: number) => {
      const m = document.createElement('div');
      m.style.cssText =
        `position:absolute;left:0;right:0;top:${top}px;height:${height}px;background:rgba(0,0,0,.45);`;
      return m;
    };
    const mb = (window.innerHeight - fb) / 2;
    const bodyH = Math.max(window.innerHeight, 1);
    const sideW = (window.innerWidth - fb) / 2;
    overlay.appendChild(mask(0, mb));
    overlay.appendChild(mask(mb + fb, bodyH - mb - fb));
    const sideL = document.createElement('div');
    sideL.style.cssText = `position:absolute;top:${mb}px;height:${fb}px;width:${sideW}px;background:rgba(0,0,0,.45);`;
    const sideR = sideL.cloneNode() as HTMLElement;
    sideR.style.left = `${fb + sideW}px`;
    overlay.appendChild(sideL);
    overlay.appendChild(sideR);
    // 顶部提示条
    const tip = document.createElement('div');
    tip.id = 'scanner-tip';
    tip.textContent = '将条码对准框内';
    tip.style.cssText =
      'position:absolute;top:56px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,0,0,.6);color:#fff;border-radius:999px;padding:8px 18px;font-size:14px;white-space:nowrap;';
    overlay.appendChild(tip);
    // 底部按钮：取消 + 手动输入
    const bar = document.createElement('div');
    bar.style.cssText =
      'position:absolute;left:0;right:0;bottom:0;padding:28px 24px calc(env(safe-area-inset-bottom,0px) + 28px);' +
      'display:flex;justify-content:space-between;align-items:center;';
    const mkBtn = (txt: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = txt;
      b.style.cssText =
        'pointer-events:auto;padding:12px 26px;border-radius:999px;border:none;font-size:15px;cursor:pointer;' +
        'background:rgba(0,0,0,.6);color:#fff;';
      return b;
    };
    const cancelBtn = mkBtn('✕ 取消');
    cancelBtn.addEventListener('click', () => finished(CANCEL, '扫码取消'));
    const manualBtn = mkBtn('📷 手动输入');
    manualBtn.style.background = '#0ea5e9';
    manualBtn.addEventListener('click', () => finished(MANUAL, '手动输入'));
    bar.appendChild(cancelBtn);
    bar.appendChild(manualBtn);
    overlay.appendChild(bar);
    overlay.style.pointerEvents = 'auto';
    document.body.appendChild(overlay);

    // —— 识别循环 ——
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        if (!video) throw new Error('no video');
        video.srcObject = s;
        detector = new Detector(['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'code_39', 'itf']);
        timeout = setTimeout(() => {
          const t = document.getElementById('scanner-tip');
          if (t && !settled) t.textContent = '未识别到条码，可对准更清晰或点【手动输入】';
        }, 8000);
        timer = setInterval(async () => {
          try {
            if (!video || video.readyState < 2 || settled) return;
            const codes = await detector.detect(video);
            if (codes && codes.length) {
              const raw = (codes[0].rawValue || '').trim();
              if (!raw) return;
              const tip = document.getElementById('scanner-tip');
              if (tip) {
                tip.textContent = '识别成功';
                tip.style.background = '#16a34a';
              }
              document.querySelectorAll('#scanner-corner-tl, #scanner-corner-tr, #scanner-corner-bl, #scanner-corner-br')
                .forEach((el) => (el as HTMLElement).style.borderColor = '#16a34a');
              try { navigator.vibrate?.(50); } catch { /* 忽略振动不支持 */ }
              setTimeout(() => finished('', '', raw), 300);
            }
          } catch {
            /* 未识别到帧，继续 */
          }
        }, 350);
      })
      .catch(() => finished(FAILED, '无法访问摄像头，请稍后重试'));
  });
}
// #endif
```

- [ ] **Step 2: 编译校验**

Run（在 `web-admin/`）:
```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 无 `scanner.ts` 相关类型错误（uni 宏 `#ifdef` 由编译器剥离，App 分支 `uni` 全局可用）。

---

## Task 2: ProductVariantMatrixTab — 扫码分流 + 手动输入

**Files:**
- Modify: `web-admin/src/components/product-tabs/ProductVariantMatrixTab.vue`

- [ ] **Step 1: import 加载 ScannerError**

手动输入需要确认后把文本写回当前字段。改动 import 行：

现在（模板/脚本中原有）：
```ts
import { scanCode } from '../../utils/scanner';
```
改为：
```ts
import { scanCode, ScannerError } from '../../utils/scanner';
```

- [ ] **Step 2: 改写 scanSkuField 支持按 code 分流 + 手动输入**

现在（现有实现）：
```ts
async function scanSkuField(si: number, field: 'barcode' | 'internalCode') {
  try {
    const val = await scanCode();
    if (!val) return;
    onSkuFieldLiteral(si, field, val);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '扫码失败', icon: 'none' });
  }
}
```
替换为：
```ts
async function scanSkuField(si: number, field: 'barcode' | 'internalCode') {
  try {
    const val = await scanCode();
    if (!val) return;
    onSkuFieldLiteral(si, field, val);
  } catch (e: any) {
    const code = (e as ScannerError)?.code;
    if (code === 'CANCEL') return; // 用户取消，静默关闭
    if (code === 'MANUAL' || code === 'FAILED') {
      // 能力不足/摄像头失败/用户点手动输入 → 弹可编辑输入框
      const cur = props.value.skus[si]?.[field] ?? '';
      uni.showModal({
        title: '手动输入' + (field === 'barcode' ? '条形码' : '内部码'),
        editable: true,
        placeholderText: '请输入条码',
        content: String(cur ?? ''),
        success: (r) => {
          if (r.confirm) {
            const v = (r.content ?? '').trim();
            if (v) onSkuFieldLiteral(si, field, v);
          }
        },
      });
      return;
    }
    uni.showToast({ title: (e as Error)?.message || '扫码失败', icon: 'none' });
  }
}
```

- [ ] **Step 3: 编译校验**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无新增类型错误（`editable`/`placeholderText`/`content` 为 `uni.showModal` 合法项）。

---

## Task 3: MediaLibraryModal — 顶部标签常驻 + 计数刷新 + 空态

**Files:**
- Modify: `web-admin/src/components/MediaLibraryModal.vue`

- [ ] **Step 1: 顶部过滤栏改为渲染「全部 + 预设 + 额外标签」**

现在模板（过滤栏只渲染 availableTags）：
```html
<scroll-view scroll-x class="mlm__tags">
  <view class="mlm__tags-inner">
    <view class="mlm__tag" :class="{ on: activeTag === '' }" @tap="selectTag('')">全部</view>
    <view v-for="t in availableTags" :key="t.name" class="mlm__tag"
      :class="{ on: activeTag === t.name }" @tap="selectTag(t.name)">
      {{ t.name }}<text class="mlm__tag-count">{{ t.count }}</text>
    </view>
  </view>
</scroll-view>
```
替换为：
```html
<scroll-view scroll-x class="mlm__tags">
  <view class="mlm__tags-inner">
    <view class="mlm__tag" :class="{ on: activeTag === '' }" @tap="selectTag('')">全部</view>
    <view v-for="t in mergedTags" :key="t.name" class="mlm__tag"
      :class="{ on: activeTag === t.name }" @tap="selectTag(t.name)">
      {{ t.name }}<text class="mlm__tag-count">{{ t.count }}</text>
    </view>
  </view>
</scroll-view>
```

- [ ] **Step 2: script 增加计数映射与 mergedTags 计算**

`availableTags` 与 `PRESET_ASSET_TAGS` 已有。在 `loadTags()` 附近追加：

```ts
const tagCountMap = ref<Record<string, number>>({});
async function loadTags() {
  try {
    availableTags.value = await fetchAssetTags();
    const m: Record<string, number> = {};
    for (const t of availableTags.value) m[t.name] = t.count;
    tagCountMap.value = m;
  } catch (e: any) {
    availableTags.value = [];
    tagCountMap.value = {};
  }
}

// 常驻标签：全部 + 18 预设 + 额外非预设（预设在前、额外追加、去重）
const mergedTags = computed(() => {
  const presets = PRESET_ASSET_TAGS.map((name) => ({ name, count: tagCountMap.value[name] ?? 0 }));
  const extraNames = availableTags.value
    .map((t) => t.name)
    .filter((n) => !PRESET_ASSET_TAGS.includes(n));
  const seen = new Set(PRESET_ASSET_TAGS);
  const extras = extraNames.filter((n) => !seen.has(n) && seen.add(n));
  return [...presets, ...extras.map((name) => ({ name, count: tagCountMap.value[name] ?? 0 }))];
});
```
`computed` 已在文件顶部从 `vue` 导入（现有 `filteredItems` 已用）。确认 import 含 `computed`。

- [ ] **Step 3: 上传/删除后刷新计数**

`chooseAndUpload` 内已有 `await load(false)`，追加 `await loadTags();`：
```ts
    await load(false);
    await loadTags();
```
`onDelete` 内已有 `await load(false);`，追加 `await loadTags();`：
```ts
        await load(false);
        await loadTags();
```

- [ ] **Step 4: 空态文案按筛选标签显示**

现在空态：
```html
<view v-else class="mlm__tip">没有更多了</view>
```
（此前 `mlm__empty` 在无图时显示"媒体库暂无可选资源"）。将 `mlm__empty` 文案改为动态：

现在：
```html
<view v-else-if="!filteredItems.length" class="mlm__empty">媒体库暂无可选资源</view>
```
替换为：
```html
<view v-else-if="!filteredItems.length" class="mlm__empty">
  {{ activeTag ? '暂无【' + activeTag + '】图片' : '媒体库暂无可选资源' }}
</view>
```

- [ ] **Step 5: 编译校验**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无新增类型错误（上面所有标识符在各自作用域内已声明）。

---

## Task 4: 构建 + 手机截图验证 + 手册补充

**Files:**
- Verify: `web-admin`（构建 H5）
- Create/Add: `docs/demo/skeleton/cases/media-tag-filter.md` + 截图（复用骨架）

- [ ] **Step 1: 全量 H5 构建**

Run（在 `web-admin/`）:
```bash
npm run build:h5
```
Expected: 构建成功，产出 `dist/build/h5`。

- [ ] **Step 2: 手机截图断言媒体库顶部标签**

用 `docs/demo/skeleton` 新增用例 `cases_py/media_tag_filter.py`，逻辑（登录超管 → 打开新增/编辑商品页 → 打开媒体库 → 截图顶部标签横条 + 点选某预设筛选截图）。头部补 `from skeleton import Manual, mobile_context`。

Run: `python cases_py/media_tag_filter.py`
Expected: `shots/media-tag-filter/*.png` 出现：① 顶部「全部 + 主图 + 白底图…」常驻横条、计数数字；② 点「主图」后网格仅剩带「主图」标签图。

- [ ] **Step 3: 真机/Chrome 手机验证扫码（人工）**

在 Android Chrome（或桌面 Chrome 开发者工具 device 模式）打开 `e.joho.cn/guanli`，编辑商品变体 → 点条码「📷」：
Expected: 相机出现取景框+四角角标+「将条码对准框内」；对准条码 → 框变绿+振动+「识别成功」并自动填入；持续多秒无识别 → 提示「未识别到条码…」；点「手动输入」或断网降级 → 弹可编辑输入框 → 确认后写入当前字段。

- [ ] **Step 4: 截图与结论补进操作手册**

把 Task 4 Step 2 生成的媒体库标签截图（手机视图）补充进所在功能的手册章节（`web-admin/src/static/manual/` 对应文件），并登记本次扫码/标签交互说明。

- [ ] **Step 5: 构建产物 + 部署**

- 提交 `web-admin/src` 改动；如在部署铁律范围内，本地 `npm run build:h5` 后 `node scripts/deploy.mjs` 上线；后端无改动（`assetTags` 接口早已存在），仅前端。
- 部署后线上复测：打开媒体库顶部标签计数、点标签筛选、编辑商品变体扫码→手动输入。

---

## Self-Review（plan 自检）

- **Spec 覆盖**：A 部分（常驻预设+额外、计数、上传/删除/打开刷新、筛选、空态、底部保留）→ Task 3 Step1-4；B 部分（取景框、角标、对准提示、成功变绿振动、超时提示、常驻手动输入、降级 MANUAL、清理）→ Task 1；上层分流 + editable 弹层 → Task 2；测试交付（手机截图+手册）→ Task 4。
- **占位符**：无 TBD/TODO；所有 step 均含实际代码或可执行命令。
- **类型一致性**：`ScannerError`（Task1 定义）在 Task2 import；`scanSkuField(si, field)` 与现有调用 `scanSkuField(si,'barcode'|'internalCode')` 一致；`mergedTags`/`tagCountMap`/`loadTags` 在 Task3 内闭包一致；现有 `presets` 用 `PRESET_ASSET_TAGS`（已在文件内定义）。