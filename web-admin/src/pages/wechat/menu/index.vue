<template>
  <view class="page">
    <view class="hint">{{ $t('wechatOps.menuHint') }}</view>

    <!-- 手机预览区 -->
    <view class="phone">
      <view class="phone-body">
        <view v-for="(b, i) in buttons" :key="i" class="top-btn">
          <text class="btn" :class="{ on: sel.level === 1 && sel.p === i }" @tap="clickTop(i)">{{ b.name || $t('wechatOps.menuUnnamed') }}</text>
          <view v-if="sel.level === 1 && sel.p === i" class="sub-wrap">
            <view v-for="(c, j) in b.children" :key="j" class="sub-row">
              <text class="btn sub" :class="{ on: sel.level === 2 && sel.p === i && sel.c === j }" @tap="clickSub(i, j)">{{ c.name || $t('wechatOps.menuUnnamed') }}</text>
              <text class="mini" @tap="moveSub(i, j, -1)">↑</text>
              <text class="mini" @tap="moveSub(i, j, 1)">↓</text>
            </view>
            <view class="add-sub" @tap="addSub(i)">+ {{ $t('wechatOps.menuAddSub') }}</view>
          </view>
        </view>
        <view class="add-top" @tap="addTop">+ {{ $t('wechatOps.menuAddTop') }}</view>
      </view>
    </view>

    <!-- 属性编辑 -->
    <view v-if="selNode" class="card">
      <view class="row-title">{{ $t('wechatOps.menuEditTitle') }}</view>
      <input class="ipt" v-model="selNode.name" :maxlength="16" :placeholder="$t('wechatOps.phName')" />
      <picker :range="typeLabels" @change="onTypeChange">
        <view class="ipt picker">{{ $t('wechatOps.menuType') }}：{{ typeLabels[selTypeIndex] }}</view>
      </picker>
      <text class="tip">{{ selHint }}</text>
      <template v-if="curFields.includes('key')">
        <input class="ipt" :maxlength="-1" v-model="selNode.key" :placeholder="$t('wechatOps.phKey')" />
      </template>
      <template v-if="curFields.includes('url')">
        <input class="ipt" :maxlength="-1" v-model="selNode.url" :placeholder="$t('wechatOps.phUrl')" />
      </template>
      <template v-if="curFields.includes('appid')">
        <input class="ipt" :maxlength="-1" v-model="selNode.appid" :placeholder="$t('wechatOps.phAppid')" />
        <input class="ipt" :maxlength="-1" v-model="selNode.pagepath" :placeholder="$t('wechatOps.phPagepath')" />
      </template>
      <template v-if="curFields.includes('media_id')">
        <input class="ipt" :maxlength="-1" v-model="selNode.mediaId" :placeholder="$t('wechatOps.phMediaId')" />
      </template>
      <view class="ops">
        <text class="op" @tap="moveSel(-1)">{{ $t('wechatOps.moveUp') }}</text>
        <text class="op" @tap="moveSel(1)">{{ $t('wechatOps.moveDown') }}</text>
        <text class="op del" @tap="removeSel">{{ $t('wechatOps.del') }}</text>
      </view>
    </view>

    <!-- 保存的本地草稿（localStorage） -->
    <view class="card">
      <view class="row-title">{{ $t('wechatOps.menuDraft') }}</view>
      <input class="ipt" :maxlength="-1" v-model="draftName" :placeholder="$t('wechatOps.phDraftName')" />
      <view class="ops">
        <text class="op" @tap="saveDraft">{{ $t('wechatOps.saveDraft') }}</text>
        <text class="op" @tap="loadDraft">{{ $t('wechatOps.loadDraft') }}</text>
      </view>
    </view>

    <view class="footer">
      <button class="act" :disabled="busy" @tap="pullRemote">{{ $t('wechatOps.pullMenu') }}</button>
      <button class="act primary" :disabled="busy" @tap="publish">{{ $t('wechatOps.publish') }}</button>
    </view>
    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchWechatMenu, publishWechatMenu } from '../../../apis/wechat';

function toast(title: string) {
  uni.showToast({ title, icon: 'none' });
}

// ============ 微信菜单类型字典 ============
const MENU_TYPES: Record<string, { label: string; fields: string[]; hint: string }> = {
  click: { label: '点击推事件', fields: ['key'], hint: '用户点击后推事件给服务器（自定义 key）' },
  view: { label: '跳转链接', fields: ['url'], hint: '用户点击后跳转到指定网页' },
  miniprogram: { label: '跳转小程序', fields: ['appid', 'pagepath'], hint: '点击跳转到关联的小程序页面' },
  scancode_push: { label: '扫码推事件', fields: ['key'], hint: '点击弹出扫码，结果推给服务器' },
  scancode_waitmsg: { label: '扫码带提示', fields: ['key'], hint: '点击弹出扫码，结果推给服务器并提示' },
  pic_sysphoto: { label: '系统拍照发图', fields: ['key'], hint: '点击直接调用系统相机拍照' },
  pic_photo_or_album: { label: '拍照或相册', fields: ['key'], hint: '点击弹出拍照/相册选择' },
  pic_weixin: { label: '微信相册发图', fields: ['key'], hint: '点击从微信相册选择图片' },
  location_select: { label: '发送位置', fields: ['key'], hint: '点击弹出地理位置选择' },
  media_id: { label: '素材消息', fields: ['media_id'], hint: '发送永久素材（图片/音频/视频）' },
  view_limited: { label: '图文素材', fields: ['media_id'], hint: '跳转图文消息（素材 media_id）' },
};
const typeEntries = Object.keys(MENU_TYPES);
const typeLabels = typeEntries.map((k) => MENU_TYPES[k].label);

