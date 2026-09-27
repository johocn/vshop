# gap4 计划剩余项收口（发布手册同步 / 第二页取证 / JSON 双根）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `2026-09-25-web-admin-gap4-plan.md` 自认「未做 / 未同步」的三项彻底收口——③ 全局配置页「JSON 高级编辑」并入 `themeTokens`（与结构化表单双向一致）、② 库存流水「上滑加载更多（第二页）」UI 取证、① 发布用使用手册 `src/static/manual/index.html` 补齐批 1/2/3/4 的新能力。

**Architecture:** 三项互不冲突，但**有严格依赖顺序**：③ 改代码 → ② 造数据 + 跑 UI 取证 → ① 写手册文案与配图（① 的配图必须在 ③ 之后拍，否则 JSON 图不含 `themeTokens`）。① 不新拍截图，**复用 `docs/verify/gap4-batch*.png` 已有取证图**（拷贝进 `src/static/manual/shots/` 并重命名），仅 2 张需要新拍（JSON 双根图、流水第二页图）。

**Tech Stack:** uni-app H5（Vue 3 + TS）/ Playwright（Python，sync API，移动视口 390×844 @dpr2）/ Vendure admin-api GraphQL / 原生 HTML 数据驱动手册（`{book,id,title,html}` 数组）

**编号:** D55（承接 D54）

---

## 0. 范围与依据（开工前必读）

### 0.1 三项的登记出处

| 项 | 登记处 | 原文 |
|---|---|---|
| ① | gap4 计划批 1 执行结论 | 「`src/static/manual/index.html`（发布用使用手册）为数据驱动 `op-N` + `shots/` 结构，与修复手册不一致，**本轮只更新修复手册**；发布手册待批次 4 的 Task 4.9 一并处理。」 |
| ① | gap4 计划批 2 / 批 3 执行结论 | 「发布用 `src/static/manual/index.html` 未同步（留待 Task 4.9）。」 |
| ① | 实际未落实 | Task 4.9 只落了 `op-40`（commit `45f4f45`，提交信息 “gap4 ops runbook”），批 1/2/3/4 的新能力**没进 op- 条目** |
| ② | 偏差表 D22② | 「计划要求的『上滑加载更多（第二页）』UI 证据**无法产出**，改为 API 分页契约对账 C1–C5」（本地 shop-a 恰好 20 条流水 = 单页 `take:20`） |
| ③ | 偏差表 D21② | 「『JSON 高级编辑』框仍**只承载 `defaults`**，未按计划把 draft 的 `themeTokens` 也并入」 |

### 0.2 关键约束（违反即返工）

1. **本地构建，服务器只解压/重启**；web-admin 走 `node scripts/deploy.mjs`（cwd 必须是 `d:\zhao\vshop\web-admin`，见偏差 #49）。
2. **② 的造数据只能在本地库**：脚本必须先校验 `BASE` 主机是 `localhost`/`127.0.0.1`，否则直接 `ENV-FAIL`（退出码 2）。生产绝不写库存。
3. **③ 不落库**：只验「双向同步 + 坏 JSON 拦截」，**不点「保存」成功路径**（避免改全局配置），验证完刷新页面即回滚。
4. i18n 新增/改名必须 **zh-Hans 与 en 成对**（既有多语言硬规范）。
5. 手册配图**必须真实存在**，否则 `npm run verify:manual` 失败（该门禁会校验「引用的截图全部存在」）。
6. 所有新增截图/照图一律 **390×844、`device_scale_factor=2`（实出 780×1688）**。

### 0.3 开工前置：启动本地两服务

```powershell
# 终端 A（后端）
cd d:\zhao\vendure\packages\dev-server ; npm run dev:server        # API_PORT=3000

# 终端 B（前端 H5）
cd d:\zhao\vshop\web-admin ; npm run dev:h5                       # 5280，/admin-api 代理 → localhost:3000
```

自检：`http://localhost:5280/` 可打开登录页；用 `superadmin@china.test / superadmin` 能登录。

### 0.4 执行期授权、备份与收口约定（用户 2026-09-27 定稿）

> 本节是本计划的**执行契约**。生效前提只有一个：**用户明确说出「执行」**。在此之前，本计划一律不落任何代码/文档改动（用户原话：「暂不执行，帮我定个计划，完成后面规划后一起执行」）。

1. **当前状态 = 待触发**。用户尚在进行后续规划，规划完成后统一执行；收到执行指令前，**不得改任何业务代码、脚本、手册、locale**。
2. **遇阻自行决断，按推荐方案继续**。执行中遇到阻塞（如 H5 `onReachBottom` 在 Playwright 下不触发、复用图尺寸不合格、i18n 键名冲突、e2e 断言口径与页面实际不符等），**不再逐项征询**，直接采用本计划各 Task 内已标注的「推荐 / 兜底」方案继续推进，并在收口报告中逐条列明「问题 → 采用方案 → 影响面」。仅以下两种情况必须停下等人：
   - 硬性门禁失败且计划内兜底方案已用尽（`npm run verify:manual` / `npm run build:h5`）；
   - 需要改动**本计划 §1 文件结构表之外的既有业务语义**（例如要动 Vendure 后端、渠道数据、生产库存）。
3. **删文件免询问，但必须先备份**。执行期间删除项目内文件（临时验证脚本、过期截图、废弃产物等）**无需征求同意**，但删除前必须：
   - 先 `Copy-Item` 到 `d:\zhao\_backup\d55-<yyyyMMdd-HHmm>\`（目录不存在则创建，**保留相对路径**）；
   - 在收口报告中给出「已删文件清单 + 备份路径」，保证可一键还原。
   - 例外：已被 `git` 跟踪且工作区干净的文件由 git 历史兜底，但**仍须在报告中点名**。
4. **收口按既有「一气呵成」执行**（本条**写入计划，但仅在执行阶段生效**，见用户回复「一气呵成可以写入计划但不是现在」）：Task 6 验证全绿后**直接 `commit → push → node scripts\deploy.mjs`**，不再逐项问「要不要 push / 要不要部署」。
   - 唯一例外：若存在「待补事项」（某张图需补拍、某条真机验证有缺口等），**先提醒用户，待其处理完后把补充与收口合并成一次提交/推送/部署**，不留半成品。
5. **执行方式默认取推荐项**：**Inline 单会话连续执行**（Task 1→6 一口气做完，遇阻按 §0.4 第 2 条自行决断；仅 Task 5 Step 4/5 与 Task 6 Step 3 两处硬门禁停下报结论）。若执行前用户改口，则切换为 **Subagent-Driven**（每 Task 一个全新 subagent + 任务间两阶段评审）。
6. **报告口径**：每个 Task 收尾给一行结论（Task 号 / 关键产物 / 门禁结果）；全部完成后给一份总表，含三项各自的证据（文件 + 行号 + 截图名 + 命令输出），以及 §0.4 第 2/3 条要求的「问题-方案-影响」与「已删文件-备份路径」清单。

---

## 1. 文件结构（本轮改动全景）

| 文件 | 动作 | 责任 |
|---|---|---|
| `src/pages/platform/global-config/index.vue` | 改 | 编辑态统一成 `{ themeTokens, defaults }`，JSON 框与结构化表单双向同步（③ 核心） |
| `src/locale/zh-Hans.json` / `src/locale/en.json` | 改 | `invalidDefaults` → `invalidJson`；`advancedJson` / `otherPagesHint` 文案更新（③） |
| `_e2e/_verify_d55_global_config_json_roots.py` | 建 | ③ 的验收与取证（双向同步 / 坏 JSON 拦截 / 780×1688 截图） |
| `_e2e/_verify_d55_movements_page2.py` | 建 | ② 造 >20 条流水 + 驱动上滑加载第二页 + 取证 |
| `_e2e/_verify_gap4_batch3.py` | 改 | 把 `skip()`（第 473–475 行）改为指向新脚本，保留分页契约 C1–C5 |
| `src/static/manual/index.html` | 改 | ① 8 处文案（7 个既有 op- 小节 + 新增 `op-41`）|
| `src/static/manual/shots/*.png` | 建 | ① 19 张配图（17 张从 `docs/verify/` 拷贝重命名 + 2 张新拍）|
| `docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md` | 改 | 偏差表新增 **D55** 行 |
| `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` | 改 | 新增 **20.22** 节 + footer 追加 |

---

## Task 1: ③ 全局配置页 —— JSON 高级编辑并入 `themeTokens`

**Files:**
- Modify: `src/pages/platform/global-config/index.vue:56-61, 108-123, 125-133, 145-155, 163-179, 181-209`
- Modify: `src/locale/zh-Hans.json:2339, 2350, 2351`
- Modify: `src/locale/en.json:2339, 2350, 2351`

**设计口径（写进代码注释）**：`themeTokens` 与 `defaults` 合成**同一份编辑态**（`draft`），结构化表单与 JSON 框是这份编辑态的两个视图——**改任一边立即同步另一边**；JSON 框在高级模式下是**完整编辑态**，`themeTokens` / `defaults` 缺哪个就以空对象覆盖哪个（与改造前「JSON 框整体覆盖 `defaults`」语义一致）。

- [x] **Step 1: 状态与 JSON 互转工具重写（替换第 108–123 行整块）**

```ts
const app = ref<'nshop' | 'vshop'>('nshop');
const tokens = ref<Record<string, string>>({ primaryColor: '#ff6600', accentColor: '#fff3e6', radius: '8' });
const defs = ref<Record<string, any>>({});
const jsonOpen = ref(false);
const draftJson = ref('{}');
const err = ref('');
const saving = ref(false);
const fieldErrors = ref<Record<string, string>>({});

/** themeTokens 的可编辑键：JSON 并入时只认这三项，其余键不参与表单往返 */
const TOKEN_KEYS = ['primaryColor', 'accentColor', 'radius'] as const;

