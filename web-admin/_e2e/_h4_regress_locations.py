# -*- coding: utf-8 -*-
"""H4-1 线上回归：web-admin 网点 CRUD（验证 deleteLocation 修复，390x844 dpr=2）
流程：登录 t2 → 列表 → 新建（名称/配送/城市/坐标）→ 保存 → 列表出现
      → 删除 → 列表移除（修复前删除始终不生效）
"""
import os, time, json
from playwright.sync_api import sync_playwright

BASE = 'https://e.joho.cn/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/'
os.makedirs(SHOT, exist_ok=True)
TEST_NAME = '回归测试网点-H4'

FILL_JS = """(a) => {
  const [idx, v] = a;
  const inputs = Array.from(document.querySelectorAll('input')).filter(i => i.offsetParent !== null);
  const el = inputs[idx];
  if (!el) return 'NOINPUT:' + idx;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'OK:' + el.value;
}"""
CHECK_JS = """() => {
  const hits = [];
  Array.from(document.querySelectorAll('label.ck, .uni-checkbox-wrapper')).forEach(el => {
    const t = (el.innerText || '');
    if (t.includes('邮寄')) { el.click(); hits.push('MAIL'); }
    if (t.includes('自提')) { el.click(); hits.push('PICKUP'); }
  });
  return JSON.stringify(hits);
}"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page()

    fail = 0

    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=30000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click(); time.sleep(7)
    print('login url=', pg.url)
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
    print('channel inject=', tok)
    pg.reload(wait_until='networkidle', timeout=45000); time.sleep(3)

    pg.goto(BASE + '#/pages/inventory/locations/index', wait_until='networkidle', timeout=45000); time.sleep(5)
    print('list body=', pg.inner_text('body')[:200].replace('\n', '|'))

    # 新建
    r = pg.evaluate("""() => {
      const els = Array.from(document.querySelectorAll('*')).filter(e => e.textContent && e.textContent.trim().includes('新建网点') && e.offsetParent !== null);
      const btn = els[els.length - 1];
      if (!btn) return 'NOBTN';
      btn.click();
      return 'CLICKED:' + btn.tagName;
    }""")
    print('add click=', r); time.sleep(3)

    print('fill name=', pg.evaluate(FILL_JS, [0, TEST_NAME]))
    print('checkbox=', pg.evaluate(CHECK_JS))
    time.sleep(0.5)
    print('fill city=', pg.evaluate(FILL_JS, [2, '北京']))
    print('fill lat=', pg.evaluate(FILL_JS, [3, '39.90']))
    print('fill lng=', pg.evaluate(FILL_JS, [4, '116.40']))

    r2 = pg.evaluate("""() => {
      const btns = Array.from(document.querySelectorAll('uni-button, button')).filter(e => (e.textContent||'').includes('保存') && e.offsetParent !== null);
      if (!btns.length) return 'NOBTN';
      btns[btns.length - 1].click();
      return 'CLICKED:' + btns[btns.length - 1].className;
    }""")
    print('save click=', r2); time.sleep(4)

    body = ''
    saved = False
    for _ in range(12):
        body = pg.inner_text('body')
        if TEST_NAME in body:
            saved = True
            break
        time.sleep(1)
    print('body after save=', body[:200].replace('\n', '|'))
    if not saved:
        fail += 1
        print('FAIL: 保存后列表未出现新网点')
    else:
        print('PASS: 新建网点成功')
        pg.screenshot(path=SHOT + 'h4_locations_created.png')

        # 删除（验证 deleteLocation 修复）
        del_click = pg.evaluate("""(name) => {
          const card = Array.from(document.querySelectorAll('.card')).find(e => (e.textContent||'').includes(name));
          if (!card) return 'NOCARD';
          const els = Array.from(card.querySelectorAll('*')).filter(e => (e.textContent||'').trim() === '删除' && e.offsetParent !== null);
          if (!els.length) return 'NODEL';
          els[els.length-1].click();
          return 'DELCLICK:' + els[els.length-1].tagName;
        }""", TEST_NAME)
        print('delete click=', del_click); time.sleep(1.5)
        del_resp = pg.evaluate("""() => {
          const els = Array.from(document.querySelectorAll('.uni-modal__btn, .uni-modal__btn_primary, button, uni-button'));
          const vis = els.filter(e => e.offsetParent !== null);
          const ok = vis.filter(e => (e.textContent||'').includes('确定'));
          if (ok.length) { ok[ok.length-1].click(); return 'OK:' + ok[ok.length-1].textContent; }
          return 'NOMODAL:' + vis.length;
        }""")
        print('delete confirm=', del_resp); time.sleep(3)

        gone = True
        for _ in range(8):
            body = pg.inner_text('body')
            if TEST_NAME not in body:
                break
            time.sleep(1)
        else:
            gone = False
        if gone:
            print('PASS: 删除网点成功（deleteLocation 修复生效）')
            pg.screenshot(path=SHOT + 'h4_locations_after_delete.png')
        else:
            fail += 1
            print('FAIL: 删除后网点仍在列表')

    b.close()
    print('[DONE]', 'ALL_PASS' if fail == 0 else f'FAIL={fail}')