interface MenuNode { name: string; type: string; key: string; url: string; appid: string; pagepath: string; mediaId: string; children: MenuNode[] }
const buttons = ref<MenuNode[]>([]);
const sel = ref<{ level: number; p: number; c: number }>({ level: 0, p: -1, c: -1 });
const draftName = ref('');
const busy = ref(false);

const selNode = computed<MenuNode | null>(() => {
  const { level, p, c } = sel.value;
  if (level === 1) return buttons.value[p] || null;
  if (level === 2) return buttons.value[p]?.children?.[c] || null;
  return null;
});
const selTypeIndex = computed(() => {
  const t = selNode.value?.type;
  const i = typeEntries.indexOf(t || '');
  return i < 0 ? 0 : i;
});
const curFields = computed(() => MENU_TYPES[selNode.value?.type || '']?.fields || []);
const selHint = computed(() => MENU_TYPES[selNode.value?.type || '']?.hint || '');

function emptyItem(): MenuNode {
  return { name: '', type: 'view', key: '', url: '', appid: '', pagepath: '', mediaId: '', children: [] };
}
function clickTop(i: number) {
  if (sel.value.level === 1 && sel.value.p === i) { sel.value = { level: 0, p: -1, c: -1 }; return; }
  sel.value = { level: 1, p: i, c: -1 };
}
function clickSub(p: number, c: number) { sel.value = { level: 2, p, c }; }
function addTop() {
  if (buttons.value.length >= 3) { toast('一级菜单最多 3 个'); return; }
  buttons.value.push(emptyItem());
  sel.value = { level: 1, p: buttons.value.length - 1, c: -1 };
}
function addSub(p: number) {
  const top = buttons.value[p];
  if (!top) return;
  if (top.children.length >= 5) { toast('子菜单最多 5 个'); return; }
  top.children.push(emptyItem());
  sel.value = { level: 2, p, c: top.children.length - 1 };
}
function moveSub(p: number, c: number, dir: number) {
  const subs = buttons.value[p]?.children || [];
  const t = c + dir;
  if (t < 0 || t >= subs.length) return;
  [subs[c], subs[t]] = [subs[t], subs[c]];
}
function moveSel(dir: number) {
  const { level, p, c } = sel.value;
  if (level === 1) {
    const t = p + dir;
    if (t < 0 || t >= buttons.value.length) return;
    [buttons.value[p], buttons.value[t]] = [buttons.value[t], buttons.value[p]];
    sel.value = { level: 1, p: t, c: -1 };
  } else if (level === 2) {
    moveSub(p, c, dir);
    sel.value = { level: 2, p, c: c + dir };
  }
}
function removeSel() {
  const { level, p, c } = sel.value;
  if (level === 1) buttons.value.splice(p, 1);
  else if (level === 2) buttons.value[p]?.children?.splice(c, 1);
  sel.value = { level: 0, p: -1, c: -1 };
}
function onTypeChange(e: any) {
  const t = typeEntries[Number(e.detail.value)];
  if (t && selNode.value) selNode.value.type = t;
}

// ============ 数据转换：编辑模型 ↔ 微信结构 ============
function buildTypeNode(n: MenuNode): Record<string, any> {
  const node: Record<string, any> = { name: (n.name || '').trim(), type: n.type };
  switch (n.type) {
    case 'view': node.url = (n.url || '').trim(); break;
    case 'miniprogram':
      node.appid = (n.appid || '').trim();
      node.pagepath = (n.pagepath || '').trim();
      if ((n.url || '').trim()) node.url = (n.url || '').trim();
      break;
    case 'media_id':
    case 'view_limited': node.media_id = (n.mediaId || '').trim(); break;
    default: node.key = (n.key || '').trim();
  }
  return node;
}
function toWechat(): any[] {
  return buttons.value
    .filter((b) => (b.name || '').trim())
    .map((b) => {
      const node: Record<string, any> = { name: (b.name || '').trim() };
      if (b.children.length > 0) node.sub_button = b.children.map(buildTypeNode);
      else Object.assign(node, buildTypeNode(b));
      return node;
    });
}
function fromRemoteItem(n: any): MenuNode {
  return { name: n.name || '', type: n.type || '', key: n.key || n.value || '', url: n.url || '', appid: n.appid || '', pagepath: n.pagepath || '', mediaId: n.media_id || '', children: [] };
}
function fromRemote(btnList: any[]): MenuNode[] {
  return (btnList || []).map((b: any) => {
    const list = b.sub_button;
    const children = Array.isArray(list) ? list : list && Array.isArray(list.list) ? list.list : [];
    const node = fromRemoteItem(b);
    node.children = children.map(fromRemoteItem);
    return node;
  });
}

