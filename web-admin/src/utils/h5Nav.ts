// H5 端体验增强：悬浮「返回首页」按钮 + 面板页返回退出确认
// 仅适用于 uni-app H5（UNI_PLATFORM === 'h5'），原生/小程序不启用。

const PANEL_PAGES = new Set(['pages/channel-select/index', 'pages/dashboard/index']);
const HIDDEN_PAGES = new Set(['pages/login/index', 'pages/change-password/index']);
// 左上角返回图标：首页(工作台)与本页相同入口以外都不显示（工作台顶部已有「☰」菜单与浏览器返回退出确认）
const NO_BACK_PAGES = new Set(['pages/dashboard/index']);

let booted = false;

// 退出/取消确认（复用：浏览器返回面板页 + 顶层子页点返回无上级两种入口）
function confirmExit() {
  uni.showModal({
    title: '离开后台',
    content: '要返回登录页并退出当前账号吗？',
    confirmText: '退出',
    cancelText: '取消',
    confirmColor: '#e64340',
    success(res) {
      if (res.confirm) {
        uni.reLaunch({ url: '/pages/login/index' });
      }
    },
  });
}

function currentRoute(): string {
  try {
    const pages = getCurrentPages();
    const last = pages[pages.length - 1] as { route?: string } | undefined;
    return last?.route || '';
  } catch {
    return '';
  }
}

function isPanel(): boolean {
  return PANEL_PAGES.has(currentRoute());
}

