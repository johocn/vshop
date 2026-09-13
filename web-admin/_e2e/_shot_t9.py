# -*- coding: utf-8 -*-
# T9 回归截图：成员信息弹窗（点击成员姓名查看用户信息，390x844 dpr=2）
# 账号：guoxinnanshan@163.com / you123123（田经理/租户管理员）
from playwright.sync_api import sync_playwright
import time, os
BASE = 'https://e.joho.cn/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/'
TMP = 'd:/zhao/vshop/web-admin/_e2e/_tmp_t9_close.png'  # 临时验证截图，脚本结束删除

def check(pg, name, texts):
    pop = pg.locator('.pop', has_text='用户信息')
    pop.wait_for(state='visible', timeout=10000)
    pop_text = pop.inner_text()
    missing = [t for t in texts if t not in pop_text]
    if missing:
        raise AssertionError(f'PASS-FAIL {name} 缺失文本: {missing}')
    print('PASS', name, '->', ','.join(texts))

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    # 登录（复用 _shot_t8.py 流程）
    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=30000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click(); time.sleep(7)
    print('登录后 url=', pg.url, 'body=', pg.inner_text('body')[:120].replace('\n', '|'))
    # 选店：API 获取 t2 channel token 注入 localStorage（绕开选店 UI）
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
    pg.goto(BASE + '#/pages/platform/members/index', wait_until='networkidle', timeout=45000); time.sleep(5)
    print('members body=', pg.inner_text('body')[:500].replace('\n', '|'))
    # 2) 点击「田经理」姓名 → 弹窗
    name_el = pg.locator('.item', has_text='田经理').locator('.name').first
    name_el.wait_for(state='visible', timeout=15000)
    name_el.tap(); time.sleep(2)
    print('after tap body=', pg.inner_text('body')[:600].replace('\n', '|'))
    check(pg, '弹窗内容', ['用户信息', '登录用户名', 'guoxinnanshan@163.com', '人员 ID', '启用'])
    # 3) 截图（目标截图，保留）
    pg.screenshot(path=SHOT + 'r05_member_info.png')
    print('shot: r05_member_info.png')
    # 4) 点击 × 关闭，断言弹窗消失
    pg.locator('.pop-close').first.tap(); time.sleep(2)
    cnt = pg.locator('.pop', has_text='用户信息').count()
    assert cnt == 0, f'PASS-FAIL 弹窗未关闭, count={cnt}'
    print('PASS 弹窗已关闭')
    # 5) 临时截图（验证关闭态，脚本结束删除）
    pg.screenshot(path=TMP)
    print('shot: tmp_close (deleted at end)')
    b.close()
if os.path.exists(TMP):
    os.remove(TMP)
    print('removed tmp:', TMP)
print('done')
