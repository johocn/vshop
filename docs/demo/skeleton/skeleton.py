# -*- coding: utf-8 -*-
"""三件套骨架库：手机截图 + 手册章节生成（可复用，供 docs/demo/skeleton 各用例 import）。

设计目标：每个新功能用例只需「填业务步骤」，骨架统一负责：
  1) 手机视口（390×844 @2x）上下文与 web-admin 登录态注入；
  2) 分步截图（自动命名 + 记录步骤）；
  3) 生成 markdown 手册章节（含截图相对引用）。

依赖：playwright（sync）+ 同目录下 login_util.py（API 层，放在 playwright/ 下，需加到 sys.path）。
"""
import os
import json
import sys
from pathlib import Path

# 允许 from login_util import ... ：login_util 固定在 playwright/，导入 skeleton 时即加入 sys.path
BASE = Path(__file__).resolve().parent
SHOT_DIR = BASE / "shots"          # 截图统一目录 skeleton/shots/<case_id>/
CASE_DIR = BASE / "cases"          # 手册章节统一目录 skeleton/cases/<case_id>.md
DEFAULT_APP = "https://e.joho.cn/guanli/"
DEFAULT_STORAGE_KEYS = ("wa_auth_token", "wa_channel_token", "wa_channel_code")

_PLAYWRIGHT_DIR = BASE.parent / "playwright"
if _PLAYWRIGHT_DIR.exists() and str(_PLAYWRIGHT_DIR) not in sys.path:
    sys.path.insert(0, str(_PLAYWRIGHT_DIR))


def mobile_context(playwright, state, app=DEFAULT_APP, viewport=(390, 844), dpr=2):
    """创建带登录态的浏览器上下文与页面（手机视口）。
    返回 (page)；state 为 login_util.admin_login_state() 的结果字典。
    全局对象可用 playwright 资源：需外层 with sync_playwright() 提供。
    """
    ctx = playwright.new_context(viewport={"width": viewport[0], "height": viewport[1]},
                                 device_scale_factor=dpr)
    inject = "".join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(state.get(k, ''))});\n"
                     for k in DEFAULT_STORAGE_KEYS)
    ctx.add_init_script(inject)
    page = ctx.new_page()
    return page


class Manual:
    """手册章节构建器：截图登记 + 步骤记录，最终输出 markdown。"""

    def __init__(self, case_id, title, app=DEFAULT_APP):
        self.case_id = case_id
        self.title = title
        self.app = app
        self.shot_dir = SHOT_DIR / case_id
        self.shot_dir.mkdir(parents=True, exist_ok=True)
        # 图片在 md 里的相对引用（md 位于 cases/<case>.md，图片位于 shots/<case>/）
        self._img_prefix = f"../shots/{case_id}/"
        self._steps = []
        self._rows = []          # (序号, 标题, 说明, 图片文件名)
        self._ok = True
        self._map = {}

    # ---- 截图登记 ----
    def shot(self, page, step, name, title, note=""):
        """截图并登记一步。返回文件名。name 用英文短横线（勿含中文/空格）。"""
        fname = f"{step:02d}_{name}.png"
        path = self.shot_dir / fname
        page.screenshot(path=str(path), full_page=False)
        self._rows.append((step, title, note, path.name))
        self._map.setdefault(name, path)
        print(f"  [S{step:02d}] {title} -> shots/{self.case_id}/{fname}")
        return path

    def note(self, md_text):
        """在手册对应位置插入说明性 markdown（跟随下一步骤或直接追加）。"""
        if self._rows and (md_text.strip().startswith("!") is False):
            self._rows.append((None, None, md_text, None))  # 无图说明行
        else:
            self._steps.append(md_text)

    def fail(self, reason):
        self._ok = False
        self._steps.append(f"> ⚠️ **用例失败：** {reason}")

    @property
    def ok(self):
        return self._ok

    # ---- 手册生成 ----
    def _render_rows(self):
        out = []
        for step, title, note, fname in self._rows:
            if step is None and fname is None:
                out.append("\n" + (note or "") + "\n")
                continue
            out.append(f"### {step}. {title}")
            if note:
                out.append(note)
            out.append(f"\n![{title}]({self._img_prefix}{fname})")
            out.append("")
        return out

    def render_md(self, extra_head=None):
        lines = [f"# {self.title}", "",
                 f"> 用例ID：`{self.case_id}` ｜ 视口：390×844 @2x（手机视图） ｜ 站点：`{self.app}`", ""]
        if extra_head:
            lines.extend(extra_head); lines.append("")
        if self._steps:
            lines.extend(self._steps); lines.append("")
        lines.extend(self._render_rows())
        if not self._rows and self._ok:
            lines.append("_(本用例未产生截图)_")
        return "\n".join(lines)

    def save_md(self):
        CASE_DIR.mkdir(parents=True, exist_ok=True)
        md = CASE_DIR / f"{self.case_id}.md"
        md.write_text(self.render_md(), encoding="utf-8")
        print("  md ->", md)
        return md