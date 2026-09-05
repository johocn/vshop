# -*- coding: utf-8 -*-
# 验证链路: 点选图片 -> 打标「主图」-> 确认(后端 setAssetTags 生效) -> 再确认回填商品表单主图
# 附带检查打标面板是否存在「描述」输入框
from playwright.sync_api import sync_playwright
import time, urllib.request, json
BASE='https://e.joho.cn/guanli/'
TARGET_ID='42'  # 刚上传的 baidu.jpg
def gql(url, token, ch, query, variables):
    req=urllib.request.Request(url, data=json.dumps({'query':query,'variables':variables}).encode(),
        headers={'Content-Type':'application/json','Authorization':'Bearer '+token,'vendure-token':ch})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return json.loads(e.read() or b'{}')
def ft(l):  # 多个媒体库实例共存(v-show), 一律取当前打开的第一个
    return l.first
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
    pg.locator('.mp__add').first.click(); time.sleep(4)
    # ① 用 :visible 锁定当前打开的媒体库实例(多实例 v-show 共存)
    print('网格图片数=', pg.locator('.mlm__cell:visible').count())
    pg.locator('.mlm__cell:visible').first.click(); time.sleep(2)
    print('已选计数:', pg.locator('.mlm__picked:visible').inner_text().strip())
    # ② 打标
    pg.locator('.mlm__tag-main:visible').click(force=True); time.sleep(2)
    desc_placeholder = pg.locator('input[placeholder*="描述"]').count()
    print('打标面板含描述输入框=', bool(desc_placeholder))
    pg.screenshot(path='_e2e/media_tagpanel_1440.png')
    names=[c.inner_text() for c in pg.locator('.mlm__panel-chip').all()]
    print('面板分类:', names)
    pg.locator('.mlm__panel-chip',has_text='主图').first.click(); time.sleep(1)
    print('已选分类:', pg.locator('.mlm__panel-count:visible').inner_text().strip())
    pg.locator('.mlm__panel-confirm:visible').click(); time.sleep(4)
    print('出现「已打标」提示=', '已打标' in pg.locator('body').inner_text())
    pg.screenshot(path='_e2e/media_tagged_grid_1440.png')
    # 后端验证: id42 的 assetTags
    st=pg.evaluate('()=>({token:localStorage.getItem("wa_auth_token"),ch:localStorage.getItem("wa_channel_token")})')
    r=gql('https://e.joho.cn/admin-api', st['token'], st['ch'],
      'query A($take:Int,$skip:Int){ assetLibrary(take:$take,skip:$skip){ items{ id assetTags } totalItems } }',
      {'take':200,'skip':0})
    hit=next((i for i in r.get('data',{}).get('assetLibrary',{}).get('items',[]) if str(i['id'])==TARGET_ID), None)
    print('后端 id42 assetTags=', hit['assetTags'] if hit else '(not found)')
    print('「主图」标签生效=', '主图' in (hit['assetTags'] if hit else []))
    # ③ 回填商品表单主图: 点「确定」关闭媒体库
    pg.locator('.mlm__confirm:visible').click(); time.sleep(3)
    thumbs=pg.locator('.mp__thumb img')
    print('商品表单主图缩略图=', thumbs.count(),
          '加载=', thumbs.first.evaluate('(e)=>e.naturalWidth>0') if thumbs.count() else 'na')
    pg.screenshot(path='_e2e/media_confirm_backfill_1440.png')
    print('PAGEERRORS=', errs if errs else '(none)')
    b.close()