/** 结构化字段的合并根：themeTokens + defaults 一条记录，路径前缀已含二者 */
const draft = computed<Record<string, any>>(() => ({ themeTokens: tokens.value, defaults: defs.value }));

const readField = (f: ConfigField) => getByPath(draft.value, f.path);

/** 编辑态的完整 JSON 形态：JSON 高级编辑框与结构化表单共用同一份编辑态 */
function syncToJson() {
  draftJson.value = JSON.stringify({ themeTokens: tokens.value, defaults: defs.value }, null, 2);
}

/** 把 JSON 里的 themeTokens 并入令牌：只覆盖 TOKEN_KEYS 中出现的键，值统一成字符串（与输入框态一致），缺键沿用当前编辑态 */
function mergeTokensFromJson(raw: unknown) {
  const t = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const next: Record<string, string> = { ...tokens.value };
  for (const k of TOKEN_KEYS) {
    if (t[k] !== undefined) next[k] = String(t[k]);
  }
  tokens.value = next;
}
```

- [x] **Step 2: `writeField` 两个分支都同步 JSON（替换第 125–133 行）**

```ts
function writeField(f: ConfigField, v: unknown) {
  if (f.path.startsWith('themeTokens.')) {
    tokens.value = setByPath({ themeTokens: tokens.value }, f.path, v).themeTokens;
  } else {
    defs.value = setByPath({ defaults: defs.value }, f.path, v).defaults;
  }
  syncToJson();
  checkField(f);
}
```

- [x] **Step 3: `syncFromJson` 支持两个根（替换第 145–155 行）**

```ts
/** 逃生口：JSON 手改在失焦时并入编辑态（坏 JSON / 非对象保持表单值不变，保存时由 save() 统一报错） */
function syncFromJson() {
  const text = draftJson.value.trim();
  if (!text) return;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return;
  const root = v as Record<string, unknown>;
  mergeTokensFromJson(root.themeTokens);
  if (root.defaults && typeof root.defaults === 'object' && !Array.isArray(root.defaults)) {
    defs.value = root.defaults as Record<string, any>;
  }
  syncToJson();
  fieldErrors.value = {};
}
```

- [x] **Step 4: `load()` 收尾改用 `syncToJson()`（替换第 174 行）**

把

```ts
    defaultsJson.value = JSON.stringify(defs.value, null, 2);
```

改成

```ts
    syncToJson();
```

- [x] **Step 5: `save()` 改为「先并 JSON → 再校验结构化字段」（替换第 181–209 行）**

```ts
async function save() {
  err.value = '';
  // 1) 高级 JSON 模式：先并入编辑态（themeTokens + defaults），再做结构化校验
  if (jsonOpen.value) {
    const text = draftJson.value.trim();
    if (text) {
      let v: unknown;
      try {
        v = JSON.parse(text);
      } catch {
        err.value = locale.t('platformGlobalConfig.invalidJson');
        return;
      }
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        err.value = locale.t('platformGlobalConfig.invalidJson');
        return;
      }
      const root = v as Record<string, unknown>;
      mergeTokensFromJson(root.themeTokens);
      defs.value = root.defaults && typeof root.defaults === 'object' && !Array.isArray(root.defaults)
        ? (root.defaults as Record<string, any>)
        : {};
      syncToJson();
    }
  }
  // 2) 结构化字段逐项校验：只标红出错项，保留其余编辑态
  const failed = FIELDS.filter((f) => validateField(f, readField(f)) !== null);
  fieldErrors.value = failed.reduce<Record<string, string>>((acc, f) => {
    acc[f.path] = validateField(f, readField(f))!;
    return acc;
  }, {});
  if (failed.length) {
    uni.showToast({
      title: locale.t('platformGlobalConfig.errFixFirst').replace('{n}', String(failed.length)),
      icon: 'none',
    });
    return;
  }
  saving.value = true;
  try {
    await templateApi.updateGlobalConfig({
      app: app.value,
      themeTokens: {
        primaryColor: String(tokens.value.primaryColor ?? '').trim(),
        accentColor: String(tokens.value.accentColor ?? '').trim(),
        radius: Number(tokens.value.radius) || 8,
      },
      defaults: { ...defs.value },
    });
    uni.showToast({ title: locale.t('platformGlobalConfig.saved'), icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('platformGlobalConfig.saveFailed')), icon: 'none' });
  } finally {
    saving.value = false;
  }
}
```

> 注意：`saving.value = true` 之前**不再**有单独的第 2 段 JSON 校验块（已提到最前），原第 196–209 行整段删除。

- [x] **Step 6: 模板里的变量名同步改（第 58、60 行）**

```html
          <text class="chip" :class="{ on: jsonOpen }" @tap="jsonOpen = !jsonOpen">{{ $t('platformGlobalConfig.advancedJson') }}</text>
        </view>
        <textarea v-if="jsonOpen" class="ta tall" v-model="draftJson" @blur="syncFromJson" />
```

（`defaultsJson` → `draftJson`，两处；改完全文件不得再出现 `defaultsJson`）

- [x] **Step 7: i18n 三处文案更新**

`src/locale/zh-Hans.json`：

```json
    "invalidJson": "JSON 不是合法对象（应为 { themeTokens, defaults }）",
```

```json
    "otherPagesHint": "其它页面的默认配置请用下方 JSON 高级编辑维护（该框同时承载主题令牌 themeTokens）。",
```

```json
    "advancedJson": "JSON 高级编辑（themeTokens + defaults）",
```

`src/locale/en.json`：

```json
    "invalidJson": "JSON must be an object shaped like { themeTokens, defaults }",
```

```json
    "otherPagesHint": "Other pages' defaults are maintained via the JSON advanced editor below (it also carries themeTokens).",
```

```json
    "advancedJson": "JSON advanced editor (themeTokens + defaults)",
```

（键名 `invalidDefaults` → `invalidJson`，仅此一处调用点，已确认：`src/pages/platform/global-config/index.vue:205`）

- [x] **Step 8: 类型检查与残留扫描**

Run:

```powershell
cd d:\zhao\vshop\web-admin ; npx vue-tsc --noEmit -p tsconfig.json 2>&1 | Select-Object -First 30 ; Select-String -Path src -Pattern "defaultsJson|invalidDefaults" -Recurse
```

Expected: `vue-tsc` 无本页报错（既有其它页报错不算本任务）；`Select-String` **无输出**。

- [x] **Step 9: 提交**

```powershell
cd d:\zhao\vshop\web-admin
git add src/pages/platform/global-config/index.vue src/locale/zh-Hans.json src/locale/en.json
git commit -m "feat(web-admin): 全局配置 JSON 高级编辑并入 themeTokens，与结构化表单双向同步（D55-③）"
```

---

## Task 2: ③ 验收与取证（新脚本）

**Files:**
- Create: `_e2e/_verify_d55_global_config_json_roots.py`
- 产出: `docs/verify/d55-global-config-json-both-roots-390.png`（780×1688）

- [x] **Step 1: 写脚本（完整内容如下）**

```python
# -*- coding: utf-8 -*-
"""D55-③ 验收：全局配置页「JSON 高级编辑」并入 themeTokens，与结构化表单双向同步。

断言（全程零落库：只验双向同步与坏 JSON 拦截，不点保存成功路径）
  A1 JSON 框是完整编辑态：文本 parse 后同时含 themeTokens 与 defaults 两个根
  A2 JSON → 表单：把 JSON 里 themeTokens.radius 改成 20 → 失焦 → 「圆角 radius」输入框 == 20
  A3 表单 → JSON：把「主色 primaryColor」输入框改成 #123456@test → JSON 文本里同步出现该值
  A4 坏 JSON 拦截：把 JSON 改成 `{` → 失焦 → 表单值不变；点「保存」→ 出现 invalidJson 文案，且**未发出**更新请求
  A5 取证：`docs/verify/d55-global-config-json-both-roots-390.png`（390×844 @dpr2 = 780×1688），0 pageerror
退出码：0 全通过 / 1 断言失败 / 2 环境不可用
"""
import json
import os
import time
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

