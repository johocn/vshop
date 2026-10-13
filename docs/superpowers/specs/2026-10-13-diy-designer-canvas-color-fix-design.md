# DIY 设计器 H5 画布错位与素材同色修复设计文档

> 日期：2026-10-13　状态：已确认（brainstorming 流程，方案 A + group 色板）
> 背景：P7 交付后浏览器实测发现三项核心体验未真正达成——「预览全部手串」画布内容溢出触边、「珠子自由拖动」触点全灭、「混搭」三种水晶全部显示同一兜底色。前两者共享同一根因，后者为颜色兜底链缺层。
> 前置约束：仍走 vshop uni-app 主线 pkg-diy 分包；后端 diy-plugin 零改动；@diy/calc 纯函数不动；金额分/毫米口径不变；小程序端行为不变。

## 1. 目标与非目标

**目标**
1. **根因修复**：BeadRing.vue H5 端 canvas 初始化补 CSS 尺寸约束 + setTransform 替代累积 scale + 幂等保护，使「预览全貌」「拖拽换位」「点选删除」在 H5 真实可用（拖动/混搭/全貌预览三项功能闭环）。
2. **颜色区分**：materialColor 兜底链插入 `attrs.group` 色板层，crystal-white/purple/yellow 等同组素材在前端获得区分色；数据侧 color/renderPreset 优先级更高可覆盖。
3. **量化回归**：复用 verify Playwright 脚本，四判据（bbox/拖动/点选/颜色）全部通过后交付。

**非目标（本期不做）**
- 后端素材数据补 color/renderPreset（运营侧后续可自行覆盖，前端色板已是可交付态）
- BeadRing 渲染视觉重设计（P7 已定稿，仅修 bug）
- 小程序端差异化处理（同路径修复，行为应保持不变）

## 2. 根因分析（实测证据）

浏览器实测（Playwright 390×844 dpr=2，verify2/verify3 脚本）：

| 现象 | 实测证据 |
|---|---|
| 预览溢出 | canvas buffer 718×644，内容 bbox [374..716]×[246..636] 挤在右下象限且触边裁切（应居中） |
| 拖动全灭 | 按 ringR=65px 精确打点 TouchEvent fire=ok，但 tap 弹窗 NOT SHOWN、序列 18→18 无变化 |
| 同色 | 白水晶/紫水晶/黄水晶渲染色均为 #B5451F（matte 兜底），API 证实 attrs 仅有 group/defaultDiameter/weightPerBead |

**根因**（探针实证，[BeadRing.vue](../../../src/pkg-diy/components/BeadRing.vue) `onMounted`）：uni-h5 内置 **hidpi polyfill**（`@dcloudio/uni-h5` `initHidpi`）会全局补丁 `CanvasRenderingContext2D.prototype`——对 `fillRect/arc/moveTo/lineTo/drawImage/fillText` 等方法的坐标参数自动乘 `pixelRatio`（`ctx.__hidpi__` 为真时），且 `drawImage` 临时 scale 矩阵。因此 uni H5 canvas 的正确用法是**单位矩阵 + CSS px 坐标**。而 BeadRing 原代码手动 `ctx.scale(dpr, dpr)` → 矩阵 ×2 叠加 polyfill ×2 = **光栅 4 倍**，内容溢出画布右下象限并被裁切；命中判定用逻辑坐标（无矩阵参与），与视觉位置脱节，拖动/点选全灭。预览溢出与交互失效同一根因。次要问题：H5 兜底路径 inner canvas 无 CSS 尺寸约束，buffer 尺寸被当显示尺寸。

## 3. 方案 A：最小修复（BeadRing.vue 单文件 ~20 行）

`onMounted` 回调内三处修改：

```typescript
// ① H5 兜底路径：buffer 与显示尺寸解耦（inner canvas 补 CSS 约束）
canvas.style.width = w + 'px';
canvas.style.height = h + 'px';
// ② 尺寸以 cssW/cssH 为准（与 :style、render() 同源），不用 client 实测值
canvas.width = Math.round(w * dpr);
canvas.height = Math.round(h * dpr);
// ③ 双端分治：
//    H5 —— 保持单位矩阵（uni hidpi polyfill 自动乘 pixelRatio，手动 scale 会叠成 4x）
//    小程序 —— canvas 2d node 需手动 dpr 缩放
// #ifndef H5
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
// #endif
// ④ 初始化幂等保护：let canvasInited，重复回调直接 return
```

- 命中判定（hitBead/insertIndexAt）本就工作在逻辑 CSS px 坐标系，与视觉修复后完全对齐，无需改动。
- 小程序端无 hidpi polyfill，保持手动 setTransform(dpr)，行为不变。
- 备选方案（已评估否决）：B = `#ifdef H5` 全自管 DOM 初始化（隔离彻底但双端两套逻辑、~60 行双份维护）；C = selectorQuery node 路径统一重写（依赖 uni 版本 node 返回行为，回归风险高、工期最长）。

## 4. 颜色区分：materialColor 五级回退链

[useDesigner.ts](../../../src/pkg-diy/composables/useDesigner.ts) `materialColor`（现四级）插入 group 色板层：

```
attrs.color → attrs.hex → attrs.group 色板（新增）→ renderPreset 底色 → matte 兜底
```

**group 色板内建映射**（bead-render.ts 导出常量，供 designer/预览共用）：

| group | 色值 | 语义 |
|---|---|---|
| crystal-white | #E8E4DC | 白水晶类 |
| crystal-purple | #8B6BAE | 紫水晶类 |
| crystal-yellow | #D9A441 | 黄水晶类 |
| wood | #A0714F | 木质类 |
| silver | #C0C4CC | 金属银类 |
| 未知 group | — | 落入下一级（renderPreset → matte） |

- 数据侧 `color`/`renderPreset` 优先级更高：后台补数据即可覆盖前端色板（动态配置优先，不硬编码锁定）。
- group 值从素材 `attrs.group` 读取（API 已证实存在该字段），纯函数解析，坏值安全回退。

## 5. 量化回归验收（verify 脚本判据）

| # | 判据 | 通过标准 |
|---|---|---|
| 1 | 预览全貌 | canvas 内容 bbox 居中且四边不触画布边缘（留边 ≥4px） |
| 2 | 珠子拖动 | 按渲染几何精确打点拖拽后，strip 顺序签名发生变化 |
| 3 | 珠子点选 | tap 珠子后快删确认弹窗出现 |
| 4 | 混搭颜色 | 选 3 种不同 group 素材后，画面像素颜色分布 ≥3 种色相 |
| 5 | 交付件 | 手机视口截图 390×844 dpr=2 补充 [pkg-diy 操作手册](../../pkg-diy-操作手册.md) |

## 6. 影响范围与交付

- **代码**：`src/pkg-diy/components/BeadRing.vue`（~20 行）、`src/pkg-diy/composables/useDesigner.ts`（materialColor ~10 行）、`src/pkg-diy/utils/bead-render.ts`（GROUP_COLORS 常量导出）。
- **不动**：designer.vue 结构、MaterialPanel、guide.vue、后端插件、@diy/calc。
- **交付流**：本地 `build:h5` → verify 回归五判据 → 手机截图补手册 → 提交推送 → 部署 e.joho.cn → 线上冒烟（chunk 校验 + 设计器页可达）。
