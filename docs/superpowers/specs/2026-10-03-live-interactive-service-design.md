# 直播互动服务落地（game-server /live gateway）设计

> 阶段39子项目 1/4。承接 `vshop/doc/2026-08-21-电商直播服务-阶段38实施计划.md`（阶段38已交付直播插件、Shop API、前端页面；互动 ws 服务当时未落地）。

**Goal:** 修复直播互动断链——弹幕/点赞/关注/在线数由 game.joho.cn 的 game-server（NestJS）承载，vshop 前端从原生 WebSocket 切换到 socket.io-client，vendure 零代码变更。

**用户已确认的关键决策：**
1. 部署形态：跨机——复用 game.joho.cn 已有的 game-server（NestJS 11），不新建进程、不并入 vendure（隔离直播峰值流量与交易服务）
2. 技术路线：socket.io 全链（服务端已有 `/game`、`/matchmaking` 两个 gateway，模式成熟；前端 live-room.vue 从原生 WebSocket 改为 socket.io-client）
3. 顺序：本子项目 → 子项目2（主播开播链路+web-admin UI）→ 子项目3（腾讯云回调+回放）→ 子项目4（小程序原生 live-player/pusher）

## 1. 架构与调用链

```
观众(vshop H5)
  │ 1. enterLiveRoom (shop-api)
  ▼
vendure (e.joho.cn) ──返回 playUrl + wsTicket（HMAC 签发，现有协议不变）
  │
  │ 2. io(wss://game.joho.cn/live, query: roomId+ticket)
  ▼
LiveGateway (game-server, game.joho.cn) ──验票（共享 wsSecret）──▶ Redis（在线集合/弹幕历史）
  │ 3. 弹幕/点赞/在线数 实时广播
  ▼
同房间全体观众
```

- 跨机信任仅靠共享密钥 `wsSecret`（vendure .env 与 game-server .env 同值），无跨机数据库依赖
- nginx：game.joho.cn-ssl.conf 已有 WebSocket Upgrade 反代，预计零改动（实施时验证 `/socket.io/` 路径覆盖）

## 2. game-server 新增 LiveModule

**Files（/opt/game-server，源码以本地克隆为准）:**
- `src/modules/live/live.module.ts`
- `src/modules/live/live.gateway.ts`
- `src/modules/live/live-room.service.ts`

### 2.1 live.gateway.ts

- `@WebSocketGateway({ namespace: '/live', cors: 同现有 gateway, pingInterval: 30000, pingTimeout: 90000, transports: ['websocket'] })`
- 连接鉴权（handleConnection）：读 `handshake.query.roomId` + `ticket`，验票失败 `disconnect()`
- `handleJoin`：`socket.join('room:'+roomId)`；Redis `SADD live:online:{roomId} socketId`；回发最近 50 条历史弹幕（`LRANGE`）
- 事件（client → server）：

| 事件 | payload | 说明 |
|---|---|---|
| `danmaku` | `{ text: string }` | 限频 1 条/秒/用户；过敏感词过滤后广播 |
| `like` | `{}` | 服务端聚合，每秒合并计数广播一次 |
| `ping` | `{}` | 心跳，30s 未心跳视为离线 |

- 事件（server → client）：

| 事件 | payload | 说明 |
|---|---|---|
| `danmaku` | `{ user, text, ts }` | 房间广播 |
| `like` | `{ count }` | 每秒聚合广播 |
| `online` | `{ count }` | 在线数变更（`SCARD`） |
| `sys` | `{ level, text }` | 系统提示（进房/断连/限频提醒） |
| `history` | `{ items: [...] }` | 进房时回发历史弹幕 |

- user 名：ticket payload 里的 customerId 昵称 MVP 用 `用户{customerId后4位}`，游客用 `游客{随机4位}`

### 2.2 live-room.service.ts（房间态）

Redis 键设计：
- `live:online:{roomId}` — SET，成员 socketId，30s 无心跳清理（`EXPIRE 120` 兜底）
- `live:danmaku:{roomId}` — LIST，保留最近 50 条（`LPUSH + LTRIM 0 49`）
- `live:like:{roomId}` — 计数器（聚合窗口内 INCR，广播后清零）