// ============ 远程操作 ============
async function pullRemote() {
  busy.value = true;
  try {
    const res = await fetchWechatMenu();
    const list = res?.selfmenu_info?.button || [];
    buttons.value = fromRemote(list);
    sel.value = buttons.value.length ? { level: 1, p: 0, c: -1 } : { level: 0, p: -1, c: -1 };
    toast(buttons.value.length ? '已拉取当前菜单' : '公众号菜单为空，请添加');
  } catch (e: any) {
    toast('拉取失败：' + String(e.message || e));
  } finally { busy.value = false; }
}
function validate(): string {
  const tops = toWechat();
  if (!tops.length) return '请至少添加一个一级菜单';
  for (const b of tops) {
    if (b.sub_button) continue; // 有子菜单的一级仅需名称
    const missing = MENU_TYPES[b.type]?.fields?.find((f) => {
      const v = f === 'media_id' ? b.media_id : (b as any)[f === 'media_id' ? 'media_id' : f];
      return !String(v || '').trim();
    });
    if (missing) return `「${b.name}」缺少必填字段`;
  }
  for (const b of tops) {
    for (const s of b.sub_button || []) {
      const missing = MENU_TYPES[s.type]?.fields?.find((f) => !String((s as any)[f] || '').trim());
      if (missing) return `子菜单「${s.name}」缺少必填字段`;
    }
  }
  return '';
}
async function publish() {
  const err = validate();
  if (err) { toast(err); return; }
  busy.value = true;
  try {
    await publishWechatMenu(toWechat());
    toast('发布成功，约 5 分钟后手机端生效');
  } catch (e: any) {
    toast('发布失败：' + String(e.message || e));
  } finally { busy.value = false; }
}

// ============ 本地草稿（localStorage） ============
const DRAFT_KEY = 'wx_menu_drafts';
function readDrafts(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; }
}
function saveDraft() {
  const name = draftName.value.trim();
  if (!name) { toast('请填写草稿名称'); return; }
  const drafts = readDrafts();
  drafts[name] = { savedAt: Date.now(), buttons: buttons.value };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  toast('草稿已保存');
}
function loadDraft() {
  const name = draftName.value.trim();
  const drafts = readDrafts();
  const d = name ? drafts[name] : null;
  if (!d) { toast('未找到同名草稿'); return; }
  buttons.value = d.buttons || [];
  toast('草稿已加载');
}

onMounted(() => {
  pullRemote();
});
</script>

<style scoped>
.page { padding: 24rpx; }
.hint { font-size: 24rpx; color: #999; margin-bottom: 20rpx; }
/* 手机预览 */
.phone { background: #f7f7f7; border-radius: 24rpx; padding: 20rpx; margin-bottom: 24rpx; }
.phone-body { display: flex; align-items: flex-start; background: #fff; border-radius: 16rpx; padding: 16rpx 8rpx; }
.top-btn { flex: 1; text-align: center; border-right: 1rpx solid #eee; padding: 0 4rpx; }
.top-btn:last-of-type { border-right: none; }
.btn { display: block; font-size: 26rpx; color: #333; padding: 18rpx 4rpx; border-radius: 8rpx; }
.btn.on { color: #07c160; font-weight: 600; }
.btn.sub { font-size: 24rpx; padding: 14rpx 4rpx; display: inline-block; flex: 1; text-align: left; }
.sub-wrap { background: #fafafa; border-radius: 8rpx; margin-top: 6rpx; padding: 8rpx; }
.sub-row { display: flex; align-items: center; }
.mini { font-size: 24rpx; color: #999; padding: 8rpx 10rpx; }
.add-sub, .add-top { font-size: 24rpx; color: #07c160; padding: 12rpx 0; text-align: center; }
.add-top { border-top: 1rpx solid #eee; }
/* 卡片表单 */
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 24rpx; }
.row-title { font-size: 28rpx; font-weight: 600; margin-bottom: 16rpx; }
.ipt { background: #f5f5f5; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 26rpx; margin-bottom: 16rpx; }
.picker { color: #333; }
.tip { font-size: 22rpx; color: #999; display: block; margin-bottom: 12rpx; }
.ops { display: flex; gap: 24rpx; margin-top: 8rpx; }
.op { font-size: 26rpx; color: #07c160; }
.op.del { color: #e64340; }
/* 底部操作 */
.footer { display: flex; gap: 20rpx; margin-top: 8rpx; }
.act { flex: 1; font-size: 28rpx; background: #f0f0f0; color: #333; border-radius: 40rpx; }
.act.primary { background: #07c160; color: #fff; }
.act[disabled] { opacity: 0.6; }
</style>
