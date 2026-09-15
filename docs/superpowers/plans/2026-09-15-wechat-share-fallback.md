# 微信分享标题/描述/主图兜底 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 vshop(e.joho.cn) 与 nshop(www.youshop.cn) 商品详情页微信分享的标题/描述/主图建立逐级兜底链（描述过滤 HTML、主图无图用默认图）。

**Architecture:** 共享 Vendure 后端新增 `Channel.shareImageUrl` customField（后台 web-admin 配置）；两端各引入纯函数 `stripHtmlToText`/`buildShareMeta` 组装分享 meta；图片兜底链 `featuredAsset → assets[0] → 店铺shareImageUrl → 内置默认图`，描述兜底链 `stripHtml(描述)[≤100字] → shopIntro → 内置语`。纯函数用 Node 原生 type-strip 跑 node:test。

**Tech Stack:** TypeScript、Vendure cjk-plugin、uni-app H5(vshop)、Nuxt SSR(nshop)、node:test、MediaPicker。

---

## 跨仓库说明

三个仓库独立 git：
- `d:\zhao\vendure`（后端 cjk-plugin）— 部署：服务器 `git pull + pm2 restart`，本机不构建部署由既有流程处理
- `d:\zhao\vshop`（含 web-admin 子目录，但在 web-admin 目录操作 git 提交），部署：`web-admin/scripts/deploy.mjs`
- `d:\zhao\nshop`（Nuxt）— 部署：`nshop` 本地 `npm run build` / `deploy` 脚本

每个任务的提交都在对应仓库执行。Node v22.16 支持原生 type-stripping 跑 `.ts` 测试。

---

## Task 1: 后端新增 Channel.shareImageUrl 字段 + SDL 下发

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-channel-custom-fields.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`
- Build: cjk-plugin

- [ ] **Step 1: 新增 ShareImageUrl customField**

在 `tenant-channel-custom-fields.ts` 的 `Channel` 数组末尾（`physicalStockEnabled` 之后）追加：

```ts
        {
            name: 'shareImageUrl',
            type: 'string',
            nullable: true,
            label: [{ languageCode: LanguageCode.zh_Hans, value: '默认分享图 URL' }],
            description: [
                { languageCode: LanguageCode.zh_Hans, value: '商品无主图时微信转发使用此图；留空则前端回退内置默认图' },
            ],
        },
```

- [ ] **Step 2: 在 resolveChannelByCode 下发字段**

在 `plugin.ts` 中 `ChannelResolveCustomFields` 类型定义（约 line 1195-1203）内追加：

```ts
                    shareImageUrl: String
```

（即 `shopLogo: String` 之后加一行 `shareImageUrl: String`。）

- [ ] **Step 3: 构建 cjk-plugin**

Run (cwd `d:\zhao\vendure\packages\cjk-plugin`):
```
npm run build
```
Expected: exit 0，无类型错误。

- [ ] **Step 4: 部署后端（git pull + pm2 restart）**

Run:
```
ssh qing "cd /www/apps/vendure && git fetch && git reset --hard origin/master && pm2 restart vendure"
```
Expected: vendure 重启成功。启动日志无 customField 重复注册报错。

- [ ] **Step 5: 冒烟验证字段可查询**

确认 `resolveChannelByCode` 返回 `shareImageUrl` 字段（首次为 null/undefined 属正常）：
Run (vshop C 端 resolver 探针，任选已有 probe 方式或直接查 Admin API schema):
```
# 用 graphiql 或既有脚本核对 ChannelResolveCustomFields 含 shareImageUrl
```

- [ ] **Step 6: Commit（vendure 仓库）**

```bash
git add packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts packages/cjk-plugin/src/plugin.ts
git commit -m "feat(cjk-plugin): Channel 新增 shareImageUrl 默认分享图字段并随 resolveChannelByCode 下发"
```

---

## Task 2: 后台店铺信息页「默认分享图」（web-admin）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\decorate\shop-info\index.vue`

- [ ] **Step 1: 引入 MediaPicker 与 asset API**

