# 直播互动服务落地 Implementation Plan（阶段39子项目1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** game-server（game.joho.cn, NestJS 11）新增 `/live` socket.io namespace 承载直播弹幕/点赞/在线数；vshop 前端切 socket.io-client；vendure 仅加配置。

**Architecture:** 跨机互信仅靠共享 `LIVE_WS_SECRET`（vendure 签 HMAC ticket → game-server 验票）；房间态放 Redis（在线 SET + 最近50条弹幕 LIST），Redis 故障降级进程内 Map。spec: `docs/superpowers/specs/2026-10-03-live-interactive-service-design.md`。

**Tech Stack:** NestJS 11 + @nestjs/websockets + socket.io（game-server 已有）、node-redis v6（game-server 已有 `redis@^6.1.0`）、socket.io-client（vshop 新增）、uni-app H5。

**环境事实（执行者必读）:**
- game-server 服务器：`ssh odoo`（root@game.joho.cn），代码在 `/opt/game-server`，systemd 单元 `game-server.service`，现跑 `node dist/src/main`。服务器**只重启不构建**（本地构建 → scp dist）。
- game-server 本地无克隆；`github.com/johocn/nestjs` 不存在。Task 1 用 scp 拉源码到 `e:\zhao\game-server`。
- vendure：`ssh joho`（admin@e.joho.cn），`/www/apps/vendure/packages/dev-server/.env`，pm2 重启。env 键已核实：`LIVE_WS_URL` / `LIVE_WS_SECRET`（dev-config.ts L459-464）。
- vshop：`e:\zhao\vshop`，前端页 `src/pkg-promotion/pages/live-room.vue`（connectWs 在 L94 附近），H5 部署走既有 tar/scp/解压流程（站点根 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index/`）。
- nginx：game.joho.cn-ssl.conf 已有 Upgrade 反代，Task 5 验证。
- Windows PowerShell 铁律：不支持 `&&`（用 `;`）；无 `head`（用 `Select-Object -First`）；复杂远程操作写 .sh 上传执行。

---

### Task 1: 获取 game-server 源码到本地

**Files:**
- Create: `e:\zhao\game-server\`（scp 拉取：src/、package.json、tsconfig*、nest-cli.json、.env 模板不拉）

- [ ] **Step 1: scp 拉取源码骨架**（排除 node_modules/dist）

```powershell
ssh odoo "cd /opt/game-server && tar czf /tmp/gs-src.tgz --exclude=node_modules --exclude=dist --exclude='dist_prev*' --exclude=admin --exclude=admin_bak* src package.json tsconfig.json tsconfig.build.json nest-cli.json"
scp odoo:/tmp/gs-src.tgz E:/zhao/gs-src.tgz
New-Item -ItemType Directory -Force E:\zhao\game-server | Out-Null
tar -xzf E:/zhao/gs-src.tgz -C E:/zhao/game-server
ssh odoo "rm -f /tmp/gs-src.tgz"
```

- [ ] **Step 2: 验证结构**

Run: `Get-ChildItem E:\zhao\game-server\src -Directory | Select-Object Name`
Expected: 包含 `modules`（内含 gateway、chat）、`cache`、`event-bus` 等。

- [ ] **Step 3: 本地安装依赖**

Run: `npm install --prefix E:\zhao\game-server --no-audit --no-fund`
Expected: 成功（bcrypt 若编译失败，改用 `npm install --ignore-scripts` 后仅跑 tsc，不影响本地 build 类型检查；若 bcrypt 仍阻断 build，见 Task 5 备选）。

- [ ] **Step 4: 现有模块侦察**（执行者读三个文件，后续代码要对齐风格）

读：`src/modules/gateway/game.gateway.ts`（装饰器/过滤器风格）、`src/modules/chat/`（敏感词过滤函数签名）、`src/cache/`（现有 Redis 封装；若已有单例 client 则 Task 2 直接复用，不要新建连接）。把发现记入任务产出摘要。

- [ ] **Step 5: 提交基线**

```powershell
git init -C E:\zhao\game-server ; git -C E:\zhao\game-server add -A ; git -C E:\zhao\game-server commit -m "chore: baseline from server (pre-live-module)"
```

### Task 2: LiveModule — Redis 房间态服务

**Files:**
- Create: `e:\zhao\game-server\src\modules\live\live.module.ts`
- Create: `e:\zhao\game-server\src\modules\live\live-room.service.ts`
- Test: `e:\zhao\game-server\test\live-room.service.spec.ts`

- [ ] **Step 1: 写失败测试**（jest，game-server 已配）

```typescript
// test/live-room.service.spec.ts
import { LiveRoomService } from '../src/modules/live/live-room.service';

