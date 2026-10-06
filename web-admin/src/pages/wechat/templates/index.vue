<template>
  <view class="page">
    <view class="hint">{{ $t('wechatOps.tplHint') }}</view>

    <view class="card" v-for="t in templates" :key="t.template_id">
      <view class="tpl-title">{{ t.title }}</view>
      <text class="tpl-id">{{ t.template_id }}</text>
      <text class="tpl-example">{{ t.example }}</text>
      <view class="ops"><text class="op" @tap="openSend(t)">{{ $t('wechatOps.send') }}</text></view>
    </view>
    <view v-if="!templates.length && !loading" class="empty">{{ $t('wechatOps.tplEmpty') }}</view>

    <!-- 发送弹层 -->
    <view v-if="sending" class="sheet-mask" @tap="sending = false">
      <scroll-view class="sheet" scroll-y @tap.stop>
        <text class="st">{{ $t('wechatOps.sendTitle') }}</text>
        <text class="sec">{{ curTpl?.title }}</text>
        <input class="ipt" :maxlength="-1" v-model="form.touser" :placeholder="$t('wechatOps.phOpenid')" />
        <input class="ipt" :maxlength="-1" v-model="form.url" :placeholder="$t('wechatOps.phJumpUrl')" />
        <view v-for="(f, i) in dataFields" :key="i" class="field">
          <text class="fname">{{ f }}</text>
          <input class="ipt" :maxlength="-1" v-model="form.data[f]" :placeholder="$t('wechatOps.phFieldValue')" />
        </view>
        <button class="save" :disabled="busy" @tap="doSend">{{ $t('wechatOps.send') }}</button>
      </scroll-view>
    </view>
    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchWechatTemplates, sendWechatTemplate } from '../../../apis/wechat';

const templates = ref<any[]>([]);
const loading = ref(false);
const sending = ref(false);
const busy = ref(false);
const curTpl = ref<any>(null);
const form = ref<{ touser: string; url: string; data: Record<string, string> }>({ touser: '', url: '', data: {} });

// 从 example 文本解析出 {{keyword.DATA}} 字段名列表
const dataFields = computed(() => {
  const ex = String(curTpl.value?.example || '');
  return [...new Set((ex.match(/\{\{(.+?)\.DATA\}\}/g) || []).map((s) => s.replace(/\{\{|\}.DATA\}\}/g, '')))];
});

function toast(title: string) { uni.showToast({ title, icon: 'none' }); }

async function load() {
  loading.value = true;
  try {
    templates.value = await fetchWechatTemplates();
  } catch (e: any) {
    toast('拉取失败：' + String(e?.message || e));
  } finally { loading.value = false; }
}
function openSend(t: any) {
  curTpl.value = t;
  form.value = { touser: '', url: '', data: {} };
  sending.value = true;
}
async function doSend() {
  if (!form.value.touser.trim()) { toast('请填写接收者 openid'); return; }
  busy.value = true;
  try {
    const input: any = {
      touser: form.value.touser.trim(),
      template_id: curTpl.value.template_id,
      data: Object.fromEntries(Object.entries(form.value.data).map(([k, v]) => [k, { value: v }])),
    };
    if (form.value.url.trim()) input.url = form.value.url.trim();
    const res = await sendWechatTemplate(input);
    toast(res?.msgid ? `已发送（msgid ${res.msgid}）` : '已发送');
    sending.value = false;
  } catch (e: any) {
    toast('发送失败：' + String(e?.message || e));
  } finally { busy.value = false; }
}

onMounted(() => load());
</script>

<style scoped>
.page { padding: 24rpx; }
.hint { font-size: 24rpx; color: #999; margin-bottom: 20rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.tpl-title { font-size: 28rpx; font-weight: 600; margin-bottom: 8rpx; }
.tpl-id { display: block; font-size: 22rpx; color: #999; word-break: break-all; margin-bottom: 8rpx; }
.tpl-example { display: block; font-size: 24rpx; color: #666; background: #f7f7f7; border-radius: 12rpx; padding: 16rpx; margin-bottom: 12rpx; white-space: pre-wrap; }
.ops { display: flex; justify-content: flex-end; }
.op { font-size: 26rpx; color: #07c160; }
.empty { text-align: center; color: #999; font-size: 26rpx; padding: 60rpx 0; }
.sheet-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 99; display: flex; align-items: flex-end; }
.sheet { width: 100%; max-height: 80vh; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 32rpx; }
.st { font-size: 32rpx; font-weight: 600; display: block; margin-bottom: 16rpx; }
.sec { font-size: 26rpx; color: #666; display: block; margin-bottom: 16rpx; }
.ipt { background: #f5f5f5; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 26rpx; margin-bottom: 16rpx; }
.field .fname { font-size: 24rpx; color: #666; display: block; margin-bottom: 6rpx; }
.save { margin-top: 12rpx; background: #07c160; color: #fff; font-size: 28rpx; border-radius: 40rpx; }
.save[disabled] { opacity: 0.6; }
</style>
