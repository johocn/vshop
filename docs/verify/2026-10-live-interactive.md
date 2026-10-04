# 直播互动服务联调与验收记录（阶段39子项目1）

> 日期：2026-10-04 · 环境：生产 · 执行：自动化脚本取证

## 1. 架构与链路

```
C端H5 (e.joho.cn, vshop uni-app)
  │  GraphQL shop-api: enterLiveRoom(roomId)          → vendure (e.joho.cn:3020, pm2)
  │    返回 { wsUrl: wss://game.joho.cn/live, wsTicket }    │ LIVE_WS_SECRET 签 HMAC 票
  ▼
socket.io-client (websocket) ──────────────────►  game-server /live namespace (game.joho.cn, systemd)
弹幕 danmaku / 点赞 like / 在线数 online / 历史 history / 系统 sys
房间态: Redis（在线 SET 120s TTL + 最近50条弹幕 LIST），Redis 故障降级进程内 Map
```

跨机互信：vendure 与 game-server 共享 `LIVE_WS_SECRET`（各自 .env，不同机器，同值）。票格式
`HMAC_SHA256(secret, "<roomId>.<customerId|guest>.<ts>")hex + ":" + payload`，TTL 5 分钟。

## 2. 配置落地记录

| 项 | 值/位置 | 状态 |
|---|---|---|
| game-server LIVE_WS_SECRET | odoo:/opt/game-server/.env.prod | 已配置（gs-deploy.sh 生成） |
| vendure LIVE_WS_URL / LIVE_WS_SECRET | joho:/www/apps/vendure/packages/dev-server/.env（备份 .bak_live_*） | 已配置（幂等脚本 vendure-live-env.sh） |
| vendure 重启 | pm2 restart vendure，shop-api 健康检查 200 | 完成 |
| nginx /socket.io/ 反代 | game.joho.cn-ssl.conf | 原已存在，零改动 |
| H5 前端 | socket.io-client 重写 connectWs + 在线徽标 + sys 提示 + 心形动效（vshop ee65cb5） | 已部署 e.joho.cn（备份 index.bak_1791098498） |
| 测试直播间 | room id=1「联调测试间」，status=live | 已建（admin-api createLiveRoom/startLiveRoom） |

## 3. 测试用例与结果

### 3.1 全链路冒烟（test/live-smoke.mjs，公网）
**SMOKE PASS** — 用 vendure enterLiveRoom 下发的真实 wsTicket 双客户端连接 wss://game.joho.cn/live：

| 断言 | 结果 |
|---|---|
| vendure 签票 → game-server 验票收连接（双客户端） | PASS |
| 在线数广播（A online 2） | PASS |
| B 弹幕实时广播到 A | PASS |
| 历史回发（A history items） | PASS |
| 点赞聚合广播（A got like 1） | PASS |

*修正记录：初版脚本 B 在 connect 回调立即发弹幕，早于 A 连接完成导致广播丢失——时序缺陷（脚本侧），服务端无 bug；已改为严格时序（A 稳定 → B 稳定 → 发送）。*

### 3.2 异常路径（test/live-negative.mjs）

| 用例 | 结果 |
|---|---|
| NEG1 篡改 ticket（deadbeef 签名）→ 服务端踢出 | PASS（handshake 后 KICKED_BY_SERVER） |
| NEG2 1s 内连发 3 条弹幕 → 仅第 1 条广播 + sys「发言太快啦，休息一下」 | PASS |

*注：服务端拒绝坏票的方式是握手成功后 `client.disconnect()`（handleConnection 内），客户端先 connect 再被踢——非 namespace 层 connect_error。*

### 3.3 浏览器双端联调（_shot_live_room.py，Playwright 390×844 dpr=2 ×2 上下文）

| 用例 | 结果 |
|---|---|
| A/B 进房，在线数徽标 1→2（跨页广播） | PASS |
| B 进房历史回显 | PASS |
| A 发弹幕 → B 实时收到 | PASS |
| B 点赞 → A 收到聚合 + 心形动效 | PASS |
| 浏览器真实点击 3 连发 → 限频 sys 提示 | PASS |

截图存证（同目录）：
- live-00-a-enter.png — A 进房首屏（播放区 + 在线徽标）
- live-01-b-received.png — B 实时收到 A 弹幕
- live-02-a-hearts.png — B 点赞后 A 端心形动效
- live-03-a-ratelimit.png — 限频 sys 提示
- live-04-a-final.png / live-05-b-final.png — 双端最终全景

## 4. 部署方式备忘

- **game-server（game.joho.cn）**：增量补丁（本地 src 落后生产 dist，严禁本地全量 build 覆盖；live 模块以 additive patch 部署），systemd 重启。
- **H5（e.joho.cn）**：本地 `dist/build/h5` tar → scp → 服务器备份 `index.bak_<ts>` 平级目录 → 解压替换。
- **vendure**：零代码改动，仅 .env 配置 + pm2 restart。

## 5. 遗留事项

1. **微信小程序 socket 合法域名**：`wss://game.joho.cn` 需在小程序后台配置（request/socket 合法域名），待用户操作。
2. **播放流**：测试间 playUrl 为占位地址（play.test.com），真实推拉流（如腾讯云直播）未接入——视频区会显示加载失败但不影响互动区。
3. game-server 仓库无远程（本地 git），如需备份推 GitHub 需提供远程地址。
4. 房间 2 的隔离性由 ticket 绑定 roomId 保证（verifyTicket 校验 rid），未做多房间 UI 级双房互扰测试（仅一个测试间）。
