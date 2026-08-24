# 租户默认角色补种子 + 模板一键导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让存量租户启动时自动补建默认三角色、角色页提供模板一键导入，并修复新建角色后详情页不可见。

**Architecture:** 沿用「按 channel 授权、租户级独立 Role」。后端新增幂等补种子方法（启动扫描 + 单租户 `importDefaultRoles` mutation），前端角色页加导入按钮与刷新修复。角色数据仍 `channelIds=[channelId]` 租户级，模板定义收敛在 `OFFICIAL_ROLE_TEMPLATES`。

**Tech Stack:** Vendure(TS/TypeORM/RoleService)、Schema-First GraphQL、uni-app(Vue3) H5 后台。

**依据 spec:** `docs/superpowers/specs/2026-08-24-tenant-default-roles-seed-and-import-design.md`

**已核实的关键事实:**
- `RequestContext.empty()` 在 `.ts/model` 已有多处成功先例（`migrations/migrate-*-encryption.ts`、`tenant/domain-resolver.service.ts`），补种子可用系统空 ctx。
- 后端部署 = cjk-plugin 本地 `tsc` 编译 → `lib/` 进 git → 服务器 `git pull` + `pm2 restart vendure`（铁律：绝不在服务器构建；已确认 `git ls-files packages/cjk-plugin/lib` 被跟踪）。
- 前端部署 = `web-admin` 本地 `npm run build:h5` → `node scripts/deploy.mjs`。
- `createTenantRole(ctx, channelId, {code,description,permissions})` 已把 `channelIds:[channelId]` 并做权限白名单校验，可复用。

---

### Task B1: 后端 — `TenantMemberService` 补种子方法

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-member.service.ts`（在 `createTenantRole` 方法之后追加）

后端角色创建已由 `createTenantRole` 统一，此处补三个方法。

- [ ] **Step 1: 在 service 中新增包内查询（幂等判定用）与补种子方法**

在 `TenantMemberService` 类 `createTenantRole` 方法（约 L266-L274）后追加：

```ts
    /** 判断指定 channel 是否已存在该 code 的关联角色（幂等判定）。 */
    private async roleExistsInChannel(ctx: RequestContext, channelId: string, code: string): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, Role);
        const rows = await repo
            .createQueryBuilder('role')
            .leftJoinAndSelect('role.channels', 'ch')
            .where('role.code = :code', { code })
            .getMany();
        return (rows as any[]).some((r) => (r.channels || []).some((c) => String(c.id) === channelId));
    }

    /** 单租户一键导入默认三角色（幂等）。已初始化（t{tenantNo}-tenant-admin 已存在）则返回空数组，不重复建。 */
    async importDefaultRoles(ctx: RequestContext, channelId: ID): Promise<any[]> {
        const channel = await this.connection
            .getRepository(ctx, Channel)
            .findOne({ where: { id: String(channelId) } } as any);
        if (!channel) throw new Error('CHANNEL_NOT_FOUND');
        const tenantNo = Number((channel as any).customFields?.tenantNo);
        if (!Number.isFinite(tenantNo)) throw new Error('TENANT_NO_MISSING');
        const chId = String(channelId);
        const adminCode = `t${tenantNo}-tenant-admin`;
        if (await this.roleExistsInChannel(ctx, chId, adminCode)) return [];
        const created: any[] = [];
        for (const tpl of OFFICIAL_ROLE_TEMPLATES) {
            created.push(
                await this.createTenantRole(ctx, channelId, {
                    code: `t${tenantNo}-${tpl.busiPrefix}`,
                    description: tpl.description,
                    permissions: tpl.permissions,
                }),
            );
        }
        return created;
    }

    /** 启动补种子：扫描所有 Channel，缺默认角色则幂等补建；异常仅打日志不阻塞启动。 */
    async ensureDefaultRolesForAllChannels(ctx: RequestContext): Promise<void> {
        const channelRepo = this.connection.getRepository(ctx, Channel);
        const channels = await channelRepo.find();
        let added = 0;
        for (const c of channels as any[]) {
            const tenantNo = Number(c?.customFields?.tenantNo);
            if (!Number.isFinite(tenantNo)) continue;
            try {
                added += (await this.importDefaultRoles(ctx, String(c.id))).length;
            } catch (e: any) {
                Logger.warn(`租户 ${String(c.id)} 默认角色补种失败: ${e.message}`, loggerCtx);
            }
        }
        Logger.info(`默认角色补种完成，共补建 ${added} 个角色`, loggerCtx);
    }
