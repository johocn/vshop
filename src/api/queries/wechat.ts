import { getGraphQLClient, deduped } from '../client';

export interface JsapiSignatureResult {
    appId: string;
    timestamp: number;
    nonceStr: string;
    signature: string;
}

export async function getJsapiSignature(url: string): Promise<JsapiSignatureResult> {
    const key = 'wechatJsapiSignature:' + url;
    return deduped(key, async () => {
        const client = getGraphQLClient();
        const query = 'query WechatJsapiSignature($url: String!) { wechatJsapiSignature(url: $url) { appId timestamp nonceStr signature } }';
        const data = await client.request(query, { url });
        return data.wechatJsapiSignature;
    });
}
