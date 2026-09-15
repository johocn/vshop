import { getGraphQLClient } from '../client';

// 说明：getJsapiSignature 已弃用——微信 JS-SDK 签名改由 zhao-sso REST 接口提供（见 src/utils/wechat.ts），
// 不再依赖 Vendure 的 wechatJsapiSignature 字段（e.joho.cn 上未暴露）。

export async function getWxacode(scene: string, path?: string): Promise<{ contentType: string; base64: string }> {
    const client = getGraphQLClient();
    const res: any = await client.request(`query WechatWxacode($scene: String!, $path: String, $width: Int) {
        wechatWxacode(scene: $scene, path: $path, width: $width) {
            contentType base64
        }
    }`, { scene, path, width: 430 });
    return res.wechatWxacode;
}
