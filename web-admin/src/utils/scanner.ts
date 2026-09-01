// 扫码工具：App/小程序用 uni.scanCode 原生；H5 用自管理摄像头（原生 getUserMedia + <video>）+ 浏览器原生
// BarcodeDetector 解码（约 1 秒识别 1 次）。自绘取景框（相对可视视口居中）/遮罩/四角角标/提示/反馈/
// 手动输入入口，并叠加按能力探测的手动对焦。
// 说明：不依赖 html5-qrcode 库自渲染的 video（该方式在 uniapp H5 下视频层会被页面盖住、露出网页），
// 这里由我们自己用原生 API 渲染摄像头画面并强制定位/填充，保证手机上能稳定出现摄像头画面。
// 能力不足 / 手输 / 微信内置 → reject ScannerError；上层按 e.code 分流。
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
// zxing：成熟解码引擎，对一维条码（EAN/Code128/Code39 等）与二维码识别稳定，
// 配合自管理 <video> 抽帧解码（自管理 video 保证画面必定渲染，zxing 保证识别率）。
import {
  BarcodeFormat as ZxBarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';

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

    // —— 全屏相机容器 + 原生 <video>：画面由原生 API 渲染，强制撑满并盖住页面 ——
    const region = document.createElement('div');
    region.id = 'scanner-h5-region';
    region.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;z-index:2147483000;background:#000;overflow:hidden;';
    const video = document.createElement('video');
    video.id = 'scanner-h5-video';
    video.muted = true;           // 必须静音才能自动播放
    video.playsInline = true;     // iOS 内联播放
    video.autoplay = true;
    video.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;-webkit-object-fit:cover;';
    region.appendChild(video);
    document.body.appendChild(region);

    // —— 自绘 overlay（遮罩/四角角标/提示/底部操作条/对焦滑块）——
    const overlay = document.createElement('div');
    overlay.style.cssText =
      `position:fixed;inset:0;z-index:2147483001;font-family:system-ui,sans-serif;`;

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

    let stream: MediaStream | null = null;
    let reader: MultiFormatReader | null = null;
    let timer: any = null;
    let settled = false;

    const stopStream = () => {
      try { stream?.getTracks()?.forEach((t) => t.stop()); } catch { /* 忽略 */ }
      stream = null;
    };
    const cleanup = () => {
      if (timer) clearInterval(timer);
      stopStream();
      if (region && region.parentNode) region.parentNode.removeChild(region);
      document.querySelectorAll('.scanner-ui-fixed').forEach((el) => el.remove());
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
    const manualBtn = mkBtn('⌨️ 手动输入', '#0ea5e9');
    manualBtn.addEventListener('click', (e) => { e.stopPropagation(); finished(MANUAL, '手动输入'); });
    bar.appendChild(cancelBtn);
    bar.appendChild(manualBtn);
    overlay.style.pointerEvents = 'auto';
    overlay.appendChild(bar);

    // —— 手动对焦（仅探测到能力才渲染；无能力时绝不抛错/白屏）——
    const focusSlider = document.createElement('input');
    focusSlider.type = 'range';
    focusSlider.style.cssText =
      'display:none;width:56%;max-width:320px;position:absolute;left:50%;bottom:140px;' +
      'transform:translateX(-50%);pointer-events:auto;accent-color:#0ea5e9;';
    overlay.appendChild(focusSlider);

    let track: MediaStreamTrack | null = null;
    const applyFocus = (focusMode: string, focusDistance?: number) => {
      if (!track) return;
      try {
        // 移动端 track.applyConstraints + advanced 支持手动对焦；不支持时会被忽略，不抛错白屏
        void track.applyConstraints({
          advanced: [{ focusMode, focusDistance } as MediaTrackConstraintSet],
        }).catch(() => { /* 忽略 */ });
      } catch { /* 忽略 */ }
    };

    const setupFocus = (caps: MediaTrackCapabilities | undefined) => {
      try {
        if (!track || !caps) return;
        const modes: string[] = Array.isArray(caps.focusMode) ? (caps.focusMode as string[]) : [];
        const canFocus = modes.includes('manual') || modes.includes('continuous');
        if (!canFocus) return;
        // 点按画面触发手动对焦
        overlay.addEventListener('click', () => applyFocus('manual', undefined));
        const fd: any = caps.focusDistance;
        if (fd && typeof fd.max === 'number') {
          focusSlider.min = String(typeof fd.min === 'number' ? fd.min : 0);
          focusSlider.max = String(fd.max);
          focusSlider.step = String(typeof fd.step === 'number' ? fd.step : (fd.max / 100));
          focusSlider.value = String(fd.max * 0.5);
          focusSlider.style.display = 'block';
          focusSlider.addEventListener('input', () =>
            applyFocus('manual', Number(focusSlider.value)));
        }
      } catch { /* 无能力 → 自动对焦，不白屏 */ }
    };

    overlay.classList.add('scanner-ui-fixed');
    document.body.appendChild(overlay);

    // —— 识别：离屏 canvas 从 <video> 抽帧 → 下采样 → 转灰度 → zxing 解码 ——
    // 注意：zxing 的 RGBLuminanceSource 期望「已算好的一字节/像素灰度」（Uint8ClampedArray），
    // 直接把 getImageData 的 RGBA（4 字节/像素）塞进去会读错字节序导致码形全乱、永远识别不到。
    // 故这里手动按 Rec.601 权重从 RGBA 换算成 w*h 的一维灰度数组，并先把帧下采样再解码以提速。
    const canvas = document.createElement('canvas');
    const cctx = canvas.getContext('2d', { willReadFrequently: true });
    const MAX_DECODE_W = 800; // 下采样上限宽度，兼顾小条码清晰度与解码速度
    const decodeTick = (): void => {
      if (settled || !reader || !cctx) return;
      const sw = video.videoWidth;
      const sh = video.videoHeight;
      if (!sw || !sh || video.readyState < 2) return; // 无帧数据 → 跳过
      try {
        const scale = Math.min(1, MAX_DECODE_W / sw);
        const w = Math.max(1, Math.round(sw * scale));
        const h = Math.max(1, Math.round(sh * scale));
        canvas.width = w;
        canvas.height = h;
        cctx.drawImage(video, 0, 0, w, h);
        const px = cctx.getImageData(0, 0, w, h).data;
        const lum = new Uint8ClampedArray(w * h);
        for (let i = 0, j = 0; j < lum.length; i += 4, j++) {
          // Rec.601 亮度：Y = (77R + 150G + 29B) >> 8
          lum[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
        }
        const source = new RGBLuminanceSource(lum, w, h);
        const bitmap = new BinaryBitmap(new HybridBinarizer(source));
        const result = reader.decode(bitmap);
        const text = result && result.getText ? String(result.getText()).trim() : '';
        if (text) {
          if (timer) clearInterval(timer);
          finished('', '', text);
        }
      } catch {
        // RGBLuminanceSource 对超限坐标会抛 IllegalArgumentException：进这里即「本帧未识别/异常」，下帧继续
      }
    };

    const makeReader = (): MultiFormatReader | null => {
      try {
        const hints = new Map<DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          ZxBarcodeFormat.QR_CODE,
          ZxBarcodeFormat.EAN_13,
          ZxBarcodeFormat.EAN_8,
          ZxBarcodeFormat.CODE_128,
          ZxBarcodeFormat.CODE_39,
          ZxBarcodeFormat.UPC_A,
          ZxBarcodeFormat.UPC_E,
          ZxBarcodeFormat.ITF,
          ZxBarcodeFormat.CODABAR,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const r = new MultiFormatReader();
        r.setHints(hints);
        return r;
      } catch {
        return null;
      }
    };

    const CAMERA_FAIL_MSG =
      '无法打开相机，请在浏览器地址栏允许摄像头权限后重试，或改用【手动输入】';

    const startCamera = async (): Promise<void> => {
      // 摄像头画面必须由我们在 <video> 里渲染出来；getUserMedia 在权限允许时会返回实时流
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      const tr = stream.getVideoTracks()[0] || null;
      track = tr;
      // 探测手动对焦能力
      let caps: MediaTrackCapabilities | undefined;
      try { caps = typeof tr?.getCapabilities === 'function' ? tr.getCapabilities() : undefined; } catch { /* */ }
      setupFocus(caps);
    };

    const init = async (): Promise<void> => {
      reader = makeReader();
      if (!reader) {
        finished(MANUAL, '当前浏览器无法初始化条码识别，请手动输入');
        return;
      }
      try {
        await startCamera();
      } catch (err) {
        console.warn('[scanner] H5 camera start failed', err);
        finished(FAILED, CAMERA_FAIL_MSG);
        return;
      }
      timer = setInterval(() => decodeTick(), 350);
      setTimeout(() => {
        const t = document.getElementById('scanner-tip');
        if (t && !settled) t.textContent = '未识别到条码，可对准更清晰或点【手动输入】';
      }, 8000);
    };

    void init();
  });
}
// #endif