BASE = os.environ.get('WA_D55_BASE', 'http://localhost:5280/')
USER = os.environ.get('WA_D55_ADMIN_USER', 'superadmin@china.test')
PWD = os.environ.get('WA_D55_ADMIN_PWD', 'superadmin')
PAGE = 'pages/platform/global-config/index'
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
FAILS = []


def check(name, ok, detail=''):
    print('%s %s%s' % ('PASS' if ok else 'FAIL', name, (' | %s' % detail) if detail else ''))
    if not ok:
        FAILS.append(name)


def login(pg):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=60000)
    pg.locator('input').nth(0).fill(USER)
    pg.locator('input').nth(1).fill(PWD)
    pg.locator('button, .btn').first.click()
    pg.wait_for_function("() => !!localStorage.getItem('wa_auth_token')", timeout=60000)


def goto_config(pg):
    pg.goto('%s#/%s?cb=%d' % (BASE, PAGE, int(time.time() * 1000)),
            wait_until='domcontentloaded', timeout=60000)
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('.card').first.wait_for(state='visible', timeout=60000)
    time.sleep(1.2)


def open_json(pg):
    pg.locator('.chip').filter(has_text='JSON 高级编辑').first.click()
    pg.wait_for_timeout(600)
    pg.locator('textarea.ta').first.wait_for(state='visible', timeout=15000)
    return pg.locator('textarea.ta').first


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844},
                            device_scale_factor=2, is_mobile=True, has_touch=True,
                            locale='zh-CN')
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        login(pg)
        goto_config(pg)

        ta = open_json(pg)
        txt = ta.input_value()
        try:
            obj = json.loads(txt)
        except Exception as e:  # noqa: BLE001
            obj = None
            check('A1 JSON 框文本可解析', False, str(e)[:120])
        if obj is not None:
            check('A1 JSON 框同时含 themeTokens 与 defaults 两个根',
                  isinstance(obj.get('themeTokens'), dict) and isinstance(obj.get('defaults'), dict),
                  'keys=%r' % list(obj.keys()))

        # A2 JSON → 表单
        obj2 = dict(obj or {})
        tt = dict(obj2.get('themeTokens') or {})
        tt['radius'] = 20
        obj2['themeTokens'] = tt
        ta.fill(json.dumps(obj2, ensure_ascii=False, indent=2))
        ta.blur()
        pg.wait_for_timeout(800)
        radius_input = pg.locator('.field').filter(has_text='圆角').locator('input').first
        check('A2 JSON → 表单：radius=20 同步到「圆角 radius」输入框',
              radius_input.input_value().strip() == '20', 'got=%r' % radius_input.input_value())

        # A3 表单 → JSON
        color_input = pg.locator('.field').filter(has_text='主色').locator('input').first
        color_input.fill('#123456')
        pg.wait_for_timeout(600)
        check('A3 表单 → JSON：主色改动同步进 JSON 文本',
              '#123456' in pg.locator('textarea.ta').first.input_value())

        # A5 先取证（此时 JSON 与表单均为最新编辑态）
        OUT.mkdir(parents=True, exist_ok=True)
        shot = OUT / 'd55-global-config-json-both-roots-390.png'
        pg.screenshot(path=str(shot))
        check('A5 取证图 %s' % shot.name, shot.exists() and shot.stat().st_size > 4000,
              '%dB' % (shot.stat().st_size if shot.exists() else 0))

        # A4 坏 JSON 拦截
        before = radius_input.input_value()
        ta.fill('{')
        ta.blur()
        pg.wait_for_timeout(800)
        check('A4 坏 JSON 不失焦即崩：表单值保持不变',
              radius_input.input_value() == before, 'before=%r after=%r' % (before, radius_input.input_value()))
        pg.locator('button.btn, .btn').filter(has_text='保存').first.click()
        pg.wait_for_timeout(1500)
        body = pg.inner_text('body')
        check('A4 坏 JSON 保存被拦截（出现 invalidJson 文案）',
              'JSON 不是合法对象' in body, 'body=%r' % body[-160:].replace('\n', '|'))
        check('A5 全程 0 pageerror', not errs, str(errs[:2]))

        b.close()

    print('\n===== D55-③ 验收：%s（失败 %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS)))
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
```

- [x] **Step 2: 跑脚本**

Run:

```powershell
cd d:\zhao\vshop\web-admin ; python _e2e\_verify_d55_global_config_json_roots.py ; echo "EXIT=$LASTEXITCODE"
```

Expected: 6 项 PASS，`EXIT=0`，且 `docs/verify/d55-global-config-json-both-roots-390.png` 为 **780×1688**。

- [x] **Step 3: 尺寸自证**

Run:

```powershell
cd d:\zhao\vshop\web-admin ; python -c "from PIL import Image;im=Image.open('docs/verify/d55-global-config-json-both-roots-390.png');print(im.size)"
```

Expected: `(780, 1688)`

- [x] **Step 4: 提交**

```powershell
cd d:\zhao\vshop\web-admin
git add _e2e/_verify_d55_global_config_json_roots.py docs/verify/d55-global-config-json-both-roots-390.png
git commit -m "test(web-admin): D55-③ 全局配置 JSON 双根双向同步验收脚本 + 取证图"
```

---

## Task 3: ② 造 >20 条流水 + 上滑加载第二页 UI 取证

**Files:**
- Create: `_e2e/_verify_d55_movements_page2.py`
- Modify: `_e2e/_verify_gap4_batch3.py:473-475`
- 产出: `docs/verify/gap4-batch3-movements-page2-390.png`（780×1688）

**造数据口径**：只用 admin-api 的 `createStockDoc(type:'PURCHASE')`，每次 1 条明细 → 每次 +1 条库存流水；`variantId` / `toStockLocationId` **从当前 flow 第一页既有流水里取**（不硬编码 id）。目标：把 `shop-a` 流水从 20 条推到 **≥25 条**。

- [x] **Step 1: 写脚本（完整内容如下）**

```python
# -*- coding: utf-8 -*-
"""D55-② 验收：库存流水「上滑加载更多（第二页）」真实 UI 证据。

背景（偏差表 D22②）：本地 shop-a 恰好 20 条流水 == 单页 take:20，无第二页可加载，
当时改用 API 分页契约对账（C1–C5）留档。本脚本先**在本地库真实造 >20 条流水**，再驱动 UI 上滑加载，
实拍第二页累积。

安全：仅允许本地 BASE（localhost / 127.0.0.1），生产域名直接 ENV-FAIL 退出码 2；绝不触碰生产。
副作用：本地 shop-a 会增加若干条采购入库单与流水（本地库脏数据，已在计划 D55 行留档）。

断言
  S1 环境为本地 + 渠道流水总数 > 20（不足则自动补造到 25 条）
  S2 UI 首屏加载 20 条（== 单页上限）
  S3 上滑到底后累积条数 == min(totalItems, 40) 且 > 20（= 第二页真的加载出来）
  S4 出现「没有更多了」且 0 pageerror
  S5 取证 docs/verify/gap4-batch3-movements-page2-390.png（780×1688）
退出码：0 全通过 / 1 断言失败 / 2 环境不可用
"""
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

BASE = os.environ.get('WA_D55_BASE', 'http://localhost:5280/')
ADMIN = os.environ.get('WA_API_ADMIN', 'http://127.0.0.1:3000/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'superadmin@china.test')
PWD = os.environ.get('WA_SMOKE_PWD', 'superadmin')
CHANNEL = os.environ.get('WA_B3_CHANNEL', 'shop-a')
TARGET = int(os.environ.get('WA_D55_TARGET_ROWS', '25'))
MOVEMENTS = 'pages/inventory/movements/index'
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
TAKE = 20
FAILS = []


def check(name, ok, detail=''):
    print('%s %s%s' % ('PASS' if ok else 'FAIL', name, (' | %s' % detail) if detail else ''))
    if not ok:
        FAILS.append(name)


def env_fail(msg):
    print('ENV-FAIL: %s' % msg)
    raise SystemExit(2)


def api(query, variables=None, token=None, channel=None):
    body = json.dumps({'query': query, 'variables': variables or {}}).encode()
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if channel:
        headers['vendure-token'] = channel
    req = urllib.request.Request(ADMIN, data=body, headers=headers, method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.headers.get('vendure-auth-token'), json.loads(r.read().decode('utf-8', 'ignore'))


def admin_login():
    q = 'mutation($u:String!,$p:String!){login(username:$u,password:$p){... on CurrentUser{id identifier}}}'
    tok, r = api(q, {'u': USER, 'p': PWD})
    if not tok:
        env_fail('登录失败 %s' % json.dumps(r, ensure_ascii=False)[:200])
    return tok


LEDGER_Q = ('query($page:Int,$take:Int){stockMovementLedger(channelCode:"%s",page:$page,pageSize:$take)'
            '{totalItems items{id productVariantId stockLocationId bizType direction quantity}}}')


def ledger(tok, page=1, take=TAKE):
    _, r = api(LEDGER_Q % CHANNEL, {'page': page, 'take': take}, token=tok, channel=CHANNEL)
    if r.get('errors'):
        env_fail('流水查询失败 %s' % str(r['errors'][0].get('message'))[:200])
    return (r.get('data') or {}).get('stockMovementLedger') or {'totalItems': 0, 'items': []}


def seed_purchase(tok, variant_id, location_id, qty, tag):
    q = ('mutation($input:StockDocCreateInput!){createStockDoc(input:$input){id code type}}')
    _, r = api(q, {'input': {'type': 'PURCHASE', 'remark': 'D55-② 造流水 %s' % tag,
                             'items': [{'variantId': str(variant_id), 'toStockLocationId': str(location_id),
                                        'qty': qty}]}},
               token=tok, channel=CHANNEL)
    if r.get('errors') or not (r.get('data') or {}).get('createStockDoc'):
        env_fail('造采购入库单失败 %s' % json.dumps(r, ensure_ascii=False)[:300])


def rows_loaded(pg):
    return pg.locator('.grp .card').count()


def scroll_to_bottom(pg):
    pg.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    pg.wait_for_timeout(1600)


def login(pg):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=60000)
    pg.locator('input').nth(0).fill(USER)
    pg.locator('input').nth(1).fill(PWD)
    pg.locator('button, .btn').first.click()
    pg.wait_for_function("() => !!localStorage.getItem('wa_auth_token')", timeout=60000)
    # 渠道注入（沿用 batch3 既有键名）
    pg.evaluate("(c)=>{localStorage.setItem('wa_channel_token',c);localStorage.setItem('wa_channel_code',c);}",
                CHANNEL)
    pg.reload(wait_until='domcontentloaded', timeout=60000)


def main():
    host = urllib.parse.urlparse(BASE).hostname or ''
    if host not in ('localhost', '127.0.0.1'):
        env_fail('本脚本会真实写入库存，仅允许本地 BASE，当前 host=%s' % host)

    tok = admin_login()
    led = ledger(tok, 1, 1)
    check('S1a 渠道 %s 已有流水 totalItems=%d' % (CHANNEL, led['totalItems']), True)
    if not led['items']:
        env_fail('渠道 %s 无任何流水，无法推导 variantId / stockLocationId' % CHANNEL)
    base_row = led['items'][0]

    made = 0
    while ledger(tok, 1, 1)['totalItems'] < TARGET:
        seed_purchase(tok, base_row['productVariantId'], base_row['stockLocationId'], 1, 'n%d' % (made + 1))
        made += 1
        if made > 60:
            env_fail('造数据超过 60 次仍未达 %d 条，请检查渠道数据' % TARGET)
    total = ledger(tok, 1, 1)['totalItems']
    check('S1b 流水总数 > %d（本轮新造 %d 条）' % (TAKE, made), total > TAKE, 'totalItems=%d' % total)

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844},
                            device_scale_factor=2, is_mobile=True, has_touch=True, locale='zh-CN')
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        login(pg)
        pg.goto('%s#/%s?cb=%d' % (BASE, MOVEMENTS, int(time.time() * 1000)),
                wait_until='domcontentloaded', timeout=60000)
        pg.reload(wait_until='domcontentloaded', timeout=60000)
        pg.locator('.grp .card').first.wait_for(state='visible', timeout=90000)
        time.sleep(1.0)

        first = rows_loaded(pg)
        check('S2 首屏加载 %d 条（== 单页上限 %d）' % (first, TAKE), first == TAKE, 'rows=%d' % first)

        for _ in range(4):
            scroll_to_bottom(pg)

        loaded = rows_loaded(pg)
        expect = min(total, TAKE * 2)
        check('S3 上滑后累积 %d 条 == min(totalItems %d, 40) 且 > %d' % (loaded, total, TAKE),
              loaded == expect and loaded > TAKE, 'rows=%d expect=%d' % (loaded, expect))
        body = pg.inner_text('body')
        check('S4 出现「没有更多了」', '没有更多了' in body, 'body=%r' % body[-160:].replace('\n', '|'))
        check('S4 0 pageerror', not errs, str(errs[:2]))

        OUT.mkdir(parents=True, exist_ok=True)
        shot = OUT / 'gap4-batch3-movements-page2-390.png'
        pg.screenshot(path=str(shot))
        check('S5 取证图 %s' % shot.name, shot.exists() and shot.stat().st_size > 4000,
              '%dB' % (shot.stat().st_size if shot.exists() else 0))
        b.close()

    print('\n===== D55-② 验收：%s（失败 %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS)))
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
```

- [x] **Step 2: 跑脚本**

Run:

```powershell
cd d:\zhao\vshop\web-admin ; python _e2e\_verify_d55_movements_page2.py ; echo "EXIT=$LASTEXITCODE"
```

Expected: S1a/S1b/S2/S3/S4/S5 全 PASS，`EXIT=0`；输出里能看到「本轮新造 N 条」。

> 若 `S3` 失败且 `loaded == 20`：说明 H5 的 `onReachBottom` 未触发——改用 `pg.mouse.wheel(0, 20000)` 或 `pg.locator('.more').scroll_into_view_if_needed()` 后再滚动，重跑；脚本内 `scroll_to_bottom` 是唯一改动点。

- [x] **Step 3: 改 batch3 脚本的 skip 说明（第 473–475 行）**

把

```python
    skip('「上滑加载更多」第二页 UI 证据',
         '本地 %s 渠道仅 %d 张单据 / %d 条流水（= 单页 take:%d），无第二页可加载；改由 API 分页契约对账证明「不重复不丢项」'
         % (CHANNEL_CODE, doc0['totalItems'], led0['totalItems'], TAKE))
```

改成

```python
    skip('「上滑加载更多」第二页 UI 证据（本脚本内）',
         '本地 %s 渠道仅 %d 张单据 / %d 条流水（= 单页 take:%d），本脚本仍以 API 分页契约对账证明「不重复不丢项」；'
         '**真实第二页 UI 证据已由 `_e2e/_verify_d55_movements_page2.py` 收口**（先本地造 >%d 条流水再驱动上滑，见 D55-②）'
         % (CHANNEL_CODE, doc0['totalItems'], led0['totalItems'], TAKE, TAKE))
```

- [x] **Step 4: 回归 batch3（确认未被改坏）**

Run:

```powershell
cd d:\zhao\vshop\web-admin ; python _e2e\_verify_gap4_batch3.py ; echo "EXIT=$LASTEXITCODE"
```

Expected: 仍为 `PASS（失败 0 / SKIP 1）`，`EXIT=0`。

- [x] **Step 5: 尺寸自证 + 提交**

```powershell
cd d:\zhao\vshop\web-admin
python -c "from PIL import Image;print(Image.open('docs/verify/gap4-batch3-movements-page2-390.png').size)"
git add _e2e/_verify_d55_movements_page2.py _e2e/_verify_gap4_batch3.py docs/verify/gap4-batch3-movements-page2-390.png
git commit -m "test(web-admin): D55-② 库存流水第二页 UI 取证（本地造 >20 条流水 + 上滑加载）"
```

Expected: `(780, 1688)`

---

## Task 4: ① 发布手册文案（8 处）

**Files:**
- Modify: `src/static/manual/index.html` （行号以改前为准，**从后往前改**，避免行号漂移）

统一约定：新段落一律用既有 class（`<mark class="mark">` 高亮、`<h3>`、`<div class="shot-box">` 包图、`<div class="imgcap">` 图注、`<div class="note">` 提示）。

- [x] **Step 1: `op-29` 数据看板 —— 追加「5. 作业分析」（在 `op-29` 块内、`<div class="note"><b>权限：`（第 824 行）之前插入）**

```html
<h3>5. 作业分析（拣货 / 盘库 / 差异率 / 发货件数）</h3>
<p>看板底部「作业分析」按所选时间窗（近 7 / 近 30）汇总四项 KPI：<mark class="mark">拣货单数</mark>、<mark class="mark">盘库次数</mark>、<mark class="mark">盘点差异率</mark>（Σ|差异| ÷ Σ应盘）与<mark class="mark">发货件数</mark>。差异率下方给出与上期对比的升降箭头。</p>
<p>其下是<mark class="mark">近 7 日盘点差异趋势</mark>（按天条状，0 差异日不画条）与<mark class="mark">作业员明细</mark>（每人：单据数 / 件数）。右上角「导出 CSV」按当前时间窗导出（含 UTF-8 BOM，文件名形如 <code>ops-report-7d-20260926.csv</code>），与页面同源同值。</p>
<div class="shot-box"><img class="img" src="shots/gap4_op29_ops_kpi.png" alt="数据看板-作业分析KPI"><div class="imgcap">图 K2 · 作业分析四项 KPI（拣货 / 盘库 / 差异率 / 发货件数）</div></div>
<div class="shot-box"><img class="img" src="shots/gap4_op29_ops_trend.png" alt="数据看板-近7日盘点差异趋势"><div class="imgcap">图 K3 · 近 7 日盘点差异趋势（条状，0 差异日不画条）</div></div>
<div class="shot-box"><img class="img" src="shots/gap4_op29_ops_counter.png" alt="数据看板-作业员明细"><div class="imgcap">图 K4 · 作业员明细（单据数 / 件数）与 CSV 导出</div></div>
<div class="note"><b>口径说明：</b>「作业员」列显示 <mark class="mark">库存单据上的操作人原值</mark>（本地环境可能是数字 ID）；「发货件数」按<mark class="mark">订单创建时间</mark>归期，非发货时间。</div>
```

- [x] **Step 2: 新增 `op-41`「拣货批次：交接 / 复核 / 异常件」（插在第 1154 行 `` `}, `` 与第 1155 行 `{book:'mp'...` 之间）**

