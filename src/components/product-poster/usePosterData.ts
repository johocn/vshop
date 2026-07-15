import { ref } from 'vue';
import { getWxacode } from '../../api/queries/wechat';
import { useAuthStore } from '../../stores/auth';
import { useTenantStore } from '../../stores/tenant';

export interface PosterData {
    channelName: string;
    channelLogo?: string;
    productImage: string;
    productTitle: string;
    price: string;
    originalPrice?: string;
    qrCodeBase64: string;      // 统一字段名：H5 为 URL 二维码 base64，小程序为小程序码 base64
    inviteCode?: string;
}

const wxacodeCache = new Map<string, { base64: string; contentType: string; expireAt: number }>();

async function fetchWxacode(scene: string, path?: string): Promise<{ base64: string; contentType: string }> {
    const cacheKey = `${scene}|${path || ''}`;
    const cached = wxacodeCache.get(cacheKey);
    if (cached && cached.expireAt > Date.now()) {
        return { base64: cached.base64, contentType: cached.contentType };
    }
    const result = await getWxacode(scene, path);
    wxacodeCache.set(cacheKey, {
        base64: result.base64,
        contentType: result.contentType,
        expireAt: Date.now() + 60_000,
    });
    return result;
}

// H5 端：用 qrcode 库生成 URL 二维码（扫码跳转 H5 页面）
async function generateH5QrCode(product: any, inviteCode: string): Promise<string> {
    const { default: QRCode } = await import('qrcode');
    const shareUrl = `${window.location.origin}/#/pkg-product/pages/detail?slug=${product.slug}`
        + (inviteCode ? `&ref=${inviteCode}` : '');
    const dataUrl = await QRCode.toDataURL(shareUrl, { width: 200, margin: 1 });
    // dataUrl 格式为 data:image/png;base64,...，提取 base64 部分
    return dataUrl.split(',')[1];
}

export function usePosterData() {
    const loading = ref(false);
    const error = ref('');

    async function preparePosterData(product: any): Promise<PosterData> {
        const authStore = useAuthStore();
        const tenantStore = useTenantStore();
        loading.value = true;
        error.value = '';
        try {
            const slug = product.slug || '';
            const inviteCode = authStore.inviteCode || '';

            // 根据平台获取不同的二维码
            let qrCodeBase64 = '';
            // #ifdef MP-WEIXIN
            // 小程序端：调用后端 wxacode 服务生成小程序码
            const scene = inviteCode ? `s=${slug}&r=${inviteCode}` : `s=${slug}`;
            const wxacode = await fetchWxacode(scene, 'pkg-product/pages/detail');
            qrCodeBase64 = wxacode.base64;
            // #endif
            // #ifdef H5
            // H5 端：用 qrcode 库生成 URL 二维码
            qrCodeBase64 = await generateH5QrCode(product, inviteCode);
            // #endif

            return {
                channelName: tenantStore.tenantName || 'VShop 商城',
                productImage: product.featuredAsset?.preview || '',
                productTitle: product.name || '',
                price: String(product.priceWithTax?.value ?? ''),
                originalPrice: product.customFields?.compareAtPrice ? String(product.customFields.compareAtPrice) : undefined,
                qrCodeBase64,
                inviteCode: inviteCode || undefined,
            };
        } catch (e: any) {
            error.value = e.message || '海报数据准备失败';
            throw e;
        } finally {
            loading.value = false;
        }
    }

    return { loading, error, preparePosterData };
}
