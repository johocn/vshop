# 审查发现 — web-admin

## 概览
只读扫描 `d:\zhao\vshop\web-admin` 的 `src/**/*.{vue,ts,js,json}`、`src/apis/*`、`scripts/*.mjs`、`_e2e/*.py`、`src/locale/**`、`pages.json`、`vite.config.ts`，共覆盖约 200+ 源文件与 2 份语言包（合计 2485 个 i18n key）；逐条执行鉴权、越权/多租户、XSS、硬编码、写操作、上传、功能缺陷七个维度。i18n key 集合逐层比对结果：`en.json` 与 `zh-Hans.json` 各 2485 个 key，**无单语言缺失 key**（差异在硬编码文案，见 F-WA-09/11）；`console.log/debug` 无残留（仅 2 处 `console.warn` 用于异常日志）；`src` 内无 `v-html` 使用，故本后台自身无注入点，但富文本输入侧未净化（见 F-WA-05）。共 14 条发现。

## 发现清单

| 编号 | 位置(文件:行号) | 级别 | 维度 | 证据(代码摘录) | 建议修法 | 验证状态 |
|---|---|---|---|---|---|---|
| F-WA-01 | src/utils/h5Nav.ts:51 | 高 | 鉴权与会话 | `uni.reLaunch({ url: '/pages/login/index' });`（confirmExit 仅跳转）；`authStore.logout()` 全项目零调用 | 退出时调用 `auth.logout()`（内部 `clearSession()`）并清理 tenant/缓存 | 已修复（dc3c582：h5Nav 退出流程改为调用 `authStore.logout()` 清理会话） |
| F-WA-02 | src/pages.json:11 | 中 | 鉴权与会话 | `{ "path": "pages/dashboard/index", ... }`；全项目无 `beforeEach`/`addInterceptor` 守卫 | 增加 H5 路由守卫，未登录统一重定向登录页 | 已修复（新增 `src/utils/routeGuard.ts`：`addInterceptor` 拦截 navigateTo/redirectTo/switchTab/reLaunch + H5 深链补判，登录页放行防递归） |
| F-WA-03 | src/stores/authStore.ts:26 | 中 | 越权 | `isSuperAdmin: (s) => !!s.access?.isSuperAdmin \|\| s.username === 'superadmin',` | 超管判定只信服务端 `access.isSuperAdmin`，移除 username 兜底 | 已修复（移除 `username === 'superadmin'` 兜底，仅信服务端 `access.isSuperAdmin`） |
| F-WA-04 | src/composables/useBinMode.ts:10,35 | 中 | 越权/多租户 | `const modeRef = ref<BinMode>('off');` + `export function resetBinMode(): void {`（全项目无调用） | 切店流程调用 `resetBinMode()`，避免沿用上一租户档位 | 已修复（切店时调用 `resetBinMode()` 复位档位，避免租户串档） |
| F-WA-05 | src/components/RichTextEditor.vue:18 | 高 | XSS 与注入 | `<textarea v-else v-model="srcHtml" class="rte__src" @blur="onSrcBlur"></textarea>`（任意 HTML 直落商品 description，无净化） | 保存前做服务端 HTML 白名单净化，前端过滤 script/on* | 已修复（dc3c582：新增 `src/utils/sanitizeHtml.ts`，RichTextEditor 保存/失焦前净化） |
| F-WA-06 | scripts/calibrate-prices.mjs:27 | 中 | 硬编码与泄露 | `const PASS = process.env.ADMIN_PASS \|\| 'z123123';` | 移除密码兜底，缺失即报错退出 | 已修复（移除 `'z123123'` 兜底，缺失 `ADMIN_PASS` 即报错退出） |
| F-WA-07 | scripts/probe-closure.mjs:15 | 中 | 硬编码与泄露 | `mutation { login(username:"superadmin", password:"superadmin") ...`（另有 7 个脚本同款） | 统一改为环境变量读取凭据 | 已修复（脚本凭据统一改读 `ADMIN_USER`/`ADMIN_PASS` 环境变量） |
| F-WA-08 | src/pages/order/detail/index.vue:184 | 中 | 交易与写操作 | `if (Number.isNaN(v) \|\| v < 0) {...}`；`const delta = Math.round(v * 100) - order.value.totalWithTax;` | 改价上限/范围与权限须服务端校验，前端仅提示 | 待后端支持（改价上下限与权限校验须服务端实现，前端仅作提示） |
| F-WA-09 | src/pages/pickup/index.vue:4 | 中 | 功能缺陷(i18n) | `<text class="tab" ...>本店自提点</text>`（整个自提点模块中文硬编码，未走 `$t`） | 抽取文案到 locale 语言包 | 已修复（自提点模块文案抽取到 locale，en/zh-Hans 同步） |
| F-WA-10 | src/components/RichTextEditor.vue:32 | 低 | XSS 与注入 | `import '@wangeditor/editor/dist/css/style.css';`（Vite 下为全局 CSS，泄漏到全站） | 评估样式作用域或按需引入 | 不修（低危：wangEditor 全局 CSS 泄漏影响面小，按需引入收益低；留观） |
| F-WA-11 | src/components/MediaLibraryModal.vue:160 | 低 | 功能缺陷(i18n) | `{ key: 'product', title: '商品图', tags: ['主图', '白底图', ...] }` | 分类/标签改走 i18n | 已修复（媒体库分类/标签改走 i18n，en/zh-Hans 同步） |
| F-WA-12 | scripts/calibrate-prices.mjs:25 | 低 | 硬编码与泄露 | `const API = process.env.ADMIN_API \|\| 'https://e.joho.cn/admin-api';` | 生产域名改为必填环境变量 | 已修复（calibrate-prices/probe-del-sign/_probe-*/probe-closure/probe-methods/probe-live-schema/probe-mut-check 全部改为必填环境变量，删除线上域名兜底） |
| F-WA-13 | src/components/BottomBar.vue:19 | 低 | 功能缺陷 | `if (it.key !== props.current) uni.switchTab ? uni.navigateTo({...fail...}) : uni.navigateTo({...});`（三元两分支等价，switchTab 意图失效） | 修正导航分支逻辑 | 已修复（BottomBar 导航分支修正，tab 页走 switchTab、其余走 navigateTo） |
| F-WA-14 | src/components/RichTextEditor.vue:145 | 低 | 功能缺陷 | `function onSrcBlur() { props.modelValue; }`（空操作，HTML 源码编辑未回写 modelValue） | 失焦时 `emit('update:modelValue', srcHtml.value)` | 已修复（`onSrcBlur` 现净化后回写 `modelValue`，随 F-WA-05 一并实现） |