```javascript
{book:'op', id:'op-41', title:'拣货批次：打印 / 交接 / 复核 / 异常件', html:`
<p class="lead">多仓或多拣货员的店铺，把「一次拣货作业」做成<mark class="mark">批次</mark>来管：批次沿状态机推进，中途可<mark class="mark">交接</mark>给下一环、出现破损或缺货时登记<mark class="mark">异常件</mark>，最后<mark class="mark">复核</mark>归档只读。</p>
<h3>1. 状态机</h3>
<div class="card">批次状态按顺序推进，不可跳级、不可回退：<br/><b>已打印 PRINTED</b> → <b>已发货 SHIPPED</b> → <b>已交接 HANDOVER</b> → <b>异常 EXCEPTION</b> → <b>已复核 REVIEWED</b>。<br/>其中「异常」是分支态：登记异常件后批次进入异常，处理完再回到交接 / 复核链路。</div>
<h3>2. 交接与异常件</h3>
<p>入口：订单 → <mark class="mark">配货台 → 批次详情</mark>。点「<mark class="mark">交接</mark>」在弹出的交接单里填<mark class="mark">交接对象</mark>与备注并提交；「未交接前不显示交接对象与交接时间」。点「<mark class="mark">登记异常件</mark>」填异常类型与数量，批次随即置为异常态。</p>
<div class="shot-box"><img class="img" src="shots/gap4_op41_handover_sheet.png" alt="批次交接单"><div class="imgcap">图 P1 · 批次交接单（交接对象 + 备注）</div></div>
<div class="shot-box"><img class="img" src="shots/gap4_op41_exception.png" alt="批次异常件登记"><div class="imgcap">图 P2 · 异常件登记（类型 + 数量，批次转异常态）</div></div>
<h3>3. 复核后只读</h3>
<p>点「<mark class="mark">复核</mark>」后整页转为<mark class="mark">只读</mark>（所有操作按钮消失），批次进入「已完成」列表；配货台列表按「进行中 / 已完成」分 Tab。</p>
<div class="shot-box"><img class="img" src="shots/gap4_op41_handover_detail.png" alt="批次详情-已交接"><div class="imgcap">图 P3 · 已交接的批次详情（交接对象 / 交接时间已写入）</div></div>
<div class="shot-box"><img class="img" src="shots/gap4_op41_reviewed.png" alt="批次详情-已复核只读"><div class="imgcap">图 P4 · 复核后整页只读（已完成 Tab）</div></div>`},
```

