# Checkout Tab 配送方式选择 + 自提点变更弹窗设计

- 日期：2026-07-26
- 范围：`vshop` 前端
- 涉及文件：`src/pkg-order/pages/checkout.vue`、`src/components/PickupLocationSheet.vue`（新增）

## 1. 背景与目标

### 1.1 现状问题

`src/pkg-order/pages/checkout.vue` 当前实现存在两个问题：

1. 配送方式为单选 radio 列表 + 条件渲染自提点区域，层级不清晰，用户无法"先选配送方式，再选自提点"。
2. 自提点列表直接渲染在页面上，无"查看更多/切换"弹窗。`getPickupLocations` 返回按距离排序的全部自提点，页面只展示前几条，用户无法浏览全部或重新筛选，无法变更已选自提点。

### 1.2 目标

- 顶部用分段控件（Segmented Control / Tab）展示当前租户启用的配送方式类型，切换即选中该配送方式。
- 切换 Tab 后自动加载对应类型的自提点列表，默认选中最近的一个。
- 自提点卡片支持"更换"操作，弹出底部抽屉展示全部自提点，支持搜索、分页加载（每页 15 条）。

### 1.3 已确认的现状（无需改动）

- 配送方式/支付方式已按租户（Channel）筛选：后端 `eligibleShippingMethods` / `eligiblePaymentMethods` 基于 `ctx.channel` 过滤，前端直接消费。
- 自提点距离排序已实现：`pickup-location-shop.resolver.ts` 在传入 `lat/lng` 时调用 `sortByDistance`（haversine 公式）。
- 定位回退已实现：`resolveLocation` 定位 3 秒超时后回退到 `tenant.defaultLocation`。
- `setOrderPickupLocation` mutation 支持随时调用变更，同步更新 `Order.customFields.selectedPickupLocationId` 和 shipping address。

## 2. 架构与改动范围

**纯前端重构，后端零改动。**

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/pkg-order/pages/checkout.vue` | 修改 | 重构配送方式为 Tab，接入弹窗 |
| `src/components/PickupLocationSheet.vue` | 新增 | 自提点选择弹窗组件 |

复用现有 API：`getPickupLocations`、`getEmployeePickupLocations`、`setOrderPickupLocation`、`setOrderShippingMethod`、`resolveLocation`。

## 3. 详细设计

### 3.1 Tab 分段控件

将 `shippingMethods` 按 `categorizeShipping` 归类为 4 类：

| category | 标签 | 对应 shipping method code |
|----------|------|---------------------------|
| `shipping` | 快递配送 | 非 store-pickup / pickup-point / employee-pickup |
| `store-pickup` | 门店自提 | `store-pickup` |
| `point-pickup` | 菜鸟驿站 | `pickup-point` |
| `employee-pickup` | 职工自提 | `employee-pickup` |

规则：
- **只渲染存在的 Tab**：某租户未启用某类型则不显示该 Tab。
- **切换即选中**：切换 Tab 时调用 `setOrderShippingMethod([sm.id])` 选中该配送方式。
- **移除原 radio 列表**：配送方式不再以 radio 展示，改由 Tab 承载。
- **初始默认选中**：`onMounted` 后默认选第一个 Tab（保持现有"第一个配送方式"的默认行为）。

分组逻辑：

```typescript
const shippingTabs = computed(() => {
    const tabs: { category: ShippingCategory; label: string; method: any }[] = [];
    for (const sm of shippingMethods.value) {
        const cat = categorizeShipping(sm);
        if (!tabs.find(t => t.category === cat)) {
            tabs.push({ category: cat, label: tabLabel(cat), method: sm });
        }
    }
    return tabs;
});

function tabLabel(cat: ShippingCategory): string {
    const labels: Record<ShippingCategory, string> = {
        shipping: '快递配送',
        'store-pickup': '门店自提',
        'point-pickup': '菜鸟驿站',
        'employee-pickup': '职工自提',
    };
    return labels[cat] || '配送方式';
}
```

### 3.2 Tab 切换流程

切换 Tab 时执行：
1. 设置 `selectedShipping = tab.method.id`
2. 设置 `shippingCategory = tab.category`
3. 清空 `selectedPickupLocation = null`
4. 若为非快递类型：
   - 调用 `resolveLocation()` 获取定位（3 秒超时 → 回退 `tenant.defaultLocation`）
   - 调用 `getPickupLocations(type, location)` 或 `getEmployeePickupLocations(location)` 加载自提点
   - 默认选中第一条（最近的自提点）
5. 调用 `setOrderShippingMethod([tab.method.id])` 同步到后端

用 `watch(activeTab)` 驱动，替代现有的 `watch(selectedShipping)`。

**`getPickupLocations` type 参数映射**：
- `store-pickup` → `type='store'`
- `point-pickup` → `type='point'`
- `employee-pickup` → 调 `getEmployeePickupLocations`（无 type 参数）

**`setOrderPickupLocation` 的 `pickupType` 参数**：保持现有行为，传 `shippingCategory` 值（如 `'store-pickup'`）。后端 `pickupType` 为自由字符串字段，仅存储不校验，与后端 calculator metadata 的 `'store'`/`'point'` 不一致属现有行为，本次不修复。

### 3.3 自提点选择弹窗（PickupLocationSheet.vue）

**组件契约**：

```typescript
// Props
interface Props {
    visible: boolean;
    locations: PickupLocation[];   // 父组件已加载的全部自提点（已按距离排序）
    selectedId?: string;
    userLocation?: { lat: number; lng: number } | null;  // 用于计算距离显示
    title?: string;                  // 默认"选择自提点"
}

