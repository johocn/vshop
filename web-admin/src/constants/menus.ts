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
    domain: '商品',
    color: D.d1.main,
    grad: D.d1.grad,
    items: [
      { label: '分类', url: '/pages/product/categories/index', tier: 1 },
      { label: '＋新增商品', url: '/pages/product/create/index', tier: 1 },
      { label: '商品列表', url: '/pages/product/list/index', tier: 1 },
      { label: '库存预警', url: '/pages/inventory/stock/index', tier: 2 },
      { label: '图片库', url: '/pages/media/library/index', tier: 3 },
    ],
  },
  {
    domain: '交易',
    color: D.d2.main,
    grad: D.d2.grad,
    items: [
      { label: '订单', url: '/pages/order/list/index', tier: 1 },
      { label: '发货', url: '/pages/order/ship/index', tier: 2 },
      { label: '售后', url: '/pages/after-sale/list/index', tier: 2 },
      { label: '门店收银', url: '/pages/pos/index', tier: 2 },
      { label: '收款台账', url: '/pages/settle/ledger/index', tier: 3 },
    ],
  },
  {
    domain: '履约',
    color: D.d3.main,
    grad: D.d3.grad,
    items: [
      { label: '配送方式', url: '/pages/shipping/methods/index', tier: 2 },
      { label: '支付方式', url: '/pages/payment/methods/index', tier: 2 },
      { label: '自提点', url: '/pages/pickup/index', tier: 2 },
      { label: '到店自提核销', url: '/pages/pickup/redeem/index', tier: 2 },
      { label: '配送档案', url: '/pages/shipping/profile/index', tier: 3 },
      { label: '支付档案', url: '/pages/payment/profile/index', tier: 3 },
    ],
  },
  {
    domain: '装修',
    color: D.d4.main,
    grad: D.d4.grad,
    items: [
      { label: '首页装修', url: '/pages/decorate/home/index', tier: 1 },
      { label: '主题风格', url: '/pages/decorate/theme/index', tier: 3 },
      { label: '店铺信息', url: '/pages/decorate/shop-info/index', tier: 3 },
    ],
  },
  {
    domain: '营销',
    color: D.d5.main,
    grad: D.d5.grad,
    items: [
      { label: '优惠券发行', url: '/pages/coupon/index', tier: 1 },
      { label: '定向发券', url: '/pages/coupon/issue/index', tier: 3 },
    ],
  },
  {
    domain: '分销',
    color: D.d5.main,
    grad: D.d5.grad,
    items: [
      { label: '分销关系', url: '/pages/distribution/relations/index', tier: 2 },
      { label: '佣金结算', url: '/pages/distribution/settle/index', tier: 2 },
    ],
  },
  {
    domain: '系统',
    color: D.d6.main,
    grad: D.d6.grad,
    items: [
      { label: '数据看板', url: '/pages/data/dashboard/index', tier: 2 },
      { label: '使用手册', tier: 3, action: 'manual' },
      { label: '切换店铺', tier: 3, action: 'switchStore' },
      { label: '退出登录', tier: 3, action: 'logout' },
    ],
  },
];

// 平台管理组：按权限渲染（仅持有对应权限者可见）
export function buildPlatformGroup(auth: MenuAuthLite): MenuGroup | null {
  const items: MenuItem[] = [];
  if (auth.isSuperAdmin || auth.hasPermission('TenantManage')) {
    items.push({ label: '租户列表', url: '/pages/platform/tenants/index', tier: 1 });
  }
  if (auth.hasPermission('TenantRoleManage')) {
    items.push({ label: '角色管理', url: '/pages/platform/roles/index', tier: 2 });
  }
  if (auth.hasPermission('TenantMemberManage')) {
    items.push({ label: '人员管理', url: '/pages/platform/members/index', tier: 2 });
  }
  if (auth.isSuperAdmin || auth.hasPermission('UpdateProduct')) {
    items.push({ label: '商品审批', url: '/pages/platform/product-approval/index', tier: 3 });
  }
  if (!items.length) return null;
  return { domain: '平台', color: D.d7.main, grad: D.d7.grad, items };
}

export function visibleMenus(auth: MenuAuthLite): MenuGroup[] {
  const pg = buildPlatformGroup(auth);
  return [...menuGroups, ...(pg ? [pg] : [])];
}