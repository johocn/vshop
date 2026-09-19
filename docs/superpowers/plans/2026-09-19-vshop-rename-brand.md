# vshop → youshop 品牌改名实施计划（2026-09-19）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 vshop 项目内部所有面向用户的品牌标识 `vshop / VShop / __UNI__VSHOP` 对齐到公开域名 `youshop`，保留仓库名与远程不变。

**Architecture:** 纯文本替换——逐文件把品牌字样 `VShop→Youshop`、`vshop→youshop`、`__UNI__VSHOP→__UNI__YOUSHOP`。分四批次提交：品牌文案 → 元数据/appid → 注释对齐 → 手册。不触碰 `dist/` 与历史设计文档。

**Tech Stack:** uni-app(Vue3)+Vite, web-admin(uview), git。

---
## 文件结构

| 批次 | 文件 | 责任 |
|---|---|---|
| B1 文案 | `.env` `.env.production` `.env.development` `pages.json` `src/pages.json` `src/pages/login/index.vue` `src/composables/useH5Share.ts` `src/composables/useShare.ts` `src/pkg-product/pages/detail.vue` `src/utils/html.test.ts` `web-admin/src/pages.json` | 用户可见品牌文案 |
| B2 元数据 | `package.json` `package-lock.json` `manifest.json` `src/manifest.json` `web-admin/package.json` | name / appid |
| B3 注释 | `src/utils/merge-config.ts` `web-admin/src/theme.ts` `web-admin/src/templates/shared/schema.ts` | 仅注释对齐 |
| B4 手册 | `doc/使用手册.md` `docs/demo/商户入驻与商品上架审批流程用户手册.md` | 文档内容 |

---

### Task B1: 品牌文案（VShop → Youshop）

**Files:**
- Modify: `.env`, `.env.production`, `.env.development`, `pages.json:235`, `src/pages.json`, `src/pages/login/index.vue`, `src/composables/useH5Share.ts`, `src/composables/useShare.ts`, `src/pkg-product/pages/detail.vue`, `src/utils/html.test.ts`, `web-admin/src/pages.json`

- [ ] **Step 1: 修改 .env 系列**
  `.env` L2: `VITE_APP_TITLE=VShop` → `VITE_APP_TITLE=Youshop`
  `.env.production` L2: `VITE_APP_TITLE=VShop` → `VITE_APP_TITLE=Youshop`
  `.env.development` L2: `VITE_APP_TITLE=VShop Dev` → `VITE_APP_TITLE=Youshop Dev`

- [ ] **Step 2: 修改导航栏页标题（两处 pages.json）**
  `pages.json` L235 `navigationBarTitleText: "VShop"` → `"Youshop"`
  `src/pages.json` L316 `navigationBarTitleText: "VShop"` → `"Youshop"`

- [ ] **Step 3: 修改登录页文案**
  `src/pages/login/index.vue` `<text>VShop</text>` → `<text>Youshop</text>`

- [ ] **Step 4: 修改四处分享标题（VShop - 精选好物 → Youshop - 精选好物）**
  `src/composables/useH5Share.ts` L24
  `src/composables/useShare.ts` L17
  `src/pkg-product/pages/detail.vue` L109
  `src/utils/html.test.ts` L23/L25（断言同步改）

- [ ] **Step 5: 修改 web-admin 页面标题**
  `web-admin/src/pages.json` L55 `"vshop 管理后台"` → `"Youshop 管理后台"`

- [ ] **Step 6: 运行校验**
  Run: `cd d:\zhao\vshop && git grep -n "VShop"` 
  Expected: 无 `VShop` 残留（仅保留历史文档/引用链接里的小写 vshop，属预期）
  若项目有 html 单测：`npx vitest run src/utils/html.test.ts`（含 `VShop - 精选好物` 断言需通过）

- [ ] **Step 7: Commit**
```bash
git -C d:\zhao\vshop add .env .env.production .env.development pages.json src/pages.json "src/pages/login/index.vue" src/composables/useH5Share.ts src/composables/useShare.ts "src/pkg-product/pages/detail.vue" src/utils/html.test.ts web-admin/src/pages.json
git -C d:\zhao\vshop commit -m "rename(brand): VShop→Youshop 品牌文案（env/标题/分享/登录页）"
```

