# 直播多平台分发（方案A：腾讯云直播枢纽 + 平台分发模型 + 自动降级）设计

> 承接 `2026-10-03-live-interactive-service-design.md`（直播互动已上线：vendure 签票 → game-server /live gateway → vshop H5 弹幕/点赞/货架全链路 SMOKE PASS）。本 spec 扩展直播的**画面来源与多平台分发**。

**Goal:** 商城直播间支持「自建流 HLS 播放」与「平台导流」双形态；一场直播可同时分发给抖音/快手/视频号等多个平台；无推流权限或未配置平台时自动降级为海报导流形态。

## 0. 用户已确认的关键决策

1. **形态**：双开同步分发——主播在平台开播 + 商城直播间同步（观众从商城进来也能看/被导走）
2. **平台范围**：抖音 + 快手 + 视频号（导流）+ 其他平台预留（platform 为开放字符串枚举）
3. **多平台**：一场直播可同时配置多个平台分发
4. **画面形态**：自建流双推——通过腾讯云直播作为推流/分发枢纽

**关键生态前提（决定双形态设计的必要性）：**
- 抖音/快手**普通个人号** App 内开播**拿不到 RTMP 推流地址**（需机构/企业号资质）→ 双推仅对有推流权限的主播成立；无权限主播只能用降级形态
- 抖音/快手流有防盗链，H5 iframe/video 嵌不进去 → 自建流画面只能来自腾讯云播放域名
- 视频号**不开放 RTMP 推流**（开播只能在视频号助手/微信内），**没有公开 H5 直播页和 URL scheme** → 纯导流平台，H5 端不跳转只引导；小程序端可用 `wx.openChannelsLive` 拉起

## 1. 双形态设计

| 形态 | 条件 | 画面 | 行为 |
|---|---|---|---|
| **形态一：自建流** | `playUrl` 非空 | HLS 播放器（video 标签 + hls.js） | 商城直播间直接看画面；播放区底缘叠平台 pill 按钮组，可跳转平台 |
| **形态二：降级导流** | `playUrl` 为空 | 海报占位（复用直播间封面/默认图） | 大按钮「前往 XX 观看」+ 平台 pill 按钮组 |

判定完全由 `playUrl` 是否为空驱动（自动降级），不需要额外开关字段。互动层（/live 弹幕/点赞/在线数）**两种形态下都工作，零改动**。

## 2. 数据模型（vendure live-streaming-plugin）

新增实体 `LiveRoomPlatform`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | ID | 主键 |
| `liveRoom` | ManyToOne → LiveRoom | 所属直播间 |
| `platform` | varchar | 平台标识：`douyin` / `kuaishou` / `wechat_channels` / 其他预留字符串 |
| `externalUrl` | varchar | 平台落地信息，格式按 platform 约定（见下） |
| `channels` | ManyToMany → Channel | 租户渠道关联（与 LiveRoom 一致的多租户模式） |

`externalUrl` 格式约定：
- `douyin` / `kuaishou`：平台直播间链接（普通浏览器直接跳转；微信内转口令复制）
- `wechat_channels`：结构化 URI `wxchannels://finder=<视频号ID>&feed=<feedId可选>`（非 http 链接，前端解析后走引导/拉起逻辑）

**Files:**
- `packages/live-streaming-plugin/src/entities/live-room-platform.entity.ts`（新建）
- `packages/live-streaming-plugin/src/plugin.ts`（注册实体 + schema 扩展）
- `packages/live-streaming-plugin/src/live-room.service.ts`（平台清单读写 + 值域校验）

## 3. API

**Admin（需登录 + 渠道隔离）：**
- `setLiveRoomPlatforms(roomId: ID!, platforms: [LiveRoomPlatformInput!]!)` — **整清单回写**（传空数组 = 清空），input `{ platform, externalUrl }`；服务端值域校验 platform（douyin/kuaishou/wechat_channels/…）
- admin 侧已有 `createLiveRoom` / `startLiveRoom` 不变；web-admin 主播开播 UI 本轮不涉及（子项目2 范畴）

**Shop（C 端）：**
- `liveRoom(id)` 查询返回值新增 `platforms: [{ platform, externalUrl }]`（按租户渠道过滤）
- `enterLiveRoom`（签票）不变

## 4. 前端（vshop live-room.vue）

播放区双形态 + 平台按钮组：

1. **形态一**：`<video>` + hls.js（npm 依赖，桌面 Chrome 无原生 HLS 时兜底；iOS/微信内浏览器走原生 HLS）。加载失败/超时 → 显示重试按钮，不自动切形态
2. **形态二**：海报区 + 主按钮「前往 XX 观看」（取 platforms[0]）+ 平台 pill 行
3. **平台 pill 点击行为**（与 platform 分支）：
   - `douyin` / `kuaishou`：普通浏览器 `location.href = externalUrl`；**微信内打开** → 复制口令（uni.setClipboardData + toast「链接已复制，请在浏览器打开」）
   - `wechat_channels`：**H5 一律不跳转**，弹「引导弹层」——视频号名大字 + 三步指引（复制视频号名 → 打开微信搜一搜 → 进入直播）+「复制视频号名」按钮（解析 `wxchannels://` URI 取 finder 名）
   - 小程序端（`#ifdef MP-WEIXIN`，manifest 已有 mp-weixin 目标）：`wx.openChannelsLive({ finderUserName, feedId })` 直接拉起
4. /live 互动（connectWs、弹幕、点赞、货架）**零改动**

## 5. 腾讯云直播接入（运维侧，零代码依赖）

- 用户需开通腾讯云直播服务（前提条件，由用户提供账号）
- 推流：OBS / 腾讯云工具推 `rtmp://push.<子域>/live/<streamKey>`；vendure `start()` 现有逻辑生成 streamKey 与 playUrl（`playDomain` + streamKey + `.m3u8`）不变
- 播放域名 CNAME：`play.<子域>` → 腾讯云分配的播放 CNAME；推流域名同理
- 鉴权链路：URL 防盗链 Key 配置后如启用，playUrl 生成需加签名——**本轮暂不启用防盗链**（记录为遗留项）

## 6. 测试

1. vendure 单测：LiveRoomPlatform 实体 CRUD、`setLiveRoomPlatforms` 整清单回写幂等、platform 值域校验、`wechat_channels` URI 解析、渠道隔离
2. game-server 回归：326 测试全绿（live 模块零改动验证）
3. 前端手机截图（390×844, dpr=2）：
   - 形态一：HLS 播放画面 + 平台 pill
   - 形态二：海报 + 导流按钮 + pill 行
   - 视频号引导弹层 + 复制 toast
   - 微信内口令复制路径
4. 生产验证：e.joho.cn 直播间真实拉流/导流跳转

## 7. YAGNI 排除项

- 自动检测平台开播状态并同步商城直播间上下线（主播手动 start/stop）
- 视频号二维码图上传（第一版文字指引，零资源依赖）
- 回放管理与录制存储
- 播放 URL 防盗链签名（腾讯云侧暂不启用）
- web-admin 主播开播 UI（子项目2 范畴）
- 视频号小程序拉起的真机自动化验证（微信开发者工具人工验证，列遗留验证项）
