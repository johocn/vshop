export function stripHtmlToText(html: string, maxLen = 100): string {
  if (!html || typeof html !== 'string') return '';
  let text = String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd().replace(/[，。、,.]$/, '') + '…';
}

export function toAbsoluteUrl(url: string, origin: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return origin + url;
  return `${origin}/${url}`;
}

// ---- 富文本净化（商品描述 / 装修富文本楼层等后台可编辑内容） ----
// H5 端用 DOMParser 做标签/属性白名单清洗（mp-html 在 H5 以 innerHTML 渲染，
// 未净化可致事件属性/脚本触发存储型 XSS）；小程序端无 DOM，退化为正则剥离危险构造。
const RICH_ALLOWED_TAGS = new Set([
  'p', 'br', 'span', 'div', 'section', 'article', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'sub', 'sup', 'mark',
  'ul', 'ol', 'li',
  'a', 'img', 'video', 'source', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'hr', 'code', 'pre',
]);
const RICH_DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button']);
const RICH_ALLOWED_ATTR = new Set([
  'href', 'src', 'alt', 'title', 'target', 'rel',
  'width', 'height', 'style', 'class', 'colspan', 'rowspan',
  'controls', 'poster', 'preload', 'type',
]);
const RICH_SAFE_URL = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

// style 值级白名单：仅放行展示类属性，剔除可构造全屏覆盖层/远程加载的属性
// （与 web-admin src/utils/sanitizeHtml.ts 保持一致，防两处分叉）
const RICH_SAFE_STYLE_PROPS = new Set([
  'color', 'background-color', 'background',
  'font-size', 'font-weight', 'font-style', 'font-family',
  'text-align', 'text-decoration', 'text-indent', 'line-height', 'letter-spacing', 'white-space',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-radius', 'border-collapse',
  'width', 'max-width', 'height', 'max-height',
  'list-style', 'vertical-align', 'word-break', 'overflow-wrap',
]);
const RICH_DANGEROUS_STYLE_VALUE = /(url\(|javascript|expression|@import|behavior|position|fixed|absolute|z-index|opacity|transform)/;

/** 清洗 style 内联值：逐条声明过滤，属性不在白名单或值含危险构造的整条剔除 */
function cleanRichStyleValue(value: string): string {
  return String(value)
    .split(';')
    .map((d) => d.trim())
    .filter((d) => {
      const i = d.indexOf(':');
      if (i <= 0) return false;
      const prop = d.slice(0, i).trim().toLowerCase();
      const val = d.slice(i + 1).trim().toLowerCase();
      if (!RICH_SAFE_STYLE_PROPS.has(prop)) return false;
      return !RICH_DANGEROUS_STYLE_VALUE.test(val);
    })
    .join('; ');
}

/** 归一化 URL：解码数字实体并剔除空白/控制字符，防 `java\\nscript:` 之类的协议绕过 */
function normalizeRichUrl(raw: string): string {
  return String(raw)
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#([0-9]+);?/g, (_m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
    .trim()
    .toLowerCase();
}

function isSafeRichUrl(raw: string): boolean {
  const v = normalizeRichUrl(raw);
  if (!v) return true;
  if (/^(?:javascript|vbscript):/.test(v)) return false;
  if (v.startsWith('data:') && !/^data:image\/(?:png|jpe?g|gif|webp);base64,/.test(v)) return false;
  return RICH_SAFE_URL.test(v);
}

function cleanRichElement(el: any): void {
  for (const child of Array.from(el.children) as any[]) {
    const tag = String(child.tagName || '').toLowerCase();
    if (RICH_DROP_TAGS.has(tag)) { child.remove(); continue; }
    if (!RICH_ALLOWED_TAGS.has(tag)) {
      cleanRichElement(child);
      const parent = child.parentNode;
      if (parent) {
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        child.remove();
      }
      continue;
    }
    for (const attr of Array.from(child.attributes) as any[]) {
      const name = String(attr.name || '').toLowerCase();
      if (name.startsWith('on') || !RICH_ALLOWED_ATTR.has(name)) { child.removeAttribute(attr.name); continue; }
      if (name === 'style') {
        const cleaned = cleanRichStyleValue(String(attr.value || ''));
        if (cleaned) child.setAttribute('style', cleaned);
        else child.removeAttribute('style');
        continue;
      }
      if ((name === 'href' || name === 'src') && !isSafeRichUrl(String(attr.value || ''))) {
        child.removeAttribute(attr.name);
      }
    }
    cleanRichElement(child);
  }
}

export function sanitizeRichHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(`<div id="__s">${html}</div>`, 'text/html');
      const root = doc.getElementById('__s');
      if (root) { cleanRichElement(root); return root.innerHTML; }
    } catch { /* 退化为正则清洗 */ }
  }
  return html
    // 先剔除注释，避免注释包裹的标签/属性被后续正则漏检
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // style 逐条声明过滤：危险声明剔除，正常展示样式保留
    .replace(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (_m: string, dq?: string, sq?: string, bare?: string) => {
      const cleaned = cleanRichStyleValue(dq ?? sq ?? bare ?? '');
      return cleaned ? ` style="${cleaned}"` : '';
    })
    // href/src 协议白名单：先解码实体、去空白再判断，防 java\nscript: 绕过
    .replace(/\s(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (m: string, _name: string, dq?: string, sq?: string, bare?: string) => {
      const raw = dq ?? sq ?? bare ?? '';
      return isSafeRichUrl(raw) ? m : '';
    });
}

export function buildShareMeta(i: {
  productName: string;
  featureImage: string;
  assetsImages: string[];
  textDescription: string;
  shareImageUrl: string;
  shopName: string;
  shopIntro: string;
  origin: string;
  defaultImage: string;
  defaultTitle: string;
  defaultDesc: string;
}): { title: string; desc: string; imgUrl: string } {
  const title = i.productName || i.shopName || i.defaultTitle;
  const desc = i.textDescription || i.shopIntro || i.defaultDesc;
  const img = i.featureImage || i.assetsImages[0] || i.shareImageUrl || toAbsoluteUrl(i.defaultImage, i.origin);
  return { title, desc, imgUrl: toAbsoluteUrl(img, i.origin) };
}