# 成员信息弹窗（点击用户名称查看用户信息）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在租户成员管理页点击成员姓名，弹出含登录用户名（邮箱）等完整信息的居中弹窗。

**Architecture:** 后端 `memberToView` 视图对象增加 `emailAddress`（取自 `Administrator.emailAddress`，登录用户名即邮箱），并同步 `plugin.ts` 中 `TenantMember` 的 GraphQL SDL（上次教训：不改 SDL 服务启动会崩）。前端列表查询追加该字段，点击姓名直接用列表已有数据弹信息卡，零额外请求。

**Tech Stack:** Vendure（NestJS + TypeORM）、cjk-plugin、uni-app Vue3（vshop web-admin）、SCSS。

**设计文档：** `docs/superpowers/specs/2026-09-14-member-info-popup-design.md`

---

### Task 1: 后端视图补 emailAddress + SDL 同步（vendure cjk-plugin）

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts:711-735`（`memberToView`）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts:676-688`（`TenantMember` SDL 块）

背景：`TenantMember` 实体不存邮箱，登录用户名即 `Administrator.emailAddress`。`AdministratorService.findOne(ctx, administratorId)` 可用（返回含 `emailAddress` 列）。

- [ ] **Step 1: 修改 `memberToView` 增加 emailAddress**

将 `memberToView` 方法（当前 711–735 行）整体替换为：

```ts
    /** 将 TenantMember 组装为含 roleIds / canResetPassword / emailAddress 的视图对象 */
    async memberToView(ctx: RequestContext, member: TenantMember): Promise<any> {
        const roleIds = await this.memberRoleIdsInChannel(ctx, member);
        const view: any = { ...member, roleIds };
        const activeUserId = ctx.activeUserId;
        let emailAddress: string | null = null;
        let myAdmin: Administrator | null = null;
        if (activeUserId != null) {
            myAdmin = await this.administratorService
                .findOneByUserId(ctx, activeUserId)
                .catch(() => null);
            if (myAdmin && String(myAdmin.id) === String(member.administratorId)) {
                emailAddress = myAdmin.emailAddress;
            }
        }
        if (emailAddress == null) {
            const admin = await this.administratorService
                .findOne(ctx, String(member.administratorId))
                .catch(() => null);
            emailAddress = admin?.emailAddress ?? null;
        }
        view.emailAddress = emailAddress;
        if (activeUserId != null) {
            if (myAdmin && String(myAdmin.id) === String(member.administratorId)) {
                view.canResetPassword = false; // 不允许重置自己的密码
                return view;
            }
        }
        if ((ctx as any).session?.user?.superAdmin === true || ctx.userHasPermissions([Permission.SuperAdmin])) {
            view.canResetPassword = true;
        } else {
            const roleRepo = this.connection.getRepository(ctx, Role);
            const roles = roleIds.length
                ? await roleRepo.findByIds(roleIds.map(String) as any)
                : [];
            const perms = (roles as any[]).flatMap((r) => (r.permissions || []) as string[]);
            view.canResetPassword = canGrantRole(this.channelOperatorPerms(ctx), perms);
        }
        return view;
    }
```

说明：`Administrator` 已在文件头 import（第 3 行），无需新增导入。逻辑仅新增 emailAddress 计算，`canResetPassword` 判定与提前返回行为保持不变。

- [ ] **Step 2: 同步 `plugin.ts` 的 `TenantMember` SDL**

在 `TenantMember` 类型块中，`phone: String` 与 `roleIds: [ID!]!` 之间插入一行：

```graphql
                    phone: String
                    emailAddress: String
                    roleIds: [ID!]!
```

即最终该类型块为：

```graphql
                type TenantMember {
                    administratorId: ID!
                    channelId: ID!
                    enabled: Boolean!
                    mustChangePassword: Boolean!
                    displayName: String
                    remark: String
                    phone: String
                    emailAddress: String
                    roleIds: [ID!]!
                    canResetPassword: Boolean!
                    createdAt: DateTime!
                    initialPassword: String
                }
```

- [ ] **Step 3: 构建 cjk-plugin 并确认产物**

Run（在 `d:\zhao\vendure` 下）:
```powershell
npm run build -w @vendure/cjk-plugin
```
Expected: 构建成功无报错。

Run:
```powershell
rg -n "emailAddress" packages\cjk-plugin\lib\src\plugin.js
```
Expected: 输出含 `emailAddress` 的 SDL 片段（lib 产物已同步）。

- [ ] **Step 4: 提交（src + lib 一起提交）**

```bash
git add packages/cjk-plugin/src/plugin.ts packages/cjk-plugin/src/tenant/tenant-member.service.ts packages/cjk-plugin/lib/src/plugin.js packages/cjk-plugin/lib/src/plugin.js.map packages/cjk-plugin/lib/src/plugin.d.ts packages/cjk-plugin/lib/src/tenant/tenant-member.service.js packages/cjk-plugin/lib/src/tenant/tenant-member.service.js.map packages/cjk-plugin/lib/src/tenant/tenant-member.service.d.ts
git commit -m "feat(tenant): 成员视图补登录用户名 emailAddress + SDL 同步"
```

