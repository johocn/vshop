// 扫码工具：App/小程序用 uni.scanCode 原生；H5 优先用浏览器原生 BarcodeDetector（Chrome 内置，免装依赖），
// 不支持时提示改用手动输入。统一返回 Promise<string>，取消/失败 reject。

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
      reject(new Error('当前环境不支持扫码，请手动输入'));
      return;
    }
    uni.scanCode({
      success: (res: any) => resolve((res?.result ?? '').trim()),
      fail: () => reject(new Error('扫码取消或失败')),
    });
  });
}
// #endif

// #ifdef H5
function scanOnH5(): Promise<string> {
  // 优先原生 BarcodeDetector（Chrome/Edge 桌面与移动端）
  const Detector: any =
    (typeof window !== 'undefined' && ((window as any).BarcodeDetector)) || undefined;
  if (!Detector) {
    // 微信内/其它不支持 BarcodeDetector 的浏览器：提示手动输入，避免无摄像头环境静默失败
    if (isWechat()) {
      // 微信内置扫码需 jssdk（当前未接入），降级提示
      return Promise.reject(new Error('请在 App 或支持扫码的浏览器中使用，或手动输入'));
    }
    return Promise.reject(new Error('当前浏览器不支持扫码，请手动输入'));
  }
  return scanWithCamera(Detector);
}

function scanWithCamera(Detector: any): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      reject(new Error('当前环境无法访问摄像头，请手动输入'));
      return;
    }
    let video: HTMLVideoElement | null = null;
    let stream: MediaStream | null = null;
    let detector: any = null;
    let timer: any = null;
    const cleanup = () => {
      if (timer) clearInterval(timer);
      if (video) video.srcObject = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = s;
        video.style.position = 'fixed';
        video.style.inset = '0';
        video.style.width = '100vw';
        video.style.height = '100vh';
        video.style.objectFit = 'cover';
        video.style.zIndex = '9999';
        video.style.background = '#000';
        document.body.appendChild(video);
        // 顶部关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '取消扫码';
        closeBtn.style.cssText =
          'position:fixed;top:30rpx;left:50%;transform:translateX(-50%);z-index:10000;' +
          'padding:12rpx 36rpx;font-size:30rpx;background:rgba(0,0,0,.6);color:#fff;border-radius:999rpx;border:none;';
        closeBtn.addEventListener('click', () => {
          cleanup();
          document.body.removeChild(video);
          if (closeBtn.parentNode) closeBtn.parentNode.removeChild(closeBtn);
          reject(new Error('扫码取消'));
        });
        document.body.appendChild(closeBtn);
        detector = new Detector(['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'code_39', 'itf']);
        timer = setInterval(async () => {
          try {
            if (!video || video.readyState < 2) return;
            const codes = await detector.detect(video);
            if (codes && codes.length) {
              const val = (codes[0].rawValue || '').trim();
              if (val) {
                cleanup();
                document.body.removeChild(video);
                if (closeBtn.parentNode) closeBtn.parentNode.removeChild(closeBtn);
                resolve(val);
              }
            }
          } catch {
            /* 未识别到帧，继续 */
          }
        }, 350);
      })
      .catch(() => reject(new Error('无法访问摄像头，请手动输入')));
  });
}
// #endif