在 `shop-info/index.vue` `<script setup>` 顶部 import 区追加：

```ts
import { fetchAssets } from '../../../apis/asset';
import MediaPicker from '../../../components/MediaPicker.vue';
```

- [ ] **Step 2: 模板新增「默认分享图」单元**

在第一个 `<view class="card">` 内、`店铺 Logo` cell 之后插入：

```html
      <view class="cell col">
        <text class="lbl">默认分享图</text>
        <MediaPicker :max="1" :value="shareImageIds" @change="onShareImageChange" />
        <text class="hint-inline">商品无主图时，微信转发的图片兜底。发分享图后点保存生效。</text>
      </view>
```

- [ ] **Step 3: state + 处理函数**

在 `f` 定义之后新增 state 与函数：

```ts
const shareImageIds = ref<string[]>([]);
const shareImageUrl = ref('');

function onShareImageChange(ids: string[]) {
  shareImageIds.value = ids;
  if (ids.length) {
    fetchAssets(1, 0, undefined, ids).then((r) => {
      shareImageUrl.value = r.items[0]?.preview || '';
    }).catch(() => {});
  } else {
    shareImageUrl.value = '';
  }
}
```

- [ ] **Step 4: 加载时回填已存 URL**

`onMounted` 中 `f.value = {...}` 之后追加：

```ts
  shareImageUrl.value = cf.shareImageUrl ?? '';
  if (shareImageUrl.value) {
    // 有已存图则回填 id（用于 MediaPicker 预览；若 id 查不到则由 URL 兜底展示）
    // MediaPicker 按 id 预览，这里用 URL 直接展示：改用一个 url 驱动模式
  }
```

说明：MediaPicker 以 asset id 驱动。如希望保存的是 URL 而非 id，可采用「URL 字符串」字段模式——本 Task **采用直接存 URL**：`shareImageIds` 仅用于选图后立即取 URL，持久化字段为 `shareImageUrl`。加载回填时不依赖 id（URL 已存），因此本步骤仅需保存 `shareImageUrl`。

- [ ] **Step 5: 保存 payload 携带 shareImageUrl**

在 `save()` 中 `payload.promoSchemes...` 之前：

```ts
  payload.shareImageUrl = shareImageUrl.value || null;
```

- [ ] **Step 6: 样式补 `.hint-inline`**

在 `<style>` `.hint` 规则旁追加：

```scss
  .hint-inline { display: block; margin-top: 12rpx; font-size: 22rpx; color: $wa-muted; }
```

- [ ] **Step 7: 构建 + 手机视口截图**

Run (cwd `d:\zhao\vshop\web-admin`):
```
npm run build:h5
```
Expected: 构建成功。用 Playwright 移动视口(390×844)打开店铺信息页，截图默认分享图区，命名 `s06_share_default.png` 存 `web-admin/src/static/manual/shots/`。

- [ ] **Step 8: Commit（vshop 仓库，web-admin 目录）**

```bash
git add web-admin/src/pages/decorate/shop-info/index.vue
git commit -m "feat(web-admin): 店铺信息页新增默认分享图配置（MediaPicker 上传存 URL）"
```

---

## Task 3: 内置默认图（两站静态资源）

- [ ] **Step 1: 生成一张品牌默认分享图**

用 GenerateImage 生成约 1:1 商城类默认分享图，存：
- `d:\zhao\vshop\src\static\share-default.png`
- `d:\zhao\nshop\public\share-default.png`

（同一张图复制到两处。）生成 prompt 建议：简洁品牌 Logo 风、浅色底、"精选好物" 主题占位，无文字强依赖。

- [ ] **Step 2: Commit vshop**

```bash
git add web-admin/../src/static/share-default.png
git commit -m "feat(vshop): 新增微信分享内置默认图"
```
（确认 vshop 仓库根 src 路径提交。）

- [ ] **Step 3: Commit nshop**

```bash
git add public/share-default.png
git commit -m "feat(nshop): 新增微信分享内置默认图"
```

---

## Task 4: vshop C 端兜底（纯函数 + tenant + share 组装）

