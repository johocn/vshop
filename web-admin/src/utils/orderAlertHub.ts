// 全局新订单提醒 Hub（H5 专用，DOM 注入挂 body，任意页面生效；对齐 h5Nav.ts 模式）
// 轮询 newOrderSignal(30s)：受限核销员按档案白名单口径（后端决定），其余为本店渠道。
// localStorage: orderAlertLastPlacedAt（防刷新重播）、orderAlertMuted（语音开关）
import { useAuthStore } from '../stores/authStore';
import { useLocaleStore } from '../stores/localeStore';
import { fetchNewOrderSignal } from '../apis/order';

const LS_LAST = 'orderAlertLastPlacedAt';
const LS_MUTE = 'orderAlertMuted';
const HIDDEN_ROUTES = new Set(['pages/login/index', 'pages/channel-select/index', 'pages/change-password/index']);
const ORDERS_URL = '/pages/order/list/index';
let booted = false;

function currentRoute(): string {
  try {
    const pages = getCurrentPages();
    const last = pages[pages.length - 1] as { route?: string } | undefined;
    return last?.route || '';
  } catch {
    return '';
  }
}

export function startOrderAlertHub() {
  if (typeof window === 'undefined' || booted) return;
  booted = true;

  const auth = useAuthStore();
  const locale = useLocaleStore();
  let unread = 0;

  // ---- DOM：顶部横幅 + 右下铃铛角标 + 铃铛菜单 ----
  const banner = document.createElement('div');
  banner.style.cssText =
    'position:fixed;top:8px;left:50%;transform:translateX(-50%) translateY(-120%);z-index:9999;' +
    'display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #0ab861;border-radius:10px;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.12);padding:8px 12px;font-size:14px;color:#1a1f2b;' +
    'transition:transform .25s;max-width:92vw;';
  const bell = document.createElement('div');
  bell.setAttribute('role', 'button');
  bell.style.cssText =
    'position:fixed;right:12px;bottom:64px;z-index:9999;width:34px;height:34px;border-radius:50%;' +
    'background:#fff;border:1px solid #d8dee9;box-shadow:0 2px 6px rgba(0,0,0,.14);' +
    'display:none;align-items:center;justify-content:center;font-size:17px;cursor:pointer;';
  bell.innerHTML = '&#128276;<span class="wa-badge" style="position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;' +
    'border-radius:999px;background:#0ab861;color:#fff;font-size:10px;line-height:16px;text-align:center;padding:0 3px;display:none;"></span>';
  const menu = document.createElement('div');
  menu.style.cssText =
    'position:fixed;right:12px;bottom:104px;z-index:9999;width:150px;background:#fff;border:1px solid #e5e8ef;' +
    'border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.16);padding:4px;display:none;flex-direction:column;';
  document.body.appendChild(banner);
  document.body.appendChild(bell);
  document.body.appendChild(menu);

  const badge = () => bell.querySelector('.wa-badge') as HTMLElement;
  function syncMuteItem() {
    const mute = localStorage.getItem(LS_MUTE) === '1';
    menu.innerHTML =
      `<div class="wa-mi" data-act="mute" style="padding:9px 10px;border-radius:8px;font-size:13px;cursor:pointer;">${mute ? locale.t('orderAlert.voiceOff') : locale.t('orderAlert.voiceOn')}</div>` +
      `<div class="wa-mi" data-act="go" style="padding:9px 10px;border-radius:8px;font-size:13px;cursor:pointer;">${locale.t('orderAlert.goOrders')}</div>`;
  }
  syncMuteItem();
  menu.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('.wa-mi') as HTMLElement | null;
    if (!el) return;
    if (el.dataset.act === 'mute') {
      localStorage.setItem(LS_MUTE, localStorage.getItem(LS_MUTE) === '1' ? '0' : '1');
      syncMuteItem();
    } else {
      setMenu(false);
      uni.navigateTo({ url: ORDERS_URL });
    }
  });
  bell.addEventListener('click', () => setMenu(menu.style.display === 'none'));
  document.addEventListener('click', (e) => {
    if (!bell.contains(e.target as Node) && !menu.contains(e.target as Node)) setMenu(false);
  });
  function setMenu(open: boolean) { menu.style.display = open ? 'flex' : 'none'; }

  function showBanner(n: number) {
    const t = locale.t('orderAlert.banner').replace('{n}', String(n));
    banner.innerHTML =
      `<span style="flex:1">${n > 1 ? t : locale.t('orderAlert.bannerOne')}</span>` +
      `<span class="wa-view" style="color:#fff;background:#0ab861;border-radius:999px;padding:3px 12px;cursor:pointer;flex-shrink:0;">${locale.t('orderAlert.view')}</span>` +
      `<span class="wa-x" style="color:#6a7480;cursor:pointer;flex-shrink:0;">&#10005;</span>`;
    banner.querySelector('.wa-view')!.addEventListener('click', () => {
      hideBanner();
      uni.navigateTo({ url: ORDERS_URL });
    });
    banner.querySelector('.wa-x')!.addEventListener('click', hideBanner);
    banner.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(hideBanner, 8000);
  }
  function hideBanner() { banner.style.transform = 'translateX(-50%) translateY(-120%)'; }

  function speak() {
    if (localStorage.getItem(LS_MUTE) === '1') return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance('您有新的订单，请及时处理');
      u.lang = 'zh-CN';
      u.rate = 1;
      synth.speak(u);
    } catch { /* TTS 不可用 → 仅横幅 */ }
  }

  // 首次交互预解锁 TTS（自动播放策略）
  const unlock = () => {
    try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance(' ')); } catch { /* noop */ }
    document.removeEventListener('pointerdown', unlock);
  };
  document.addEventListener('pointerdown', unlock, { once: true });

  function setUnread(n: number) {
    unread = n;
    const b = badge();
    if (!b) return;
    b.textContent = String(n);
    b.style.display = n > 0 ? 'block' : 'none';
  }

  // ---- 轮询 ----
  async function tick() {
    const route = currentRoute();
    if (!auth.isAuthed || HIDDEN_ROUTES.has(route)) {
      bell.style.display = 'none';
      hideBanner();
      return;
    }
    bell.style.display = 'flex';
    try {
      const last = localStorage.getItem(LS_LAST);
      const since = last || new Date(Date.now() - 30_000).toISOString();
      const sig = await fetchNewOrderSignal(since);
      if (sig.latestPlacedAt) {
        // 首轮（无 last）只记 baseline 不提醒，避免刷新/登录后重播历史订单
        if (last && sig.latestPlacedAt > last && sig.count > 0) {
          setUnread(unread + sig.count);
          showBanner(sig.count);
          speak();
        }
        localStorage.setItem(LS_LAST, sig.latestPlacedAt);
      }
    } catch { /* 静默重试下一轮 */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
  tick();
  setInterval(tick, 30_000);
}