```

- [ ] **Step 2: 本地编译验证**

Run（cwd=`d:\zhao\vendure`）:
```powershell
node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json
```
Expected: 无 TS 编译错误。

- [ ] **Step 3: 验证编译产物包含新方法**

Run:
```powershell
Select-String -Path d:\zhao\vendure\packages\cjk-plugin\lib\src\tenant\tenant-member.service.js -Pattern "ensureDefaultRolesForAllChannels","importDefaultRoles","roleExistsInChannel"
```
Expected: 输出三处方法名对应的匹配行（`roleExistsInChannel` 可能被内联命名，至少前两个必须命中）。

- [ ] **Step 4: 提交**

```powershell
git add packages/cjk-plugin/src/tenant/tenant-member.service.ts packages/cjk-plugin/lib
git commit -m "feat(cjk-plugin): 增加默认角色幂等补种子/一键导入 service"
```

---

### Task B2: 后端 — Resolver 暴露 `importDefaultRoles` + 启动补种子注册

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-admin.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: 超管 resolver 新增 mutation**

在 `tenant-admin.resolver.ts` 任意 mutation 后追加：

```ts
    @Mutation()
    @Allow(Permission.SuperAdmin)
    async importDefaultRoles(
        @Ctx() ctx: RequestContext,
        @Args('channelId') channelId: string,
    ): Promise<any[]> {
        return this.tenantMemberService.importDefaultRoles(ctx, channelId);
    }
```

- [ ] **Step 2: plugin.ts 注册服务 + SDL 声明 + 启动补种子**

`plugin.ts`:
1) 顶部 import 增加 `RequestContext`与 `TenantMemberService`：
```ts
import { I18nService, Injector, Logger, PluginCommonModule, RequestContext, VendurePlugin } from '@vendure/core';
import { TenantMemberService } from './tenant/tenant-member.service';
```
（若已存在则只补 `RequestContext`。）
2) `AdminApiExtensions.schema` 的 `extend type Mutation` 块（约 L764）内追加一行：
```graphql
importDefaultRoles(channelId: ID!): [Role!]!
```
3) `onApplicationBootstrap()` 末尾（`tenant` 模块启用分支之后，约 L1203）追加：
```ts
        // 存量租户默认角色补种子（幂等，仅补缺失；失败不阻塞启动）
        if (this.options.tenant?.enabled) {
            try {
                await injector.get(TenantMemberService).ensureDefaultRolesForAllChannels(RequestContext.empty());
            } catch (e: any) {
                Logger.warn(`默认角色补种子失败（可后台手动触发 importDefaultRoles）: ${e.message}`, loggerCtx);
            }
        }