注意：**只暂存上述文件**，仓库根目录有大量未跟踪诊断脚本，绝不可 `git add .`。

---

### Task 2: 前端 API 层追加 emailAddress（vshop web-admin）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts:16-27`（`TenantMemberItem` 接口）
- Modify: `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts:294-300`（`fetchMyTenantMembers` 查询）

- [ ] **Step 1: `TenantMemberItem` 接口增加字段**

在 `phone?: string | null;` 之后插入：

```ts
  emailAddress?: string | null;
```

即：

```ts
export interface TenantMemberItem {
  id: string;
  administratorId: string;
  channelId: string;
  enabled: boolean;
  displayName?: string | null;
  remark?: string | null;
  phone?: string | null;
  emailAddress?: string | null;
  roleIds?: string[];
  canResetPassword?: boolean;
  createdAt: string;
}
```

- [ ] **Step 2: `fetchMyTenantMembers` 查询追加字段**

将（当前 296 行）：

```ts
    `query TenantMembers { tenantMembers { id administratorId channelId enabled displayName remark phone roleIds createdAt canResetPassword } }`,
```

改为：

```ts
    `query TenantMembers { tenantMembers { id administratorId channelId enabled displayName remark phone emailAddress roleIds createdAt canResetPassword } }`,
```

- [ ] **Step 3: 提交**

```bash
git add web-admin/src/apis/tenant-admin.ts
git commit -m "feat(web-admin): 成员列表 API 追加 emailAddress 字段"
```

---

### Task 3: members 页点击姓名弹信息卡（vshop web-admin）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\members\index.vue`

背景：页面已有 `.mask`（居中遮罩）+ `.pop`（居中弹层）样式与 `roles` 角色列表；`infoVisible`/`infoTarget`/`infoRoleNames`/`fmtTime` 为本次新增。

- [ ] **Step 1: 姓名可点击**

将（第 13 行）：

```html
          <text class="name">{{ m.displayName || m.administratorId }}</text>
```

改为：

```html
          <text class="name" @tap="showInfo(m)">{{ m.displayName || m.administratorId }}</text>
```

- [ ] **Step 2: 新增信息弹窗模板**

在「分配角色」弹层（`</view>` 结束于第 82 行）之后、`<PasswordPopup ...>`（第 84 行）之前插入：

```html
  <!-- 用户信息弹窗 -->
  <view class="mask" v-if="infoVisible && infoTarget" @tap="infoVisible = false">
    <view class="pop" @tap.stop>
      <view class="pop-head">
        <text class="pop-title">用户信息</text>
        <text class="pop-close" @tap="infoVisible = false">×</text>
      </view>
      <view class="name-row">
        <text class="info-name">{{ infoTarget.displayName || infoTarget.administratorId }}</text>
        <text class="badge" :class="infoTarget.enabled ? 'on' : ''">{{ infoTarget.enabled ? '启用' : '停用' }}</text>
      </view>
      <view class="kv"><text class="k">登录用户名</text><text class="v">{{ infoTarget.emailAddress || '—' }}</text></view>
      <view class="kv"><text class="k">手机号</text><text class="v">{{ infoTarget.phone || '—' }}</text></view>
      <view class="kv"><text class="k">角色</text><text class="v">{{ infoRoleNames }}</text></view>
      <view class="kv"><text class="k">备注</text><text class="v">{{ infoTarget.remark || '—' }}</text></view>
      <view class="kv"><text class="k">人员 ID</text><text class="v">{{ infoTarget.administratorId }}</text></view>
      <view class="kv"><text class="k">加入时间</text><text class="v">{{ fmtTime(infoTarget.createdAt) }}</text></view>
    </view>
  </view>
```

- [ ] **Step 3: 新增状态与函数**

在 `const showRoles = ref(false);`（第 111 行）之后、`onShow(load);`（第 115 行）之前插入：

```ts
const infoVisible = ref(false);
const infoTarget = ref<TenantMemberItem | null>(null);

const infoRoleNames = computed(() => {
  const t = infoTarget.value;
  if (!t || !t.roleIds?.length) return '—';
  return t.roleIds
    .map((id) => roles.value.find((r) => r.id === id)?.description || id)
    .join('、');
});

function showInfo(m: TenantMemberItem) {
  infoTarget.value = m;
  infoVisible.value = true;
}

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
```

- [ ] **Step 4: 新增样式**

在 `<style lang="scss" scoped>` 内、`.pop-title` 规则（第 254 行）之后追加：

```scss
.pop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
.pop-head .pop-title { margin-bottom: 0; }
.pop-close { font-size: 36rpx; color: #999; line-height: 1; padding: 8rpx; }
.name-row { display: flex; align-items: center; gap: 16rpx; margin-bottom: 16rpx; }
.info-name { font-size: 32rpx; font-weight: 700; }
.badge { font-size: 22rpx; color: #999; background: #f2f2f2; border-radius: 999rpx; padding: 4rpx 16rpx; }
.badge.on { color: #07c160; background: #e8f8f0; }
.kv { display: flex; justify-content: space-between; gap: 24rpx; padding: 16rpx 0; border-bottom: 1px solid #f2f2f2; }
.kv .k { font-size: 24rpx; color: #999; flex: 0 0 auto; }
.kv .v { font-size: 26rpx; color: #333; text-align: right; word-break: break-all; }
```

