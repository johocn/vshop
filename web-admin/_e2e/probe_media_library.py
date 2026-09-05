# -*- coding: utf-8 -*-
# 验证商品创建页媒体库：打开弹窗, 断言缩略图真实加载(naturalWidth>0), 并截图
from playwright.sync_api import sync_playwright
import time
BASE='https://e.joho.cn/guanli/'
with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    pg=b.new_page(viewport={'width':1440,'height':900}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)[:160]))
    pg.goto(BASE,wait_until='networkidle',timeout=45000)
    pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle',timeout=45000)
    pg.locator('input').nth(0).fill('superadmin'); pg.locator('input').nth(1).fill('z123123')
    pg.locator('button, .btn').first.click(); time.sleep(4)
    pg.locator('.item',has_text='t1').first.click(); time.sleep(4)
    pg.goto(BASE+'#/pages/product/create/index',wait_until='networkidle',timeout=45000); time.sleep(3)
    # 打开第一个媒体库(触发区 .mp__add, 含「添加图片」)
    add=pg.locator('.mp__add').first
    add.click(); time.sleep(4)
    overlay=pg.locator('.mlm__overlay')
    print('媒体库弹窗可见=', overlay.count()>0 and overlay.first.is_visible())
    cells=pg.locator('.mlm__cell').count()
    # 检查缩略图真实加载
    loaded=0; broken=0
    imgs=pg.locator('.mlm__cell-thumb img')
    for i in range(imgs.count()):
        nw=imgs.nth(i).evaluate('(el)=>el.naturalWidth||0')
        st=imgs.nth(i).evaluate('(el)=>({nw:el.naturalWidth||0, src:el.getAttribute("src")||el.src} )')
        if nw>0: loaded+=1
        else: broken+=1
        if i==0: print('首图:', st)
    print('mlm__cell 数量=',cells,'缩略图真实加载=',loaded,'未加载=',broken)
    pg.screenshot(path='_e2e/media_library_1440.png', full_page=True)
    print('PAGEERRORS=', errs if errs else '(none)')
    b.close()