**Files:**
- Create: `d:\zhao\vshop\src\utils\html.ts`
- Create: `d:\zhao\vshop\src\utils\html.test.ts`
- Modify: `d:\zhao\vshop\src\api\queries\channel.ts`
- Modify: `d:\zhao\vshop\src\stores\tenant.ts`
- Modify: `d:\zhao\vshop\src\composables\useH5Share.ts`
- Modify: `d:\zhao\vshop\src\composables\useShare.ts`
- Modify: `d:\zhao\vshop\src\pkg-product\pages\detail.vue`

- [ ] **Step 1: 写失败的单测（html 纯函数）**

Create `d:\zhao\vshop\src\utils\html.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { stripHtmlToText, toAbsoluteUrl, buildShareMeta } from './html';

test('stripHtmlToText: 剥离标签解实体压缩空白', () => {
  assert.strictEqual(stripHtmlToText('<p>你好&nbsp;<b>世界</b></p>'), '你好 世界');
});
test('stripHtmlToText: 截断到100字符加省略号', () => {
  const long = '<p>' + 'a'.repeat(120) + '</p>';
  const out = stripHtmlToText(long);
  assert.ok(out.endsWith('…'));
  assert.ok(out.length <= 101);
});
test('stripHtmlToText: 空串/非法输入返回空字符串', () => {
  assert.strictEqual(stripHtmlToText(''), '');
  assert.strictEqual(stripHtmlToText('<p></p>'), '');
  assert.strictEqual(stripHtmlToText('   '), '');
});
test('toAbsoluteUrl: 相对路径补 origin，绝对保留', () => {
  assert.strictEqual(toAbsoluteUrl('/static/a.png', 'https://x.com'), 'https://x.com/static/a.png');
  assert.strictEqual(toAbsoluteUrl('https://x.com/a.png', 'https://y.com'), 'https://x.com/a.png');
  assert.strictEqual(toAbsoluteUrl('', 'https://x.com'), '');
});
test('buildShareMeta: 无图无描述逐级兜底', () => {
  const meta = buildShareMeta({
    productName: '', featureImage: '', assetsImages: [], textDescription: '',
    shareImageUrl: '', shopName: '', shopIntro: '', origin: 'https://x.com',
    defaultImage: '/share-default.png', defaultTitle: 'VShop - 精选好物', defaultDesc: '精选好物推荐',
  });
  assert.strictEqual(meta.imgUrl, 'https://x.com/share-default.png');
  assert.strictEqual(meta.title, 'VShop - 精选好物');
  assert.strictEqual(meta.desc, '精选好物推荐');
});
test('buildShareMeta: 主图链 featuredAsset→assets0→店铺→默认', () => {
  assert.strictEqual(
    buildShareMeta({ productName: 'A', featureImage: 'https://x/fa.png', assetsImages: ['https://x/a0.png'], textDescription: 'd', shareImageUrl: 'https://x/s.png', shopName: 'S', shopIntro: 'i', origin: 'https://x', defaultImage: '/d.png', defaultTitle: 't', defaultDesc: 'dd' }).imgUrl,
    'https://x/fa.png',
  );
  assert.strictEqual(
    buildShareMeta({ productName: 'A', featureImage: '', assetsImages: ['https://x/a0.png'], textDescription: 'd', shareImageUrl: 'https://x/s.png', shopName: 'S', shopIntro: 'i', origin: 'https://x', defaultImage: '/d.png', defaultTitle: 't', defaultDesc: 'dd' }).imgUrl,
    'https://x/a0.png',
  );
  assert.strictEqual(
    buildShareMeta({ productName: 'A', featureImage: '', assetsImages: [], textDescription: 'd', shareImageUrl: 'https://x/s.png', shopName: 'S', shopIntro: 'i', origin: 'https://x', defaultImage: '/d.png', defaultTitle: 't', defaultDesc: 'dd' }).imgUrl,
    'https://x/s.png',
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run (cwd `d:\zhao\vshop`, Node 22):
```
node --experimental-strip-types --test src/utils/html.test.ts
```
Expected: FAIL，报 `Cannot find module .../html` 或函数未定义。

- [ ] **Step 3: 实现纯函数**

Create `d:\zhao\vshop\src\utils\html.ts`:

```ts
export function stripHtmlToText(html: string, maxLen = 100): string {
  if (!html || typeof html !== 'string') return '';
  let text = String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd().replace(/[，。、,.]$/, '') + '…';
}

