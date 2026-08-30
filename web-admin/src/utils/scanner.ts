// 扫码工具：App/小程序用 uni.scanCode 原生；H5 优先用浏览器原生 BarcodeDetector（Chrome 内置，免装依赖），
// 并叠加取景框/对准提示/识别反馈/手动输入入口；能力不足时降级为手动输入信号（code='MANUAL'），不白屏。
// 统一返回 Promise<string>；失败 reject ScannerError，上层按 e.code 分流。
export class ScannerError extends Error {
  code: string;
  constructor(code: string, msg: string) {
    super(msg);
    this.name = 'ScannerError';
    this.code = code;
  }
}

const MANUAL = 'MANUAL';   // 能力不足/用户手动输入/微信内置 → 上层弹手动输入
const CANCEL = 'CANCEL';   // 用户取消
const FAILED = 'FAILED';   // 摄像头打开失败等

// #ifdef H5
function isWechat(): boolean {
  return typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent || '');
}
// #endif

export function scanCode(): Promise<string> {
  // #ifdef H5
  return scanOnH5();
  // #endif
  // #ifndef H5
  return scanNative();
  // #endif
}

// #ifndef H5
function scanNative(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof uni.scanCode !== 'function') {
      reject(new ScannerError(MANUAL, '当前环境不支持扫码，请手动输入'));
      return;
    }
    uni.scanCode({
      success: (res: any) => resolve((res?.result ?? '').trim()),
      fail: () => reject(new ScannerError(CANCEL, '扫码取消或失败')),
    });
  });
}
// #endif

// #ifdef H5
function scanOnH5(): Promise<string> {
  const Detector: any =
    (typeof window !== 'undefined' && ((window as any).BarcodeDetector)) || undefined;
  // 能力不足（无 Detector / 非安全上下文 / 微信内置）→ 直接给手动输入信号，不白屏
  const secure = typeof window !== 'undefined' && window.isSecureContext !== false;
  if (!Detector || !secure || isWechat()) {
    return Promise.reject(new ScannerError(MANUAL, '请在支持扫码的浏览器使用，或手动输入'));
  }
  return scanWithCamera(Detector);
}

