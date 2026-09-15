import { test } from 'node:test';
import assert from 'node:assert';
import { stripHtmlToText, toAbsoluteUrl, buildShareMeta } from './html.ts';

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
  const m = buildShareMeta({ productName: '', featureImage: '', assetsImages: [], textDescription: '', shareImageUrl: '', shopName: '', shopIntro: '', origin: 'https://x.com', defaultImage: '/static/share-default.jpg', defaultTitle: 'VShop - 精选好物', defaultDesc: '精选好物推荐' });
  assert.strictEqual(m.imgUrl, 'https://x.com/static/share-default.jpg');
  assert.strictEqual(m.title, 'VShop - 精选好物');
  assert.strictEqual(m.desc, '精选好物推荐');
});
test('buildShareMeta: 主图链 featuredAsset→assets0→店铺→默认', () => {
  const base = { textDescription: 'd', shareImageUrl: 'https://x/s.png', shopName: 'S', shopIntro: 'i', origin: 'https://x.com', defaultImage: '/static/share-default.jpg', defaultTitle: 't', defaultDesc: 'dd' };
  assert.strictEqual(buildShareMeta({ productName: 'A', featureImage: 'https://x/fa.png', assetsImages: ['https://x/a0.png'], ...base }).imgUrl, 'https://x/fa.png');
  assert.strictEqual(buildShareMeta({ productName: 'A', featureImage: '', assetsImages: ['https://x/a0.png'], ...base }).imgUrl, 'https://x/a0.png');
  assert.strictEqual(buildShareMeta({ productName: 'A', featureImage: '', assetsImages: [], ...base }).imgUrl, 'https://x/s.png');
});