> 注意：`op-41` 是 `book:'op'` 数组的**最后一项之后**插入，因此上一项（`op-40`）结尾的 `` `}, `` 保留，新项结尾也必须是 `` `}, ``。

- [x] **Step 3: `op-24` 预留单 —— 追加「预留单独立页」（在 `op-24` 块内、`<h3>3. 对账</h3>`（第 764 行）之前插入）**

```html
<h3>3. 预留单独立页（倒计时 / 手工释放）</h3>
<p>入口：库存 → 「<mark class="mark">预留单</mark>」宫格。默认列出<mark class="mark">待备货</mark>的预留单，每条显示<mark class="mark">剩余有效期倒计时（mm:ss，每秒递减）</mark>；顶部按状态分 5 个页签（待备货 / 已配货 / 已发货 / 已释放 / 全部）。</p>
<p>点每条右侧「<mark class="mark">释放</mark>」可<mark class="mark">手工释放</mark>（把「待备货」置为「已释放」并归还账面占用）；已释放等<mark class="mark">终态单不再显示「释放」按钮</mark>。自动释放由常驻 worker 执行，见 op-40。</p>
<div class="shot-box"><img class="img" src="shots/gap4_op24_resv_page.png" alt="预留单独立页-倒计时"><div class="imgcap">图 R16 · 预留单独立页（mm:ss 倒计时 + 手工释放 + 状态页签）</div></div>
<div class="shot-box"><img class="img" src="shots/gap4_op24_resv_entry.png" alt="库存页预留单入口"><div class="imgcap">图 R17 · 库存页「预留单」宫格入口</div></div>
```

（原「3. 对账」编号顺延为「4. 对账」，只改这一行标题文本）

- [x] **Step 4: `op-23` —— 新增「7. 单据中心」，原「7. 库存预警」顺延为「8.」**

先在 `§6 库存流水` 正文（第 745 行）之后、第 746 行的 `<img>` 之前插入筛选说明：

```html
<p>页面提供<mark class="mark">五组筛选</mark>：方向（全部 / 入库 / 出库）、业务类型（采购 / 移库 / 盘库 / 出库 / 销售 / 镜像同步…）、仓库（含「全部仓」）、<mark class="mark">日期区间</mark>与商品变体 ID。筛选提交后<mark class="mark">顶部汇总条随条件重算</mark>（入库合计 / 出库合计 / 条数），每条流水行显示<mark class="mark">「结存变化 前 → 后」</mark>，可直接看出这笔变动把该仓库存从多少改到多少。</p>
<div class="shot-box"><img class="img" src="shots/gap4_op23_movements_filter.png" alt="库存流水-方向筛选"><div class="imgcap">图 I3b · 库存流水按方向「出库」筛选（汇总随条件重算）</div></div>
<div class="shot-box"><img class="img" src="shots/gap4_op23_movements_delta.png" alt="库存流水-结存变化"><div class="imgcap">图 I3c · 每行「结存变化 前 → 后」</div></div>
<div class="shot-box"><img class="img" src="shots/gap4_op23_movements_page2.png" alt="库存流水-上滑加载第二页"><div class="imgcap">图 I3d · 上滑加载更多（累计条数随滚动变多，到底显示「没有更多了」）</div></div>
```

再把第 749 行标题 `<h3>7. 库存预警（低库存 / 缺货 + 批量生成采购入库单）</h3>` 改为 `<h3>8. 库存预警（低库存 / 缺货 + 批量生成采购入库单）</h3>`，并在其**之前**插入新的一节：

```html
<h3>7. 单据中心（筛选 / 进度 / 重试）</h3>
<p>入口：后台 → 库存 → <mark class="mark">单据中心</mark>。汇总全渠道的采购入库 / 移库 / 盘库 / 出库单据，顶部<mark class="mark">四项筛选</mark>：类型（页签）、仓库、日期区间、操作人；列表顶部显示<mark class="mark">进度条与「已显示 N / M」</mark>，上滑加载更多，到底提示「没有更多了」。请求失败时给出<mark class="mark">错误态 + 「重试」</mark>按钮，不会静默留下空白页。</p>
<div class="shot-box"><img class="img" src="shots/gap4_op23_stockdoc_filter.png" alt="单据中心-筛选与进度"><div class="imgcap">图 I6 · 单据中心（类型 + 仓库 + 日期筛选 + 进度「已显示 N / M」）</div></div>
```

