# vshop 导航重构 + 配送/支付 CRUD 实施计划

**Goal:** 按统一色彩规范重构 web-admin 的 ☰ 抽屉与工作台，并为配送方式/支付方式补齐编辑+删除+启停。
**Architecture:** uni-app CLI（Vue3+Vite）直连 Vendure admin-api；把所有域配色收敛到 `src/theme.ts`（唯一来源），组件引用之。
**Tech Stack:** uni-app, Vue3, scss, graphql-request。

参考：`docs/superpowers/specs/2026-08-23-vshop-tenant-admin-design.md`

> **已确认的范围决策（由 schema 探针决定）**：
> - ShippingMethod **无原生 enabled** → 配送方式**不做启停**，做编辑+删除。
> - PaymentMethod **有 enabled** → 支付方式做编辑+删除+启停（已有）。
> - 两者**均不做"新增"**（新增需配置计价器/处理器 args，脆弱且本次非刚需）。
> - 改名用 `translations: [{ languageCode: 'zh_Hans', name, description }]`（已探到现存 zh_Hans 翻译）。

---

### Task 1: 新建 `src/theme.ts` 颜色唯一来源

**Files:**
- Create: `web-admin/src/theme.ts`

- [ ] 创建 token 与档位样式工具

```ts
export const D = {
  d1: { main: '#ff6600', grad: '#ff8833' },   // 商品域
  d2: { main: '#e53935', grad: '#ff6659' },   // 交易域
  d3: { main: '#2563eb', grad: '#60a5fa' },   // 履约域
  d4: { main: '#7c3aed', grad: '#a78bfa' },   // 装修域
  d5: { main: '#0d9488', grad: '#14b8a6' },   // 分销域
  d6: { main: '#64748b', grad: '#94a3b8' },   // 系统域
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#e53935',
  disabled: '#9ca3af',
  info: '#2563eb',
};

// 三档标签样式（T1 填充 / T2 镂空 / T3 纯文字）
export function tierStyle(main: string, grad: string, tier: 1 | 2 | 3): Record<string, string> {
  if (tier === 1) return { background: `linear-gradient(135deg, ${main}, ${grad})`, color: '#ffffff' };
  if (tier === 2) return { border: `1.5rpx solid ${main}`, color: main };
  return { background: '#f5f5f5', color: '#666666' };
}
```

### Task 2: `src/uni.scss` 补域色变量

**Files:**
- Modify: `web-admin/src/uni.scss:1-10`

- [ ] 追加域色（供 scss 静态样式引用）

```scss
// 业务域主色（唯一来源见 src/theme.ts，此处供 <style> 引用）
$pm-d1: #ff6600; $pm-d1-grad: #ff8833;
$pm-d2: #e53935; $pm-d2-grad: #ff6659;
$pm-d3: #2563eb; $pm-d3-grad: #60a5fa;
$pm-d4: #7c3aed; $pm-d4-grad: #a78bfa;
$pm-d5: #0d9488; $pm-d5-grad: #14b8a6;
$pm-d6: #64748b; $pm-d6-grad: #94a3b8;
$pm-success: #16a34a; $pm-warning: #f59e0b; $pm-danger: #e53935; $pm-disabled: #9ca3af;
```

### Task 3: 重构 `src/components/Drawer.vue`（按域分组密集宫格）

**Files:**
- Modify: `web-admin/src/components/Drawer.vue`

- [ ] 重写 template/script/style（6 域、三档标签、商品"分类"置首）

