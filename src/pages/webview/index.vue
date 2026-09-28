<template>
  <web-view :src="url"></web-view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const url = ref('');

const DEFAULT_ALLOWED_HOSTS = ['joho.cn', 'weixin.qq.com', 'wx.tenpay.com', 'alipay.com', 'alipayobjects.com'];

function getHost(target: string): string {
    const match = /^https:\/\/([^/?#]+)/i.exec(target);
    if (!match) return '';
    return match[1].split('@').pop()!.split(':')[0].toLowerCase();
}

function isAllowed(target: string): boolean {
    const host = getHost(target);
    if (!host) return false;
    const extra = (import.meta.env.VITE_WEBVIEW_ALLOWED_HOSTS || '')
        .split(',')
        .map((h: string) => h.trim().toLowerCase())
        .filter(Boolean);
    const allowed = [...DEFAULT_ALLOWED_HOSTS, ...extra];
    if (allowed.some(h => host === h || host.endsWith('.' + h))) return true;
    // #ifdef H5
    try {
        if (host === window.location.hostname.toLowerCase()) return true;
    } catch (e) {}
    // #endif
    return false;
}

onLoad((query: any) => {
    const target = decodeURIComponent(query?.url || '');
    if (!isAllowed(target)) {
        uni.showToast({ title: t('webview.invalidUrl'), icon: 'none' });
        uni.navigateBack();
        return;
    }
    url.value = target;
});
</script>
