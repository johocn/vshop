// 富文本 HTML 白名单净化（web-admin 仅 H5，浏览器 DOMParser 可用）。
// 用途：富文本编辑器「HTML 源码模式」允许直接编辑原始 HTML，落库前必须清洗，
// 否则可植入 <script>/on* 事件/javascript: 协议，在 C 端展示时触发存储型 XSS。

const ALLOWED_TAGS = new Set([
  'p', 'br', 'span', 'div', 'section', 'article', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'sub', 'sup', 'mark',
  'ul', 'ol', 'li',
  'a', 'img', 'video', 'source', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'hr', 'code', 'pre',
]);

// 整段移除（连同内容）的危险容器
const DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button']);

const ALLOWED_ATTR = new Set([
  'href', 'src', 'alt', 'title', 'target', 'rel',
  'width', 'height', 'style', 'class', 'colspan', 'rowspan',
  'controls', 'poster', 'preload', 'type',
]);

// 仅放行 http(s)/mailto/tel 与相对路径
const SAFE_URL = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

function cleanElement(el: Element): void {
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase();
    if (DROP_TAGS.has(tag)) {
      child.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      // 未知标签：保留其子节点（去壳），避免丢失可见内容
      cleanElement(child);
      const parent = child.parentNode;
      if (parent) {
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        child.remove();
      }
      continue;
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith('on') || !ALLOWED_ATTR.has(name)) {
        child.removeAttribute(attr.name);
        continue;
      }
      if ((name === 'href' || name === 'src') && !SAFE_URL.test(value.trim())) {
        child.removeAttribute(attr.name);
      }
    }
    cleanElement(child);
  }
}

/** 白名单净化富文本 HTML；无 DOM 环境（理论兜底）时仅剥离 script 段落 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<\s*(script|style|iframe)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  }
  const doc = new DOMParser().parseFromString(`<div id="__rte_root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__rte_root');
  if (!root) return '';
  cleanElement(root);
  return root.innerHTML;
}