---

### Task B2: 元数据 name 与 appid

**Files:**
- Modify: `package.json`, `package-lock.json`, `manifest.json`, `src/manifest.json`, `web-admin/package.json`

- [ ] **Step 1: 改根 package.json 与 package-lock.json**
  `package.json` L2 `"name": "vshop"` → `"youshop"`
  `package-lock.json` L2 与包名引用处 `vshop` → `youshop`

- [ ] **Step 2: 改两处 manifest（name + appid）**
  `manifest.json` L2 `"name": "vshop"`→`"youshop"`; L3 `"appid": "__UNI__VSHOP"`→`"__UNI__YOUSHOP"`
  `src/manifest.json` L2/L3 同上

- [ ] **Step 3: 改 web-admin package.json description**
  `web-admin/package.json` L4 `description:"vshop 多租户手机管理后台` → `"youshop 多租户手机管理后台`

- [ ] **Step 4: 校验**
  Run: `cd d:\zhao\vshop && git grep -n '"name": "vshop"\|"__UNI__VSHOP"'`
  Expected: 无输出（已全改）

- [ ] **Step 5: Commit**
```bash
git -C d:\zhao\vshop add package.json package-lock.json manifest.json src/manifest.json web-admin/package.json
git -C d:\zhao\vshop commit -m "rename(brand): 元数据 name/appid vshop→youshop"
```

---

### Task B3: 注释对齐

**Files:**
- Modify: `src/utils/merge-config.ts`, `web-admin/src/theme.ts`, `web-admin/src/templates/shared/schema.ts`

- [ ] **Step 1: 逐个改动注释中的品牌字样**
  `src/utils/merge-config.ts` L1 注释 `（vshop 侧...` → `（youshop 侧...`
  `web-admin/src/theme.ts` L1 `// 业务域主色...（vshop 唯一视觉来源` → `（youshop 唯一视觉来源`（L2 引用链接保持不动，属历史文档）
  `web-admin/src/templates/shared/schema.ts` L1 若含 `vshop` → `youshop`

- [ ] **Step 2: Commit**
```bash
git -C d:\zhao\vshop add src/utils/merge-config.ts web-admin/src/theme.ts web-admin/src/templates/shared/schema.ts
git -C d:\zhao\vshop commit -m "rename(brand): 注释品牌字样对齐"
```

---

### Task B4: 手册内容

**Files:**
- Modify: `doc/使用手册.md`, `docs/demo/商户入驻与商品上架审批流程用户手册.md`

- [ ] **Step 1: 手册内 vshop→youshop**
  两手册文档内出现的 `vshop / VShop` 品牌字样 → `youshop / Youshop`

- [ ] **Step 2: 校验**
  Run: `cd d:\zhao\vshop && git grep -n "vshop" doc/ docs/demo/`
  Expected: 仅历史文档残留（`docs/superpowers/*` 属保留范围）

- [ ] **Step 3: Commit**
```bash
git -C d:\zhao\vshop add "doc/使用手册.md" "docs/demo/商户入驻与商品上架审批流程用户手册.md"
git -C d:\zhao\vshop commit -m "rename(brand): 手册品牌字样对齐 youshop"
```

---

## 明确不做（边界，勿越界）
- 不改仓库名 / 远程 `johocn/vshop.git` / 根目录 `d:\zhao\vshop`。
- 不改 `docs/superpowers/*` 与 `doc/旧计划*` 历史设计文档。
- 不改 `dist/` 构建产物（重建后自动更新）。
- 不部署线上（用户未要求本次上线）。

## 自检对照（spec→plan 覆盖）
- A 文案 → Task B1 ✅
- B 元数据/appid → Task B2 ✅
- C 注释 → Task B3 ✅
- D 手册 → Task B4 ✅
- E 历史文档保留 → 边界明确 ✅
- F appid 改 → Task B2（用户确认未部署）✅