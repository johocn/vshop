// 公众号运营 admin-api 调用（菜单/粉丝/模板消息，后端 wechat-auth-plugin 代理微信 cgi-bin）
import { getAdminClient } from './client';

/** 拉取公众号当前自定义菜单（微信 get_current_selfmenu_info 原始结构） */
export async function fetchWechatMenu(): Promise<any> {
  const { wechatCurrentMenu } = await getAdminClient().request<{ wechatCurrentMenu: any }>(
    `query { wechatCurrentMenu }`,
  );
  return wechatCurrentMenu;
}

/** 发布自定义菜单（微信 menu/create，入参 { button: [...] }） */
export async function publishWechatMenu(button: any[]): Promise<any> {
  const { wechatMenuPublish } = await getAdminClient().request<{ wechatMenuPublish: any }>(
    `mutation Pub($menu: JSON!) { wechatMenuPublish(menu: $menu) }`,
    { menu: { button } },
  );
  return wechatMenuPublish;
}

/** 删除公众号自定义菜单 */
export async function deleteWechatMenu(): Promise<any> {
  const { wechatMenuDelete } = await getAdminClient().request<{ wechatMenuDelete: any }>(
    `mutation { wechatMenuDelete }`,
  );
  return wechatMenuDelete;
}

/** 粉丝 openid 列表（微信 user/get，next_openid 分页） */
export async function fetchWechatFans(nextOpenid?: string): Promise<any> {
  const { wechatFans } = await getAdminClient().request<{ wechatFans: any }>(
    `query($nextOpenid: String) { wechatFans(nextOpenid: $nextOpenid) }`,
    { nextOpenid: nextOpenid || null },
  );
  return wechatFans;
}

/** 私有模板消息列表（微信 template/get_all_private_template） */
export async function fetchWechatTemplates(): Promise<any[]> {
  const { wechatTemplates } = await getAdminClient().request<{ wechatTemplates: any }>(
    `query { wechatTemplates }`,
  );
  return wechatTemplates?.template || [];
}

/** 发送模板消息（微信 message/template/send） */
export async function sendWechatTemplate(input: {
  touser: string;
  template_id: string;
  data?: Record<string, { value: string }>;
  url?: string;
  miniprogram?: { appid: string; pagepath: string };
}): Promise<any> {
  const { wechatTemplateSend } = await getAdminClient().request<{ wechatTemplateSend: any }>(
    `mutation Send($input: JSON!) { wechatTemplateSend(input: $input) }`,
    { input },
  );
  return wechatTemplateSend;
}