export function enableH5Nav(_opts: { hasStore: () => boolean }) {
  if (typeof window === 'undefined' || booted) return;
  booted = true;

  // ---------- 1. 右下角半隐藏「高频快捷入口」：透明三点、可拖拽移动并记忆位置、轻触弹出面板 ----------
  const QUICK_ITEMS = [
    { label: '工作台', url: '/pages/dashboard/index', home: true },
    { label: '订单', url: '/pages/order/list/index' },
    { label: '到店自提核销', url: '/pages/pickup/redeem/index' },
    { label: '门店收银', url: '/pages/pos/index' },
    { label: '数据看板', url: '/pages/data/dashboard/index' },
    { label: '收款台账', url: '/pages/settle/ledger/index' },
  ];
  const QUICK_HIDDEN = new Set(['pages/login/index', 'pages/change-password/index', 'pages/channel-select/index']);
  const POS_KEY = 'wa_quick_pos';

  const qwrap = document.createElement('div');
  qwrap.style.cssText =
    'position:fixed;z-index:9998;display:flex;flex-direction:column;align-items:flex-end;user-select:none;';
  // 触钮：透明三点（无背景/边框/阴影）
  const qdot = document.createElement('div');
  qdot.setAttribute('role', 'button');
  qdot.setAttribute('aria-label', '高频快捷入口');
  qdot.style.cssText =
    'display:flex;align-items:center;justify-content:center;min-width:30px;height:30px;' +
    'font-size:22px;line-height:22px;letter-spacing:1px;color:#6a7480;cursor:grab;' +
    'background:transparent;touch-action:none;';
  qdot.innerHTML = '&hellip;';
  // 快捷面板
  const qsheet = document.createElement('div');
  qsheet.style.cssText =
    'position:absolute;right:0;bottom:32px;width:204px;background:#fff;border-radius:14px;' +
    'box-shadow:0 12px 32px rgba(0,0,0,.16);border:1px solid #e5e8ef;padding:8px;' +
    'display:none;flex-direction:column;';
  QUICK_ITEMS.forEach((it) => {
    const row = document.createElement('div');
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', it.label);
    row.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:10px;' +
      'cursor:pointer;font-size:14px;color:#1a1f2b;';
    row.innerHTML =
      '<span style="width:26px;height:26px;border-radius:8px;background:#2f6bff;color:#fff;' +
      'display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">&#8962;</span>' +
      '<span>' + it.label + '</span>';
    row.addEventListener('mouseenter', () => { row.style.background = '#f4f6fa'; });
    row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
    row.addEventListener('click', () => {
      setQuick(false);
      if (it.home) { uni.reLaunch({ url: it.url }); } else { uni.navigateTo({ url: it.url }); }
    });
    qsheet.appendChild(row);
  });
  qwrap.appendChild(qsheet);
  qwrap.appendChild(qdot);
  document.body.appendChild(qwrap);

  function clampPos(x: number, y: number): [number, number] {
    const w = qwrap.clientWidth, h = qwrap.clientHeight;
    x = Math.max(0, Math.min(x, window.innerWidth - w));
    y = Math.max(0, Math.min(y, window.innerHeight - h));
    return [x, y];
  }
  function place(x: number, y: number) {
    const [cx, cy] = clampPos(x, y);
    qwrap.style.left = cx + 'px';
    qwrap.style.top = cy + 'px';
  }
  // 初始位置：右缘贴近（刚能看到三个点）+ 紧贴底部导航栏(100rpx≈视口/750*100)上沿；如已存手动位置则恢复
  (function initPos() {
    try {
      const p = localStorage.getItem(POS_KEY);
      if (p) {
        const [x, y] = p.split(',').map(Number);
        if (Number.isFinite(x) && Number.isFinite(y)) { place(x, y); return; }
      }
    } catch { /* 忽略 */ }
    const dot = qdot.getBoundingClientRect();
    const rpx = window.innerWidth / 750;
    const tabH = 100 * rpx;
    place(window.innerWidth - dot.width - 4, window.innerHeight - tabH - dot.height + 2);
  })();

  let moved = false;
  let ox = 0, oy = 0, px0 = 0, py0 = 0;
  qdot.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = qwrap.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    px0 = e.clientX; py0 = e.clientY; moved = false;
    try { (qdot as any).setPointerCapture(e.pointerId); } catch { /* noop */ }
  });
  qdot.addEventListener('pointermove', (e: PointerEvent) => {
    if (Math.abs(e.clientX - px0) + Math.abs(e.clientY - py0) < 6) return; // 抖动阈值内视为点击
    moved = true;
    place(e.clientX - ox, e.clientY - oy);
  });
  qdot.addEventListener('pointerup', (e: PointerEvent) => {
    try { (qdot as any).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (moved) {
      try { localStorage.setItem(POS_KEY, `${Math.round(qwrap.offsetLeft)},${Math.round(qwrap.offsetTop)}`); } catch { /* noop */ }
      setQuick(false);
      return;
    }
    setQuick(qsheet.style.display === 'none');
  });

  function setQuick(open: boolean) {
    qsheet.style.display = open ? 'flex' : 'none';
    qdot.style.color = open ? '#2f6bff' : '#6a7480';
  }
  document.addEventListener('click', (e: MouseEvent) => {
    if (e.target !== qdot && !qsheet.contains(e.target as Node)) setQuick(false);
  });

  function syncQuick() {
    const r = currentRoute();
    qwrap.style.display = QUICK_HIDDEN.has(r) ? 'none' : 'flex';
  }
  syncQuick();
  setInterval(syncQuick, 600);

  // ---------- 3. 左上角「返回上一级」图标（首页之外任意页面） ----------
  const back = document.createElement('div');
  back.setAttribute('role', 'button');
  back.setAttribute('aria-label', '返回上一级');
  // 置于系统导航条下方浮动；用 --window-top 适应有无原生导航栏的差异
  back.style.cssText =
    'position:fixed;left:12px;top:calc(var(--window-top, 44px) + 10px);' +
    'width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.96);' +
    'border:1px solid #d8dee9;box-shadow:0 2px 6px rgba(0,0,0,.14);' +
    'display:flex;align-items:center;justify-content:center;' +
    'font-size:19px;color:#2f6bff;font-weight:700;line-height:1;' +
    'z-index:9998;cursor:pointer;user-select:none;';
  back.innerHTML = '&#8592;';
  document.body.appendChild(back);

  function syncBack() {
    const r = currentRoute();
    back.style.display = HIDDEN_PAGES.has(r) || NO_BACK_PAGES.has(r) ? 'none' : 'flex';
  }
  back.addEventListener('click', () => {
    const pages = getCurrentPages();
    // 有上级页面：逐级回退（可一路返回至工作台/首页）
    if (pages.length > 1) {
      uni.navigateBack();
      return;
    }
    // 已处于顶层无上级可回：弹出退出/取消确认
    confirmExit();
  });
  syncBack();
  setInterval(syncBack, 600);

  // ---------- 2b. 面板页（工作台/选店）浏览器返回 -> 退出确认 ----------
  let confirming = false;
  window.addEventListener('popstate', () => {
    if (!isPanel() || confirming) return;
    confirming = true;
    // 撤销本次浏览器回退，先停留在面板页；是否离开由用户决定
    window.history.pushState(window.history.state, '');
    uni.showModal({
      title: '离开后台',
      content: '要返回登录页并退出当前账号吗？',
      confirmText: '退出',
      cancelText: '取消',
      confirmColor: '#e64340',
      success(res) {
        confirming = false;
        if (res.confirm) {
          uni.reLaunch({ url: '/pages/login/index' });
        }
      },
    });
  });
}