export function toAbsoluteUrl(url: string, origin: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return origin + url;
  return `${origin}/${url}`;
}

export interface ShareMetaInput {
  productName: string;
  featureImage: string;
  assetsImages: string[];
  textDescription: string;
  shareImageUrl: string;
  shopName: string;
  shopIntro: string;
  origin: string;
  defaultImage: string;
  defaultTitle: string;
  defaultDesc: string;
}

export function buildShareMeta(i: ShareMetaInput): {
  title: string; desc: string; imgUrl: string;
} {
  const title = i.productName || i.shopName || i.defaultTitle;
  const desc = i.textDescription || i.shopIntro || i.defaultDesc;
  const img =
    i.featureImage || i.assetsImages[0] || i.shareImageUrl || toAbsoluteUrl(i.defaultImage, i.origin);
  return { title, desc, imgUrl: toAbsoluteUrl(img, i.origin) };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```
node --experimental-strip-types --test src/utils/html.test.ts
```
Expected: PASS（6 tests）。

- [ ] **Step 5: channel query 加 shareImageUrl**

`d:\zhao\vshop\src\api\queries\channel.ts` 的 `resolveChannelByCode` query customFields 内追加 `shareImageUrl`（`themeId` 后加一行 `shareImageUrl`）；同样在 `resolveChannelByDomain` 如需返回也补（当前 domain 只查 token/code，可保持）。

- [ ] **Step 6: tenant store 暴露 shareImageUrl**

`d:\zhao\vshop\src\stores\tenant.ts`：
1. state 加 `const shareImageUrl = ref('');`
2. `loadTenantDetails` 中 `servicePhone.value = cf.servicePhone || '';` 之后加 `shareImageUrl.value = cf.shareImageUrl || '';`
3. `loadTenantDetails` 兜底分支（重置处）加 `shareImageUrl.value = '';`
4. return 增加 `shareImageUrl`（getter 区）。

- [ ] **Step 7: useH5Share / useShare 兜底**

`d:\zhao\vshop\src\composables\useH5Share.ts`：

```ts
export function useH5Share(options: H5ShareOptions = {}) {
    const defaultTitle = 'VShop - 精选好物';
    const defaultDesc = '精选好物推荐';
    const defaultLink = window.location.href.split('#')[0];
    ensureWxReady().then(() => {
        const shareData = {
            title: options.title || defaultTitle,
            desc: options.desc || defaultDesc,
            link: buildShareLink(options.link || defaultLink),
            imgUrl: options.imageUrl || '',
        };
        ...
```

将 `useH5ProductShare` 改造为接收完整 meta：

```ts
export function useH5ProductShare(productName: string, slug: string, imageUrl?: string, desc?: string) {
    const base = window.location.origin + '/#/pkg-product/pages/detail?slug=' + slug;
    useH5Share({
        title: productName,
        desc: desc || '精选好物推荐',
        link: base,
        imageUrl,
    });
}
```

`d:\zhao\vshop\src\composables\useShare.ts` 的 `useProductShare` 增 `desc` 参数并透传给 H5 分支（MP-WEIXIN 分支保持）。

- [ ] **Step 8: 商品详情页组装并接入**

`d:\zhao\vshop\src\pkg-product\pages\detail.vue`：

1. import 增：
```ts
import { useTenantStore } from '../../stores/tenant';
import { stripHtmlToText, buildShareMeta } from '../../utils/html';
```
2. 顶部 `const tenant = useTenantStore();`
3. 替换 `onMounted` 中分享调用：

```ts
    if (product.value) {
      const meta = buildShareMeta({
        productName: product.value.name || '',
        featureImage: product.value.featuredAsset?.preview || '',
        assetsImages: (product.value.assets || []).map((a: any) => a.preview).filter(Boolean),
        textDescription: stripHtmlToText(pickTranslation(product.value.translations || [])),
        shareImageUrl: tenant.shareImageUrl || '',
        shopName: tenant.shopName || '',
        shopIntro: tenant.shopIntro || '',
        origin: window.location.origin,
        defaultImage: '/static/share-default.png',
        defaultTitle: 'VShop - 精选好物',
        defaultDesc: '精选好物推荐',
      });
      useProductShare(meta.title, slug, meta.imgUrl, meta.desc);
    }
```

- [ ] **Step 9: 构建验证**

Run (cwd `d:\zhao\vshop`):
```
npm run build:h5
```
Expected: 构建成功，无 TS 错误。

- [ ] **Step 10: 回归 + 手机视口截图**

Playwright 移动视口打开商品详情页，截图确认（转发现有分享配置取值逻辑通过，若难以断言取图，截图作证页面正常 + 分享 meta 组装正确）。截图 `s07_vshop_share.png` 存 `web-admin/src/static/manual/shots/`。

- [ ] **Step 11: Commit（vshop 仓库）**

```bash
git add src/utils/html.ts src/utils/html.test.ts src/api/queries/channel.ts src/stores/tenant.ts src/composables/useH5Share.ts src/composables/useShare.ts src/pkg-product/pages/detail.vue
git commit -m "feat(vshop): 微信分享标题/描述/主图兜底（含 HTML 过滤纯函数）"
git add src/static/share-default.png src/static/manual/shots/s07_vshop_share.png 2>/dev/null || true
```

---

## Task 5: nshop C 端兜底

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\utils\html-share.ts`
- Create: `d:\zhao\nshop\layers\base\app\utils\html-share.test.ts`
- Modify: `d:\zhao\nshop\layers\base\gql\queries\context.gql`（或新增 query）
- Modify: `d:\zhao\nshop\layers\base\app\components\WechatShare.vue`
- Modify: `d:\zhao\nshop\layers\base\app\pages\product\[slug].vue`

- [ ] **Step 1: 写失败的单测**

`html-share.test.ts`（复用 Task 4 的 `stripHtmlToText`/`buildShareMeta` 语义，nshop 独立副本）：

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { stripHtmlToText } from './html-share';

test('nshop stripHtmlToText 剥离/截断', () => {
  assert.strictEqual(stripHtmlToText('<p><b>Hi</b>&nbsp;there</p>'), 'Hi there');
  assert.strictEqual(stripHtmlToText(''), '');
  assert.ok(stripHtmlToText('x'.repeat(120)).endsWith('…'));
});
```

- [ ] **Step 2: 运行确认失败**

Run (cwd `d:\zhao\nshop`):
```
node --experimental-strip-types --test layers/base/app/utils/html-share.test.ts
```
Expected: FAIL。

- [ ] **Step 3: 实现纯函数副本**

`html-share.ts`：内容同 Task 4 Step 3 的 `stripHtmlToText`（+ `toAbsoluteUrl` + `buildShareMeta`，字段结构保持一致）。因 nshop 为 Nuxt SSR pure TS，避免 import 别名，纯 ESM。

- [ ] **Step 4: 运行确认通过**

Expected: PASS。

- [ ] **Step 5: 新增/扩展 channel 分享图 query**

方式 A（推荐）：`context.gql` 已有 `GetChannelTheme`，在 `customFields` 内追加 `shareImageUrl`：

```graphql
query GetChannelTheme {
  activeChannel {
    customFields {
      themeId
      shopContent
      detailConfig
      orderDetailConfig
      orderListConfig
      taxMode
      promoSchemes
      serviceSchemes
      shareImageUrl
    }
    pricesIncludeTax
  }
}
```

- [ ] **Step 6: WechatShare.vue 兜底**

在 `fetchJssdkSignature` 前引入租户分享图（自 Task2/4 后端字段）。`shareData` computed 调整：

```ts
const shareData = computed(() => ({
  title: props.title || document.title,
  desc: props.description || shareChannelDesc.value || t("messages.share.inviteTip"),
  link: shareUrl.value,
  imgUrl: props.imageUrl || shareChannelImage.value || defaultShareImage.value,
}));
```

并新增：
```ts
const tenantStore = useTenantChannel();
// shareChannelDesc/shareChannelImage 由改插的 shareImageUrl 动态源提供
const defaultShareImage = computed(() => {
  return `${window.location.origin}/share-default.png`;
});
```

- [ ] **Step 7: 商品详情页接入**

`[slug].vue` 模板处改为：

```html
    <WechatShare
      :title="product?.name"
      :description="stripHtmlToText(product?.description)"
      :image-url="featureShareImage"
    />
```

script 里定义（主图链 + 店铺分享图）：
```ts
const featureShareImage = computed(() =>
  product.value?.featuredAsset?.preview
    || product.value?.assets?.[0]?.preview
    || ''
);
```
店铺 `shareImageUrl` 兜底交由 WechatShare 内部根据 query 结果注入（或在此拉取后作为额外兜底传入，二者择一，注意别重复）。

- [ ] **Step 8: 类型/构建**

Run (cwd `d:\zhao\nshop`):
```
npm run typecheck
```
Expected: 通过。再 `npm run build` 确认 SSR 构建。

- [ ] **Step 9: Commit（nshop 仓库）**

```bash
git add layers/base/app/utils/html-share.ts layers/base/app/utils/html-share.test.ts layers/base/gql/queries/context.gql layers/base/app/components/WechatShare.vue layers/base/app/pages/product/[slug].vue
git commit -m "feat(nshop): 微信分享标题/描述/主图兜底（HTML 过滤 + 店铺默认图）"
```

---

## Task 6: e2e 配置回归 + 操作手册

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\static\manual\index.html`
- 截图：`r16_share_default_cfg.png`, `r17_vshop_share.png`, `r18_nshop_share.png`

- [ ] **Step 1: 后台配置 e2e**

Playwright 手机视口：登录管理员 → 店铺信息页 → 上传默认分享图保存 → 刷新确认持久化。截图 `r16_share_default_cfg.png`。

- [ ] **Step 2: 商品页分享取值验证**

移动视口打开商品详情页（vshop 与 nshop 各一个无主图商品实例，可选），确认分享 meta 取到默认分享图/纯文本描述。截图 `r17_vshop_share.png`、`r18_nshop_share.png`。

- [ ] **Step 3: 手册新增章节 op-21**

`index.html` 中在 op-19 之后插入「微信分享兜底配置」章节：说明默认分享图配置入口、主图/描述/标题兜底链、内置默认图说明；引用 r16/r17/r18 截图。

- [ ] **Step 4: web-admin 构建 + 部署 + 校验**

```
npm run build:h5 && node scripts/deploy.mjs
```
Expected: 产物同步，线上 op-21 生效。

- [ ] **Step 5: Commit（vshop 仓库，web-admin 目录）**

```bash
git add web-admin/src/static/manual/index.html web-admin/src/static/manual/shots/r16_share_default_cfg.png web-admin/src/static/manual/shots/r17_vshop_share.png web-admin/src/static/manual/shots/r18_nshop_share.png
git commit -m "docs(manual): op-21 微信分享兜底配置手册（含截图）"
```

- [ ] **Step 6: 部署 nshop**

按 nshop 既有部署流程（`npm run build` + 部署/上传脚本）发布 www.youshop.cn。

---

## 验证清单

- [ ] `stripHtmlToText` 单测全绿（vshop + nshop 两副本）
- [ ] 后端 `shareImageUrl` 随 `resolveChannelByCode` / `GetChannelTheme` 下发
- [ ] 后台能配置并持久化默认分享图
- [ ] vshop 商品页分享取主图链 + 纯文本描述
- [ ] nshop 商品页分享取主图链 + 纯文本描述
- [ ] op-21 手册上线，两站部署完成