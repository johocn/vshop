# usemall→vshop 全功能审计与差距矩阵 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 usemall 功能全集为源清单（F01-F23），静态盘点 vshop 三层（C 端/Vendure 后端/web-admin）落地状态 + 生产探针验证，产出《差距矩阵》报告交用户确认。

**Architecture:** 纯只读审计——不改任何业务代码。产物仅两件：矩阵文档（`web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-matrix.md`）+ 只读探针脚本（`web-admin/scripts/_smoke_usemall_parity.py`）。生产后端验证用一次 GraphQL introspection + 少量定向查询，不做写操作。

**Tech Stack:** PowerShell 5.1（本地命令）+ Python 3（探针，仅标准库 urllib）+ Vendure 3.6.4（只读 introspection）。

设计依据：[2026-10-09-vshop-usemall-parity-design.md](file:///d:/zhao/vshop/web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-design.md)

---

## 0. 前置事实与执行口径（每个 Task 都适用）

**必须知道的现状（已一手核实，不要再猜）**

1. 工作区：`d:\zhao\vshop`（git 仓库根，web-admin 是其子目录，无独立 .git）。所有提交都提到该仓库，中文 commit message，只 `git add` 本 Task 文件，禁止 `git add -A`。
2. **PowerShell 5.1：不支持 `&&`**（用 `;` 分隔）；没有 tail/ls -la。
3. 源清单：`d:\zhao\usemall\readme.md` L32-45（10 组功能）——本计划已展开为 F01-F23 编号（见 Task 1），执行者**直接使用该编号**，不要自行增删功能项。
4. 参照文件（写探针前必读）：
   - 既有探针（模式与生产 API 地址来源）：`d:\zhao\vshop\web-admin\scripts\_smoke_usemall_align.py`
   - 对齐计划（版式口径范围，F23 复核依据）：`d:\zhao\vshop\web-admin\docs\superpowers\plans\2026-09-24-vshop-usemall-alignment-plan.md`
5. vshop C 端无 codegen，GraphQL 全是手写字符串；C 端页面路由注册在 `d:\zhao\vshop\src\pages.json`（uni-app 惯例）。
6. 判定四态（矩阵唯一合法值）：`已具备` / `部分具备`（标明缺哪层） / `缺失` / `不适用`（注明理由）。判定是**能力等价**（vshop 有等价实现即算已具备），不是逐文件复制 usemall。
7. 探针鉴权口径：只打**无需登录**的公开查询与 introspection；需要客户会话的能力（如分销树、我的钱包）静态验证 SDL 暴露即可，矩阵中如实标注「生产数据路径未验证（需登录态）」，不要伪造登录。
8. 矩阵文档中每个判定必须附**证据**（文件路径:行号，或探针输出摘要行）。没有证据的判定视为未完成。

**验证三件套（本计划简化为两件）**

| 手段 | 命令 / 方式 | 说明 |
|---|---|---|
| 探针 | `python web-admin/scripts/_smoke_usemall_parity.py`（在 `d:\zhao\vshop`） | Task 5 创建；打生产 shop-api，全只读 |
| 文档门禁 | 矩阵内无空判定、无「TBD/待补」字样 | Task 6 收尾 grep 断言 |

**提交规范**：每个 Task 结束提交一次；本计划所有提交都在 `d:\zhao\vshop`。

---

## Task 1: 矩阵骨架 + 功能编号定稿

**Files:**
- Create: `d:\zhao\vshop\web-admin\docs\superpowers\specs\2026-10-09-vshop-usemall-parity-matrix.md`

- [ ] **Step 1: 创建矩阵骨架文件**

写入以下内容（表体判定列暂填 `待盘点`）：

```markdown
# usemall → vshop 全功能差距矩阵

日期：2026-10-09 ｜ 方法：静态三层盘点 + 生产探针（见设计文档 §3）
判定口径：已具备 / 部分具备（标明缺层）/ 缺失 / 不适用（注明理由）

| 编号 | 功能 | usemall 证据 | vshop C端 | Vendure 后端 | web-admin | 判定 | 缺口/证据 | 批次建议 |
|---|---|---|---|---|---|---|---|---|
| F01 | 查看物流（物流跟踪） | readme L33 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F02 | 商品海报图（生成/分享/保存） | readme L34 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F03 | 钱包-充值 | readme L35 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F04 | 钱包-余额与流水 | readme L35 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F05 | 钱包-提现（余额/分销佣金） | readme L35-36 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F06 | 领券中心 | readme L35 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F07 | 我的优惠券与下单用券 | readme L35,40 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F08 | 分销中心（绑定/佣金/分销商海报） | readme L36,38 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F09 | 多规格 SKU 选择 | readme L37 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F10 | 注册/登录/隐私协议/修改密码 | readme L37-38 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F11 | 常见问题与意见反馈 | readme L37-38 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F12 | 自定义头部/导航 | readme L37 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F13 | 积分商城（兑换） | readme L37,39 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F14 | 积分明细 | readme L39 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F15 | 瀑布流商品列表 | readme L37 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F16 | 产品列表二级分类筛选 | readme L38 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F17 | 会员中心/开通/会员价下单 | readme L39 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F18 | 每日签到 | readme L39 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F19 | 购物圈（社区：列表/详情/赞/藏/分享/买同款） | readme L41-43 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F20 | 积分抽奖 | readme L44 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F21 | 快递费模板（运费模板） | readme L44 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F22 | 积分激励视频广告 | readme L44 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
| F23 | 秒杀/拼团（对齐计划已覆盖，复核） | 对齐计划全文 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | 待盘点 | - |
```

- [ ] **Step 2: 提交**

```powershell
git -C d:\zhao\vshop add web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-matrix.md
git -C d:\zhao\vshop commit -m "docs(parity): 差距矩阵骨架（F01-F23 功能编号定稿）"
```

---

## Task 2: 后端层盘点（Vendure 插件 → shop-api 暴露）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\docs\superpowers\specs\2026-10-09-vshop-usemall-parity-matrix.md`（回填「Vendure 后端」列）

**功能 → 插件线索表**（起点，不是结论；允许发现别的承载插件）：

| 功能 | 线索插件（`d:\zhao\vendure\packages\`） |
|---|---|
| F01 物流 | logistics-plugin、logistics-api-plugin、delivery-gateway-plugin、delivery-plugin |
| F02 海报 | 无已知插件（预期缺失/前端实现） |
| F03/F04/F05 钱包 | vcash-pos-plugin、vcash-offline-plugin、recharge-card-plugin、distribution-plugin（佣金提现）、settlement-plugin |
| F06/F07 优惠券 | coupon-plugin、voucher-plugin |
| F08 分销 | distribution-plugin、affiliate-plugin |
| F09 SKU | Vendure core variant（无需插件） |
| F10 账号 | phone-auth-plugin、wechat-auth-plugin、douyin-auth-plugin、core auth |
| F13/F14/F20 积分 | eco-plugin、shop-plugin（搜索 points/积分）、member-level-plugin |
| F17 会员 | member-level-plugin |
| F18 签到 | checkin-plugin |
| F19 购物圈 | community-plugin |
| F21 运费模板 | logistics-plugin、delivery-plugin（shipping method 配置） |
| F23 秒杀/拼团 | flash-sale-plugin、group-buy-plugin |

- [ ] **Step 1: 逐插件读 `src/plugin.ts` 的 `shopApiExtensions`**

对线索表中每个插件：Grep `shopApiExtensions`（文件：`packages/<name>/src/plugin.ts`），再 Read 该段 SDL，记录暴露的 Query/Mutation 名。**同时确认该插件已注册进生产配置**：Grep `d:\zhao\vendure\packages\dev-server\dev-config.ts` 中的插件 import 行（该文件即生产 dist 的源）。

- [ ] **Step 2: 回填矩阵「Vendure 后端」列**

每个功能行写：`插件名@暴露的Query名（注册:是/否）`，例：`checkin-plugin@checkinConfig,signIn（注册:是）`。无承载插件的写 `无`。

- [ ] **Step 3: 提交**

```powershell
git -C d:\zhao\vshop add web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-matrix.md
git -C d:\zhao\vshop commit -m "docs(parity): 后端层盘点回填（插件/SDL/注册状态）"
```

---

## Task 3: C 端盘点（vshop src 页面与 GraphQL）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\docs\superpowers\specs\2026-10-09-vshop-usemall-parity-matrix.md`（回填「vshop C端」列）

- [ ] **Step 1: 读路由全表**

Read `d:\zhao\vshop\src\pages.json`，列出全部已注册页面（主包 + pkg-*），作为「有无入口」的第一证据。

- [ ] **Step 2: 按功能定向取证**

对每个功能行，在 `d:\zhao\vshop\src` 内用 Grep 找页面/组件/GraphQL 字符串（中英文关键词都试）：

| 功能 | Grep 关键词（path=d:\zhao\vshop\src，-i） |
|---|---|
| F01 | `logistics`、`快递100`、`kuaidi` |
| F02 | `poster`、`海报`、`canvas.*share`、`saveImageToPhotosAlbum` |
| F03/F04 | `recharge`、`balance`、`余额` |
| F05 | `withdraw`、`提现` |
| F06/F07 | `coupon`、`领券` |
| F08 | `distribution`、`分销`、`commission` |
| F09 | `SkuSheet`、`spec`、`规格` |
| F10 | `login`、`register`、`隐私`、`修改密码`、`changePassword` |
| F11 | `feedback`、`反馈`、`常见问题`、`faq` |
| F12 | `custom.*header`、`navigationBar` |
| F13/F14 | `points`、`积分` |
| F15 | `waterfall`、`瀑布流` |
| F16 | `二级分类`、`subCategory`、`facetValue` |
| F17 | `member`、`会员`、`memberPrice` |
| F18 | `checkin`、`签到` |
| F19 | `community`、`购物圈`、`feed` |
| F20 | `lottery`、`抽奖`、`lucky` |
| F21 | `运费`、`freight`、`shipping.*template` |
| F23 | `flash-sale`、`group-buy` |

每条命中记录：文件路径 + 该文件是页面/组件/纯字符串。**注意区分「页面存在」「仅 API 字符串存在」「完全没有」**。

- [ ] **Step 3: 回填矩阵「vshop C端」列并提交**

格式：`页面路径` 或 `无页面，仅X` 或 `无`。

```powershell
git -C d:\zhao\vshop add web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-matrix.md
git -C d:\zhao\vshop commit -m "docs(parity): C端盘点回填（页面/组件/GraphQL 证据）"
```

---

## Task 4: web-admin 后台盘点

**Files:**
- Modify: `d:\zhao\vshop\web-admin\docs\superpowers\specs\2026-10-09-vshop-usemall-parity-matrix.md`（回填「web-admin」列）

- [ ] **Step 1: 列后台页面目录**

```powershell
Get-ChildItem d:\zhao\vshop\web-admin\src -Directory -Recurse -Depth 2 | Select-Object -ExpandProperty FullName
```

- [ ] **Step 2: 按功能定向取证**

在 `d:\zhao\vshop\web-admin\src` Grep：`签到|checkin`、`社区|community|购物圈`、`分销|distribution`、`运费|运费模板|shipping`、`积分|points`、`会员|member`、`优惠券|coupon`。记录后台是否有对应管理/配置页（路径）。F02/F15/F16 等纯 C 端体验项此列写 `-`。

- [ ] **Step 3: 回填并提交**

```powershell
git -C d:\zhao\vshop add web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-matrix.md
git -C d:\zhao\vshop commit -m "docs(parity): web-admin 后台盘点回填"
```

---

## Task 5: 生产探针脚本

**Files:**
- Create: `d:\zhao\vshop\web-admin\scripts\_smoke_usemall_parity.py`

- [ ] **Step 1: 读参照脚本取生产地址**

Read `d:\zhao\vshop\web-admin\scripts\_smoke_usemall_align.py`，提取其中生产 shop-api URL 常量与请求写法（探针完全沿用该地址）。

- [ ] **Step 2: 写探针脚本（仅标准库）**

脚本骨架（把 `<PROD_SHOP_API>` 换成 Step 1 提取的真实地址）：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""usemall→vshop 全功能差距矩阵 生产探针（只读）"""
import json, urllib.request

SHOP_API = "<PROD_SHOP_API>"

def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(SHOP_API, data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())

# 1) introspection：一次拿全 schema Query 字段名
INTROSPECT = "query { __schema { queryType { fields { name } } } }"
names = {f["name"] for f in gql(INTROSPECT)["data"]["__schema"]["queryType"]["fields"]}

# 2) 每功能一条定向查询（存在性 + 可出数据），按 Task 2 盘点到的真实 Query 名填
CHECKS = []  # [(功能号, 描述, query, 断言函数)]
# 示例（以 Task 2 实际盘点结果为准逐条补齐，勿臆造 Query 名）：
# CHECKS.append(("F18", "签到配置", "query { checkinConfig { id } }",
#                lambda d: "checkinConfig" in d))
# CHECKS.append(("F19", "社区feed", "query { communityPosts(options:{take:1}) { total } }",
#                lambda d: "communityPosts" in d))

def main():
    print(f"== introspection: {len(names)} query fields ==")
    for fid, desc, q, assert_fn in CHECKS:
        try:
            data = gql(q).get("data") or {}
            ok = assert_fn(data)
            print(f"[{'OK' if ok else 'EMPTY'}] {fid} {desc}")
        except Exception as e:
            msg = getattr(e, "read", lambda: b"")()
            print(f"[FAIL] {fid} {desc}: {e} {msg[:200] if msg else ''}")

if __name__ == "__main__":
    main()
```

`CHECKS` 清单要求：Task 2 中「注册:是」且有公开 Query 的功能，**每条都加一行定向查询**（查询名以 Task 2 读到的 SDL 为准；需要参数的用最小合法参数）。需要登录态的功能不进 CHECKS，在脚本尾部打印 `SKIP(需登录态): F05,F08,...`（按实际盘点结果）。

- [ ] **Step 3: 本地跑通**

```powershell
python d:\zhao\vshop\web-admin\scripts\_smoke_usemall_parity.py
```

Expected：introspection 行输出非 0 字段数；每条 OK/EMPTY/FAIL 有明确输出（FAIL 允许存在——它本身就是矩阵证据）。

- [ ] **Step 4: 提交**

```powershell
git -C d:\zhao\vshop add web-admin/scripts/_smoke_usemall_parity.py
git -C d:\zhao\vshop commit -m "test(parity): 生产只读探针 _smoke_usemall_parity.py（introspection+定向查询）"
```

---

## Task 6: 判定回填 + 文档门禁

**Files:**
- Modify: `d:\zhao\vshop\web-admin\docs\superpowers\specs\2026-10-09-vshop-usemall-parity-matrix.md`

- [ ] **Step 1: 汇总探针输出入矩阵**

跑 Task 5 探针，把每条结果写进对应行的「缺口/证据」列（格式：`探针 OK/EMPTY/FAIL: <摘要>`）。

- [ ] **Step 2: 按四态规则落「判定」列**

逐行判定（依据 = 三层证据 + 探针），「批次建议」列按设计 §4 填：`批次1（仅缺C端入口）` / `批次2（后端需补字段）` / `批次3（需新建后端能力）` / `-（不适用）` / `-（已具备）`。矩阵尾部加一节「汇总」：各判定数量 + 批次 1 候选功能清单。

- [ ] **Step 3: 文档门禁**

```powershell
(Select-String -Path d:\zhao\vshop\web-admin\docs\superpowers\specs\2026-10-09-vshop-usemall-parity-matrix.md -Pattern '待盘点|TBD|待补').Count
```

Expected：`0`（23 行判定全部落值）。非 0 则回 Step 2 补齐。

- [ ] **Step 4: 提交**

```powershell
git -C d:\zhao\vshop add web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-matrix.md
git -C d:\zhao\vshop commit -m "docs(parity): 差距矩阵定稿（23 项判定+探针证据+批次建议）"
```

---

## Task 7: 自检与呈报

- [ ] **Step 1: 三查**

1. 规格覆盖：设计 §3 判定规则四态、§6 交付物 1/4 是否都在矩阵/脚本中落地；
2. 占位符：`Select-String -Pattern '待盘点|TBD|TODO|待补'` 对矩阵与脚本 = 0 命中；
3. 证据完整性：23 行每行的证据列非空（grep `| 待盘点 |` = 0）。

- [ ] **Step 2: 向用户呈报**

汇报矩阵汇总（各判定数量、批次 1 候选清单、不适用项），**等用户确认矩阵后**才进入批次 1 的 brainstorming→writing-plans。本计划到此结束。