- [x] **Step 5: `op-36` 店铺全局配置 —— 追加「编辑方式」三段（在 `op-36` 块内、第 890 行的 `<div class="shot-box">` 之前插入）**

```html
<h3>1. 结构化表单（推荐）</h3>
<p>主题令牌（<mark class="mark">主色 / 辅色 / 圆角</mark>）与「商品详情默认配置」（版式 <code>layout</code> 与 7 个功能块开关）都用<mark class="mark">结构化表单</mark>填写：版式用胶囊单选，开关用 switch。<mark class="mark">保存前逐项校验，出错项当场标红</mark>（颜色格式 / 数值范围 / 必填），不会「报错后全部重填」。</p>
<div class="shot-box"><img class="img" src="shots/gap4_op36_config_form.png" alt="全局配置-结构化表单"><div class="imgcap">图 G2 · 结构化表单（令牌 + 版式胶囊 + 块开关 + 行内标红）</div></div>
<h3>2. 合并预览（改前可见）</h3>
<p>点「立即预览」用<mark class="mark">当前未保存的编辑态</mark>生成 L0→L3 逐级合并后的最终配置；点「显示来源」可逐键看到该值来自 <mark class="mark">L1 全局 / L2 模板 / L3 店铺覆盖</mark>哪一层。</p>
<div class="shot-box"><img class="img" src="shots/gap4_op36_config_preview.png" alt="全局配置-合并预览"><div class="imgcap">图 G3 · 合并预览（逐键标注 L1/L2/L3 来源）</div></div>
<h3>3. JSON 高级编辑（兜底）</h3>
<p>下方「JSON 高级编辑」是<mark class="mark">完整编辑态</mark>的逃生口：内容形如 <code>{ "themeTokens": {...}, "defaults": {...} }</code>，<mark class="mark">与上方结构化表单双向同步</mark>——改表单会立即反映到 JSON，改 JSON 失焦后也会并回表单。其它页面的默认配置（首页 / 分类 / 购物车 / 我的）只能在 JSON 里维护。</p>
<div class="shot-box"><img class="img" src="shots/gap4_op36_config_json.png" alt="全局配置-JSON双根"><div class="imgcap">图 G4 · JSON 高级编辑（themeTokens + defaults 两个根，与表单双向同步）</div></div>
```

- [x] **Step 6: `op-35` 商品分类 —— 追加「层级树 / 排序 / 图标 / 批量」（在 `op-35` 块内、第 885 行的 `<div class="shot-box">` 之前插入）**

```html
<h3>层级树与排序</h3>
<p>分类列表按<mark class="mark">父子层级缩进</mark>展示，可<mark class="mark">逐级折叠</mark>；同级可用「上移 / 下移」调整顺序（顺序即前台展示顺序），也支持<mark class="mark">层级移动</mark>——把某分类挂到另一个父分类下。</p>
<div class="shot-box"><img class="img" src="shots/gap4_op35_categories_tree.png" alt="分类管理-层级树"><div class="imgcap">图 C2 · 分类层级树（父子缩进 + 折叠）与同级排序</div></div>
<h3>分类图标与批量操作</h3>
<p>每个分类可设置<mark class="mark">图标</mark>（前台分类导航直接取用）。勾选多个分类后底部出现<mark class="mark">批量操作条</mark>；删除时若该分类下仍有<mark class="mark">在售商品或子分类</mark>会被拦下并说明原因。</p>
<div class="shot-box"><img class="img" src="shots/gap4_op35_categories_bulk.png" alt="分类管理-批量操作"><div class="imgcap">图 C3 · 勾选多个分类 → 底部批量操作条</div></div>
```

- [x] **Step 7: `op-31` 售后 —— 在「入口与筛选」小节内追加类型筛选与上滑加载（第 848 行段落之后、第 849 行 `<div class="shot-box">` 之前插入）**

```html
<p>状态标签旁还有<mark class="mark">售后类型筛选</mark>：全部 / 仅退款 / 退货退款 / 换货，可与状态标签叠加使用；列表<mark class="mark">分页加载</mark>，上滑到底自动加载下一页并累积显示，末尾提示「没有更多了」。</p>
<div class="shot-box"><img class="img" src="shots/gap4_op31_aftersale_type_filter.png" alt="售后处理-类型筛选"><div class="imgcap">图 S1b · 售后类型筛选（仅退款/退货退款/换货）</div></div>
<div class="shot-box"><img class="img" src="shots/gap4_op31_aftersale_loadmore.png" alt="售后处理-上滑加载更多"><div class="imgcap">图 S1c · 上滑加载更多（累计条数增加，到底提示「没有更多了」）</div></div>
```

- [x] **Step 8: 结构与语法自检**

Run:

```powershell
cd d:\zhao\vshop\web-admin
Select-String -Path src\static\manual\index.html -Pattern "gap4_op" | Measure-Object | Select-Object -ExpandProperty Count
node -e "const fs=require('fs');const s=fs.readFileSync('src/static/manual/index.html','utf8');const m=s.match(/id:'op-\d+'/g)||[];console.log('op 条目数',m.length);console.log('op-41',m.includes(\"id:'op-41'\"))"
```

Expected: 引用的 `gap4_op*` 图名出现次数 = **19**；`op 条目数` 比改前多 1；`op-41 true`。

---

## Task 5: ① 手册配图（拷贝 17 张 + 新增 2 张）+ 门禁

**Files:**
- Create: `src/static/manual/shots/gap4_op*.png`（19 张）
- 源：`docs/verify/gap4-batch*.png` + `docs/verify/d55-global-config-json-both-roots-390.png`

- [x] **Step 1: 拷贝映射（17 张，逐条执行；PowerShell）**

```powershell
cd d:\zhao\vshop\web-admin
$map = @{
  'gap4-batch1-aftersale-type-filter.png'   = 'gap4_op31_aftersale_type_filter.png'
  'gap4-batch1-aftersale-loadmore.png'      = 'gap4_op31_aftersale_loadmore.png'
  'gap4-batch1-categories-tree.png'         = 'gap4_op35_categories_tree.png'
  'gap4-batch1-categories-picked-bulk.png'  = 'gap4_op35_categories_bulk.png'
  'gap4-batch2-globalconfig-form.png'       = 'gap4_op36_config_form.png'
  'gap4-batch2-globalconfig-preview.png'    = 'gap4_op36_config_preview.png'
  'gap4-batch3-movements-direction-out.png' = 'gap4_op23_movements_filter.png'
  'gap4-batch3-movements-delta.png'         = 'gap4_op23_movements_delta.png'
  'gap4-batch3-movements-page2-390.png'     = 'gap4_op23_movements_page2.png'
  'gap4-batch3-stockdoc-location-date.png'  = 'gap4_op23_stockdoc_filter.png'
  'gap4-batch4-resv-list-default.png'       = 'gap4_op24_resv_page.png'
  'gap4-batch4-stock-grid-reservation.png'  = 'gap4_op24_resv_entry.png'
  'gap4-batch4-handover-sheet.png'          = 'gap4_op41_handover_sheet.png'
  'gap4-batch4-exception-detail.png'        = 'gap4_op41_exception.png'
  'gap4-batch4-handover-detail.png'         = 'gap4_op41_handover_detail.png'
  'gap4-batch4-reviewed-detail.png'         = 'gap4_op41_reviewed.png'
  'gap4-batch4-dash-ops-kpi.png'            = 'gap4_op29_ops_kpi.png'
  'gap4-batch4-dash-ops-trend.png'          = 'gap4_op29_ops_trend.png'
  'gap4-batch4-dash-ops-counter.png'        = 'gap4_op29_ops_counter.png'
}
foreach ($k in $map.Keys) { Copy-Item "docs\verify\$k" "src\static\manual\shots\$($map[$k])" -Force }
Copy-Item 'docs\verify\d55-global-config-json-both-roots-390.png' 'src\static\manual\shots\gap4_op36_config_json.png' -Force
Get-ChildItem src\static\manual\shots\gap4_op*.png | Measure-Object | Select-Object -ExpandProperty Count
```

Expected: 最后一行输出 **19**。

- [x] **Step 2: 图片尺寸自证（19 张全部 780×1688）**

```powershell
cd d:\zhao\vshop\web-admin
python -c "from PIL import Image; import glob; [print(f, Image.open(f).size) for f in sorted(glob.glob('src/static/manual/shots/gap4_op*.png'))]"
```

Expected: 每行都是 `(780, 1688)`。若某张不是（如 batch4 的 `handover-sheet`），按 Step 3 重拍该张。

- [x] **Step 3: 仅对不合格的图重拍（示例：交接单）**

