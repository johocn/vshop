# -*- coding: utf-8 -*-
# 风格模板库管理（引用徽标/历史版本/合并预览/删除警示）截图（超管视角 + 副本模板制造版本历史）
# 账号：superadmin / z123123
# 副本安全：复制出一个「截图演示副本」→ 改名（产生 v1 快照）→ 截图 → API 删除副本，不留垃圾数据。
# 只读导航：警示框截图后点「取消」，历史版本不点「回滚」，不做停用/删除真实模板。
from playwright.sync_api import sync_playwright
import time, json
BASE='https://e.joho.cn/guanli/'
SHOT='d:/zhao/vshop/web-admin/src/static/manual/shots/'
COPY_NAME='截图演示副本'
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
    pg.locator('input').nth(0).fill('superadmin')
    pg.locator('input').nth(1).fill('z123123')
    pg.locator('button, .btn').first.click(); time.sleep(3)
    # 选店页：点第一个店铺
    try:
        pg.locator('.item').first.click(timeout=8000); time.sleep(3)
        print('channel selected')
    except Exception as e:
        print('channel select fail:', str(e)[:120])
    print('登录后 url=',pg.url, 'body=', pg.inner_text('body')[:120].replace('\n','|'))
    # 准备副本：清残留 → 复制第一个模板 → 改名（产生版本快照）→ 查版本
    prep = pg.evaluate("""async (copyName) => {
      const t = localStorage.getItem('wa_auth_token');
      const ct = localStorage.getItem('wa_channel_token');
      const gql = async (query, variables) => {
        const h = {'Content-Type':'application/json','Authorization':'Bearer '+t};
        if (ct) h['vendure-token'] = ct;
        const r = await fetch('/admin-api', {method:'POST',
          headers:h,
          body: JSON.stringify({query, variables})});
        return r.json();
      };
      const F = 'id name app theme pages version enabled updatedAt';
      let list = [];
      for (const app of ['vshop','nshop']) {
        const r = await gql('query ($app: String) { shopTemplates(app: $app) { '+F+' } }', {app});
        if (r.data && Array.isArray(r.data.shopTemplates) && r.data.shopTemplates.length) { list = r.data.shopTemplates; break; }
      }
      if (!list.length) return JSON.stringify({err:'NO_TEMPLATES'});
      const stale = list.find(x=>x.name===copyName);
      if (stale) await gql('mutation ($id: ID!) { deleteShopTemplate(id: $id) }', {id: stale.id});
      const t0 = list[0];
      const cp = await gql('mutation ($id: ID!) { copyShopTemplate(id: $id) { '+F+' } }', {id: t0.id});
      const c0 = cp.data && cp.data.copyShopTemplate;
      if (!c0) return JSON.stringify({err:'COPY_FAIL', msg:(cp.errors?cp.errors[0].message:JSON.stringify(cp)).slice(0,200)});
      const up = await gql('mutation ($input: UpdateShopTemplateInput!) { updateShopTemplate(input: $input) { '+F+' } }', {input: {id: c0.id, name: copyName}});
      const vs = await gql('query ($id: ID!) { templateVersions(id: $id) { id version name note createdAt } }', {id: c0.id});
      return JSON.stringify({src:{id:t0.id,app:t0.app,name:t0.name}, copy:{id:c0.id,app:c0.app,version:(up.data&&up.data.updateShopTemplate?up.data.updateShopTemplate.version:c0.version)}, versions:(vs.data&&vs.data.templateVersions||[]).map(v=>({v:v.version,name:v.name,note:v.note}))});
    }""", COPY_NAME)
    print('prep=', prep)
    info = json.loads(prep)
    copy_id = (info.get('copy') or {}).get('id','')
    copy_app = (info.get('copy') or {}).get('app','vshop')
    if info.get('err'):
        print('PREP ERR:', info['err'])
    # 进模板列表页
    pg.goto(BASE+'#/pages/platform/templates/index',wait_until='networkidle',timeout=45000); time.sleep(5)
    # 切到副本所在 app
    try:
        pg.locator('.chip', has_text='vshop 商城' if copy_app=='vshop' else 'nshop 商城').first.tap(timeout=5000); time.sleep(3)
        print('app chip tapped:', copy_app)
    except Exception as e:
        print('app chip tap fail:', str(e)[:120])
    print('tpl list body=',pg.inner_text('body')[:500].replace('\n','|'))
    shot(pg,'tpl_list_badges.png')
    # 打开副本模板编辑弹层
    try:
        pg.locator('.item', has_text=COPY_NAME).first.tap(timeout=8000); time.sleep(2.5)
        print('edit modal body=',pg.inner_text('body')[:300].replace('\n','|'))
        # 历史版本 Tab
        pg.locator('.tab', has_text='历史版本').tap(timeout=5000); time.sleep(3)
        print('versions body=',pg.inner_text('body')[:400].replace('\n','|'))
        shot(pg,'tpl_history.png')
        # 合并预览 Tab（默认无覆盖场景，mApp=模板 app）
        pg.locator('.tab', has_text='合并预览').tap(timeout=5000); time.sleep(1.5)
        pg.locator('.pop .btn', has_text='生成合并预览').first.tap(timeout=5000); time.sleep(3.5)
        if pg.locator('.mp').count() == 0:
            print('merged preview not shown, body=',pg.inner_text('body')[:400].replace('\n','|'))
        shot(pg,'tpl_preview.png')
        # 关闭弹层 → 副本删除警示框 → 截图后取消
        pg.locator('.pop-close').tap(timeout=5000); time.sleep(1.5)
        pg.locator('.item', has_text=COPY_NAME).locator('.link', has_text='删除').first.tap(timeout=8000); time.sleep(2)
        print('warn modal body=',pg.inner_text('body')[:400].replace('\n','|'))
        shot(pg,'tpl_warn.png')
        try:
            pg.locator('text=取消').first.tap(timeout=5000); time.sleep(1)
            print('warn cancelled, mask count=', pg.locator('.mask').count())
        except Exception as e:
            print('cancel tap fail:', str(e)[:120])
        warn_from = 'copy-template'
    except Exception as e:
        print('template flow fail:', str(e)[:200])
        warn_from = 'flow-error'
        shot(pg,'tpl_warn.png')
    print('WARN FROM:', warn_from)
    # 清理副本（API 删除，不留垃圾数据）
    if copy_id:
        del_res = pg.evaluate("""async (id) => {
          const t = localStorage.getItem('wa_auth_token');
          const ct = localStorage.getItem('wa_channel_token');
          const h = {'Content-Type':'application/json','Authorization':'Bearer '+t};
          if (ct) h['vendure-token'] = ct;
          const r = await fetch('/admin-api', {method:'POST',
            headers:h,
            body: JSON.stringify({query:'mutation ($id: ID!) { deleteShopTemplate(id: $id) }', variables:{id}})});
          const d = await r.json();
          return JSON.stringify({deleted: d.data ? d.data.deleteShopTemplate : null, err: d.errors ? d.errors[0].message : null});
        }""", copy_id)
        print('DELETE_COPY=', del_res)
    else:
        print('DELETE_COPY=SKIP (no copy id)')
    b.close()
print('done')
