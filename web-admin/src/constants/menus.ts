// 后台功能菜单唯一数据源：Drawer、工作台首页共用，保证两处入口一致
import { D } from '../theme';

export interface MenuItem {
  label: string;
  url?: string;
  tier: 1 | 2 | 3;
  action?: string;
}
export interface MenuGroup {
  domain: string;
  color: string;
  grad: string;
  items: MenuItem[];
}

// 权限校验所需的最小接口（与 authStore 对齐，解耦具体 store）
export interface MenuAuthLite {
  isSuperAdmin: boolean;
  hasPermission(p: string): boolean;
}

export const menuGroups: MenuGroup[] = [
  {
    domain: 'menu.domain.product',
    color: D.d1.main,
    grad: D.d1.grad,
    items: [
      { label: 'menu.category', url: '/pages/product/categories/index', tier: 1 },
      { label: 'menu.productCreate', url: '/pages/product/create/index', tier: 1 },
      { label: 'menu.productList', url: '/pages/product/list/index', tier: 1 },
      { label: 'menu.stockWarning', url: '/pages/inventory/stock/index', tier: 2 },
      { label: 'menu.purchaseIn', url: '/pages/inventory/stock-doc/purchase/index', tier: 2 },
      { label: 'menu.transfer', url: '/pages/inventory/stock-doc/transfer/index', tier: 2 },
      { label: 'menu.stocktake', url: '/pages/inventory/stock-doc/stocktake/index', tier: 2 },
      { label: 'menu.manualIssue', url: '/pages/inventory/stock-doc/issue/index', tier: 2 },
      { label: 'menu.stockMovements', url: '/pages/inventory/movements/index', tier: 2 },
      { label: 'menu.locationManage', url: '/pages/inventory/locations/index', tier: 2 },
      { label: 'menu.mediaLibrary', url: '/pages/media/library/index', tier: 3 },
    ],
  },
  {
    domain: 'menu.domain.trade',
    color: D.d2.main,
    grad: D.d2.grad,
    items: [
      { label: 'menu.order', url: '/pages/order/list/index', tier: 1 },
      { label: 'menu.picking', url: '/pages/order/picking/index', tier: 2 },
      { label: 'menu.ship', url: '/pages/order/ship/index', tier: 2 },
      { label: 'menu.afterSale', url: '/pages/after-sale/list/index', tier: 2 },
      { label: 'menu.pos', url: '/pages/pos/index', tier: 2 },
      { label: 'menu.settleLedger', url: '/pages/settle/ledger/index', tier: 3 },
    ],
  },
  {
    domain: 'menu.domain.fulfillment',
    color: D.d3.main,
    grad: D.d3.grad,
    items: [
      { label: 'menu.shippingMethod', url: '/pages/shipping/methods/index', tier: 2 },
      { label: 'menu.paymentMethod', url: '/pages/payment/methods/index', tier: 2 },
      { label: 'menu.pickup', url: '/pages/pickup/index', tier: 2 },
      { label: 'menu.pickupRedeem', url: '/pages/pickup/redeem/index', tier: 2 },
      { label: 'menu.shippingProfile', url: '/pages/shipping/profile/index', tier: 3 },
      { label: 'menu.paymentProfile', url: '/pages/payment/profile/index', tier: 3 },
    ],
  },
  {
    domain: 'menu.domain.decorate',
    color: D.d4.main,
    grad: D.d4.grad,
    items: [
      { label: 'menu.decorateHome', url: '/pages/decorate/home/index', tier: 1 },
      { label: 'menu.decorateProduct', url: '/pages/decorate/product/index', tier: 2 },
      { label: 'menu.decorateCategory', url: '/pages/decorate/category/index', tier: 2 },
      { label: 'menu.decorateCart', url: '/pages/decorate/cart/index', tier: 2 },
      { label: 'menu.decorateProfile', url: '/pages/decorate/profile/index', tier: 2 },
      { label: 'menu.themeStyle', url: '/pages/decorate/theme/index', tier: 3 },
      { label: 'menu.shopInfo', url: '/pages/decorate/shop-info/index', tier: 3 },
    ],
  },
  {
    domain: 'menu.domain.marketing',
    color: D.d5.main,
    grad: D.d5.grad,
    items: [
      { label: 'menu.couponIssue', url: '/pages/coupon/index', tier: 1 },
      { label: 'menu.couponTargeted', url: '/pages/coupon/issue/index', tier: 3 },
    ],
  },
  {
    domain: 'menu.domain.distribution',
    color: D.d5.main,
    grad: D.d5.grad,
    items: [
      { label: 'menu.distributionRelations', url: '/pages/distribution/relations/index', tier: 2 },
      { label: 'menu.distributionSettle', url: '/pages/distribution/settle/index', tier: 2 },
    ],
  },
  {
    domain: 'menu.domain.system',
    color: D.d6.main,
    grad: D.d6.grad,
    items: [
      { label: 'menu.dataDashboard', url: '/pages/data/dashboard/index', tier: 2 },
      { label: 'menu.manual', tier: 3, action: 'manual' },
      { label: 'menu.switchStore', tier: 3, action: 'switchStore' },
      { label: 'menu.logout', tier: 3, action: 'logout' },
    ],
  },
];

// 平台管理组：按权限渲染（仅持有对应权限者可见）
export function buildPlatformGroup(auth: MenuAuthLite): MenuGroup | null {
  const items: MenuItem[] = [];
  if (auth.isSuperAdmin || auth.hasPermission('TenantManage')) {
    items.push({ label: 'menu.tenantList', url: '/pages/platform/tenants/index', tier: 1 });
  }
  if (auth.hasPermission('TenantRoleManage')) {
    items.push({ label: 'menu.roleManage', url: '/pages/platform/roles/index', tier: 2 });
  }
  if (auth.hasPermission('TenantMemberManage')) {
    items.push({ label: 'menu.memberManage', url: '/pages/platform/members/index', tier: 2 });
  }
  if (auth.isSuperAdmin || auth.hasPermission('UpdateProduct')) {
    items.push({ label: 'menu.roomTemplates', url: '/pages/platform/room-templates/index', tier: 3 });
  }
  if (auth.isSuperAdmin || auth.hasPermission('ShopTemplatesRead')) {
    items.push({ label: 'menu.styleTemplates', url: '/pages/platform/templates/index', tier: 3 });
  }
  if (auth.isSuperAdmin || auth.hasPermission('ShopTemplatesUpdate')) {
    items.push({ label: 'menu.globalConfig', url: '/pages/platform/global-config/index', tier: 3 });
  }
  if (auth.isSuperAdmin || auth.hasPermission('UpdateProduct')) {
    items.push({ label: 'menu.productApproval', url: '/pages/platform/product-approval/index', tier: 3 });
  }
  if (auth.isSuperAdmin || auth.hasPermission('ReadOrder')) {
    items.push({ label: 'menu.reconcile', url: '/pages/platform/reconcile/index', tier: 3 });
  }
  if (!items.length) return null;
  return { domain: 'menu.domain.platform', color: D.d7.main, grad: D.d7.grad, items };
}

export function visibleMenus(auth: MenuAuthLite): MenuGroup[] {
  const pg = buildPlatformGroup(auth);
  return [...menuGroups, ...(pg ? [pg] : [])];
}