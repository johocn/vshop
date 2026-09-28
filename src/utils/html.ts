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
      if ((name === 'href' || name === 'src') && !RICH_SAFE_URL.test(String(attr.value || '').trim())) {
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
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*("|')?\s*(javascript|vbscript|data:text\/html)[^"'>\s]*("|')?/gi, '');
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