```vue
<template>
  <view>
    <view v-if="show" class="mask" @tap="$emit('close')" />
    <view v-if="show" class="drawer">
      <view class="head">
        <text class="store">{{ tenant.name || tenant.code || '未选店铺' }}</text>
        <text class="switch" @tap="switchStore">切换店铺 ›</text>
      </view>
      <scroll-view scroll-y class="body">
        <view class="group" v-for="g in groups" :key="g.domain">
          <view class="g-band">
            <view class="band" :style="{ background: g.color }" />
            <text class="g-title">{{ g.domain }}</text>
          </view>
          <view class="tags">
            <text v-for="it in g.items" :key="it.label" class="tag"
              :style="tierStyle(g.color, g.grad, it.tier)" @tap="go(it)">{{ it.label }}</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { useTenantStore } from '../stores/tenantStore';
import { D, tierStyle } from '../theme';
const emit = defineEmits(['close']);
const tenant = useTenantStore();
defineProps<{ show: boolean }>();

const groups = [
  { domain: '商品', color: D.d1.main, grad: D.d1.grad, items: [
    { label: '分类', url: '/pages/product/categories/index', tier: 1 },
    { label: '＋新增商品', url: '/pages/product/create/index', tier: 1 },
    { label: '商品列表', url: '/pages/product/list/index', tier: 1 },
    { label: '库存预警', url: '/pages/inventory/stock/index', tier: 2 },
    { label: '图片库', url: '/pages/media/library/index', tier: 3 },
  ]},
  { domain: '交易', color: D.d2.main, grad: D.d2.grad, items: [
    { label: '订单', url: '/pages/order/list/index', tier: 1 },
    { label: '发货', url: '/pages/order/ship/index', tier: 2 },
    { label: '售后', url: '/pages/after-sale/list/index', tier: 2 },
  ]},
  { domain: '履约', color: D.d3.main, grad: D.d3.grad, items: [
    { label: '配送方式', url: '/pages/shipping/methods/index', tier: 2 },
    { label: '支付方式', url: '/pages/payment/methods/index', tier: 2 },
    { label: '自提点', url: '/pages/pickup/index', tier: 2 },
    { label: '配送档案', url: '/pages/shipping/profile/index', tier: 3 },
    { label: '支付档案', url: '/pages/payment/profile/index', tier: 3 },
  ]},
  { domain: '装修', color: D.d4.main, grad: D.d4.grad, items: [
    { label: '首页装修', url: '/pages/decorate/home/index', tier: 1 },
    { label: '主题风格', url: '/pages/decorate/theme/index', tier: 3 },
    { label: '店铺信息', url: '/pages/decorate/shop-info/index', tier: 3 },
  ]},
  { domain: '分销', color: D.d5.main, grad: D.d5.grad, items: [
    { label: '分销关系', url: '/pages/distribution/relations/index', tier: 2 },
    { label: '佣金结算', url: '/pages/distribution/settle/index', tier: 2 },
  ]},
  { domain: '系统', color: D.d6.main, grad: D.d6.grad, items: [
    { label: '数据看板', url: '/pages/data/dashboard/index', tier: 2 },
    { label: '切换店铺', tier: 3, action: 'switchStore' },
    { label: '退出登录', tier: 3, action: 'logout' },
  ]},
];

function switchStore() { uni.redirectTo({ url: '/pages/channel-select/index' }); }
function go(it: any) {
  emit('close');
  if (it.action === 'logout') return uni.redirectTo({ url: '/pages/login/index' });
  if (it.action === 'switchStore') return switchStore();
  if (it.url) uni.navigateTo({ url: it.url });
}
</script>
<style lang="scss" scoped>
.mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 90; }
.drawer { position: fixed; left: 0; top: 0; bottom: 0; width: 78vw; max-width: 540rpx; background: #fff; z-index: 91; display: flex; flex-direction: column; box-shadow: 4rpx 0 24rpx rgba(0,0,0,.1); }
.head { padding: 32rpx 32rpx 22rpx; border-bottom: 1px solid #f0f0f0;
  .store { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
  .switch { display: block; margin-top: 8rpx; font-size: 22rpx; color: $pm-info; }
}
.body { flex: 1; padding: 20rpx 28rpx 40rpx; }
.group { margin-bottom: 28rpx; }
.g-band { display: flex; align-items: center; gap: 12rpx; margin-bottom: 16rpx;
  .band { width: 10rpx; height: 30rpx; border-radius: 6rpx; }
  .g-title { font-size: 26rpx; font-weight: 700; color: $wa-ink; }
}
.tags { display: flex; flex-wrap: wrap; gap: 14rpx; }
.tag { padding: 12rpx 22rpx; border-radius: 14rpx; font-size: 24rpx; font-weight: 500; }
</style>
```

### Task 4: 重构 `src/pages/dashboard/index.vue`（工作台）

**Files:**
- Modify: `web-admin/src/pages/dashboard/index.vue`

- [ ] 重写 KPI + 4 列宫格 + 履约区 + 次频区