```
4) 确认 `TenantAdminResolver` 已在 `providers`/`AdminApiExtensions.resolvers` 中注册（既有，无需改）。

- [ ] **Step 3: 本地编译验证**

Run（cwd=`d:\zhao\vendure`）:
```powershell
node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json
```
Expected: 无 TS 编译错误。

- [ ] **Step 4: 验证编译产物**

Run:
```powershell
Select-String -Path d:\zhao\vendure\packages\cjk-plugin\lib\src\tenant\tenant-admin.resolver.js -Pattern "importDefaultRoles"
Select-String -Path d:\zhao\vendure\packages\cjk-plugin\lib\src\plugin.js -Pattern "ensureDefaultRolesForAllChannels"
```
Expected: 两处均命中。

- [ ] **Step 5: 提交**

```powershell
git add packages/cjk-plugin/src/plugin.ts packages/cjk-plugin/src/tenant/tenant-admin.resolver.ts packages/cjk-plugin/lib
git commit -m "feat(cjk-plugin): 暴露 importDefaultRoles mutation，启动时幂等补建存量租户默认角色"
```

---

### Task B3: 后端 — 部署 + 线上验证

**Files:** 无（部署操作）

- [ ] **Step 1: 确认本地 dist/lib 已含改动后推送到 git**

Run（cwd=`d:\zhao\vendure`）:
```powershell
git status; git log --oneline -3
```
Expected: 本地无未提交改动（或有本任务新建的未提交改动先提交）；最近 3 条含本任务 commit。

- [ ] **Step 2: 服务器拉取并重启**

Run:
```powershell
ssh qing "cd /www/apps/vendure && git pull && pm2 restart vendure"
```
Expected: pull 成功拉到最新 commit，`pm2 restart vendure` 返回 `online`。

- [ ] **Step 3: 线上 schema 校验 `importDefaultRoles`**

Run（cwd=`d:\zhao`，用 `curl.exe`；若文件已存在则覆写 `_gql_mut.json`）:
```powershell
Set-Content -Path d:\zhao\_gql_mut.json -Value '{"query":"{ __type(name: \"Mutation\") { fields { name } } }"}' -Encoding utf8
curl.exe -s -X POST https://e.joho.cn/admin-api -H "Content-Type: application/json" --data "@d:\zhao\_gql_mut.json"
```
Expected: 响应 JSON 中含 `"importDefaultRoles"`。

- [ ] **Step 4: 验证 channel 7 已补默认三角色（幂等）**

Run（用线上 admin-api 对 channelId=7 调 `tenantRoles`+`importDefaultRoles`；需超管 token，若手头无 token 则改由用户后台核对）:
```powershell
# importDefaultRoles(channelId:7) 应返回空数组（已初始化）或返回新角色；重复调用应恒为空数组
# tenantRoles(channelId:7) 应含 code = t7-tenant-admin / t7-sales / t7-stock
```
Expected: channel 7 的角色列表出现 `t7-tenant-admin`、`t7-sales`、`t7-stock` 三个默认角色。

- [ ] **Step 5: 清理临时 payload**

Run:
```powershell
Remove-Item d:\zhao\_gql_mut.json -ErrorAction SilentlyContinue
```

---

### Task F1: 前端 — API 层新增 `importTenantDefaultRoles`

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\tenant-admin.ts`

- [ ] **Step 1: 新增导入 API（在 `applyTenantRole` 相关 `Role` 函数定义区附近，约 `deleteTenantRole` 之后）**

追加：

```ts
export async function importTenantDefaultRoles(channelId: string): Promise<RoleItem[]> {
  const res = await getAdminClient().request<{ importDefaultRoles: RoleItem[] }>(
    `mutation ImportDefaultRoles($channelId: ID!) { importDefaultRoles(channelId: $channelId) { id code description permissions } }`,
    { channelId },
  );
  return res.importDefaultRoles ?? [];
}
```

- [ ] **Step 2: 提交**

```powershell
git add web-admin/src/apis/tenant-admin.ts
git commit -m "feat(web-admin): tenant-admin API 新增默认角色一键导入"
```
（cwd=`d:\zhao\vshop`）

---

### Task F2: 前端 — 角色页模板导入入口 + 空态 + 刷新修复

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\roles\index.vue`

- [ ] **Step 1: onLoad 改 onLoad+onShow，保证返回时重拉**

将 `onLoad` 改为：

```ts
import { onLoad, onShow } from '@dcloudio/uni-app';