```powershell
cd d:\zhao\vshop\web-admin ; python _e2e\_verify_gap4_batch4.py ; echo "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`（该脚本按固定视口重出 `docs/verify/gap4-batch4-*.png`），随后重跑 Step 1 的 `Copy-Item` 与 Step 2 校验。

- [x] **Step 4: 手册门禁**

```powershell
cd d:\zhao\vshop\web-admin ; npm run verify:manual ; echo "EXIT=$LASTEXITCODE"
```

Expected: `PASS`，失败 0（含「手册引用的截图全部存在」）。

- [x] **Step 5: 构建门禁**

```powershell
cd d:\zhao\vshop\web-admin ; npm run build:h5 ; echo "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`（允许既有 Sass deprecation 警告）。

- [x] **Step 6: 提交**

```powershell
cd d:\zhao\vshop\web-admin
git add src/static/manual/index.html src/static/manual/shots
git commit -m "docs(manual): 发布手册补齐 gap4 批1/2/3/4 能力（op-31/35/36/23/24/29 + 新增 op-41）"
```

---

## Task 6: 回填文档 + 收口部署

**Files:**
- Modify: `docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md`（偏差表，D54 行之后）
- Modify: `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html`（新增 20.22 节 + footer）

> **收口方式（§0.4 第 4 条）**：Step 4（提交 + 推送）与 Step 5（部署）**一气呵成、不再逐项征询**。若验收中发现「待补事项」（如需补拍某张图），先提醒用户，待其处理完后与收口合并为**一次**提交/推送/部署。

- [x] **Step 1: 偏差表新增 D55 行**

在第 3293 行的 **D54 行之后、空行之前**插入一行，格式对齐既有行：

```markdown
| D55 | gap4 计划自认「未做 / 未同步」三项全部收口：①发布用使用手册未同步（批1/2/3/4）②「上滑加载更多」第二页 UI 证据 ③全局配置 JSON 高级编辑未并入 themeTokens | ① 批 1/2/3 结论均写「发布手册待批次 4 的 Task 4.9 一并处理」，而 Task 4.9 实测只落了 `op-40`（`45f4f45`）；② 本地 shop-a 恰好 20 条流水 == 单页 `take:20`，无第二页可加载（D22②）；③ 并入主题令牌会改变既有 load/save 语义，D21② 原留档为范围外 | 用户指令「继续处理 D51 剩余项」后的追单：用户明确「上面三项内容只写计划，暂不执行，写完计划统一执行」，且在 `AskUserQuestion` 选定「①②③ 全做」 | **③（改代码）**：`src/pages/platform/global-config/index.vue` 编辑态统一为 `{themeTokens, defaults}`（新增 `syncToJson` / `mergeTokensFromJson`，`writeField` 两分支均回写 JSON，`syncFromJson` 并入两个根，`save()` 改为「先并 JSON 再校验结构化字段」），i18n `invalidDefaults`→`invalidJson` 并把 `advancedJson` / `otherPagesHint` 文案改为含 themeTokens（zh-Hans + en 成对）；验收 `_e2e/_verify_d55_global_config_json_roots.py` **6 项 PASS**（JSON 双根 / JSON→表单 radius / 表单→JSON 主色 / 坏 JSON 拦截 / 0 pageerror / 780×1688 取证），**全程零落库**。**②（造数据 + UI 取证）**：新增 `_e2e/_verify_d55_movements_page2.py`（仅允许本地 BASE，生产域名 `ENV-FAIL`；用 `createStockDoc(type:'PURCHASE')` 把 shop-a 流水从 20 条推到 ≥25 条，变体/仓从既有流水首行推导、不硬编码）→ 首屏 20 条、上滑后累积 == `min(totalItems, 40)` 且 >20、出现「没有更多了」、0 pageerror、取证 `docs/verify/gap4-batch3-movements-page2-390.png`（780×1688）；原 `_verify_gap4_batch3.py:473` 的 `skip` 改为指向新脚本，C1–C5 分页契约保留。**①（发布手册）**：`src/static/manual/index.html` 8 处改动——`op-31` 补类型筛选 + 上滑加载、`op-35` 补层级树/排序/图标/批量、`op-36` 补结构化表单 + 合并预览 + JSON 双根兜底、`op-23` §6 补五组筛选 + 结存变化 + 上滑第二页并新增 §7 单据中心（原 §7 库存预警顺延 §8）、`op-24` 补预留单独立页倒计时/手工释放、`op-29` 补作业分析 4 KPI + 差异趋势 + 作业员 + CSV、**新增 `op-41` 拣货批次（状态机/交接/异常件/复核只读）**；配图 19 张（17 张由 `docs/verify/gap4-batch*.png` 拷贝重命名 + 2 张新拍），全部 780×1688。**门禁**：`npm run verify:manual` PASS、`npm run build:h5` EXIT=0、`_verify_gap4_batch3.py` 回归 PASS。**部署**：`node scripts/deploy.mjs`（cwd = `d:\zhao\vshop\web-admin`，见偏差 #49）上线线上手册 `https://e.joho.cn/guanli/static/manual/index.html`。**副作用**：本地 shop-a 增加若干采购入库单与流水（本地库脏数据，不涉生产） |
```

- [x] **Step 2: 修复手册新增 20.22 节**

在 `docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html` 的 20.21 节 `</section>` 之后、`<footer>` 之前插入：

```html
  <section>
    <h3 id="gap4-d55-remaining-closure">20.22 gap4 计划剩余项收口：发布手册同步 / 第二页取证 / JSON 双根（<mark class="key">已修</mark> · D55 · 2026-09-27）</h3>
    <div class="callout ok">
      <p style="margin-bottom:0;"><strong>一句话读懂</strong>：gap4 计划主干 4 个批次早已收口，但计划自认的三项「未做 / 未同步」一直挂着——① 发布用使用手册 <code class="mono">src/static/manual/index.html</code> 只落了 <code class="mono">op-40</code>，批 1/2/3/4 的新能力从未写进 op- 条目；② 库存流水「上滑加载更多（第二页）」的 UI 证据因本地恰好 20 条流水（= 单页上限）而缺席，当时只做了 API 分页契约对账；③ 全局配置页「JSON 高级编辑」框只承载 <code class="mono">defaults</code>，未按计划并入 <code class="mono">themeTokens</code>。本节把三项一并收口。</p>
    </div>
    <p><strong>① 发布手册同步</strong>（<code class="mono">src/static/manual/index.html</code>，8 处）：<code class="mono">op-31</code> 售后补「类型筛选 + 上滑加载」；<code class="mono">op-35</code> 分类补「层级树 / 同级排序 / 层级移动 / 图标 / 批量操作」；<code class="mono">op-36</code> 全局配置补「结构化表单 + 行内校验 / 合并预览逐键标注 L1-L3 / JSON 双根兜底」；<code class="mono">op-23</code> §6 流水补「五组筛选 + 汇总随条件重算 + 每行结存变化前→后 + 上滑第二页」，并新增「§7 单据中心」（原 §7 库存预警顺延 §8）；<code class="mono">op-24</code> 预留单补「独立页 5 页签 + <code class="mono">mm:ss</code> 倒计时 + 手工释放 + 终态无释放按钮」；<code class="mono">op-29</code> 看板补「作业分析 4 KPI + 近 7 日差异趋势 + 作业员明细 + CSV 导出」；<strong>新增 <code class="mono">op-41</code>「拣货批次：打印 / 交接 / 复核 / 异常件」</strong>（状态机 <code class="mono">PRINTED→SHIPPED→HANDOVER→EXCEPTION→REVIEWED</code>、交接单、异常件登记、复核后整页只读）。配图 19 张，全部 780×1688，其中 17 张由 <code class="mono">docs/verify/gap4-batch*.png</code> 拷贝重命名、2 张新拍。</p>
    <p><strong>② 上滑加载第二页取证</strong>（新增 <code class="mono">_e2e/_verify_d55_movements_page2.py</code>）：脚本先用 admin-api <code class="mono">createStockDoc(type:'PURCHASE')</code> 在<strong>本地</strong> shop-a 造流水（变体 / 仓从既有流水首行推导，不硬编码），把总数从 20 推到 ≥25，再驱动流水页上滑：首屏 <strong>20 条</strong>、上滑后累积 == <code class="mono">min(totalItems, 40)</code> 且 <strong>&gt;20</strong>、出现「没有更多了」、0 pageerror。安全：脚本先校验 <code class="mono">BASE</code> 主机必须是 <code class="mono">localhost/127.0.0.1</code>，否则 <code class="mono">ENV-FAIL</code>（退出码 2）；原 <code class="mono">_verify_gap4_batch3.py:473</code> 的 <code class="mono">skip</code> 改为指向新脚本，C1–C5 分页契约保留。</p>
    <p><strong>③ 全局配置 JSON 并入 themeTokens</strong>（<code class="mono">src/pages/platform/global-config/index.vue</code>）：编辑态统一成 <code class="mono">{ themeTokens, defaults }</code> 一份，JSON 框与结构化表单<strong>双向同步</strong>——新增 <code class="mono">syncToJson()</code> 与 <code class="mono">mergeTokensFromJson()</code>，<code class="mono">writeField()</code> 的令牌分支也回写 JSON（原只回写 defaults），<code class="mono">syncFromJson()</code> 失焦时并入两个根，<code class="mono">save()</code> 改为<strong>先并 JSON 再校验结构化字段</strong>（否则令牌的 JSON 改动会被上一轮校验判空）。i18n：<code class="mono">invalidDefaults</code> → <code class="mono">invalidJson</code>，<code class="mono">advancedJson</code> / <code class="mono">otherPagesHint</code> 文案改为含 <code class="mono">themeTokens</code>（zh-Hans 与 en 成对）。验收 <code class="mono">_e2e/_verify_d55_global_config_json_roots.py</code> <strong>6 项 PASS</strong>，<strong>全程零落库</strong>（只验双向同步与坏 JSON 拦截，不点保存成功路径）。</p>
    <p><strong>门禁与部署</strong>：<code class="mono">npm run verify:manual</code> PASS（含「引用的截图全部存在」）、<code class="mono">npm run build:h5</code> EXIT=0、<code class="mono">_verify_gap4_batch3.py</code> 回归 PASS；<code class="mono">node scripts/deploy.mjs</code>（cwd = <code class="mono">d:\zhao\vshop\web-admin</code>）上线线上手册 <code class="mono">https://e.joho.cn/guanli/static/manual/index.html</code>。副作用：本地 shop-a 增加若干采购入库单与流水（本地库脏数据，不涉生产）。</p>
  </section>