```vue
<template>
  <view class="page">
    <view class="topbar">
      <view class="tl">
        <text class="t">{{ tenant.name || '工作台' }}</text>
        <text class="s">经营中</text>
      </view>
      <text class="menu" @tap="drawer = true">☰</text>
    </view>

    <view class="kpis">
      <view class="kpi" v-for="k in kpis" :key="k.label">
        <text class="v" :style="{ color: k.color }">{{ k.value }}</text>
        <text class="l">{{ k.label }}</text>
        <text class="d">去处理 ›</text>
      </view>
    </view>

    <view class="sec">
      <text class="sec-t">🗂 常用功能 <text class="tag">高频</text></text>
      <view class="grid">
        <view v-for="it in common" :key="it.label" class="act" @tap="go(it.url)">
          <view class="ic" :style="tierStyle(it.color, it.grad, 1)">{{ it.ic }}</view>
          <text class="nm">{{ it.label }}</text>
        </view>
      </view>
    </view>

    <view class="sec">
      <text class="sec-t">⚙ 履约 / 配置</text>
      <view class="row">
        <view class="pill" v-for="p in fulfill" :key="p.label" @tap="go(p.url)">
          <view class="ic" :style="{ background: D.d3.main + '22', color: D.d3.main }">{{ p.ic }}</view>
          <view class="tx"><text class="b">{{ p.label }}</text><text class="s">前提配置</text></view>
          <text class="chev">›</text>
        </view>
      </view>
    </view>

    <view class="sec">
      <text class="sec-t">📦 商品 <text class="tag b">次频</text></text>
      <view class="grid">
        <view v-for="it in subfreq" :key="it.label" class="act" @tap="go(it.url)">
          <view class="ic" :style="{ background: D.d3.main + '22', color: D.d3.main }">{{ it.ic }}</view>
          <text class="nm">{{ it.label }}</text>
        </view>
      </view>
    </view>

    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
    <Drawer :show="drawer" @close="drawer = false" />
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { D, tierStyle } from '../../theme';
import { useTenantStore } from '../../stores/tenantStore';
import BottomBar from '../../components/BottomBar.vue';
import Drawer from '../../components/Drawer.vue';

const tenant = useTenantStore();
const drawer = ref(false);
const kpis = [
  { label: '今日销售额', value: '¥ —', color: D.d1.main },
  { label: '待发货', value: '0', color: D.d2.main },
  { label: '库存预警', value: '0', color: D.warning },
];
const common = [
  { ic: '单', label: '订单', url: '/pages/order/list/index', color: D.d2.main, grad: D.d2.grad },
  { ic: '＋', label: '新增商品', url: '/pages/product/create/index', color: D.d1.main, grad: D.d1.grad },
  { ic: '售', label: '售后', url: '/pages/after-sale/list/index', color: D.d2.main, grad: D.d2.grad },
  { ic: '类', label: '分类', url: '/pages/product/categories/index', color: D.d1.main, grad: D.d1.grad },
  { ic: '库', label: '库存', url: '/pages/inventory/stock/index', color: D.d1.main, grad: D.d1.grad },
  { ic: '装', label: '装修', url: '/pages/decorate/home/index', color: D.d4.main, grad: D.d4.grad },
];
const fulfill = [
  { ic: '配', label: '配送方式', url: '/pages/shipping/methods/index' },
  { ic: '付', label: '支付方式', url: '/pages/payment/methods/index' },
];
const subfreq = [
  { ic: '商', label: '商品列表', url: '/pages/product/list/index' },
  { ic: '图', label: '图片库', url: '/pages/media/library/index' },
];
function go(url: string) { uni.navigateTo({ url }); }
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 24rpx 160rpx; }
.topbar { display: flex; align-items: center; justify-content: space-between; background: #fff; border-radius: 20rpx; padding: 26rpx 28rpx; margin-bottom: 20rpx;
  .tl { .t { font-size: 34rpx; font-weight: 800; color: $wa-ink; } .s { display: block; font-size: 20rpx; color: $pm-success; margin-top: 4rpx; } }
  .menu { font-size: 36rpx; color: $wa-ink; }
}
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16rpx; margin-bottom: 24rpx;
  .kpi { background: #fff; border-radius: 20rpx; padding: 22rpx 12rpx 18rpx; text-align: center; box-shadow: 0 2rpx 6rpx rgba(0,0,0,.04);
    .v { font-size: 36rpx; font-weight: 800; line-height: 1; }
    .l { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 10rpx; }
    .d { display: block; font-size: 18rpx; color: #bbb; margin-top: 4rpx; }
  }
}
.sec { margin-bottom: 24rpx;
  .sec-t { font-size: 28rpx; font-weight: 700; color: $wa-ink; margin: 0 8rpx 16rpx; display: flex; align-items: center; gap: 10rpx;
    .tag { font-size: 20rpx; color: $pm-d1; font-weight: 600; &.b { color: $pm-d3; } }
  }
}
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16rpx;
  .act { background: #fff; border-radius: 18rpx; padding: 22rpx 6rpx 18rpx; display: flex; flex-direction: column; align-items: center; gap: 12rpx; box-shadow: 0 2rpx 6rpx rgba(0,0,0,.04);
    .ic { width: 68rpx; height: 68rpx; border-radius: 20rpx; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 32rpx; font-weight: 700; }
    .nm { font-size: 22rpx; color: $wa-ink; font-weight: 600; }
  }
}
.row { display: flex; gap: 16rpx;
  .pill { flex: 1; background: #fff; border-radius: 18rpx; padding: 22rpx; display: flex; align-items: center; gap: 16rpx; box-shadow: 0 2rpx 6rpx rgba(0,0,0,.04);
    .ic { width: 60rpx; height: 60rpx; border-radius: 16rpx; display: flex; align-items: center; justify-content: center; font-size: 28rpx; font-weight: 700; }
    .tx { flex: 1; .b { font-size: 26rpx; color: $wa-ink; font-weight: 600; display: block; } .s { font-size: 20rpx; color: $pm-d3; } }
    .chev { color: #ccc; }
  }
}
</style>
```