describe('LiveRoomService ticket verify', () => {
  const SECRET = 'test-secret';
  const service = new LiveRoomService({} as any);
  it('accepts a valid ticket', () => {
    const payload = `12.88.${Date.now()}`;
    const sig = require('crypto').createHmac('sha256', SECRET).update(payload).digest('hex');
    const ok = service.verifyTicket(`${sig}:${payload}`, '12', SECRET);
    expect(ok.ok).toBe(true);
  });
  it('rejects expired ticket', () => {
    const payload = `12.88.${Date.now() - 6 * 60_000}`;
    const sig = require('crypto').createHmac('sha256', SECRET).update(payload).digest('hex');
    const ok = service.verifyTicket(`${sig}:${payload}`, '12', SECRET);
    expect(ok.ok).toBe(false);
  });
  it('rejects wrong room', () => {
    const payload = `99.88.${Date.now()}`;
    const sig = require('crypto').createHmac('sha256', SECRET).update(payload).digest('hex');
    expect(service.verifyTicket(`${sig}:${payload}`, '12', SECRET).ok).toBe(false);
  });
  it('rejects bad signature', () => {
    const payload = `12.88.${Date.now()}`;
    expect(service.verifyTicket(`deadbeef:${payload}`, '12', SECRET).ok).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `npm test --prefix E:\zhao\game-server -- --testPathPattern live-room`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 live-room.service.ts**

```typescript
// src/modules/live/live-room.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { createHmac, timingSafeEqual } from 'crypto';

const TICKET_TTL_MS = 5 * 60_000;
const DANMAKU_HISTORY = 50;

interface MemRoom { online: Set<string>; danmaku: string[]; like: number; }

@Injectable()
export class LiveRoomService implements OnModuleDestroy {
  private readonly logger = new Logger(LiveRoomService.name);
  private client: RedisClientType | null = null;
  private mem: Map<string, MemRoom> = new Map(); // Redis 降级用

  async onModuleInit() {
    try {
      const pw = process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : '';
      this.client = createClient({
        url: `redis://${pw}${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || '6379'}/${process.env.REDIS_DB || '0'}`,
      }) as RedisClientType;
      await this.client.connect();
      this.logger.log('Redis connected for live module');
    } catch (e: any) {
      this.logger.warn(`Redis unavailable, degrade to in-memory: ${e.message}`);
      this.client = null;
    }
  }
  async onModuleDestroy() { try { await this.client?.quit(); } catch {} }

  /** 验票：HMAC-SHA256(secret, "roomId.customerId.ts") + ':' + payload（与 vendure live-room-shop.service.ts 一致） */
  verifyTicket(ticket: string, roomId: string, secret: string): { ok: boolean; customerId: string | null } {
    try {
      const idx = ticket.indexOf(':');
      if (idx < 0) return { ok: false, customerId: null };
      const sig = ticket.slice(0, idx), payload = ticket.slice(idx + 1);
      const expect = createHmac('sha256', secret).update(payload).digest();
      const got = Buffer.from(sig, 'hex');
      if (got.length !== expect.length || !timingSafeEqual(got, expect)) return { ok: false, customerId: null };
      const [rid, cid, ts] = payload.split('.');
      if (rid !== roomId) return { ok: false, customerId: null };
      if (!ts || Date.now() - Number(ts) > TICKET_TTL_MS || Date.now() - Number(ts) < -30_000) return { ok: false, customerId: null };
      return { ok: true, customerId: cid === 'guest' ? null : cid };
    } catch { return { ok: false, customerId: null }; }
  }

  async join(roomId: string, socketId: string): Promise<void> {
    if (this.client) { await this.client.sAdd(`live:online:${roomId}`, socketId); await this.client.expire(`live:online:${roomId}`, 120); }
    else this.memRoom(roomId).online.add(socketId);
  }
  async leave(roomId: string, socketId: string): Promise<void> {
    if (this.client) await this.client.sRem(`live:online:${roomId}`, socketId);
    else this.memRoom(roomId).online.delete(socketId);
  }
  async onlineCount(roomId: string): Promise<number> {
    if (this.client) return this.client.sCard(`live:online:${roomId}`);
    return this.memRoom(roomId).online.size;
  }
  async pushDanmaku(roomId: string, json: string): Promise<void> {
    if (this.client) { await this.client.lPush(`live:danmaku:${roomId}`, json); await this.client.lTrim(`live:danmaku:${roomId}`, 0, DANMAKU_HISTORY - 1); }
    else { const r = this.memRoom(roomId); r.danmaku.unshift(json); if (r.danmaku.length > DANMAKU_HISTORY) r.danmaku.length = DANMAKU_HISTORY; }
  }
  async history(roomId: string): Promise<string[]> {
    if (this.client) return this.client.lRange(`live:danmaku:${roomId}`, 0, DANMAKU_HISTORY - 1);
    return this.memRoom(roomId).danmaku.slice(0, DANMAKU_HISTORY);
  }
  /** 点赞聚合：窗口内 +1，返回当前窗口计数 */
  async bumpLike(roomId: string): Promise<number> {
    if (this.client) return this.client.incr(`live:like:${roomId}`);
    return ++this.memRoom(roomId).like;
  }
  async resetLike(roomId: string): Promise<void> {
    if (this.client) await this.client.del(`live:like:${roomId}`);
    else this.memRoom(roomId).like = 0;
  }
  private memRoom(roomId: string): MemRoom {
    let r = this.mem.get(roomId);
    if (!r) { r = { online: new Set(), danmaku: [], like: 0 }; this.mem.set(roomId, r); }
    return r;
  }
}
```

注意：若 Task 1 Step 4 发现 `src/cache/` 已有共享 Redis 单例，则本 service 改注入该 client（删掉自建连接），其余 API 不变。

- [ ] **Step 4: live.module.ts**

```typescript
// src/modules/live/live.module.ts
import { Module } from '@nestjs/common';
import { LiveRoomService } from './live-room.service';
import { LiveGateway } from './live.gateway';

