# 店铺覆盖风格模板库 · 管理增强 设计文档（2026-09-20）

## 1. 目标与范围

深化已上线的 `shop-template-plugin`（五级合并模型：L0 全局默认 ← L1 全局配置 ← L2 风格模板 ← L3 店铺覆盖 ← L4 页面内建默认），聚焦**模板库管理体验**增强：

- **现状缺口**：
  1. **无版本历史**：`update` 直接覆盖 `theme/pages`，改错不可回滚，`version` 只是递增的数字，无快照。
  2. **无引用可见性**：模板被哪些店铺（channel）引用不可见；停用/删除被引用模板会**静默回退**到 L1 全局配置，运营无感知。
  3. **无回退链路预览**：后台编辑模板时看不到「模板 + 全局配置 + 店铺覆盖」合并后的最终效果，也无法理解回退链路。
- **本设计目标**：
  1. 模板**版本历史**：每次保存生成快照，可查看历史版本、回滚。
  2. **引用可见性与保护**：列出引用该模板的店铺；停用/删除被引用模板时给出警示（明确哪些店会回退）。
  3. **合并预览**：展示「全局配置 → 模板 → 店铺覆盖」逐层合并后的最终配置（纯函数深合并结果），支持按覆盖场景预览。

## 2. 已确认决策

1. **方向**：模板库管理增强（用户确认）。
2. **范围**：仅 web-admin 后台体验 + 必要的后端支撑（版本快照、引用查询），**不改变 C 端消费语义**（回退链行为不变）。
3. **交付**：三份设计一并审阅后批量实现。

## 3. 架构与组件

### 3.1 后端新增（shop-template-plugin）

| 能力 | 实现 |
|---|---|
| 版本快照 | 新表 `ShopTemplateVersion`：`{templateId, version, name?, theme, pages, enabled, createdAt, note}`。保存模板时把旧值写入快照（每次 update/copy 时）。 |
| 版本历史查询 | `templateVersions(id): [ShopTemplateVersion!]!` |
| 回滚 | `restoreTemplateVersion(id, version): ShopTemplate!`（把快照内容写回模板，version+1 并生成新快照） |
| 引用可见性 | `templateReferences(id): [TemplateReference!]!`，`TemplateReference = {channelId, channelCode, channelName, tenantCode, app}`，查询 `channel.customFields.templateId == id` 的渠道列表 |
| 合并预览 | `templateMergedPreview(app, templateId?, overrides?): JSON`——纯函数深合并（L1 全局配置 → L2 模板 → L3 店铺覆盖）返回最终配置，C 端消费同一纯函数 |

### 3.2 web-admin 增强（platform/templates 页）

- **列表行**：显示「引用店铺数」徽标（引用>0 时显示），被引用模板删除/停用有确认警示（列出将回退的店铺）。
- **详情/编辑弹层**：
  - 「历史版本」Tab：版本列表（时间/备注），可预览某版本 JSON、一键回滚。
  - 「合并预览」区：选覆盖场景（无覆盖/指定店铺覆盖），实时展示最终合并配置（theme/pages 合并结果），并标注各键来源层级。
- **新建/编辑**保留现有 JSON 编辑能力。

### 3.3 回退链路可视化

合并预览以「层级卡片」展示：
```
L1 全局配置 (app=nshop)   →   L2 模板「橙色经典」v3   →   L3 店铺覆盖 (渠道 t2 二月兰)
[primaryColor:#ff6600]        [primaryColor:#e8541f]        [radius:12]
      ↓ 深合并（数组/标量覆盖、null 跳过）
最终：primaryColor:#e8541f  accentColor:#fff3e6  radius:12 ...
```
每键标注来源层级，运营可直观理解回退。

## 4. 数据流与服务逻辑

1. **保存**：update → 写回模板 + 快照旧值入 `ShopTemplateVersion`（version+1）。
2. **回滚**：restore → 当前值入快照 → 快照值写回模板 → version+1。
3. **引用查询**：遍历 channel（按 app 过滤），取 `customFields.templateId` 匹配。
4. **合并预览**：复用 C 端合并纯函数（`merge-config.ts`），传入模板/覆盖 JSON，返回合并结果 + 键来源标注。

## 5. 错误处理

- 回滚到不存在的版本 → `UserInputError`。
- 被引用模板删除：后端**允许**删除（保持 C 端回退语义不变），前端强警示；如需「禁止删除被引用模板」需用户确认（默认不做，YAGNI）。
- 版本快照写失败 → 回滚保存操作（同事务）。

## 6. 测试与交付

- 后端单测：版本快照生成/回滚、引用查询、合并预览纯函数（数组/标量/null 覆盖）。
- web-admin：手机截图（列表引用徽标、历史版本、合并预览、删除警示）。
- E2E：保存产生新版本 → 回滚 → 内容还原；引用查询正确。
- 手册：新增「风格模板库管理」章节。

## 7. 风险与边界（YAGNI）

- **不新增**：模板发布流（draft/publish）、多环境、跨 app 复制——超出本次。
- **不回退破坏**：C 端 `shopTemplate()` 语义（未引用/引用无效回退 null）保持不变。
- **表结构**：新增 `ShopTemplateVersion` 表，需幂等迁移（沿用 `CREATE TABLE IF NOT EXISTS` + hasColumn 模式）。
