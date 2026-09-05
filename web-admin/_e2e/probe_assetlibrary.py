# -*- coding: utf-8 -*-
# 复现: 登录后直接调 assetLibrary(take=30,skip=0,tags) 与无tags, 对比真实错误
from playwright.sync_api import sync_playwright
import time, urllib.request, json
BASE='https://e.joho.cn/guanli/'
def gql(url, token, ch, query, variables):
    req=urllib.request.Request(url, data=json.dumps({'query':query,'variables':variables}).encode(),
        headers={'Content-Type':'application/json','Authorization':'Bearer '+token,'vendure-token':ch})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b'{}')
with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    pg=b.new_page(viewport={'width':1440,'height':900})
    pg.goto(BASE,wait_until='networkidle',timeout=45000)
    pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle',timeout=45000)
    pg.locator('input').nth(0).fill('superadmin'); pg.locator('input').nth(1).fill('z123123')
    pg.locator('button, .btn').first.click(); time.sleep(4)
    pg.locator('.item',has_text='t1').first.click(); time.sleep(4)
    st=pg.evaluate('()=>({token:localStorage.getItem("wa_auth_token"),ch:localStorage.getItem("wa_channel_token"),uid:localStorage.getItem("wa_user_id")})')
    url='https://e.joho.cn/admin-api'
    q='query AssetLibrary($take:Int,$skip:Int,$tags:[String]){ assetLibrary(take:$take,skip:$skip,tags:$tags){ totalItems items{ id name preview source width height } } }'
    tags=["主图","白底图","细节图","场景图","实拍图","规格图","商详图"]
    r1=gql(url,st['token'],st['ch'],q,{'take':30,'skip':0,'tags':tags})
    r2=gql(url,st['token'],st['ch'],q,{'take':30,'skip':0})
    print('tags=[主图...] =>', json.dumps(r1, ensure_ascii=False)[:400])
    print('tags=null     =>', json.dumps(r2, ensure_ascii=False)[:400])
    b.close()