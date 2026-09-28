import { getShopApiHeaders, getShopApiUrl, setSessionToken } from '../client';

export interface UploadedAsset {
    id: string;
    source: string;
    preview: string;
}

const UPLOAD_CUSTOMER_ASSET = `
    mutation UploadCustomerAsset($file: Upload!) {
        uploadCustomerAsset(file: $file) { id source preview }
    }
`;

/**
 * C 端资产上传（售后凭证等）。
 * 走 GraphQL multipart 上传规范（graphql-upload）：文件部分字段名必须等于 map 的键。
 * 服务端按 assetOptions.permittedMimeTypes 校验 MIME，返回的 Asset 已由
 * AssetInterceptorPlugin 转为绝对 URL，可直接用于 <image :src>。
 */
export function uploadCustomerAsset(filePath: string): Promise<UploadedAsset> {
    return new Promise((resolve, reject) => {
        uni.uploadFile({
            url: getShopApiUrl(),
            filePath,
            name: '0',
            formData: {
                operations: JSON.stringify({
                    query: UPLOAD_CUSTOMER_ASSET,
                    variables: { file: null },
                }),
                map: JSON.stringify({ '0': ['variables.file'] }),
            },
            header: getShopApiHeaders(),
            success: (res: any) => {
                const authToken =
                    res.header?.['vendure-auth-token'] || res.header?.['Vendure-Auth-Token'] || '';
                if (authToken) {
                    setSessionToken(authToken);
                }
                let body: any;
                try {
                    body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
                } catch (e) {
                    reject(new Error('上传失败：响应解析错误'));
                    return;
                }
                if (body?.errors?.length) {
                    reject(new Error(body.errors[0].message));
                    return;
                }
                const asset = body?.data?.uploadCustomerAsset;
                if (!asset?.source) {
                    reject(new Error('上传失败'));
                    return;
                }
                // 后端在 Windows 开发环境下用 path.join 生成 source，会带反斜杠；
                // 反斜杠在 CSS url() 里是转义符，会导致缩略图取不到图，这里统一成正斜杠。
                resolve({ ...asset, source: String(asset.source).replace(/\\/g, '/') });
            },
            fail: (err: any) => reject(new Error(err?.errMsg || '上传失败')),
        });
    });
}
