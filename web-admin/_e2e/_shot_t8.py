# -*- coding: utf-8 -*-
# T8 回归截图：租户成员角色权限门禁与密码管理（普通租户管理员视角，390x844 dpr=2）
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
from playwright.sync_api import sync_playwright
import time
BASE='https://e.joho.cn/guanli/'
SHOT='d:/zhao/vshop/web-admin/src/static/manual/shots/'
def shot(pg, name, delay=0):
    if delay: time.sleep(delay)
    pg.screenshot(path=SHOT+name)
    print('shot:', name)
def closeMask(pg):
    # 点遮罩左上角空白区（避开居中 pop，pop 有 @tap.stop 无法关闭），连点关闭叠层弹窗
    pg.mouse.click(20,100); time.sleep(1)
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
    # 1) members 列表页
    pg.goto(BASE+'#/pages/platform/members/index',wait_until='networkidle',timeout=45000); time.sleep(5)
    print('members body=',pg.inner_text('body')[:900].replace('\n','|'))
    shot(pg,'r01_tenant_members.png')
    # 2) 添加人员弹层 + 角色下拉
    pg.locator('.head-btn', has_text='添加人员').first.tap(); time.sleep(2)
    pg.locator('.pick-trigger').first.tap(); time.sleep(2)
    print('add modal body=',pg.inner_text('body')[:500].replace('\n','|'))
    shot(pg,'r02_add_member_roles.png',1)
    closeMask(pg)  # 关闭角色选择弹层
    closeMask(pg)  # 关闭添加人员弹层
    print('masks after close=', pg.locator('.mask').count())
    # 3) 分配角色弹层：点成员行「角色」（用第一个成员，若陈店长在前也满足）
    link = pg.locator('.item .link', has_text='角色').first
    try:
        link.wait_for(state='visible',timeout=10000)
        link.tap(timeout=10000)
    except Exception as e:
        print('tap fail, force click:', str(e)[:120])
        link.click(force=True)
    time.sleep(2)
    print('assign modal body=',pg.inner_text('body')[:500].replace('\n','|'))
    shot(pg,'r03_assign_roles.png',1)
    closeMask(pg)
    # 4) 修改密码页 manual=1
    pg.locator('.head-link', has_text='修改密码').first.tap(); time.sleep(4)
    print('改密页 url=',pg.url)
    print('改密页 body=',pg.inner_text('body')[:400].replace('\n','|'))
    shot(pg,'r04_change_password.png',1)
    b.close()
print('done')
