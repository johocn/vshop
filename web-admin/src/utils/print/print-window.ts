// 打印执行器：隐藏 iframe 打印（移动端 window.open 易被拦截，故默认不用它）
// 规格 §9：打印被拦截时提供「打开新窗口」兜底 + 单据 HTML 暂存在内存里可重试。

let lastHtml = '';

/** 最近一次待打印的单据 HTML（兜底重试用；为空则没有可重试的单据） */
export function getLastPrintHtml(): string {
  return lastHtml;
}

/**
 * 用隐藏 iframe 打印完整 HTML（含内联 CSS）。
 * 返回是否成功发起打印；`false` 时调用方应引导用户走 `openPrintFallback`。
 */
export function printHtml(html: string): boolean {
  lastHtml = html;
  if (typeof document === 'undefined' || !document.body) return false;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const doPrint = () => {
    try {
      win.focus();
      win.print();
    } catch (_e) {
      // 打印被拦截：保留 lastHtml，由调用方弹「新窗口打印」兜底
      openPrintFallback();
    } finally {
      // 打印对话框是同步阻塞的，回来后即可移除 iframe
      setTimeout(() => iframe.remove(), 1000);
    }
  };

  // doc.write 后 readyState 可能已是 complete，两种情形都要覆盖
  if (doc.readyState === 'complete') setTimeout(doPrint, 200);
  else iframe.onload = () => setTimeout(doPrint, 200);

  return true;
}

/** 兜底：新窗口打开同一份单据（`html` 省略时用最近一次的单据） */
export function openPrintFallback(html?: string): boolean {
  const content = html ?? lastHtml;
  if (!content || typeof window === 'undefined') return false;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(content);
  w.document.close();
  return true;
}