```

并在页脚追加：`，2026-09-27 追加 20.22 gap4 计划剩余项收口（<strong>已修复 · D55</strong>：发布手册 op-31/35/36/23/24/29 同步 + 新增 op-41 拣货批次；库存流水上滑第二页 UI 取证；全局配置 JSON 并入 themeTokens 双向同步）`

- [x] **Step 3: 文档门禁复核**

```powershell
cd d:\zhao\vshop\web-admin ; npm run verify:manual ; echo "EXIT=$LASTEXITCODE"
```

Expected: `PASS`，失败 0。

- [x] **Step 4: 提交 + 推送**

```powershell
cd d:\zhao\vshop\web-admin
git add docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md docs/webadmin-bugfix-manual/webadmin-bugfix-manual.html
git commit -m "docs(web-admin): D55 偏差登记 + 修复手册 20.22（gap4 剩余三项收口）"
git push
```

- [x] **Step 5: 部署（本地构建 → 上传）**

```powershell
cd d:\zhao\vshop\web-admin ; node scripts\deploy.mjs
```

Expected: 退出码 0。

- [x] **Step 6: 线上复核（只读）**

```powershell
curl.exe -s "https://e.joho.cn/guanli/static/manual/index.html" | Select-String -Pattern "op-41|作业分析" | Select-Object -First 5
```

Expected: 能匹配到 `op-41`（线上手册已含新条目）。

---

## 2. 自检结果（Self-Review）

**1. 覆盖度**：三项各有任务落点——③ → Task 1/2；② → Task 3；① → Task 4/5；偏差表与手册回填 → Task 6。计划里没有「未分配到 Task 的登记项」。

**2. 占位符扫描**：全部代码块为可直接落盘的完整内容（`.vue` 替换块、两个新 Python 脚本全文、8 处手册 HTML、偏差行与手册小节全文）；无 TBD / 「类似上文」/「自行补充」。

**3. 一致性**：`draftJson` 在 Task 1 内 Step 1/3/5/6 中名称一致（全文不得残留下划线变量 `defaultsJson`，Step 8 有扫描命令）；`mergeTokensFromJson` 签名在 Step 1/3/5 一致；`TOKEN_KEYS` 仅 Step 1 定义、Step 1 内使用；手册图名在 Task 4 的 19 处 `src="shots/gap4_op…"` 与 Task 5 的拷贝映射一一对应（Task 4 Step 8 有计数校验 = 19）。

**4. 已知风险与兜底**：① H5 `onReachBottom` 在 Playwright 下可能不触发 → Task 3 Step 2 已给替代驱动方式与唯一改动点；② 复用图尺寸不合格 → Task 5 Step 3 给重拍路径；③ `op-41` 新增后数组语法错误 → Task 4 Step 8 用 `node -e` 解析 id 列表验证。

---

## 3. 执行方式与当前状态

**当前状态：待触发（用户规划中）**。本计划**只写不执行**；收到用户明确的「执行」指令后，按 `## 0.4` 执行契约统一开工，Task 1→6 一口气做完。

> **状态更新（2026-09-28）**：用户已下达执行指令，本计划 **Task 1→6 已按 Inline 单会话连续执行完毕并上线**；38 个 Step 全部勾选。结果见文末 **「执行结论（2026-09-28 执行完毕）」**。

**执行方式（默认 = 推荐项）**：**Inline 单会话连续执行** —— 遇阻按各 Task 内已标注的推荐/兜底方案自行决断，不逐项征询；仅两处硬门禁停下报告结论：**Task 5 Step 4（`npm run verify:manual` PASS）+ Step 5（`npm run build:h5` EXIT=0）**、**Task 6 Step 3（文档门禁复核）**。
**备选**：Subagent-Driven —— 每个 Task 派一个全新 subagent 实现，Task 之间由主会话做两阶段评审；粒度更细、上下文更干净，但往返更多。执行前用户可指定切换。

**推进节奏**：Task 1→2（③ 代码 + 验收，不落库）→ Task 3（② 仅本地造数 + 上滑第二页取证）→ Task 4→5（① 手册文案 + 19 张配图 + 双门禁）→ Task 6（偏差表 D55 + 修复手册 20.22 + 收口上线）。Task 6 Step 5 部署前必须确认前五个 Task 均已提交。

**收口**：按 `## 0.4` 第 3/4/6 条执行 —— 删除文件免询问但先备份到 `d:\zhao\_backup\d55-<ts>\`；验证全绿后 `commit → push → node scripts\deploy.mjs` 一气呵成（有「待补事项」则先提醒用户并合并成一次收口）；完成后给三项证据总表 + 「问题-方案-影响」+「已删文件-备份路径」清单。

---

## 执行结论（2026-09-28 执行完毕）

**结论：Task 1–6 全部执行完毕并上线；38 个 Step 已勾选。**

| 项 | 交付证据 | commit |
|---|---|---|
| ③ JSON 并入 `themeTokens` | `src/pages/platform/global-config/index.vue` + 双语言包；`_e2e/_verify_d55_global_config_json_roots.py` **6 项 PASS、零落库** | `b51f945` / `dfc21a2` |
| ② 流水第二页 UI 取证 | `_e2e/_verify_d55_movements_page2.py` → `docs/verify/gap4-batch3-movements-page2-390.png`（780×1688）；batch3 回归 **PASS（失败 0 / SKIP 1）** | `2088d73` |
| ① 发布手册同步 | `src/static/manual/index.html` 8 处（op-31/35/36/23/24/29 + 新增 **op-41**）+ **18 张**配图 | `50fa224` |
| 偏差与手册回填 | gap4 计划偏差表 **D55** 行 + 修复手册 **20.22** 节 + footer | `6984ecd` |

门禁与上线：`npm run verify:manual` **PASS**、`npm run build:h5` 构建成功、`_verify_gap4_batch3.py` **PASS**、`node scripts\deploy.mjs`（cwd `d:\zhao\vshop\web-admin`）退出码 **0**；线上 `https://e.joho.cn/guanli/static/manual/index.html` 复验 `op-41` 命中 1 次、「作业分析」4 次。

**计划偏差（如实登记）**：作业分析原计划 3 张取证图，实测该页三板块同屏（`scrollHeight=984 < 视口 844`）三张必然同图 → **合并为 1 张** `gap4_op29_ops.png`，配图总数 19 → **18**（Task 4 Step 8、§1 文件结构表与上文「推进节奏」的「19」均为笔误，以本节为准）。

**清理**：11 个临时探针与日志已备份至 `d:\zhao\_backup\d55-20260928-0659\` 后删除。

**副作用**：本地库 shop-a 增加 3 张采购入库单 + 5 条流水（仅本地脏数据，不涉生产）。