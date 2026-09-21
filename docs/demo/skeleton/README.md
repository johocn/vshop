# 测试交付「三件套」骨架

> 硬性规则：**每次功能测试用手机浏览视图截图（390×844 @2x）并补充操作手册**。
> 本目录把这套流程固化成可复用骨架：新功能用例只需「填业务步骤」，自动完成
> **① API/端到端回归 ② 手机截图 ③ 手册章节生成**。

## 文件结构
```
docs/demo/skeleton/
├── skeleton.py          # 骨架库（手机视口上下文 + 截图登记 + 手册生成）
├── README.md            # 本文档
├── example_demo.py      # 可运行样板（只读演示三件套用法）
├── shots/<case_id>/     # 每个用例的截图（自动生成）
└── cases/<case_id>.md   # 每个用例的手册章节（自动生成）
```
依赖：`docs/demo/playwright/login_util.py`（API 层）+ `playwright`（py）。

## 三件套职责
1. **回归**：用 `login_util.admin_login_state(...)` + 后台 Admin API 断言后端就绪/数据正确（只读优先，写操作注明）。
2. **截图**：`skeleton.mobile_context()` 注入登录态到手机视口页面，分步 `Manual.shot()` 截图。
3. **手册**：`Manual.save_md()` 输出 markdown 章节（含截图引用），按需并入 `web-admin/src/static/manual/`。

## 接入步骤（新功能用例）
1. 复制 `example_demo.py` → `cases_py/<你的功能>.py`。
2. 改 `CASE_ID` / `TITLE`；`STATE = login_util.admin_login_state("<账号>", "<密码>")`。
3. 第一步：**回归断言**（如查询 schema/数据，失败即 `manual.fail()` 退出）。
4. 打开页面路由，每到一个关键界面 `manual.shot(page, step, "英文名", "中文标题", "说明")`。
5. 结尾 `md = manual.save_md()`，把 `md` 相对/绝对路径输出的摘要，按需拷贝含图章节进 `web-admin/src/static/manual/`。

## 运行
```bash
cd docs/demo/skeleton
python example_demo.py
```
> 会直连线上 `https://e.joho.cn/guanli/`（只读查询截图），不产生写操作；如需写操作请改用隔离测试数据并清理。

## 命名规范
- 截图：`<NN>_<英文短横线名>.png`（骨架自动编号）；避免中文/空格文件名。
- 用例：`cases/<case_id>.md`，`case_id` 用英文短横线（如 `media-asset-tag`）。
- 截图不再无归档散落：统一在 `shots/<case_id>/`，手册引用固定相对路径。

## 常见改动点
- 站点：`DEFAULT_APP` 或 `mobile_context(app=...)`。
- 登录态：`DEFAULT_STORAGE_KEYS`（web-admin 注入的 localStorage key）。
- 视口：`mobile_context(viewport=(w,h), dpr=...)`（默认手机 390×844 @2x）。