// Emits
interface Emits {
    (e: 'update:visible', val: boolean): void;
    (e: 'select', location: PickupLocation): void;
}
```

**UI 结构**：
- 底部抽屉（ActionSheet 样式），从底部滑入，顶部圆角
- 遮罩层半透明黑色，点击关闭
- 顶部标题栏：标题 + 关闭按钮
- 搜索框：实时过滤，匹配名称或地址（前端过滤）
- 列表：自提点卡片，显示名称、地址、距离（km）、营业时间，选中态高亮
- 分页：每页 15 条，滚动到底自动加载下一批（前端 slice 已加载的全部数据）
- 选中自提点后高亮，点击底部"确认"按钮关闭弹窗并 emit select（避免浏览分页时误触关闭）

**分页逻辑**：

```typescript
const pageSize = 15;
const currentPage = ref(1);
const filteredLocations = computed(() => {
    const kw = keyword.value.trim();
    if (!kw) return props.locations;
    return props.locations.filter(l =>
        l.name.includes(kw) || l.address.includes(kw)
    );
});
const pagedLocations = computed(() => filteredLocations.value.slice(0, currentPage.value * pageSize));
function loadMore() {
    if (pagedLocations.value.length < filteredLocations.value.length) {
        currentPage.value++;
    }
}
function onKeywordChange() { currentPage.value = 1; }
```

**距离显示**：`PickupLocation` 实体已包含 `coordinates` 字段。弹窗接收 `userLocation`（父组件定位结果）作为 prop，用 haversine 公式计算距离并展示。若 `userLocation` 为空（定位失败且无默认坐标）则不显示距离，按后端返回顺序展示。父组件传入的 `locations` 已由后端按距离排序，弹窗保持该顺序。

### 3.4 数据流与状态管理

| 状态 | 位置 | 触发 | 变更 |
|------|------|------|------|
| `shippingTabs` | checkout.vue computed | `shippingMethods` 变化 | 重新分组 |
| `activeTab` | checkout.vue ref | Tab 切换 | 设置 `selectedShipping`，清空 `selectedPickupLocation`，加载自提点 |
| `pickupLocations` | checkout.vue ref | Tab 切换（非快递） | 调 `getPickupLocations` 填充 |
| `selectedPickupLocation` | checkout.vue ref | 弹窗选中 | 更新卡片展示 |
| `showPickupSheet` | checkout.vue ref | 点击"更换" | 控制弹窗显隐 |

### 3.5 页面布局

```
┌─────────────────────────────┐
│ Tab: 快递 | 门店 | 菜鸟 | 职工 │  ← Segmented Control
├─────────────────────────────┤
│ [快递] 收货地址卡片          │  ← shipping category 条件渲染
│ [自提] 已选自提点卡片 + 更换  │
├─────────────────────────────┤
│ 支付方式 radio 列表          │  ← 保持不变
├─────────────────────────────┤
│ 订单摘要                     │
├─────────────────────────────┤
│ [提交订单]                   │
└─────────────────────────────┘
```

自提点卡片：
- 名称（粗体）
- 地址（灰色小字）
- 距离 + 营业时间（橙色标签）
- "更换自提点 ▾" 按钮（品牌色，点击弹窗）

## 4. 错误处理与边界

| 场景 | 处理 |
|------|------|
| 无可用自提点 | Tab 内显示"暂无可用自提点"空状态 |
| 职工未绑定（strict 模式） | 显示"您尚未绑定企业职工身份"提示 + 联系客服引导 |
| 定位失败且无默认坐标 | 传 `location=undefined`，后端返回未排序列表 |
| 提交时未选自提点 | toast 拦截"请选择自提点"（保留现有逻辑） |
| 弹窗搜索无结果 | 显示"未找到匹配的自提点" |
| 弹窗分页到底 | 无更多加载，不显示加载提示 |

## 5. 测试要点

- 多租户 Tab 数量正确（default 启用全部，其他租户按配置）
- Tab 切换后自提点列表刷新且默认选中第一条
- 弹窗分页：15 条后滚动加载下一批
- 弹窗搜索：按名称/地址过滤，重置分页
- 职工自提 strict 模式未绑定时显示提示
- 定位超时回退默认坐标后自提点按默认坐标排序
- 提交订单后 `setOrderPickupLocation` 正确写入 `selectedPickupLocationId` 和 `pickupType`
- 切换 Tab 后 `setOrderShippingMethod` 正确同步到后端

## 6. 非目标（YAGNI）

- 不做自提点地图展示（后端 `coordinates` 已有，但本期不做地图）
- 不做自提点详情页（营业时间、电话已在列表卡片展示）
- 不做后端 `getPickupLocations` 分页改造（返回全部，前端分页）
- 不做支付方式 Tab 化（保持 radio 列表）
