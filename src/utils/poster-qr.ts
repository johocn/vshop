import { getWxacode } from '../api/queries/wechat';

// H5：生成指向落地页的 URL 二维码 base64（扫码后进入落地页并携带 ref 由 onLoad 绑定）
export async function generateH5InviteQr(inviteCode: string): Promise<string> {
    const { default: QRCode } = await import('qrcode');
    const shareUrl = `${window.location.origin}/#/pages/landing/invite?ref=${encodeURIComponent(inviteCode)}`;
    const dataUrl = await QRCode.toDataURL(shareUrl, { width: 200, margin: 1 });
    return dataUrl.split(',')[1];
}

// 小程序：生成小程序码（scene 为 ref，扫码后落地页 onLoad options 里无 scene 则需后端 scene 解析；本期小程序由 H5 跳转为主）
export async function generateMpInviteQr(inviteCode: string): Promise<string> {
    const res = await getWxacode(`r=${inviteCode}`);
    return res.base64;
}