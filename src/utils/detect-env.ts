export type Platform = 'wechat' | 'alipay' | 'douyin' | 'browser';

export function detectPlatform(): Platform {
    // #ifdef MP-WEIXIN
    return 'wechat';
    // #endif
    // #ifdef MP-ALIPAY
    return 'alipay';
    // #endif
    // #ifdef MP-TOUTIAO
    return 'douyin';
    // #endif
    // #ifdef H5
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('micromessenger')) return 'wechat';
    if (ua.includes('alipayclient')) return 'alipay';
    if (ua.includes('newsclient') || ua.includes('bytedance')) return 'douyin';
    return 'browser';
    // #endif
    return 'browser';
}
