// #ifdef H5
import { ensureWxReady, resetWxReady } from '../utils/wechat';
import { useAuthStore } from '../stores/auth';

declare const wx: any;

interface H5ShareOptions {
    title?: string;
    desc?: string;
    link?: string;
    imageUrl?: string;
}

function buildShareLink(baseUrl: string): string {
    const authStore = useAuthStore();
    if (authStore.inviteCode) {
        const sep = baseUrl.includes('?') ? '&' : '?';
        return baseUrl + sep + 'ref=' + encodeURIComponent(authStore.inviteCode);
    }
    return baseUrl;
}

export function useH5Share(options: H5ShareOptions = {}) {
    const defaultTitle = 'VShop - 精选好物';
    const defaultLink = window.location.href.split('#')[0];

    ensureWxReady().then(() => {
        const shareData = {
            title: options.title || defaultTitle,
            desc: options.desc || '',
            link: buildShareLink(options.link || defaultLink),
            imgUrl: options.imageUrl || '',
        };
        try {
            wx.updateAppMessageShareData(shareData);
            wx.updateTimelineShareData(shareData);
        } catch (e) {
            console.warn('[useH5Share] wx share API failed:', e);
        }
    }).catch((e: any) => console.warn('[useH5Share] init failed:', e));
}

export function useH5ProductShare(productName: string, slug: string, imageUrl?: string) {
    const base = window.location.origin + '/#/pkg-product/pages/detail?slug=' + slug;
    useH5Share({
        title: productName,
        desc: 'VShop 精选好物推荐',
        link: base,
        imageUrl,
    });
}
// #endif