### Task 5: `src/apis/shipping.ts` 补更新/删除

**Files:**
- Modify: `web-admin/src/apis/shipping.ts`

- [ ] 追加 updateShippingMethod / deleteShippingMethod

```ts
export async function updateShippingMethod(id: string, name: string, description: string): Promise<void> {
  await getAdminClient().request(`mutation Up($input: UpdateShippingMethodInput!) {
    updateShippingMethod(input: $input) { id }
  }`, { input: { id, translations: [{ languageCode: 'zh_Hans', name, description }] } });
}

export async function deleteShippingMethod(id: string): Promise<void> {
  await getAdminClient().request(`mutation Del($id: ID!) { deleteShippingMethod(id: $id) { result } }`, { id });
}
```

### Task 6: `src/apis/payment.ts` 补更新/删除

**Files:**
- Modify: `web-admin/src/apis/payment.ts`

- [ ] 追加 updatePaymentMethod / deletePaymentMethod（保留 setPaymentEnabled）

```ts
export async function updatePaymentMethod(id: string, name: string, description: string): Promise<void> {
  await getAdminClient().request(`mutation Up($input: UpdatePaymentMethodInput!) {
    updatePaymentMethod(input: $input) { id }
  }`, { input: { id, translations: [{ languageCode: 'zh_Hans', name, description }] } });
}

export async function deletePaymentMethod(id: string): Promise<void> {
  await getAdminClient().request(`mutation Del($id: ID!) { deletePaymentMethod(id: $id) { result } }`, { id });
}
```

### Task 7: 配送方式页 编辑+删除+前提提示

**Files:**
- Modify: `web-admin/src/pages/shipping/methods/index.vue`

- [ ] 重写列表：卡片（名称/code/描述）+ 编辑 + 删除（`uni.showModal` 二次确认）+ 顶部前提提示；编辑走自定义浮层表单

