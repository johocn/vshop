# vshop → youshop 品牌改名设计（2026-09-19）

## 目标（用户确认）

把 `d:\zhao\vshop` 项目内部所有**面向用户的品牌标识** `vshop / VShop / __UNI__VSHOP` 对齐到公开域名 `youshop`。

## 边界（已与用户确认）

- **保留**：仓库名 `vshop`、根目录名 `d:\zhao\vshop`、git 远程 `johocn/vshop.git`。
- **不含**：`dist/` 构建产物（重新构建后自动更新）。
- **不含**：历史设计稿 / 实施计划文档里的 vshop（`docs/superpowers/*`、`doc/旧计划*`）——保留追溯性。
- **改 appid**：`__UNI__VSHOP` 一并改名 `__UNI__YOVSHOP`（用户确认未部署，无 DCloud 关联风险）。等宽大小写风格与 `vshop→youshop` 对齐：appid 惯例为全大写，故 `__UNI__YOUShop`？——定稿：统一 `__UNI__YOUShop` 与页面标题风格不符，采用 `__UNI__YOUSHOP`（与旧 `VSHOP` 全大写一致）。

> 修正：appid 采用 `__UNI__YOUSHOP`（全大写，与旧值 `__UNI__VSHOP` 风格一致）。

## 替换清单（逐文件）

### A. 品牌文案（用户可见）
| 文件 | 现 | 改 |
|---|---|---|
| `.env` L2 | `VITE_APP_TITLE=VShop` | `Youshop` |
| `.env.production` L2 | `VITE_APP_TITLE=VShop` | `Youshop` |
| `.env.development` L2 | `VITE_APP_TITLE=VShop Dev` | `Youshop Dev` |
| `pages.json` L235 | `navigationBarTitleText: "VShop"` | `Youshop` |
| `src/pages.json` L316 | `navigationBarTitleText: "VShop"` | `Youshop` |
| `src/pages/login/index.vue` L5 | `<text>VShop</text>` | `<text>Youshop</text>` |
| `src/composables/useH5Share.ts` L24 | `'VShop - 精选好物'` | `'Youshop - 精选好物'` |
| `src/composables/useShare.ts` L17 | `'VShop - 精选好物'` | `'Youshop - 精选好物'` |
| `src/pkg-product/pages/detail.vue` L109 | `'VShop - 精选好物'` | `'Youshop - 精选好物'` |
| `src/utils/html.test.ts` L23/L25 | `'VShop - 精选好物'` 断言 | `'Youshop - 精选好物'` |
| `src/utils/merge-config.ts` L1 | 注释 `（vshop 侧...）` | `（youshop 侧...）` |
| `web-admin/src/pages.json` L55 | `"vshop 管理后台"` | `"Youshop 管理后台"` |

### B. 元数据 name / appid
| 文件 | 现 | 改 |
|---|---|---|
| `package.json` L2 | `"name": "vshop"` | `"youshop"` |
| `package-lock.json` L2/L8 | `vshop` | `youshop` |
| `manifest.json` L2 | `"name": "vshop"` | `"youshop"` |
| `manifest.json` L3 | `"appid": "__UNI__VSHOP"` | `"__UNI__YOUSHOP"` |
| `src/manifest.json` L2 | `"name": "vshop"` | `"youshop"` |
| `src/manifest.json` L3 | `"appid": "__UNI__VSHOP"` | `"__UNI__YOUSHOP"` |
| `web-admin/package.json` L4 | `description:"vshop 多租户手机管理后台` | `"youshop 多租户手机管理后台` |

### C. 注释/参考链接（非展示，顺手对齐，不改逻辑）
`web-admin/src/theme.ts` L1-L2、`web-admin/src/templates/shared/schema.ts` L1——若含 vshop 字样则对齐。

### D. 手册（含名称）
- `doc/使用手册.md`：文档内 vshop→youshop
- `docs/demo/商户入驻与商品上架审批流程用户手册.md`：文档内 vshop→youshop
- 手册文件名本身是否为「*vshop*」？经查两手册文件名均不含 vshop，仅文档内容含，故只改内容。

## 验证
- `git status` 复核：仅上述预期文件改动，`dist/` 与历史文档不被卷入。
- 跑 `npx tsc --noEmit`（html.test.ts 改后编译/单测）。
- 不触发部署（用户未要求本次上线）。

## 明确不做
- 不改仓库名 / 远程 / 目录名。
- 不改历史设计稿 / 实施计划。
- 不改微信小程序平台绑定（未部署，appid 一并改但说明风险已确认）。