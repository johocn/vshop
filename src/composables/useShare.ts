interface ShareOptions {
    title?: string;
    path?: string;
    imageUrl?: string;
}

/** WeChat share composable - call in page setup */
export function useShare(options: ShareOptions = {}) {
    // #ifdef MP-WEIXIN
    const { onShareAppMessage, onShareTimeline } = require('@dcloudio/uni-app');
    const defaultTitle = 'VShop - 精选好物';
    const defaultPath = '/pages/home/index';
    onShareAppMessage(() => ({
        title: options.title || defaultTitle,
        path: options.path || defaultPath,
        imageUrl: options.imageUrl || '',
    }));
    onShareTimeline(() => ({
        title: options.title || defaultTitle,
        query: '',
        imageUrl: options.imageUrl || '',
    }));
    // #endif
    // #ifdef H5
    const { useH5Share } = require('./useH5Share');
    useH5Share({
        title: options.title,
        link: options.path ? window.location.origin + '/#' + options.path : undefined,
        imageUrl: options.imageUrl,
    });
    // #endif
}

/** Share product detail */
export function useProductShare(productName: string, slug: string, imageUrl?: string) {
    // #ifdef MP-WEIXIN
    useShare({
        title: productName,
        path: '/pkg-product/pages/detail?slug=' + slug,
        imageUrl,
    });
    // #endif
    // #ifdef H5
    const { useH5ProductShare } = require('./useH5Share');
    useH5ProductShare(productName, slug, imageUrl);
    // #endif
}