```vue
<template>
  <view class="page">
    <view class="hint">前提配置：先配好配送方式，才可在「配送档案」引用。</view>
    <view class="card" v-for="s in items" :key="s.id">
      <view class="row">
        <view class="left"><text class="name">{{ s.name }}</text><text class="code">{{ s.code }}</text></view>
      </view>
      <text class="desc">{{ s.description || '—' }}</text>
      <view class="ops">
        <text class="ed" @tap="openEdit(s)">编辑</text>
        <text class="del" @tap="onDel(s)">删除</text>
      </view>
    </view>
    <view v-if="!items.length" class="empty">暂无配送方式</view>

    <view v-if="editing" class="sheet-mask" @tap="editing = null">
      <view class="sheet" @tap.stop>
        <text class="st">{{ editing.id ? '编辑配送方式' : '新增配送方式' }}</text>
        <input class="ipt" v-model="form.name" placeholder="名称" />
        <input class="ipt" v-model="form.description" placeholder="描述" />
        <button class="save" @tap="save">保存</button>
      </view>
    </view>
    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchShippingMethods, updateShippingMethod, deleteShippingMethod } from '../../../apis/shipping';

const items = ref<any[]>([]);
const editing = ref<any>(null);
const form = ref({ id: '', name: '', description: '' });
onMounted(async () => { items.value = await fetchShippingMethods(); });

function openEdit(s: any) { editing.value = s; form.value = { id: s.id, name: s.name, description: s.description || '' }; }
async function save() {
  try {
    await updateShippingMethod(form.value.id, form.value.name, form.value.description);
    editing.value = null; items.value = await fetchShippingMethods();
    uni.showToast({ title: '已保存', icon: 'none' });
  } catch (e: any) { uni.showToast({ title: e?.message || '保存失败', icon: 'none' }); }
}
function onDel(s: any) {
  uni.showModal({ title: '删除配送方式', content: `确认删除「${s.name}」？`, success: async (r) => {
    if (!r.confirm) return;
    try { await deleteShippingMethod(s.id); items.value = await fetchShippingMethods(); uni.showToast({ title: '已删除', icon: 'none' }); }
    catch (e: any) { uni.showToast({ title: e?.message || '删除失败', icon: 'none' }); }
  }});
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .hint { background: #fff7f0; border: 1px solid #ffe0c4; color: #b05000; font-size: 24rpx; border-radius: 16rpx; padding: 18rpx 22rpx; margin-bottom: 20rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 26rpx 30rpx 12rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; .left { display: flex; flex-direction: column; .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; } .code { font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; } } }
    .desc { display: block; margin-top: 12rpx; font-size: 24rpx; color: $wa-muted; }
    .ops { display: flex; justify-content: flex-end; gap: 40rpx; margin-top: 16rpx; padding-top: 16rpx; border-top: 1px solid $wa-rule; padding-bottom: 12rpx;
      .ed { font-size: 26rpx; color: $pm-info; } .del { font-size: 26rpx; color: $pm-danger; }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
.sheet-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 90; display: flex; align-items: flex-end; }
.sheet { width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 40rpx 32rpx calc(env(safe-area-inset-bottom) + 40rpx);
  .st { font-size: 32rpx; font-weight: 700; color: $wa-ink; display: block; margin-bottom: 24rpx; }
  .ipt { background: #f5f5f5; border-radius: 14rpx; padding: 22rpx 24rpx; font-size: 28rpx; margin-bottom: 20rpx; }
  .save { background: $pm-d1; color: #fff; font-size: 30rpx; font-weight: 700; border-radius: 16rpx; line-height: 88rpx; }
}
</style>
```

### Task 8: 支付方式页 编辑+删除+启停+前提提示

**Files:**
- Modify: `web-admin/src/pages/payment/methods/index.vue`

- [ ] 在现有启停基础补编辑/删除/前提提示（复用 Task 7 表单模式，删除改 `onDel`）

```vue
<!-- 模板：<template> 内卡片顶部加 .hint；row 左名/code，右侧 switch；ops 编辑/删除；底部 sheet 表单 -->
<view class="hint">前提配置：先配好支付方式，才可在「支付档案」引用。</view>
```
并在 script 引入 `updatePaymentMethod, deletePaymentMethod`，加 `openEdit/save/onDel`（同 Task 7，保存调 `updatePaymentMethod`，删除调 `deletePaymentMethod`）。

### Task 9: 本地构建 + 提交 + 部署 qing

- [ ] 构建并验证 dist

Run (web-admin):
```
npm run build:h5
```
验证 dist/build/h5 含新 chunk（`Select-String` 可能漏大 chunk，用 `Get-ChildItem dist/build/h5/assets -Filter 'pages-*'` 看 keys）。

- [ ] 提交 git
```
git add -A; git commit -m "feat(web-admin): 统一配色规范重构抽屉/工作台 + 配送支付编辑删除启停"
git push
```

- [ ] 部署静态站到 `e.joho.cn/guanli`（ssh `qing`）
```
cd dist/build/h5 && tar -cf /tmp/out.tar .
scp /tmp/out.tar qing:/tmp/
ssh qing "cd /www/sites/e.joho.cn/guanli && cp -r . .bak_$(date +%s) && rm -rf assets && tar -xf /tmp/out.tar"
```
验证 curl `/guanli/`、`/guanli/assets/pages-*` 200。