function scanWithCamera(Detector: any): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      reject(new ScannerError(MANUAL, '当前环境无法访问摄像头，请手动输入'));
      return;
    }
    let video: HTMLVideoElement | null = null;
    let stream: MediaStream | null = null;
    let detector: any = null;
    let timer: any = null;
    let timeout: any = null;
    let settled = false;

    const frameBox = () => Math.floor(Math.min(window.innerWidth * 0.78, 420));
    const cleanup = () => {
      if (timer) clearInterval(timer);
      if (timeout) clearTimeout(timeout);
      if (video) video.srcObject = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      document.querySelectorAll('.scanner-ui').forEach((el) => el.remove());
    };
    const finished = (code: string, msg: string, val?: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (val !== undefined) resolve(val);
      else reject(new ScannerError(code, msg));
    };

    // —— 相机层 ——
    video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.position = 'fixed';
    video.style.inset = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.zIndex = '9999';
    video.style.background = '#000';
    document.body.appendChild(video);

    // —— UI 覆盖层（取景框/暗化/角标/提示/按钮）——
    const overlay = document.createElement('div');
    overlay.className = 'scanner-ui';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:10000;pointer-events:none;font-family:system-ui,sans-serif;';
    const fb = frameBox();
    const edge = (vn: string, top: number, left: number, border: string) => {
      const d = document.createElement('div');
      d.style.cssText =
        `position:absolute;width:44px;height:44px;top:${top}px;left:${left}px;border:4px solid #5eead4;${border};pointer-events:none;`;
      d.id = vn;
      return d;
    };
    overlay.appendChild(edge('scanner-corner-tl', 0, 0, 'border-right:none;border-bottom:none;'));
    overlay.appendChild(edge('scanner-corner-tr', 0, fb - 44, 'border-left:none;border-bottom:none;'));
    overlay.appendChild(edge('scanner-corner-bl', fb - 44, 0, 'border-right:none;border-top:none;'));
    overlay.appendChild(edge('scanner-corner-br', fb - 44, fb - 44, 'border-left:none;border-top:none;'));
    const mask = (top: number, height: number) => {
      const m = document.createElement('div');
      m.style.cssText =
        `position:absolute;left:0;right:0;top:${top}px;height:${height}px;background:rgba(0,0,0,.45);`;
      return m;
    };
    const mb = (window.innerHeight - fb) / 2;
    const bodyH = Math.max(window.innerHeight, 1);
    const sideW = (window.innerWidth - fb) / 2;
    overlay.appendChild(mask(0, mb));
    overlay.appendChild(mask(mb + fb, bodyH - mb - fb));
    const sideL = document.createElement('div');
    sideL.style.cssText = `position:absolute;top:${mb}px;height:${fb}px;width:${sideW}px;background:rgba(0,0,0,.45);`;
    const sideR = sideL.cloneNode() as HTMLElement;
    sideR.style.left = `${fb + sideW}px`;
    overlay.appendChild(sideL);
    overlay.appendChild(sideR);
    const tip = document.createElement('div');
    tip.id = 'scanner-tip';
    tip.textContent = '将条码对准框内';
    tip.style.cssText =
      'position:absolute;top:56px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,0,0,.6);color:#fff;border-radius:999px;padding:8px 18px;font-size:14px;white-space:nowrap;';
    overlay.appendChild(tip);
    const bar = document.createElement('div');
    bar.style.cssText =
      'position:absolute;left:0;right:0;bottom:0;padding:28px 24px calc(env(safe-area-inset-bottom,0px) + 28px);' +
      'display:flex;justify-content:space-between;align-items:center;';
    const mkBtn = (txt: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = txt;
      b.style.cssText =
        'pointer-events:auto;padding:12px 26px;border-radius:999px;border:none;font-size:15px;cursor:pointer;' +
        'background:rgba(0,0,0,.6);color:#fff;';
      return b;
    };
    const cancelBtn = mkBtn('✕ 取消');
    cancelBtn.addEventListener('click', () => finished(CANCEL, '扫码取消'));
    const manualBtn = mkBtn('📷 手动输入');
    manualBtn.style.background = '#0ea5e9';
    manualBtn.addEventListener('click', () => finished(MANUAL, '手动输入'));
    bar.appendChild(cancelBtn);
    bar.appendChild(manualBtn);
    overlay.appendChild(bar);
    overlay.style.pointerEvents = 'auto';
    document.body.appendChild(overlay);

    // —— 识别循环 ——
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        if (!video) throw new Error('no video');
        video.srcObject = s;
        detector = new Detector(['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'code_39', 'itf']);
        timeout = setTimeout(() => {
          const t = document.getElementById('scanner-tip');
          if (t && !settled) t.textContent = '未识别到条码，可对准更清晰或点【手动输入】';
        }, 8000);
        timer = setInterval(async () => {
          try {
            if (!video || video.readyState < 2 || settled) return;
            const codes = await detector.detect(video);
            if (codes && codes.length) {
              const raw = (codes[0].rawValue || '').trim();
              if (!raw) return;
              const tip = document.getElementById('scanner-tip');
              if (tip) {
                tip.textContent = '识别成功';
                tip.style.background = '#16a34a';
              }
              document.querySelectorAll('#scanner-corner-tl, #scanner-corner-tr, #scanner-corner-bl, #scanner-corner-br')
                .forEach((el) => (el as HTMLElement).style.borderColor = '#16a34a');
              try { navigator.vibrate?.(50); } catch { /* 忽略振动不支持 */ }
              setTimeout(() => finished('', '', raw), 300);
            }
          } catch {
            /* 未识别到帧，继续 */
          }
        }, 350);
      })
      .catch(() => finished(FAILED, '无法访问摄像头，请稍后重试'));
  });
}
// #endif