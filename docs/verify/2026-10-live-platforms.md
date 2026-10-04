# 直播多平台分发（双形态 + 视频号引导）验收手册

日期：2026-10-04 ｜ 方案：`docs/superpowers/specs/2026-10-04-live-dual-platform-distribution-design.md`（含视频号增量）

## 交付内容

### 后端（vendure，live-streaming-plugin）
| Commit | 内容 |
|---|---|
| e3de5c8c6 | `LiveRoomPlatform` 实体（liveRoom M2O CASCADE + platform varchar32 + externalUrl varchar512 + channels M2M）注册进 plugin entities |
| 1b375378c | admin schema 增 `LiveRoomPlatformInput` / `setLiveRoomPlatforms(roomId, platforms)` 整清单回写（校验：platform 格式 `^[a-z0-9_]{2,32}$`、重复、externalUrl 必填、wxchannels URI 格式）；shop detail 渠道过滤 platforms |
| 905daf321 | shop-api detail relations 加 platforms + `platforms.channels` 过滤本渠道 |
| ca37ca393 | 【安全修复】live-admin.resolver 全 10 方法补 `@Allow(Permission.SuperAdmin)`（此前无权限 metadata 被 AuthGuard 放行，未认证可调，上线以来遗留债；src+lib 同步修复） |

部署：git pull + pm2 restart（scripts/vendure-live-platforms-deploy.sh），postgres synchronize 自动建表。

### 前端（vshop H5）
| Commit | 内容 |
|---|---|
| cc5025c | live-room.vue 双形态渲染 + 平台按钮组 pills + 视频号引导弹层；H5 hls.js 动态 import 兜底；MP-WEIXIN `wx.openChannelsLive` 条件编译；getLiveRoom 查询加 platforms |
| 01ee003 | H5 构建产物入库（hls.js chunk 590KB）+ 认证回归脚本 |
| d6d136d | 【缺陷修复】hls.js fatal error 监听 → 显示「加载失败，点击重试」（原实现只监听 video 元素 error，假地址下 hls 层失败不触发）+ 数据准备脚本 |

部署：本地构建 → tgz → scp → 服务器解压 `/opt/1panel/.../e.joho.cn/index`（备份 index.bak_1791107502 / index.bak_1791107752），index.html MD5 与本地构建一致。

## 数据约定

- `platform` 枚举：`douyin`（抖音）/ `kuaishou`（快手）/ `wechat_channels`（视频号）
- 视频号 URI：`wxchannels://finder=<视频号ID>(&feed=<feedId>)?`，前端解析后小程序内 `wx.openChannelsLive` 直开，H5 弹三步引导（复制视频号名 → 微信搜一搜）
- `setLiveRoomPlatforms` 为整清单回写：传空数组 = 清空本渠道配置
- playUrl 有值且 status=live → 形态一（站内播 + pills）；playUrl 空或非 live → 形态二（海报 + 「前往XX观看」导流）

## 测试证据

### 生产 GraphQL 冒烟（scripts/live-platforms-verify.sh，7 段全过）
登录 → 回写 douyin+wechat_channels → shop 读回 → wxchannels 格式负例 → 重复 platform 负例 → 非法字符负例 → 还原。

### 认证回归（docs/verify/_test_admin_auth_gap.py）
未登录调 createLiveRoom / setLiveRoomPlatforms → FORBIDDEN（内网+外网验证）。

### 手机视口取证（390×844 dpr=2，docs/verify/_shot_live_platforms.py，6/6 PASS）
| 截图 | 断言 |
|---|---|
| live-plat-01-pills.png | 形态一 pill 行显示 抖音+视频号 |
| live-plat-02-wxsheet.png | 视频号弹层显示 @johocn_shop |
| live-plat-03-toast.png | 复制视频号名 toast 出现 |
| live-plat-04-form2-gobtn.png | 形态二「前往视频号观看」按钮 |
| live-plat-05-plain-ended.png | 无 platforms 回归：直播已结束、无 go-btn/pills |
| live-plat-06-retry.png | hls 失败显示「加载失败，点击重试」 |

## 管理端操作指引

```
mutation { setLiveRoomPlatforms(roomId: "1", platforms: [
  { platform: "douyin", externalUrl: "https://live.douyin.com/xxx" },
  { platform: "wechat_channels", externalUrl: "wxchannels://finder=你的视频号ID" }
]) { id platforms { platform externalUrl } } }
```

## 遗留项

1. **腾讯云直播未开通**：房间1 playUrl 为占位假地址，形态一真实拉流待开通直播服务 + CNAME 域名配置
2. **视频号小程序真机验证**：`wx.openChannelsLive` / `wx.getChannelsLiveInfo` 需真机（Playwright 无法模拟）
3. **播放防盗链未启用**：开通腾讯云直播后建议配置 URL 防盗链 key
4. 演示数据：房间1（live+双平台）、房间2「平台分发演示间」（ended+视频号）、房间3「无分发回归间」（ended 无平台）
