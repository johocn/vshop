# DIY 配饰素材数据补全设计方案

日期：2026-10-13 ｜ 状态：待用户审 ｜ 前置：P7.2 已上线（commit f522fab）

## 1. 背景与现状核对

对照方案 B mockup 与用户四问的落地核对（数据实测 e.joho.cn 后端，68 条素材）：

| 问题 | 结论 |
|---|---|
| 设计器下面是否有素材 | 面板 UI 已落地；珠子 tab 68 款；**配饰 tab 永远为空（attrs.decor 素材 0 条）** |
| 珠子是否可拖拽 | 已完整落地（三态 swap/insert/delete + 预览，回归 15/15） |
| 珠子间是否应该加一条线 | 已有细轨道圆（几何辅助线）；绳线质感渲染另立任务 |
| 打结/挂坠/隔片是否落地 | 前端机制齐（结位开关/挂点渲染/配饰拖拽），**后端配饰素材数据 0 条**，产品不可用 |

数据侧实况：68 条素材全部 `shape=round`，集中在 cat1–5 五个分类；`金属配件`/`天然宝石` 分类空置；无 `shape=spacer` 素材。后端 `calc-bridge` 已支持 spacer/decor 角色，`bracelet-classic` 模板隔片槽位 filter `shapes:['spacer']` 就绪——纯缺数据。

## 2. 设计：配饰素材清单（14 款，价格尺码齐全）

### 2.1 隔片 ×6（shape=spacer，配饰 tab，点击串入环上）

| code | 名称 zh/en | 直径×厚 mm | 价格 |
|---|---|---|---|
| spacer-silver-round | 纯银圆隔片 / Silver spacer | 4×1.5 | ¥3 |
| spacer-silver-flat | 纯银平片 / Silver flat disc | 6×1 | ¥4 |
| spacer-gold-round | 镀金圆隔片 / Gold spacer | 4×1.5 | ¥2 |
| spacer-gold-flat | 镀金平片 / Gold flat disc | 6×1 | ¥3 |
| spacer-rosewood | 黑檀隔珠 / Ebony spacer | 6×2 | ¥1 |
| spacer-turquoise | 松石隔片 / Turquoise spacer | 5×2 | ¥3 |

### 2.2 挂坠 ×4 + 装饰珠 ×5（配饰 tab，挂环外可拖拽）

| code | 名称 | shape | 尺寸 mm | 价格 | render preset |
|---|---|---|---|---|---|
| pendant-jade-kou | 翡翠平安扣 | pendant | 12 | ¥59 | jade-flower |
| pendant-amber-drop | 蜜蜡水滴坠 | pendant | 10 | ¥39 | amber |
| pendant-silver-bell | 纯银铃铛 | pendant | 8 | ¥15 | metal |
| pendant-crystal-heart | 粉晶爱心坠 | pendant | 10 | ¥19 | glass |
| charm-gold | 镀金转运珠 | charm | 6 | ¥8 | metal |
| charm-silver | 纯银配珠 | charm | 6 | ¥10 | metal |
| charm-pearl | 贝珠配珠 | charm | 8 | ¥5 | pearl |
| charm-enamel | 珐琅蓝珠 | charm | 6 | ¥6 | glass |
| charm-coral | 朱砂圆坠 | charm | 8 | ¥12 | matte |

> 实测清单共 15 款（隔片 6 + 挂坠 4 + 装饰珠 5），比初版 mockup 多 1 款装饰珠，价格/尺码全部齐全。

## 3. 设计：attrs 结构与 tab 归属（统一规则）

- **配饰 tab 判定统一为 `attrs.decor === true`**（MaterialPanel 现行过滤零改动）：
  - 隔片：`{ decor: true, kind: 'spacer', group: 'metal' }`
  - 挂坠：`{ decor: true, kind: 'pendant', group: <材质> }`
  - 装饰珠：`{ decor: true, kind: 'charm', group: <材质> }`
- **点击行为按 kind 分流**（designer.vue `onPickMaterial` 配饰分支内）：
  - `kind === 'spacer'` → `appendBead(id)`（隔片当小珠串入环上，算量按 diameter/axialLength）
  - 其他 → `addDecor(id)`（挂环外，可拖拽/删除）
- 非 free 模式槽位指派路径不变（assignSlot 不区分 kind，维持现状）。

## 4. 设计：珠子 68 条分类归属完善

- 分类映射（categoryId 按材质归位 7 个 seed 分类）：crystal（水晶）/ agate（玛瑙玉髓）/ wood（木质）/ amber（蜜蜡琉璃）/ pearl（珍珠贝珠）/ metal（金属配件）/ gemstone（天然宝石）。
- 由 seed 内「attrs.group → 分类 code」映射表驱动，幂等更新已有素材 `categoryId`；金属银珠类归 metal，南红/红纹石等归 agate/gemstone。
- 目标：左侧分类竖列 7 类全部有货可筛。

## 5. 设计：珠子 attrs 详情字段完善

- attrs 增补可选字段：`meaning`（寓意，多语言 `{ 'zh-CN': ..., 'en-US': ... }`）、`origin`（产地，多语言）、`hardness`（莫氏硬度，number）。
- `MaterialDetailPopup`（长按素材详情）新增展示这三项（缺字段跳过该行）。
- 五语言 i18n 增补弹窗字段标签词条（meaning/origin/hardness）。

## 6. Seed 实现（幂等）

- 位置：`vendure/packages/diy-plugin/src/seed.ts` 新增 `seedDecorMaterials()` 与 `enrichBeadMaterials()`，由 `seedDiy()` 末尾调用。
- 幂等策略：素材按 `code` 查重（不存在才插入）；enrichment 仅当目标字段与期望不符时更新。
- app 归属：与现有素材一致（实施首步查 `diy_material.app` 分布并对齐；默认渠道）。
- 渲染回退：无实拍图，走 sprite→preset→color 三级回退（preset 见 §2.2 表）。

## 7. 前端改动清单（vshop）

1. `designer.vue onPickMaterial`：配饰 tab 内按 `attrs.kind` 分流 spacer→appendBead / 其余→addDecor（约 5 行）。
2. `BeadRing.vue drawDecorAt`：固定 `9*scale` 改为 `(row.diameter/2)*scale`（下限 6*scale）。
3. `MaterialDetailPopup.vue`：展示 meaning/origin/hardness（缺省跳行）。
4. i18n×5：3 个详情字段标签词条。

## 8. 验证链

1. 线上 GraphQL 抽查：decor 素材 ≥9、spacer 素材 =6、7 分类全有货。
2. dev 设计器实测：配饰 tab 15 款；添加挂坠→挂点出现→拖拽→删除；点隔片→串入环上→三态拖拽仍工作。
3. 回归 `scripts/_verify_diy_p72.py` 15/15 PASS。
4. 手机视口截图（390×844 dpr=2）：配饰 tab 全景、挂坠挂环特写、隔片串入手串——补充到操作手册。
5. 两端收口：vendure git pull + pm2 restart（后端 seed 随启动执行）；vshop build:h5 + scp 部署。

## 9. 范围外（明确不做）

- 绳线质感渲染（另立任务）。
- 配饰实拍图/sprite 上传（后续走管理端）。
- 非 free 模式槽位与配饰的类型校验强化。
