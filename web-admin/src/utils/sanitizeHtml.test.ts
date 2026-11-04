// @vitest-environment jsdom
// 富文本 URL 白名单回归：覆盖浏览器会「吃掉」控制字符/空白后变成 javascript: 的变体。
import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitizeHtml';

// 危险协议：浏览器解析时会忽略前导控制字符/空白、剔除协议中的 \t \n \r，
// 归一化后即为 javascript:/data:/vbscript: —— 必须整条属性被剔除。
const DANGEROUS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'java\tscript:alert(1)',
  'jav\nascript:alert(1)',
  'java\rscript:alert(1)',
  '\u0001javascript:alert(1)',
  '\u0000javascript:alert(1)',
  '  javascript:alert(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'vbscript:msgbox(1)',
];

// 正常链接必须保留，避免修复把合法内容误杀。
const SAFE = [
  'https://example.com/a?b=1#c',
  'http://example.com',
  'mailto:support@example.com',
  'tel:+8613800000000',
  '/pages/home/index',
  './img/a.png',
  '#anchor',
];

describe('sanitizeHtml URL 白名单', () => {
  it.each(DANGEROUS)('剔除危险 href: %j', (url) => {
    const out = sanitizeHtml(`<a href="${url}">x</a>`);
    expect(out).not.toMatch(/href=/i);
  });

  it.each(DANGEROUS)('剔除危险 src: %j', (url) => {
    const out = sanitizeHtml(`<img src="${url}" alt="x">`);
    expect(out).not.toMatch(/src=/i);
  });

  it.each(SAFE)('保留安全 href: %j', (url) => {
    const out = sanitizeHtml(`<a href="${url}">x</a>`);
    expect(out).toMatch(/href=/i);
  });

  it('保留安全 src 与正文内容', () => {
    const out = sanitizeHtml('<p>正文</p><img src="https://cdn.example.com/a.png" alt="图">');
    expect(out).toContain('正文');
    expect(out).toContain('src="https://cdn.example.com/a.png"');
  });
});
