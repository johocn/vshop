import { getGraphQLClient } from '../client';

export async function getJsapiSignature(url: string) {
    const client = getGraphQLClient();
    const res: any = await client.request(`query WechatJsapiSignature($url: String!) {
        wechatJsapiSignature(url: $url) {
            appId timestamp nonceStr signature
        }
    }`, { url });
    return res.wechatJsapiSignature;
}

export async function getWxacode(scene: string, path?: string): Promise<{ contentType: string; base64: string }> {
    const client = getGraphQLClient();
    const res: any = await client.request(`query WechatWxacode($scene: String!, $path: String, $width: Int) {
        wechatWxacode(scene: $scene, path: $path, width: $width) {
            contentType base64
        }
    }`, { scene, path, width: 430 });
    return res.wechatWxacode;
}
