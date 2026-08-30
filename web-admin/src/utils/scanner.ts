// 扫码工具：App/小程序用 uni.scanCode 原生；H5 用 html5-qrcode 成熟库解码（约 1 秒识别 1 次），
// 自绘取景框（相对可视视口居中）/遮罩/四角角标/提示/反馈/手动输入入口，并叠加按能力探测的手动对焦。
// 能力不足 / 手输 / 微信内置 → reject ScannerError；上层按 e.code 分流。
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
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
// #endif

// #ifdef H5
function isWechat(): boolean {
  return typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent || '');
}

// 是否安全上下文（HTTPS 或 localhost）。`navigator.mediaDevices` 只在安全上下文暴露，
// 非 HTTPS 下直接用引导文案提示，而非笼统"无法访问摄像头"。
function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
  const host = (window.location && window.location.hostname) || '';
  return host === 'localhost' || host === '127.0.0.1';
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
  // 微信内置 WebView 无法可靠打开相机 → 直接走手动输入信号，不白屏
  if (isWechat()) {
    return Promise.reject(
      new ScannerError(MANUAL, '微信内置浏览器不支持扫码，请在手机浏览器/Chrome 中打开本页'),
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    if (!isSecureContext()) {
      return Promise.reject(
        new ScannerError(
          MANUAL,
          '当前为非安全上下文（未启用 HTTPS），浏览器无法调用摄像头；请通过 https:// 或 localhost 访问本页后重试',
        ),
      );
    }
    return Promise.reject(new ScannerError(MANUAL, '当前环境无法访问摄像头，请手动输入'));
  }
  return scanWithCamera();
}

