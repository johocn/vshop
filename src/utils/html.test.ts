// @vitest-environment jsdom
import { test } from 'vitest';
import assert from 'node:assert';
import { stripHtmlToText, toAbsoluteUrl, buildShareMeta, sanitizeRichHtml } from './html.ts';

test('stripHtmlToText: 剥离标签解实体压缩空白', () => {
  assert.strictEqual(stripHtmlToText('<p><b>Hi</b>&nbsp;there</p>'), 'Hi there');
});
test('stripHtmlToText: 空串/纯空白返回空', () => {
  assert.strictEqual(stripHtmlToText(''), '');
  assert.strictEqual(stripHtmlToText('<p></p>'), '');
  assert.strictEqual(stripHtmlToText('   '), '');
});
test('stripHtmlToText: 截断100字加省略号', () => {
  const out = stripHtmlToText('x'.repeat(120));
  assert.ok(out.endsWith('…'));
  assert.ok(out.length <= 101);
});
test('toAbsoluteUrl: 相对补origin绝对保留', () => {
  assert.strictEqual(toAbsoluteUrl('/a.png', 'https://x.com'), 'https://x.com/a.png');
  assert.strictEqual(toAbsoluteUrl('https://x.com/a.png', 'https://y.com'), 'https://x.com/a.png');
});
test('buildShareMeta: 无图无描述逐级兜底', () => {
  const m = buildShareMeta({ productName: '', featureImage: '', assetsImages: [], textDescription: '', shareImageUrl: '', shopName: '', shopIntro: '', origin: 'https://x.com', defaultImage: '/static/share-default.jpg', defaultTitle: 'Youshop - 精选好物', defaultDesc: '精选好物推荐' });
  assert.strictEqual(m.imgUrl, 'https://x.com/static/share-default.jpg');
  assert.strictEqual(m.title, 'Youshop - 精选好物');
  assert.strictEqual(m.desc, '精选好物推荐');
});
test('buildShareMeta: 主图链 featuredAsset→assets0→店铺→默认', () => {
  const base = { textDescription: 'd', shareImageUrl: 'https://x/s.png', shopName: 'S', shopIntro: 'i', origin: 'https://x.com', defaultImage: '/static/share-default.jpg', defaultTitle: 't', defaultDesc: 'dd' };
  assert.strictEqual(buildShareMeta({ productName: 'A', featureImage: 'https://x/fa.png', assetsImages: ['https://x/a0.png'], ...base }).imgUrl, 'https://x/fa.png');
  assert.strictEqual(buildShareMeta({ productName: 'A', featureImage: '', assetsImages: ['https://x/a0.png'], ...base }).imgUrl, 'https://x/a0.png');
  assert.strictEqual(buildShareMeta({ productName: 'A', featureImage: '', assetsImages: [], ...base }).imgUrl, 'https://x/s.png');
});

// ---- 富文本净化（H5 DOMParser 分支） ----
test('sanitizeRichHtml(DOMParser): position:fixed 被移除', () => {
  const out = sanitizeRichHtml('<p style="position:fixed;top:0">x</p>');
  assert.ok(!/position|fixed/i.test(out), out);
});
test('sanitizeRichHtml(DOMParser): background:url(//evil) 被移除', () => {
  const out = sanitizeRichHtml('<p style="background:url(//evil)">x</p>');
  assert.ok(!/url\(|background/i.test(out), out);
});
test('sanitizeRichHtml(DOMParser): javascript: 协议（含换行）被移除', () => {
  const out = sanitizeRichHtml('<a href="java\nscript:alert(1)">x</a>');
  assert.ok(!/href/i.test(out), out);
});
test('sanitizeRichHtml(DOMParser): 正常 color:#f00 保留', () => {
  const out = sanitizeRichHtml('<span style="color:#f00">x</span>');
  assert.ok(/style="[^"]*color/i.test(out), out);
});
test('sanitizeRichHtml(DOMParser): script/onerror 被移除', () => {
  const out = sanitizeRichHtml('<img src="https://x/a.png" onerror="alert(1)"><script>alert(1)</script>');
  assert.ok(!/onerror|<script/i.test(out), out);
});

// ---- 正则降级分支（小程序等无 DOM 环境） ----
function withRegexFallback(fn: () => void) {
  const g = globalThis as any;
  const saved = g.DOMParser;
  g.DOMParser = undefined;
  try { fn(); } finally { g.DOMParser = saved; }
}

test('sanitizeRichHtml(正则降级): position:fixed 被移除', () => {
  withRegexFallback(() => {
    const out = sanitizeRichHtml('<p style="position:fixed;left:0">x</p>');
    assert.ok(!/position|fixed|left/i.test(out), out);
  });
});
test('sanitizeRichHtml(正则降级): background:url(//evil) 被移除', () => {
  withRegexFallback(() => {
    const out = sanitizeRichHtml('<p style="background:url(//evil)">x</p>');
    assert.ok(!/url\(|background/i.test(out), out);
  });
});
test('sanitizeRichHtml(正则降级): javascript: 协议（含换行/实体）被移除', () => {
  withRegexFallback(() => {
    const a = sanitizeRichHtml('<a href="java\nscript:alert(1)">x</a>');
    const b = sanitizeRichHtml('<a href="java&#10;script:alert(1)">x</a>');
    assert.ok(!/href/i.test(a), a);
    assert.ok(!/href/i.test(b), b);
  });
});
test('sanitizeRichHtml(正则降级): 正常 color:#f00 保留', () => {
  withRegexFallback(() => {
    const out = sanitizeRichHtml('<span style="color:#f00">x</span>');
    assert.ok(/style="color:#f00"/i.test(out), out);
  });
});