降级：Redis 抛错时降级为进程内 Map 房间态（丢历史弹幕，直播不断），打 warn 日志。

## 3. 验票协议（与 vendure 现有实现严格一致）

vendure 侧签发（`live-room-shop.service.ts` 现有代码，不改）：
```
payload = `${roomId}.${customerId ?? 'guest'}.${Date.now()}`
ticket  = HMAC_SHA256(wsSecret, payload).hex + ':' + payload
```
game-server 验票：
1. `ticket.split(':')` → sig + payload；重算 HMAC 比对（`timingSafeEqual`）
2. payload 按 `.` 拆分：roomId 匹配、ts 距今 ≤ 5 分钟
3. 任一失败 → 拒绝连接

配置：game-server `.env` 新增 `LIVE_WS_SECRET`。vendure 侧键名已核实（dev-config.ts L459-464）：`wsUrl = LIVE_WS_URL`、`wsSecret = LIVE_WS_SECRET`，两端同键同值。

## 4. vendure 改动（仅配置，零代码）

- 服务器 `.env` 新增：
  - `LIVE_WS_URL=wss://game.joho.cn/live`（插件 options.wsUrl 现有读取逻辑直接生效）
  - `LIVE_WS_SECRET=<32位随机串>`（与 game-server 同值，同时写入 game-server `.env`）
- `pm2 restart vendure` 生效

## 5. vshop 前端改动

- `src/package.json`（或根 package.json）新增依赖 `socket.io-client`
- `src/pkg-promotion/pages/live-room.vue` 的 `connectWs()` 重写：
  - `io(wsUrl, { transports: ['websocket'], query: { roomId, ticket }, reconnection: true })`
  - 绑定 `danmaku/like/online/sys/history` 五个事件到现有 UI（弹幕列表、点赞数、在线数徽标、提示条）
  - `sendDanmaku/sendLike` 改 emit，保留本地回显
- 点赞动效：收 `like` 聚合计数时触发爱心上浮（CSS 动画）
- 关注：MVP 保持现有 sendFollow 本地态 + `sys` 提示广播；vendure 关注体系不在本子项目范围
- 产物部署：沿用 e.joho.cn tar/scp/解压流程

## 6. 错误处理

| 场景 | 行为 |
|---|---|
| 票无效/过期 | 断连；前端 toast「连接已过期，请重新进入直播间」 |
| 弹幕超限 | 服务端丢弃 + `sys` 提示（每用户每次会话最多提醒 1 次） |
| 敏感词命中 | 替换为 `**` 后照常广播（复用 Chat 模块过滤策略） |
| Redis 不可用 | 降级内存态，warn 日志，直播不中断 |
| game-server 重启 | socket.io 自动重连 + 重新 join，前端无感 |

## 7. 测试计划

1. **game-server 冒烟**：node 脚本模拟两个客户端连 `/live` → 验票 → 互发弹幕 → 校验广播与在线数 → 断开后在线数回落
2. **前端 e2e**：直播间弹幕收发、点赞动效、在线数、历史弹幕回显
3. **交付硬规范**：手机视口截图（390×844, dpr=2）存证
4. **双端联调**：两个浏览器窗口对发弹幕验证广播隔离（不同房间不串扰）

## 8. 部署

1. game-server：本地 `nest build` → scp dist → `systemctl restart game-server`（服务器只重启不构建）
2. vendure：`.env` 两行新增 → `pm2 restart vendure`
3. vshop：重新构建 H5 → tar/scp/解压 e.joho.cn
4. nginx：验证 `/socket.io/` 反代，必要时补 location

## 9. 运维待办（用户侧）

- 微信小程序后台：socket 合法域名加 `wss://game.joho.cn`（小程序阶段前完成即可）

## 10. 后续子项目（另立 spec）

2. 主播开播链路：web-admin 直播管理 UI + OBS 推流指引 + streamKey 展示
3. 腾讯云回调+回放闭环：事件回调自动同步状态、录制回放生成 replayUrl
4. 小程序原生适配：live-player 播放、live-pusher 推流（需小程序直播类目资质）