function scanWithCamera(): Promise<string> {
  return new Promise((resolve, reject) => {
    const vv = window.visualViewport;
    const vh = vv && vv.height ? vv.height : window.innerHeight;
    const vw = typeof window.innerWidth === 'number' ? window.innerWidth : 0;
    // 取景框：宽约 78% 视口宽、正方形，相对可视视口水平垂直居中
    const fb = Math.floor(Math.min(Math.max(vw * 0.78, 240), 420));
    const top0 = Math.max((vh - fb) / 2, 0);
    const left0 = Math.max((vw - fb) / 2, 0);

    // —— 相机容器：html5-qrcode 渲染视频铺满视口 ——
    const region = document.createElement('div');
    region.id = 'scanner-h5-region';
    region.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;z-index:9998;background:#000;';
    document.body.appendChild(region);

    // —— 自绘 overlay（遮罩/四角角标/提示/底部操作条/对焦滑块）——
    const overlay = document.createElement('div');
    overlay.className = 'scanner-ui';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:10000;pointer-events:none;font-family:system-ui,sans-serif;';

    const corner = (top: number, left: number, borders: string) => {
      const d = document.createElement('div');
      d.style.cssText =
        `position:absolute;width:44px;height:44px;top:${top}px;left:${left}px;` +
        `border:4px solid #5eead4;${borders};pointer-events:none;`;
      return d;
    };
    overlay.appendChild(corner(top0, left0, 'border-right:none;border-bottom:none;'));
    overlay.appendChild(corner(top0, left0 + fb - 44, 'border-left:none;border-bottom:none;'));
    overlay.appendChild(corner(top0 + fb - 44, left0, 'border-right:none;border-top:none;'));
    overlay.appendChild(corner(top0 + fb - 44, left0 + fb - 44, 'border-left:none;border-top:none;'));

    const mask = (top: number, left: number, width: number, height: number) => {
      const m = document.createElement('div');
      m.style.cssText =
        `position:absolute;top:${top}px;left:${left}px;width:${width}px;height:${height}px;` +
        'background:rgba(0,0,0,.45);pointer-events:none;';
      return m;
    };
    overlay.appendChild(mask(0, 0, vw, top0));                    // 上遮罩
    overlay.appendChild(mask(0, 0, left0, vh));                   // 左遮罩
    overlay.appendChild(mask(0, left0 + fb, vw - left0 - fb, vh));// 右遮罩
    overlay.appendChild(mask(top0 + fb, 0, vw, Math.max(vh - top0 - fb, 0))); // 下遮罩

    const tip = document.createElement('div');
    tip.id = 'scanner-tip';
    tip.textContent = '将条码对准框内';
    tip.style.cssText =
      'position:absolute;top:64px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,0,0,.6);color:#fff;border-radius:999px;padding:8px 18px;' +
      'font-size:14px;white-space:nowrap;pointer-events:none;';
    overlay.appendChild(tip);

    const bar = document.createElement('div');
    bar.style.cssText =
      'position:absolute;left:0;right:0;bottom:0;padding:28px 24px calc(env(safe-area-inset-bottom,0px) + 28px);' +
      'display:flex;justify-content:space-between;align-items:center;pointer-events:none;';
    const mkBtn = (txt: string, bg: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = txt;
      b.style.cssText =
        'pointer-events:auto;padding:12px 26px;border-radius:999px;border:none;font-size:15px;' +
        `cursor:pointer;background:${bg};color:#fff;`;
      return b;
    };

    let codeReader: Html5Qrcode | null = null;
    let timeout: any = null;
    let settled = false;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      try { if (codeReader && codeReader.isScanning) void codeReader.stop(); } catch { /* 忽略 */ }
      if (region && region.parentNode) region.parentNode.removeChild(region);
      document.querySelectorAll('.scanner-ui').forEach((el) => el.remove());
    };
    const finished = (code: string, msg: string, val?: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (val !== undefined) resolve(val);
      else reject(new ScannerError(code, msg));
    };

    const cancelBtn = mkBtn('✕ 取消', 'rgba(0,0,0,.6)');
    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); finished(CANCEL, '扫码取消'); });
    const manualBtn = mkBtn('📷 手动输入', '#0ea5e9');
    manualBtn.addEventListener('click', (e) => { e.stopPropagation(); finished(MANUAL, '手动输入'); });
    bar.appendChild(cancelBtn);
    bar.appendChild(manualBtn);

    // —— 手动对焦（仅探测到能力才渲染；无能力时不渲染、绝不抛错/白屏）——
    const focusSlider = document.createElement('input');
    focusSlider.type = 'range';
    focusSlider.style.cssText =
      'display:none;width:56%;max-width:320px;position:absolute;left:50%;bottom:140px;' +
      'transform:translateX(-50%);pointer-events:auto;accent-color:#0ea5e9;';
    overlay.appendChild(focusSlider);

    const tapFocus = () => {
      if (!codeReader) return;
      try {
        const cap: any = codeReader.getRunningTrackCapabilities();
        const fd: any = cap && cap.focusDistance;
        void codeReader.applyVideoConstraints({
          focusMode: 'manual',
          focusDistance: ((fd && typeof fd.max === 'number' ? fd.max : 1) as number) * 0.5,
        }).catch(() => { /* 忽略能力不支持 */ });
      } catch { /* 忽略 */ }
    };

    const setupFocus = () => {
      try {
        if (!codeReader) return;
        const cap: any = codeReader.getRunningTrackCapabilities();
        if (!cap) return;
        const modes: string[] = Array.isArray(cap.focusMode) ? cap.focusMode : [];
        const canFocus = modes.includes('manual') || modes.includes('continuous');
        if (!canFocus) return; // 无手动/连续对焦能力 → 不渲染对焦控件
        // 点按画面触发手动对焦
        overlay.addEventListener('click', tapFocus);
        // 对焦距离滑块：min/max/step 取 cap.focusDistance；缺省则仅保留点按对焦
        const fd: any = cap.focusDistance;
        if (fd && typeof fd.max === 'number') {
          focusSlider.min = String(typeof fd.min === 'number' ? fd.min : 0);
          focusSlider.max = String(fd.max);
          focusSlider.step = String(typeof fd.step === 'number' ? fd.step : (fd.max / 100));
          focusSlider.value = String(fd.max * 0.5);
          focusSlider.style.display = 'block';
          focusSlider.addEventListener('input', () => {
            if (!codeReader) return;
            try {
              void codeReader.applyVideoConstraints({
                focusMode: 'manual',
                focusDistance: Number(focusSlider.value),
              }).catch(() => { /* 忽略 */ });
            } catch { /* 忽略 */ }
          });
        }
      } catch { /* 无能力 → 自动对焦，不白屏 */ }
    };

    overlay.appendChild(bar);
    overlay.style.pointerEvents = 'auto';
    document.body.appendChild(overlay);

    // —— 识别：fps=1（约每秒 1 次），命中即停 ——
    const successAction = async (raw: string) => {
      const text = (raw || '').trim();
      if (!text || settled || !codeReader) return;
      try { await codeReader.stop(); } catch { /* 忽略 */ }
      finished('', '', text);
    };

    // 相机无法打开的引导文案（权限被拒 / 库内部异常 / 非安全上下文等统一收敛到 FAILED）
    const CAMERA_FAIL_MSG =
      '无法打开相机，请在浏览器地址栏允许摄像头权限后重试，或改用【手动输入】';

    try {
      // 说明：html5-qrcode v2 中 `formatsToSupport` 属于构造函数 config，
      // 由构造函数内的 getSupportedFormats() 读取并注入解码器；start() 的
      // Html5QrcodeCameraScanConfig 不读取该字段（仅 fps/qrbox/aspectRatio/disableFlip/
      // videoConstraints）。因此它不能移到 start()，保留此处。
      codeReader = new Html5Qrcode(region.id, {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
        ],
      });

      timeout = setTimeout(() => {
        const t = document.getElementById('scanner-tip');
        if (t && !settled) t.textContent = '未识别到条码，可对准更清晰或点【手动输入】';
      }, 8000);

      codeReader
        .start(
          { facingMode: 'environment' },
          { fps: 1, qrbox: { width: fb, height: fb }, aspectRatio: 1 },
          successAction,
          () => { /* 单帧未识别到码：继续 */ },
        )
        .then(() => setupFocus())
        .catch((err) => {
          // 权限拒绝 / 相机不可用 / start() 内部异常
          console.warn('[scanner] H5 camera start failed', err);
          finished(FAILED, CAMERA_FAIL_MSG);
        });
    } catch (err) {
      // new Html5Qrcode(...) 或 start() 同步抛错（如库内部校验异常）也收敛到 FAILED，
      // 避免"点扫码无反应"的未捕获异常
      console.warn('[scanner] H5 camera init threw', err);
      finished(FAILED, CAMERA_FAIL_MSG);
    }
  });
}
// #endif