# -*- coding: utf-8 -*-
"""线上校验：手册新章节 + 导航截图可访问"""
import urllib.request

BASE = 'https://e.joho.cn/guanli/static/manual/'


def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.status, r.read()


s, body = get(BASE + 'index.html')
html = body.decode('utf-8')
print('manual status:', s, 'bytes:', len(body))
print('chapter op-4b:', 'op-4b' in html)
print('chapter title:', '返回、退出与手机端导航' in html)
print('shots referenced:', html.count('shots/nav1-'))
for n in ['nav1-02-subpage-back-means-home', 'nav1-03-subpage-back-lands-home-no-modal',
          'nav1-08-home-back-exit-confirm', 'nav1-10-browser-back-subpage-no-modal']:
    s2, b2 = get(BASE + 'shots/%s.png' % n)
    print('shot %-42s %s  %6d bytes' % (n, s2, len(b2)))