@Module({ providers: [LiveRoomService, LiveGateway], exports: [LiveRoomService] })
export class LiveModule {}
```

并在 `src/app.module.ts` imports 数组中加入 `LiveModule`（读文件定位 imports 列表后编辑）。

- [ ] **Step 5: 跑测试确认绿**

Run: `npm test --prefix E:\zhao\game-server -- --testPathPattern live-room`
Expected: 4 passed

- [ ] **Step 6: Commit**

```powershell
git -C E:\zhao\game-server add -A ; git -C E:\zhao\game-server commit -m "feat(live): LiveModule with ticket verify + Redis room state (degradable)"
```

### Task 3: live.gateway.ts（/live namespace）

**Files:**
- Create: `e:\zhao\game-server\src\modules\live\live.gateway.ts`
- Test: `e:\zhao\game-server\test\live.gateway.spec.ts`

- [ ] **Step 1: 写失败测试**（验票集成 + 限频逻辑纯函数部分）

```typescript
// test/live.gateway.spec.ts
import { LiveGateway } from '../src/modules/live/live.gateway';

describe('LiveGateway rate limit', () => {
  const gw = new LiveGateway({} as any, { verifyTicket: () => ({ ok: true, customerId: '88' }) } as any);
  it('allows 1 msg/s then blocks', () => {
    expect(gw.allowDanmaku('s1')).toBe(true);
    expect(gw.allowDanmaku('s1')).toBe(false);
    jest.setSystemTime(Date.now() + 1100);
    expect(gw.allowDanmaku('s1')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `npm test --prefix E:\zhao\game-server -- --testPathPattern live.gateway`
Expected: FAIL（allowDanmaku 不存在）

- [ ] **Step 3: 实现 live.gateway.ts**

```typescript
// src/modules/live/live.gateway.ts
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect,
  SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UseFilters } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsExceptionFilter } from '../gateway/ws-exception.filter';
import { LiveRoomService } from './live-room.service';

const LIKE_FLUSH_MS = 1000;

@WebSocketGateway({
  namespace: '/live',
  cors: {
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()) : ['*'],
    credentials: true,
  },
  pingInterval: 30000,
  pingTimeout: 90000,
  transports: ['websocket'],
})
@UseFilters(WsExceptionFilter)
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(LiveGateway.name);
  @WebSocketServer() server: Server;
  private lastDanmakuAt = new Map<string, number>();
  private likeCounters = new Map<string, number>(); // roomId -> 本窗口点赞数
  private likeTimer: NodeJS.Timeout | null = null;
  private filtered = new Set<string>(); // 已提醒过限频的 socket

  constructor(
    private readonly config: { LIVE_WS_SECRET?: string },
    private readonly rooms: LiveRoomService,
  ) {}

  allowDanmaku(socketId: string): boolean {
    const now = Date.now();
    const last = this.lastDanmakuAt.get(socketId) || 0;
    if (now - last < 1000) return false;
    this.lastDanmakuAt.set(socketId, now);
    return true;
  }

  async handleConnection(client: Socket) {
    const q = client.handshake?.query || {};
    const roomId = String(q.roomId || '');
    const ticket = String(q.ticket || '');
    const secret = process.env.LIVE_WS_SECRET || '';
    if (!roomId || !ticket || !secret) { client.disconnect(); return; }
    const v = this.rooms.verifyTicket(ticket, roomId, secret);
    if (!v.ok) { this.logger.warn(`live auth reject room=${roomId} socket=${client.id}`); client.disconnect(); return; }
    (client.data as any) = { roomId, customerId: v.customerId, user: v.customerId ? `用户${v.customerId.slice(-4)}` : `游客${Math.random().toString(36).slice(2, 6)}` };
    await this.rooms.join(roomId, client.id);
    client.join(`room:${roomId}`);
    const items = await this.rooms.history(roomId);
    client.emit('history', { items: items.map(s => JSON.parse(s)).reverse() });
    this.broadcastOnline(roomId);
    this.ensureLikeTimer();
  }

  async handleDisconnect(client: Socket) {
    const d = client.data as any;
    if (!d?.roomId) return;
    await this.rooms.leave(d.roomId, client.id);
    this.lastDanmakuAt.delete(client.id);
    this.filtered.delete(client.id);
    this.broadcastOnline(d.roomId);
  }

  @SubscribeMessage('danmaku')
  async onDanmaku(@ConnectedSocket() client: Socket, @MessageBody() body: { text?: string }) {
    const d = client.data as any;
    if (!d?.roomId || !body?.text) return;
    if (!this.allowDanmaku(client.id)) {
      if (!this.filtered.has(client.id)) { this.filtered.add(client.id); client.emit('sys', { level: 'warn', text: '发言太快啦，休息一下' }); }
      return;
    }
    const text = this.filterText(String(body.text).slice(0, 100));
    const msg = { user: d.user, text, ts: Date.now() };
    await this.rooms.pushDanmaku(d.roomId, JSON.stringify(msg));
    this.server.to(`room:${d.roomId}`).emit('danmaku', msg);
  }

  @SubscribeMessage('like')
  async onLike(@ConnectedSocket() client: Socket) {
    const d = client.data as any;
    if (!d?.roomId) return;
    const n = await this.rooms.bumpLike(d.roomId);
    this.likeCounters.set(d.roomId, (this.likeCounters.get(d.roomId) || 0) + 1);
    void n;
  }

  private ensureLikeTimer() {
    if (this.likeTimer) return;
    this.likeTimer = setInterval(async () => {
      for (const [roomId, n] of this.likeCounters) {
        if (n > 0) { this.server.to(`room:${roomId}`).emit('like', { count: n }); await this.rooms.resetLike(roomId); }
      }
      this.likeCounters.clear();
    }, LIKE_FLUSH_MS);
  }

  private async broadcastOnline(roomId: string) {
    const count = await this.rooms.onlineCount(roomId);
    this.server.to(`room:${roomId}`).emit('online', { count });
  }

  /** 敏感词过滤：优先复用 chat 模块（Task 1 Step 4 侦察后对齐调用签名），兜底直接返回 */
  private filterText(text: string): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { filterSensitiveWords } = require('../chat/chat.util');
      return filterSensitiveWords(text);
    } catch { return text; }
  }
}
```

注意两点：① `filterSensitiveWords` 的真实函数名/路径以 Task 1 Step 4 侦察结果为准对齐（chat 模块在 `src/modules/chat/`），不存在则保留 try/catch 兜底；② gateway 通过构造函数拿 `LiveRoomService`（Nest DI 会自动注入，测试里手传 stub），不要真的注入 config 对象——生产 DI 下直接 `process.env` 取 secret，测试构造改为 `new LiveGateway(null as any, stub)`。

- [ ] **Step 4: 跑测试确认绿**

Run: `npm test --prefix E:\zhao\game-server -- --testPathPattern live`
Expected: 全部 passed

- [ ] **Step 5: Commit**

```powershell
git -C E:\zhao\game-server add -A ; git -C E:\zhao\game-server commit -m "feat(live): /live gateway with auth, rate limit, like aggregation"
```

### Task 4: 本地端到端冒烟

**Files:**
- Create: `e:\zhao\game-server\test\live-smoke.mjs`

- [ ] **Step 1: 写冒烟脚本**（两个客户端互发弹幕）

```javascript
// test/live-smoke.mjs — 用法: node test/live-smoke.mjs <wsUrl> <roomId> <ticket>
import { io } from 'socket.io-client';
const [url, roomId, ticket] = process.argv.slice(2);
const mk = () => io(`${url}/live`, { transports: ['websocket'], query: { roomId, ticket }, reconnection: false, timeout: 5000 });
const a = mk(), b = mk();
let onlineSeen = false, gotB = false;
const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
setTimeout(() => fail('timeout'), 12000);
a.on('connect', () => console.log('A connected'));
b.on('connect', async () => { console.log('B connected'); b.emit('danmaku', { text: 'hello-live' }); });
a.on('online', ({ count }) => { if (count >= 2) onlineSeen = true; console.log('online', count); });
a.on('danmaku', (m) => { if (m.text === 'hello-live') gotB = true; console.log('A got danmaku', m); });
a.on('history', ({ items }) => console.log('A history', items.length));
setInterval(() => { if (onlineSeen && gotB) { console.log('SMOKE PASS'); process.exit(0); } }, 300);
```

- [ ] **Step 2: 本地起服务跑冒烟**

本地 `.env` 补 `LIVE_WS_SECRET=dev-live-secret`；`npm run build` → `node dist/src/main`（若端口冲突用现有主端口）→
Run: `node test/live-smoke.mjs http://localhost:<port> 1 <ticket>`，ticket 用 node -e 现算：
`node -e "const c=require('crypto');const p='1.guest.'+Date.now();console.log(c.createHmac('sha256','dev-live-secret').update(p).digest('hex')+':'+p)"`
Expected: `SMOKE PASS`

- [ ] **Step 3: Commit**

```powershell
git -C E:\zhao\game-server add -A ; git -C E:\zhao\game-server commit -m "test(live): smoke script for two-client danmaku broadcast"
```

### Task 5: 构建 + 部署 game-server + nginx 验证

- [ ] **Step 1: 本地构建**

Run: `npm run build --prefix E:\zhao\game-server`
Expected: `dist/src/modules/live/` 产物存在。bcrypt 本地编译若阻断 build：`npm i --prefix E:\zhao\game-server --ignore-scripts` 后仅以 `npx tsc -p tsconfig.build.json` 产出 dist（bcrypt 为运行时依赖，服务器 node_modules 已有，无需本地可用）。

- [ ] **Step 2: 打包上传**

```powershell
tar -czf E:/zhao/gs-dist.tgz -C E:/zhao/game-server/dist . ; scp E:/zhao/gs-dist.tgz odoo:/tmp/
```

- [ ] **Step 3: 服务器原子换 dist + 配 secret + 重启**

```bash
# /tmp/gs-deploy.sh —— scp 后 ssh odoo "bash /tmp/gs-deploy.sh" 执行
set -e
cd /opt/game-server
cp .env /tmp/gs-env.bak
grep -q '^LIVE_WS_SECRET=' .env || echo "LIVE_WS_SECRET=$(openssl rand -hex 32)" >> .env
rm -rf dist_prev_live && mv dist dist_prev_live
mkdir dist && tar xzf /tmp/gs-dist.tgz -C dist
systemctl restart game-server
sleep 3
systemctl is-active game-server
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:$(grep -E '^PORT=' .env | cut -d= -f2)/health || true
```

Expected: `active`。失败则 `mv dist_prev_live dist && systemctl restart game-server` 回滚。

- [ ] **Step 4: 服务器冒烟**（真票：用 vendure 同款 secret 计算）

取两侧 secret 同值：`ssh joho "grep LIVE_WS_SECRET /www/apps/vendure/packages/dev-server/.env"`，若无则先给 vendure .env 写同一值（Task 6 Step 1 一起做，顺序调整：先 Task 6 Step 1 配 secret，再回来跑本步）。
Run: `ssh odoo "node /opt/game-server/test/live-smoke.mjs http://127.0.0.1:<port> 1 <ticket>"`（test 目录若未随 dist 上传，单独 `scp -r e:\zhao\game-server\test odoo:/opt/game-server/`）
Expected: `SMOKE PASS`

- [ ] **Step 5: nginx 验证 wss 可达**

Run: `ssh odoo "curl -s -o /dev/null -w '%{http_code}\n' -H 'Upgrade: websocket' -H 'Connection: Upgrade' 'https://game.joho.cn/socket.io/?EIO=4&transport=websocket'"`
Expected: `400`（socket.io 拒绝无 ns 握手的 http_code 属正常）或 `101`；若 `404/502` → 在 game.joho.cn-ssl.conf 补 `location /socket.io/ { proxy_pass http://127.0.0.1:<port>; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }` 后 reload。

- [ ] **Step 6: Commit（部署脚本入库 game-server 仓库）**

```powershell
git -C E:\zhao\game-server add -A ; git -C E:\zhao\game-server commit -m "chore(live): deploy script + smoke on server"
```

### Task 6: vendure 配置 + wsUrl 下发验证

- [ ] **Step 1: e.joho.cn .env 写入**（与 game-server 同 secret 值）

```bash
# /tmp/v-live-env.sh —— ssh joho "bash /tmp/v-live-env.sh"
set -e
cd /www/apps/vendure/packages/dev-server
SECRET=$(ssh 换算不可用——改为: 直接由执行者把 odoo 侧读到的 LIVE_WS_SECRET 值作为参数传入脚本 $1)
grep -q '^LIVE_WS_SECRET=' .env || echo "LIVE_WS_SECRET=$1" >> .env
grep -q '^LIVE_WS_URL=' .env || echo "LIVE_WS_URL=wss://game.joho.cn/live" >> .env
pm2 restart vendure
sleep 3
pm2 list | grep vendure
```

注意：脚本不要嵌套 ssh；执行者先 `ssh odoo "grep '^LIVE_WS_SECRET=' /opt/game-server/.env"` 取值，再以参数传入本脚本。

- [ ] **Step 2: shop-api 验证 enterLiveRoom 下发 wsUrl**

```powershell
curl.exe -s -X POST https://e.joho.cn/shop-api/graphql -H "Content-Type: application/json" -d "{\"query\":\"query{liveRooms{items{id name status}}}\"}"
```
Expected: JSON 正常（拿到一个 roomId）。再（带 roomId）：
```powershell
curl.exe -s -X POST https://e.joho.cn/shop-api/graphql -H "Content-Type: application/json" -d "{\"query\":\"mutation{enterLiveRoom(id:\\\"<roomId>\\\"){wsUrl wsTicket playUrl}}\"}"
```
Expected: `wsUrl == "wss://game.joho.cn/live"`，wsTicket 含 `:`。

### Task 7: vshop 前端 socket.io-client 改造

**Files:**
- Modify: `e:\zhao\vshop\package.json`（dependencies 加 `"socket.io-client": "^4.7.5"`）
- Modify: `e:\zhao\vshop\src\pkg-promotion\pages\live-room.vue`（connectWs 重写 L94-120 附近；模板区加在线数徽标）

- [ ] **Step 1: 安装依赖**

Run: `npm i socket.io-client@^4.7.5 --prefix E:\zhao\vshop`
Expected: package.json 更新、lock 更新。

- [ ] **Step 2: 重写 connectWs 与事件绑定**（保留 load() 里 enterLiveRoom 取 wsUrl/wsTicket 不变）

```typescript
// live-room.vue <script setup> 中替换原 connectWs 及相关状态
import { io, Socket } from 'socket.io-client';

const onlineCount = ref(0);
const sysTip = ref('');
let socket: Socket | null = null;

function connectWs() {
  if (!wsUrl.value) return;
  socket = io(wsUrl.value, {
    transports: ['websocket'],
    query: { roomId: roomId.value, ticket: wsTicket.value },
    reconnection: true,
    reconnectionDelay: 2000,
  });
  socket.on('connect', () => console.log('live ws connected'));
  socket.on('history', ({ items }) => { danmakuList.value.push(...items); });
  socket.on('danmaku', (m: any) => { danmakuList.value.push(m); trimDanmaku(); });
  socket.on('like', ({ count }) => { likeCount.value += count; popHearts(count); });
  socket.on('online', ({ count }) => { onlineCount.value = count; });
  socket.on('sys', (m: any) => { sysTip.value = m.text; setTimeout(() => (sysTip.value = ''), 3000); });
  socket.on('connect_error', () => { sysTip.value = '互动通道连接中…'; });
}
function sendDanmaku() {
  const text = inputText.value.trim();
  if (!text) return;
  socket?.emit('danmaku', { text });
  inputText.value = '';
}
function sendLike() {
  socket?.emit('like');
}
function popHearts(n: number) { /* 触发 .heart 上浮动画 n 次（CSS animation 重放，实现略需 DOM ref） */ }
function trimDanmaku() { if (danmakuList.value.length > 60) danmakuList.value.splice(0, danmakuList.value.length - 60); }
onUnmounted(() => socket?.disconnect());
```

- [ ] **Step 3: 模板区增量**（在 head 状态行加在线数；互动区绑定新状态）

在 `.h-status` 旁加：`<text class="h-online">{{ onlineCount }} 人在看</text>`；`.actions` 里「赞」改为 `赞 {{ likeCount }}`（保留），发送/输入不变。

- [ ] **Step 4: H5 构建检查 + 部署**

Run: `npm run build:h5 --prefix E:\zhao\vshop`
Expected: 无类型错误，`dist/build/h5` 更新。然后按既有流程：tar → scp → 解压 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index/`（先备份 index.bak_<ts>）。

- [ ] **Step 5: Commit + push**

```powershell
git -C E:\zhao\vshop add package.json package-lock.json src/pkg-promotion/pages/live-room.vue ; git -C E:\zhao\vshop commit -m "feat(live): socket.io-client interactive room (danmaku/like/online/history)" ; git -C E:\zhao\vshop push
```

### Task 8: 双端联调 + 手机视口截图验收

- [ ] **Step 1: 预置直播间**（vendure admin-api 建一个 live 房间 status=live + playUrl 用任意可播 HLS 或留空播测试流）
- [ ] **Step 2: 浏览器双窗口**：`https://e.joho.cn/#/pkg-promotion/pages/live-room?id=<roomId>` 两窗口互发弹幕，验证广播、在线数=2、点赞聚合
- [ ] **Step 3: 手机视口截图（390×844, dpr=2）**：弹幕列表 + 在线数徽标 + 点赞动效三张，存 `docs/verify/`
- [ ] **Step 4: 异常路径**：篡改 ticket 连接 → 应断连；快速发 3 条弹幕 → 第 2 条被限频 + sys 提示
- [ ] **Step 5: 操作记录写 `docs/verify/2026-10-live-interactive.md`（测试用例 + 截图引用）**

### Task 9: 收尾

- [ ] **Step 1:** game-server 仓库（本地 e:\zhao\game-server）推送——问用户远程地址；无远程则保持本地 git 并在汇报中说明
- [ ] **Step 2:** 更新 project_memory（game-server 部署方式、LIVE_WS_SECRET 双端配置、socket.io-client 选型）
- [ ] **Step 3:** 汇报：联调结果 + 截图 + 遗留（小程序 socket 合法域名待用户配）

---

## Self-Review 记录

1. **Spec coverage**: §2（Task 2/3）、§3 验票（Task 2 测试）、§4 vendure 配置（Task 6）、§5 前端（Task 7）、§6 错误处理（gateway sys/降级/重连）、§7 测试（Task 4/5/8）、§8 部署（Task 5/6/7）、§9 运维待办（Task 9 Step 3）——全覆盖。
2. **Placeholder scan**: popHearts 标注「实现略需 DOM ref」属前端动画细节，执行时按现有 heart 动效补齐——已给方向；`filterSensitiveWords` 以侦察结果为准对齐——已在任务内写明对齐指令与兜底。无 TBD 级空洞。
3. **Type consistency**: verifyTicket 返回 `{ok, customerId}` 在 Task 2 定义、Task 3 使用一致；Redis 键前缀 `live:` 统一；事件名 danmaku/like/online/sys/history 前后端一致。
