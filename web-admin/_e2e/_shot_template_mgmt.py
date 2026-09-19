# -*- coding: utf-8 -*-
# 风格模板库管理（引用徽标/历史版本/合并预览/删除警示）截图（租户管理员视角，390x844 dpr=2）
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
# 只截图与导航：警示框截图后点「取消」，历史版本不点「回滚」，不做删除/停用等写操作
from playwright.sync_api import sync_playwright
import time
BASE='https://e.joho.cn/guanli/'
SHOT='d:/zhao/vshop/web-admin/src/static/manual/shots/'
def shot(pg, name, delay=0):
    if delay: time.sleep(delay)
    pg.screenshot(path=SHOT+name)
    print('shot:', name)
with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    ctx=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg=ctx.new_page()
    pg.goto(BASE,wait_until='networkidle',timeout=45000)
    pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle',timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible',timeout=30000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click(); time.sleep(7)
    print('登录后 url=',pg.url, 'body=', pg.inner_text('body')[:120].replace('\n','|'))
    # 选店：通过 API 获取 t2 channel token 注入 localStorage（绕开选店 UI 交互不稳定）
    tok = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c = (d.data.myTenantAccess.channels||[]).find(x=>x.code==='t2');
        if (c) { localStorage.setItem('wa_channel_token', c.token); localStorage.setItem('wa_channel_code','t2'); return 'OK:'+c.token.slice(0,6); }
        return 'NOCHANNEL';
      }).catch(e=>'ERR:'+e.message);
    }""")
    print('channel token inject=', tok)
    # 1) 模板列表（引用徽标）
    pg.goto(BASE+'#/pages/platform/templates/index',wait_until='networkidle',timeout=45000); time.sleep(6)
    print('tpl list body=',pg.inner_text('body')[:500].replace('\n','|'))
    shot(pg,'tpl_list_badges.png')
    # 2) 打开第一个模板编辑弹层 → 历史版本 Tab
    try:
        pg.locator('.item').first.tap(); time.sleep(2.5)
        print('edit modal body=',pg.inner_text('body')[:300].replace('\n','|'))
        pg.locator('.tab', has_text='历史版本').tap(); time.sleep(3.5)
        print('versions body=',pg.inner_text('body')[:400].replace('\n','|'))
        shot(pg,'tpl_history.png')
        # 3) 合并预览 Tab（mApp 默认即模板 app，无覆盖场景直接生成；不做任何写操作）
        pg.locator('.tab', has_text='合并预览').tap(); time.sleep(1.5)
        pg.locator('.pop .btn', has_text='生成合并预览').first.tap(); time.sleep(3.5)
        if pg.locator('.mp').count() == 0:
            print('merged preview not shown, body=',pg.inner_text('body')[:400].replace('\n','|'))
        shot(pg,'tpl_preview.png')
        # 4) 关闭弹层 → 删除警示框（优先被引用模板；无则第一个模板）→ 截图后取消
        pg.locator('.pop-close').tap(); time.sleep(1.5)
        refitem = pg.locator('.item', has_text='引用').first
        if refitem.count() > 0:
            refitem.locator('.link', has_text='删除').tap()
            warn_from = 'referenced-template'
        else:
            pg.locator('.item .link', has_text='删除').first.tap()
            warn_from = 'first-template'
        time.sleep(2)
        print('warn modal body=',pg.inner_text('body')[:400].replace('\n','|'))
        shot(pg,'tpl_warn.png')
        try:
            pg.locator('text=取消').first.tap(timeout=5000); time.sleep(1)
            print('warn cancelled, mask count=', pg.locator('.mask').count())
        except Exception as e:
            print('cancel tap fail:', str(e)[:120])
    except Exception as e:
        print('template flow fail:', str(e)[:160])
        warn_from = 'flow-error'
        shot(pg,'tpl_warn.png')
    print('WARN FROM:', warn_from)
    b.close()
print('done')