- [ ] **Step 5: 提交**

```bash
git add web-admin/src/pages/platform/members/index.vue
git commit -m "feat(web-admin): 成员列表点击姓名弹出用户信息卡（含登录用户名）"
```

---

### Task 4: 两端构建 + 部署 + 手机回归 + 操作手册

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\static\manual\index.html`（op-16 章节补一句 + 截图引用）
- Create: `d:\zhao\vshop\web-admin\_e2e\_shot_t9.py`（复用 `_shot_t8.py` 的登录/截图方式）

- [ ] **Step 1: 构建 web-admin 并提交 dist**

Run（在 `d:\zhao\vshop\web-admin` 下）:
```powershell
npm run build:h5
```
Expected: 构建成功，`dist/build/h5` 产物更新。

```bash
git add web-admin/dist/build/h5 web-admin/index.html
git commit -m "build(web-admin): 成员信息弹窗 H5 构建产物"
```

- [ ] **Step 2: 部署 web-admin**

Run（在 `d:\zhao\vshop\web-admin` 下）:
```powershell
node scripts/deploy.mjs
```
Expected: `deploy done`。

Run:
```powershell
curl.exe -s -o NUL -w "%{http_code}" https://e.joho.cn/guanli/
```
Expected: `200`。

- [ ] **Step 3: 构建 + 推送 + 部署 vendure**

Run（在 `d:\zhao\vendure` 下，Task 1 若已构建可跳过）:
```powershell
npm run build -w @vendure/cjk-plugin
git push origin master
ssh -o ConnectTimeout=8 qing "cd /www/apps/vendure && git fetch origin && git reset --hard origin/master && pm2 restart vendure"
```
Expected: push 成功（`git status -sb` 显示 up to date），ssh 命令成功执行。

等待约 12 秒后验证：
```powershell
curl.exe -s -o NUL -w "%{http_code}" https://e.joho.cn/admin-api
```
Expected: `200`（若 502/504 说明 SDL 或部署有问题，检查 pm2 日志 `ssh qing "pm2 logs vendure --lines 40 --nostream"`）。

- [ ] **Step 4: 手机视口回归 + 截图**

参考 `d:\zhao\vshop\web-admin\_e2e\_shot_t8.py` 的 Playwright 登录流程（390×844 视口，dpr=2，登录 田经理 账号 guoxinnanshan@163.com / 密码 you123123），新建 `_e2e\_shot_t9.py`，步骤：

1. 打开 `https://e.joho.cn/guanli/#/pages/platform/members/index`（必要时先登录）。
2. 点击成员行「田经理」姓名 → 断言弹窗出现，且包含文本：`用户信息`、`登录用户名`、`guoxinnanshan@163.com`、`人员 ID`。
3. 截图保存为 `web-admin\src\static\manual\shots\r05_member_info.png`（命名沿用既有 `r0X` 规范）。
4. 用 Read 查看截图确认非白屏、布局正确。
5. 点击 × 关闭，断言弹窗消失。

- [ ] **Step 5: 操作手册补充**

`web-admin/src/static/manual/index.html` op-16「成员密码管理与角色授权」章节内补一小节：

```html
<h3>查看成员信息</h3>
<p>点击成员列表中的「显示姓名」，可查看该成员的完整信息，包括登录用户名（邮箱）、手机号、角色、状态、人员 ID 与加入时间。</p>
<img src="shots/r05_member_info.png" alt="成员信息弹窗">
```

（具体标签结构以手册既有 h3/p/img 写法为准。）

- [ ] **Step 6: 提交手册 + 回归脚本**

```bash
git add web-admin/src/static/manual/index.html web-admin/src/static/manual/shots/r05_member_info.png web-admin/_e2e/_shot_t9.py
git commit -m "docs: 成员信息弹窗操作手册与手机截图"
git push origin master
```

---

## Self-Review（已核查）

- **Spec 覆盖**：`memberToView` 补 emailAddress（T1）✓、SDL 同步（T1）✓、前端 API（T2）✓、弹窗模板/状态/样式（T3）✓、部署+回归+手册（T4）✓。所有 spec 条目均有对应任务。
- **占位符扫描**：所有代码步骤均含完整可粘贴代码，无 TBD/TODO。
- **类型一致性**：后端返回 `string | null` ↔ 前端 `emailAddress?: string | null` ↔ 模板 `infoTarget.emailAddress || '—'` 一致；`showInfo`（函数）/`infoVisible`（ref）/`infoTarget`/`infoRoleNames`/`fmtTime` 命名全程一致。
- **已知取舍**：`memberToView` 不新增单元测试（依赖 AdministratorService 与连接层，沿用现有集成验证模式，由 T4 回归覆盖）。