onLoad((q: any) => { channelId.value = q?.id || ''; loadCatalog(); });
onShow(() => { load(); }); // uni-app 先 onLoad 后 onShow，此处 channelId 已就绪；每次进入/返回都重拉
```
说明：`load()` 移到 `onShow`，每次进入/从详情页返回都重拉角色列表（修复新建后回到详情页/选择器不刷新的问题）。`loadCatalog()` 保持 `onLoad` 仅一次即可。

- [ ] **Step 2: 模板导入入口与逻辑**

新增状态与按钮：
1) 模板顶部模板——在标题栏右侧放「＋新建角色」(`.fab`) 的同时，增加一个「导入默认角色」入口。在 `openCreate` 的 `.fab` 之前加一个固定的「导入」按钮控件（or 复用 `.fab` 旁按钮）：
```html
<view class="import-btn" @tap="openImport">导入默认角色</view>
```
2) 脚本新增：
```ts
const importing = ref(false);
async function openImport() {
  try {
    importing.value = true;
    await importTenantDefaultRoles(channelId.value);
    uni.showToast({ title: '已导入默认角色', icon: 'none' });
    load();
  } catch (err: any) {
    uni.showToast({ title: err?.message || '导入失败', icon: 'none' });
  } finally {
    importing.value = false;
  }
}
```
3) 在 import 列表方法处引入 `importTenantDefaultRoles`（更新 `import { ... } from '../../../apis/tenant-admin'`）。
4) 为空态时展示提示 + 一键导入：
```html
<view v-if="!roles.length" class="empty">暂无角色
  <view class="import-btn" @tap="openImport">一键导入默认角色</view>
</view>
```
5) 追加样式：
```scss
.import-btn { display:inline-block; margin-top:20rpx; padding:12rpx 30rpx; background:$pm-info; color:#fff; border-radius:999rpx; font-size:26rpx; }
```
6) 资源控制：新增「导入默认角色」按钮仅在 `channelId` 有值时显示（超管从租户详情进入）；全局「角色管理」菜单入口（无 channelId）不显示，保持 `myTenantRoles/myCreateTenantRole` 逻辑不变。

- [ ] **Step 3: 提交**

```powershell
git add web-admin/src/pages/platform/roles/index.vue
git commit -m "fix(web-admin): 角色页 onShow 刷新 + 默认角色一键导入 + 空态入口"
```
（cwd=`d:\zhao\vshop`）

---

### Task F3: 前端 — 本地构建 + 部署验证

**Files:** 无（部署操作）

- [ ] **Step 1: 本地构建**

Run（cwd=`d:\zhao\vshop\web-admin`）:
```powershell
npm run build:h5
```
Expected: `DONE Build complete`，产物在 `dist/build/h5`。

- [ ] **Step 2: 部署**

Run:
```powershell
node scripts/deploy.mjs
```
（cwd=`d:\zhao\vshop\web-admin`）Expected: `deploy done`，nginx reload 通过。

- [ ] **Step 3: 线上验证**

Run:
```powershell
curl.exe -s -o NUL -w "index.html HTTP %{http_code}\n" https://e.joho.cn/guanli/index.html
```
Expected: `index.html HTTP 200`。

- [ ] **Step 4: 全链路人工验证（需在浏览器后台操作）**

1. 进入 `https://e.joho.cn/guanli/#/pages/platform/tenants/detail?id=7` 角色 Tab：
   - 应显示 `t7-tenant-admin`、`t7-sales`、`t7-stock` 三个默认角色（不再空白）。
2. 添加管理员 → 角色弹窗：应能勾选上述默认角色。
3. 新建一个自定义角色（详情页 → 新建角色）→ 保存后返回详情页：角色 Tab 与添加管理员选择器均可见新角色（验证修复）。
4. 重复点「导入默认角色」：不产生重复角色（幂等）。

---

## Self-Review

**Spec coverage:** ①启动自动补种子→Task B1+B2+B3；②一键导入→Task B1(service)+B2(mutation)+F1+F2；③新建可见修复→Task F2 onShow；④所有租户覆盖→`ensureDefaultRolesForAllChannels` 遍历全部 channel；⑤权限隔离→复用 `createTenantRole`(`channelIds=[channelId]`)；⑥非阻塞→try/catch Logger。

**Type consistency:** service 方法名 `importDefaultRoles`/`ensureDefaultRolesForAllChannels`/`roleExistsInChannel` 在 B1/B2/B3 一致；前端 `importTenantDefaultRoles` 在 F1 定义、F2 调用一致；mutation 名 `importDefaultRoles` 在 SDL(B2)/api(F1)/resolver(B2) 一致。