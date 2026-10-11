# web-admin 使用手册补充（营销与增长板块）Spec

## Why
对照 `constants/menus.ts` 后台菜单树与 `web-admin/src/static/manual/index.html` 现有 58 章，运营册（op）已覆盖商品/订单/库存/核销/装修/优惠券/分销等主干，但**营销与增长板块整体缺失**：积分商城、秒杀/拼团、抽奖、会员等级、评价管理、余额提现、反馈与 FAQ 均无操作章节（仅在 op-14c/op-40 等处被顺带提及）。商家拿到后台后不知道这些功能怎么用，手册交付不完整。

## What Changes
- 新增 op 册 7 章（沿用现有 `{book:'op', id, title, html}` 数据结构与样式体系）：
  - `op-46` 积分商城：积分商品管理（`pages/points/goods`）+ 积分订单管理（`pages/points/orders`）
  - `op-47` 促销活动：限时秒杀（`pages/promotion/flash-sale`）+ 拼团（`pages/promotion/group-buy`），含「场次到点自动开/结束依赖 worker（呼应 op-40）」
  - `op-48` 抽奖活动：奖品配置与中奖记录（`pages/lottery/prizes`）
  - `op-49` 会员等级：等级规则配置（`pages/member/level-config`）
  - `op-50` 评价管理：评价查看/回复（`pages/review/list`）
  - `op-51` 余额与提现：提现申请审核（`pages/balance/withdraw`）
  - `op-52` 反馈与 FAQ：FAQ 维护 + 意见反馈处理（`pages/feedback/faq`、`pages/feedback/list`）
- 新增轻量「修订记录」块（手册封面页尾部），登记本次补充
- 每个新章节必须带 390×844 手机视口实机截图（存 `manual/shots/`，沿用 imgcap 图注规范）
- **明确排除（后续批次，不在本 spec）**：校园配送与骑手管理（campus/rider，自成体系需单独核实业务流程）、微信公众号管理三件套（wechat/menu|fans|templates）、平台端角色/成员/全局配置（platform/roles|members|global-config）、酒店预订管理（op-17 扩节）、手册多语言翻译
- **BREAKING**: 无

## Impact
- Affected specs: 无既有 spec
- Affected code: 仅 `web-admin/src/static/manual/index.html`（章节条目、目录自动生成逻辑如涉及）与 `web-admin/src/static/manual/shots/`（新截图）；不改动任何业务代码
- 交付流程：提交 vshop → `node scripts/deploy.mjs` 部署 → 生产验证手册可达

## ADDED Requirements

### Requirement: 营销与增长板块章节齐全
运营册 SHALL 包含 op-46 至 op-52 共 7 个新章节，覆盖菜单树中 `menu.pointsGoodsManage`、`menu.pointsOrdersManage`、`menu.flashSale`、`menu.groupBuy`、`menu.lotteryManage`、`menu.memberLevel`、`menu.review`、`menu.balanceWithdraw`、`menu.faqManage`、`menu.feedbackList` 全部 10 个菜单入口（积分商品/订单合一章、秒杀/拼团合一章、反馈/FAQ 合一章）。

#### Scenario: 商家按章节找到对应操作
- **WHEN** 商家从「使用手册」菜单进入运营册
- **THEN** 能通过目录或搜索定位到上述任一功能并按步骤完成操作

#### Scenario: 章节内容真实可操作
- **WHEN** 任一新章节描述操作路径
- **THEN** 路径与实际页面一致（菜单层级、按钮/字段名以页面代码或实机截图为准，不得虚构）

### Requirement: 新章节带实机截图
每个新章节 SHALL 至少包含 1 张 390×844（dpr=2）手机视口实机截图，图注遵循 `imgcap` 规范；无法实机截取的界面 SHALL 复用 `web-admin/docs/superpowers/manual/usemall-parity-batch3/` 等既有后台截图。

#### Scenario: 截图可加载
- **WHEN** 手册页面打开新章节
- **THEN** 全部图片可正常加载（相对路径 `shots/xxx.png` 与文件实际存在一致）

### Requirement: 手册结构与既有风格一致
新章节 SHALL 沿用既有数据结构（`{book:'op', id, title, html}`）、样式类（steps/table/note/warn/tip/mark/imgcap）与编号规则；修订记录 SHALL 登记本次变更。

#### Scenario: 渲染与搜索正常
- **WHEN** 用浏览器直接打开 index.html（或部署后访问）
- **THEN** 新章节出现在目录与搜索结果中，样式与既有章节无差异
