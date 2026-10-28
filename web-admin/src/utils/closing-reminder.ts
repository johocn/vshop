// 打烊前提醒（商家端 H5）：工作台 / 经营设置轮询到「下一次切换 = 打烊」且进入 15 分钟窗口时，
// 顶部横幅 + 语音提醒一次。同一切换时刻只提醒一次（localStorage 记忆，多标签页共用）。
// 与 orderAlertHub 的新订单提醒互不干扰：各自独立的横幅 / TTS 锁 / 静音开关。
import { useLocaleStore } from '../stores/localeStore';
import type { CampusBusinessTransition } from '../apis/campus';

/** 打烊前多少分钟开始提醒 */
export const CLOSING_WARN_MIN = 15;
const LS_FIRED = 'closingWarnFiredAt';
const LS_MUTE = 'closingWarnMuted';
const LS_TTS_LOCK = 'closingWarnTtsLock';

let banner: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** 打烊提醒开关（经营设置页可见，默认开） */
export function closingWarnEnabled(): boolean {
  try { return localStorage.getItem(LS_MUTE) !== '1'; } catch { return true; }
}

export function setClosingWarnEnabled(on: boolean): void {
  try { localStorage.setItem(LS_MUTE, on ? '0' : '1'); } catch { /* 隐私模式忽略 */ }
}

function hideBanner(): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  if (banner) banner.style.transform = 'translateX(-50%) translateY(-140%)';
}

function showBanner(text: string): void {
  if (!banner) {
    banner = document.createElement('div');
    banner.style.cssText =
      'position:fixed;top:8px;left:50%;transform:translateX(-50%) translateY(-140%);z-index:9998;' +
      'display:flex;align-items:center;gap:10px;background:#fff7e6;border:1px solid #fa8c16;border-radius:10px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.12);padding:10px 14px;font-size:14px;color:#ad4e00;' +
      'transition:transform .25s;max-width:92vw;';
    document.body.appendChild(banner);
  }
  banner.innerHTML =
    `<span style="flex:1">${text}</span>` +
    '<span class="wa-x" style="color:#ad4e00;opacity:.6;cursor:pointer;flex-shrink:0;">&#10005;</span>';
  banner.querySelector('.wa-x')!.addEventListener('click', hideBanner);
  banner.style.transform = 'translateX(-50%) translateY(0)';
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(hideBanner, 15000);
}

function speak(text: string): void {
  try {
    // 多标签页互斥：12s 内另一 tab 刚播过则跳过，避免叠音
    const now = Date.now();
    if (now - Number(localStorage.getItem(LS_TTS_LOCK) || 0) < 12000) return;
    localStorage.setItem(LS_TTS_LOCK, String(now));
    const synth = (window as any).speechSynthesis;
    if (!synth) return;
    const locale = useLocaleStore();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale.locale === 'en' ? 'en-US' : 'zh-CN';
    u.rate = 1;
    synth.speak(u);
  } catch { /* TTS 不可用 → 仅横幅 */ }
}

/**
 * 打烊前提醒入口：工作台每次轮询、经营设置每次刷新后调用。
 * 只在「下一次切换是打烊且剩余 ≤15 分钟」时提醒，同一时刻仅一次。
 */
export function maybeClosingReminder(next: CampusBusinessTransition | null | undefined): void {
  if (typeof document === 'undefined') return;
  if (!next || next.action !== 'close') return;
  if (next.inMinutes <= 0 || next.inMinutes > CLOSING_WARN_MIN) return;
  if (!closingWarnEnabled()) return;
  const key = `${next.today ? 'T' : 'N'}|${next.at}`;
  try {
    if (localStorage.getItem(LS_FIRED) === key) return;
    localStorage.setItem(LS_FIRED, key);
  } catch { /* 隐私模式：退化为每轮提醒，可接受 */ }
  const locale = useLocaleStore();
  const text = locale.t('campusStoreSettings.closingWarn')
    .replace('{t}', next.at)
    .replace('{n}', String(next.inMinutes));
  showBanner(text);
  speak(locale.t('campusStoreSettings.closingWarnTts').replace('{n}', String(next.inMinutes)));
}

/** 下次切换的人话文案（经营设置页 / 工作台状态行共用） */
export function transitionText(next: CampusBusinessTransition | null | undefined): string {
  if (!next) return '';
  const locale = useLocaleStore();
  const key = `campusStoreSettings.next${next.action === 'close' ? 'Close' : 'Open'}${next.today ? 'Today' : 'Tomorrow'}`;
  return locale.t(key).replace('{t}', next.at).replace('{n}', String(next.inMinutes));
}
