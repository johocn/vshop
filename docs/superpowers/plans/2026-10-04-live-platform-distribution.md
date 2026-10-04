# 直播多平台分发（方案A）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 商城直播间支持「自建流 HLS」/「平台导流」双形态，一场直播可分发给抖音/快手/视频号（`wechat_channels`），无推流权限自动降级海报导流。

**Architecture:** vendure live-streaming-plugin 新增 `LiveRoomPlatform` 实体（ManyToOne→LiveRoom + channels 租户渠道关联），admin `setLiveRoomPlatforms` 整清单回写，shop `liveRoom` 返回 `platforms`；vshop `live-room.vue` 播放区按 `playUrl` 空判定双形态 + 平台 pill 按钮组；game-server /live 互动层零改动。生产 postgres `synchronize:true`，pm2 restart 自动建表。

**Tech Stack:** Vendure 3.x（TypeORM 实体 + GraphQL schema 扩展）、uni-app/Vue3（vshop H5 + mp-weixin 条件编译）、hls.js（H5 桌面 Chrome 兜底）、socket.io（互动，不动）。

**关键约束（执行者必读）:**
1. **vendure 本地克隆未装依赖**：改动采用既定「src+lib 手工同步」实践——src 为主，`lib/` 编译产物手工同步入库，服务器 `git pull` 零构建生效。本地 `npx tsc --noEmit` 若报 `@vendure/core` 类型解析错误可忽略，但**语法错误必须修**。
2. **服务器并发风险**：joho 服务器上有另一客户操作 pm2/strapi。所有服务器操作前先 `pm2 ls` 检查 uptime/restarts 异常；**绝不碰 strapi**；只 restart `vendure` 进程。
3. **PowerShell 铁律**：本地命令不支持 `&&`（用 `;`）；复杂远程操作写 `.sh` scp 执行；ssh 单引号会被剥离。
4. **部署顺序**：vendure 先上（数据层），vshop 后上（前端消费新字段）。
5. 生产 admin 凭据 `superadmin/z123123`（token 缓存 `e:\zhao\vshop\.secrets\admin_token.txt`）；SSH 别名 `joho`。
6. 手机截图规范：Playwright 390×844、dpr=2、is_mobile=True、has_touch=True。

**Spec:** `docs/superpowers/specs/2026-10-04-live-dual-platform-distribution-design.md`

---

## File Structure

```
e:\zhao\vendure\packages\live-streaming-plugin\
├── src\
│   ├── live-room-platform.entity.ts   [新建] 平台分发实体
│   ├── live-room.entity.ts            [修改] 加 platforms OneToMany
│   ├── plugin.ts                      [修改] 实体注册 + schema（admin/shop）
│   ├── live-room.service.ts           [修改] setPlatforms + findOne relations
│   ├── live-room-shop.service.ts      [修改] detail 返回 platforms（渠道过滤）
│   └── live-admin.resolver.ts         [修改] setLiveRoomPlatforms mutation
└── lib\                               [同步] 以上文件对应 .js/.d.ts

e:\zhao\game-server\
└── scripts\live-platforms-verify.sh   [新建] 生产 GraphQL 冒烟（参数化密码）

e:\zhao\vshop\
├── src\api\queries\live.ts            [修改] getLiveRoom 加 platforms 字段
├── src\pkg-promotion\pages\live-room.vue  [修改] 双形态 + 平台按钮组 + 视频号引导
└── package.json                       [修改] 加 hls.js 依赖
```

---

### Task 1: vendure — LiveRoomPlatform 实体 + 注册

**Files:**
- Create: `packages/live-streaming-plugin/src/live-room-platform.entity.ts`
- Modify: `packages/live-streaming-plugin/src/live-room.entity.ts`
- Modify: `packages/live-streaming-plugin/src/plugin.ts`
- Sync: `packages/live-streaming-plugin/lib/`（手工同步 .js/.d.ts）

- [ ] **Step 1.1: 新建实体** `src/live-room-platform.entity.ts`

```ts
import { Column, Entity, Index, JoinTable, ManyToMany, ManyToOne } from 'typeorm';
import { Channel, DeepPartial, VendureEntity } from '@vendure/core';
import { LiveRoom } from './live-room.entity';

@Entity()
export class LiveRoomPlatform extends VendureEntity {
    constructor(input?: DeepPartial<LiveRoomPlatform>) {
        super(input);
    }

    @Index()
    @ManyToOne(() => LiveRoom, room => room.platforms, { onDelete: 'CASCADE' })
    liveRoom: LiveRoom;

    /** 平台标识：douyin / kuaishou / wechat_channels / 预留扩展（^[a-z0-9_]{2,32}$） */
    @Column({ type: 'varchar', length: 32 })
    platform: string;

    /**
     * 平台落地信息：
     * - douyin/kuaishou: http(s) 直播间链接
     * - wechat_channels: wxchannels://finder=<视频号ID>(&feed=<feedId>)?
     */
    @Column({ type: 'varchar', length: 512 })
    externalUrl: string;

    @ManyToMany(() => Channel)
    @JoinTable()
    channels: Channel[];
}
```

- [ ] **Step 1.2: LiveRoom 实体加反向关系**

`src/live-room.entity.ts`：import 行加 `OneToMany`（从 'typeorm'），新增 import `LiveRoomPlatform`，在 `products` 字段后加：

```ts
    /** 平台分发配置（多租户按渠道过滤） */
    @OneToMany(() => LiveRoomPlatform, p => p.liveRoom)
    platforms: LiveRoomPlatform[];
```

- [ ] **Step 1.3: plugin.ts 注册实体**

`src/plugin.ts`：加 `import { LiveRoomPlatform } from './live-room-platform.entity';`，`entities: [LiveRoom, LiveRoomProduct]` 改为 `entities: [LiveRoom, LiveRoomProduct, LiveRoomPlatform]`。

- [ ] **Step 1.4: lib 手工同步**

新建 `lib/live-room-platform.entity.js` + `.d.ts`（由 Step 1.1 代码去类型得到，模式参照 `lib/live-room-product.entity.js` 现有写法：`__decorate` 装饰器、`__metadata`）；同步修改 `lib/live-room.entity.js`（加 platforms 装饰器段 + require）与 `lib/live-room.entity.d.ts`、`lib/plugin.js`（entities 数组）、`lib/plugin.d.ts`。

- [ ] **Step 1.5: 语法验证**

Run: `cd e:\zhao\vendure; npx tsc -p packages/live-streaming-plugin/tsconfig.json --noEmit`
Expected: 无**语法**错误（缺依赖的类型解析报错可忽略）。

- [ ] **Step 1.6: Commit**

```bash
git add packages/live-streaming-plugin/src packages/live-streaming-plugin/lib
git commit -m "feat(live): LiveRoomPlatform 实体（平台分发配置，租户渠道关联）"
```

---

### Task 2: vendure — admin schema + setLiveRoomPlatforms 整清单回写

**Files:**
- Modify: `packages/live-streaming-plugin/src/plugin.ts`
- Modify: `packages/live-streaming-plugin/src/live-room.service.ts`
- Modify: `packages/live-streaming-plugin/src/live-admin.resolver.ts`
- Sync: `lib/` 同名文件

- [ ] **Step 2.1: schema 扩展（plugin.ts）**

共享类型串 `liveRoomType` 加（`type LiveRoomProduct` 块之后）：

```graphql
type LiveRoomPlatform implements Node {
    id: ID!
    platform: String!
    externalUrl: String!
}
```

`type LiveRoom` 内加字段：`platforms: [LiveRoomPlatform!]!`。

adminApiExtensions schema 加 input 与 mutation（`AddLiveRoomProductInput` 之后）：

```graphql
input LiveRoomPlatformInput {
    platform: String!
    externalUrl: String!
}
```

`extend type Mutation` 内加：`setLiveRoomPlatforms(roomId: ID!, platforms: [LiveRoomPlatformInput!]!): LiveRoom!`

（shop 端 `${liveRoomType}` 复用共享串，自动获得 platforms 字段与 LiveRoomPlatform type。）

- [ ] **Step 2.2: service 加 setPlatforms + findOne relations**

`src/live-room.service.ts` 顶部 import `LiveRoomPlatform`，常量与正则加在 `randomKey` 之后：

```ts
const PLATFORM_RE = /^[a-z0-9_]{2,32}$/;
const WXCHANNELS_RE = /^wxchannels:\/\/finder=[A-Za-z0-9_-]+(&feed=[A-Za-z0-9_-]+)?$/;
```

`findOne` 的 relations 改为 `{ relations: ['products', 'platforms'] }`。

`removeProduct` 方法之后新增：

```ts
    /** 平台分发整清单回写（传空数组=清空本渠道配置） */
    async setPlatforms(ctx: RequestContext, roomId: ID, inputs: any[]): Promise<LiveRoom> {
        const room = await this.findOne(ctx, roomId);
        if (!room) throw new UserInputError('Live room not found');
        const seen = new Set<string>();
        for (const p of inputs) {
            if (!p?.platform || !PLATFORM_RE.test(p.platform)) {
                throw new UserInputError(`Invalid platform: ${p?.platform}`);
            }
            if (seen.has(p.platform)) throw new UserInputError(`Duplicate platform: ${p.platform}`);
            seen.add(p.platform);
            if (!p.externalUrl) throw new UserInputError(`externalUrl required for ${p.platform}`);
            if (p.platform === 'wechat_channels' && !WXCHANNELS_RE.test(p.externalUrl)) {
                throw new UserInputError('wechat_channels externalUrl must be wxchannels://finder=<id>(&feed=<id>)');
            }
        }
        const repo = this.connection.getRepository(ctx, LiveRoomPlatform);
        const existing = await repo.find({ where: { liveRoom: { id: roomId as any } }, relations: ['channels'] });
        const mine = existing.filter(p => p.channels.some(c => c.id === ctx.channelId));
        if (mine.length) await repo.remove(mine);
        const channel = await this.connection.getEntityOrThrow(ctx, Channel, ctx.channelId);
        await repo.save(inputs.map(p => repo.create({
            liveRoom: room,
            platform: p.platform,
            externalUrl: p.externalUrl,
            channels: [channel],
        })));
        return (await this.findOne(ctx, roomId))!;
    }
```

- [ ] **Step 2.3: admin resolver 加 mutation**

`src/live-admin.resolver.ts` `stopLiveRoom` 之后：

```ts
    @Mutation()
    @Transaction()
    async setLiveRoomPlatforms(@Ctx() ctx: RequestContext, @Args('roomId') roomId: ID, @Args('platforms') platforms: any) {
        return this.liveRoomService.setPlatforms(ctx, roomId, platforms);
    }
```

- [ ] **Step 2.4: lib 手工同步** `lib/plugin.js`（schema 串）、`lib/live-room.service.js/.d.ts`（setPlatforms + relations）、`lib/live-admin.resolver.js/.d.ts`。

- [ ] **Step 2.5: 语法验证** 同 Task 1 Step 1.5。

- [ ] **Step 2.6: Commit**

```bash
git add packages/live-streaming-plugin/src packages/live-streaming-plugin/lib
git commit -m "feat(live): setLiveRoomPlatforms 整清单回写 + 值域校验 + shop platforms 透出"
```

---

### Task 3: vendure — shop detail 渠道过滤 platforms

**Files:**
- Modify: `packages/live-streaming-plugin/src/live-room-shop.service.ts`
- Sync: `lib/live-room-shop.service.js/.d.ts`

- [ ] **Step 3.1: detail() 改造**

```ts
    async detail(ctx: RequestContext, id: ID): Promise<LiveRoom> {
        const room = await this.connection
            .findOneInChannel(ctx, LiveRoom, id, ctx.channelId, { relations: ['products', 'platforms', 'platforms.channels'] })
            .then(r => r ?? undefined);
        if (!room) throw new UserInputError('Live room not found');
        room.platforms = (room.platforms ?? []).filter(p => (p.channels ?? []).some(c => c.id === ctx.channelId));
        room.viewCount += 1;
        await this.connection.getRepository(ctx, LiveRoom).save(room);
        return room;
    }
```

（`enterForRoom`、`list` 不动。）

- [ ] **Step 3.2: lib 同步 + 语法验证** 同前。

- [ ] **Step 3.3: Commit**

```bash
git add packages/live-streaming-plugin/src packages/live-streaming-plugin/lib
git commit -m "feat(live): shop liveRoom 返回本渠道 platforms"
```

---

### Task 4: vendure — 推送 + 服务器部署 + 建表确认

**Files:** 无新文件（部署操作）。

- [ ] **Step 4.1: 推送**

Run: `cd e:\zhao\vendure; git push`
Expected: push 成功（origin 为该仓库远程；若本地无 remote 与此前直播插件部署一致——先 `git remote -v` 确认，无远程则跳过 push，改走 scp 补丁方式，参照 `scripts/gs-live-deploy.sh` 先例不适用时用 `git bundle` / 直接 scp 变更文件列表到服务器对应路径）。

- [ ] **Step 4.2: 服务器前检（并发风险）**

Run: `ssh joho "pm2 ls"`
Expected: 确认 `vendure` 进程存在且 uptime 正常；若发现 strapi 被反复重启（restarts 异常增长/CPU 99%）或 vendure 被外部停止，**停下来问用户**再继续。

- [ ] **Step 4.3: 拉代码 + 重启**

复杂远程写脚本 `scripts/vendure-live-platforms-deploy.sh`（本地 game-server 仓库，scp 执行）：

```bash
#!/usr/bin/env bash
# 用法: ./vendure-live-platforms-deploy.sh   （vendure 仓库路径固定 /www/apps/vendure）
set -euo pipefail
cd /www/apps/vendure
git pull --ff-only
cd packages/dev-server
pm2 restart vendure --update-env
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3020/shop-api/ || true)
  [ "$code" = "200" ] || [ "$code" = "405" ] && { echo "vendure up ($code)"; exit 0; }
  sleep 3
done
echo "vendure not healthy in 90s"; exit 1
```

Run: `scp e:\zhao\game-server\scripts\vendure-live-platforms-deploy.sh joho:/tmp/; ssh joho "bash /tmp/vendure-live-platforms-deploy.sh"`
Expected: `vendure up`。

- [ ] **Step 4.4: 建表确认（synchronize 自动）**

Run: `ssh joho "docker exec 1Panel-postgresql-pIe0 psql -U postgres -d vendure -c '\\d \"live_room_platform\"' | head -20"`
Expected: 表存在，含 `platform`、`externalUrl` 列与 `live_room_platform_channels_channels` 关联表（若列名前缀不同以实际为准，关键是表存在）。

- [ ] **Step 4.5: Commit 部署脚本**

```bash
git add scripts/vendure-live-platforms-deploy.sh
git commit -m "chore(live): 平台分发部署脚本（vendure git pull + pm2 restart + 健康检查）"
```

---

### Task 5: 生产 GraphQL 冒烟（admin 回写 + shop 读取 + 负例）

**Files:**
- Create: `e:\zhao\game-server\scripts\live-platforms-verify.sh`

- [ ] **Step 5.1: 写冒烟脚本**（复用 vendure-live-verify.sh 的登录模式；密码参数化）

```bash
#!/usr/bin/env bash
# 用法: ./live-platforms-verify.sh <ADMIN_PASS>   —— 直播平台分发全链路冒烟
set -euo pipefail
PASS="${1:?usage: live-platforms-verify.sh <ADMIN_PASS>}"
BASE="https://e.joho.cn"
ROOM="${ROOM_ID:-1}"

gql() { # $1=api路径 $2=query $3=token(可空)
  curl -s -X POST "$BASE$1" -H 'Content-Type: application/json' \
    ${3:+-H "Authorization: Bearer $3"} -d "$2"
}

# 1. admin 登录
TOKEN=$(curl -s -D - -o /dev/null -X POST "$BASE/admin-api" -H 'Content-Type: application/json' \
  -d "{\"query\":\"mutation { login(username: \\\"superadmin\\\", password: \\\"$PASS\\\") { ... on CurrentUser { id } ... on ErrorResult { message } } }\"}" \
  | tr -d '\r' | grep -i '^vendure-auth-token:' | awk '{print $2}')
[ -n "$TOKEN" ] || { echo "FAIL: admin login"; exit 1; }
echo "OK: admin login"

Q() { python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get('data') or d.get('errors'), ensure_ascii=False))"; }

# 2. 整清单回写
gql "/admin-api" "{\"query\":\"mutation { setLiveRoomPlatforms(roomId: \\\"$ROOM\\\", platforms: [{platform: \\\"douyin\\\", externalUrl: \\\"https://live.douyin.com/12345\\\"}, {platform: \\\"wechat_channels\\\", externalUrl: \\\"wxchannels://finder=test_finder\\\"}]) { id platforms { platform externalUrl } } }\"}" "$TOKEN" | Q
echo "EXPECT: douyin + wechat_channels"

# 3. shop 读取（回显 count 也即 viewCount+1，不影响断言）
gql "/shop-api" "{\"query\":\"{ liveRoom(id: \\\"$ROOM\\\") { id status platforms { platform externalUrl } } }\"}" | Q
echo "EXPECT: platforms 同上（shop 可读）"

# 4. 负例：wechat_channels 格式错
gql "/admin-api" "{\"query\":\"mutation { setLiveRoomPlatforms(roomId: \\\"$ROOM\\\", platforms: [{platform: \\\"wechat_channels\\\", externalUrl: \\\"https://oops\\\"}]) { id } }\"}" "$TOKEN" | Q
echo "EXPECT: errors (wxchannels 格式校验拒绝)"

# 5. 负例：重复 platform
gql "/admin-api" "{\"query\":\"mutation { setLiveRoomPlatforms(roomId: \\\"$ROOM\\\", platforms: [{platform: \\\"douyin\\\", externalUrl: \\\"https://a\\\"},{platform: \\\"douyin\\\", externalUrl: \\\"https://b\\\"}]) { id } }\"}" "$TOKEN" | Q
echo "EXPECT: errors (Duplicate platform)"

# 6. 还原：清空本渠道平台配置
gql "/admin-api" "{\"query\":\"mutation { setLiveRoomPlatforms(roomId: \\\"$ROOM\\\", platforms: []) { id platforms { platform } } }\"}" "$TOKEN" | Q
echo "EXPECT: platforms []"
echo "SMOKE DONE"
```

- [ ] **Step 5.2: 执行**

Run: `scp e:\zhao\game-server\scripts\live-platforms-verify.sh joho:/tmp/; ssh joho "bash /tmp/live-platforms-verify.sh z123123"`
Expected: 五段输出全部符合 EXPECT 注释。

- [ ] **Step 5.3: Commit**（game-server 仓库）

```bash
git add scripts/live-platforms-verify.sh
git commit -m "test(live): 平台分发生产冒烟脚本（回写/读取/负例/还原）"
```

---

### Task 6: vshop — 前端双形态 + 平台按钮组 + 视频号引导

**Files:**
- Modify: `src/api/queries/live.ts`
- Modify: `src/pkg-promotion/pages/live-room.vue`
- Modify: `package.json`（hls.js）

- [ ] **Step 6.1: 安装 hls.js**

Run: `cd e:\zhao\vshop; npm i hls.js`
Expected: package.json dependencies 出现 hls.js。

- [ ] **Step 6.2: live API 加字段**

`src/api/queries/live.ts` `getLiveRoom` 查询串中 `products {...}` 行之后加：

```ts
            platforms { id platform externalUrl }
```

- [ ] **Step 6.3: live-room.vue 模板改造**

播放区（`<view class="player">` 内）整体替换为：

```html
    <!-- 形态一：自建流 -->
    <template v-if="canPlay">
      <!-- #ifdef H5 -->
      <video ref="videoRef" class="video" controls autoplay playsinline @error="h5PlayError = true"></video>
      <view v-if="h5PlayError" class="retry" @click="setupH5Player"><text>加载失败，点击重试</text></view>
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <video :id="'player-' + roomId" class="video" :src="playUrl" controls autoplay object-fit="contain" mode="live" />
      <!-- #endif -->
    </template>
    <!-- 形态二：降级导流 -->
    <view v-else class="no-live">
      <template v-if="platforms.length">
        <image v-if="room.coverUrl" class="no-live-cover" :src="room.coverUrl" mode="aspectFill" />
        <text v-if="firstPlatform" class="go-btn" @click="onPlatformTap(firstPlatform)">
          前往{{ platformLabel(firstPlatform.platform) }}观看
        </text>
      </template>
      <text v-else>{{ room.status === 'ended' ? '直播已结束' : '直播未开始' }}</text>
    </view>
    <!-- 平台 pill 按钮组（双形态共用，播放区底缘） -->
    <view v-if="platforms.length" class="pills">
      <text v-for="p in platforms" :key="p.platform" class="pill" :class="'p-' + p.platform" @click="onPlatformTap(p)">
        {{ platformLabel(p.platform) }}
      </text>
    </view>
```

原 `<view class="head">…</view>` 保留在 pills 之后。

页面根元素末尾（`</view>` 前）加视频号引导弹层：

```html
    <!-- 视频号引导弹层（H5） -->
    <view v-if="wxSheet" class="sheet-mask" @click="wxSheet = null">
      <view class="sheet" @click.stop>
        <view class="sheet-head"><text class="sheet-title">观看视频号直播</text><text class="sheet-x" @click="wxSheet = null">✕</text></view>
        <text class="sheet-name">@{{ wxSheet.finder }}</text>
        <view class="sheet-steps">
          <text>1. 点击下方复制视频号名</text>
          <text>2. 打开微信 → 搜一搜</text>
          <text>3. 进入视频号观看直播</text>
        </view>
        <view class="sheet-btn" @click="copyWxChannels"><text>复制视频号名</text></view>
      </view>
    </view>
```

- [ ] **Step 6.4: script 增量**

`<script setup>` 中加（`connectWs` 之前的位置即可）：

```ts
import { nextTick, watch } from 'vue';
// #ifdef H5
import type Hls from 'hls.js';
// #endif

const platforms = computed<any[]>(() => room.value?.platforms || []);
const firstPlatform = computed(() => platforms.value[0]);
const PLATFORM_LABELS: Record<string, string> = { douyin: '抖音', kuaishou: '快手', wechat_channels: '视频号' };
function platformLabel(p: string) { return PLATFORM_LABELS[p] || p; }

const wxSheet = ref<{ finder: string } | null>(null);
// #ifdef H5
const videoRef = ref<HTMLVideoElement | null>(null);
const h5PlayError = ref(false);
let hls: Hls | null = null;

async function setupH5Player() {
  h5PlayError.value = false;
  const v = videoRef.value;
  if (!v || !playUrl.value) return;
  if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = playUrl.value; return; }
  try {
    const mod = await import('hls.js');
    if (!mod.default.isSupported()) return;
    hls?.destroy();
    hls = new mod.default();
    hls.loadSource(playUrl.value);
    hls.attachMedia(v);
  } catch { h5PlayError.value = true; }
}
watch(canPlay, (v) => { if (v) nextTick(setupH5Player); });
// #endif

function isWeixinBrowser() {
  return /MicroMessenger/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');
}

function onPlatformTap(p: any) {
  if (p.platform === 'wechat_channels') { onWxChannelsTap(p); return; }
  // #ifdef H5
  if (isWeixinBrowser()) {
    uni.setClipboardData({ data: p.externalUrl, success: () => ui.showToast('链接已复制，请在浏览器打开', 'success') });
  } else {
    window.location.href = p.externalUrl;
  }
  // #endif
  // #ifndef H5
  uni.setClipboardData({ data: p.externalUrl, success: () => ui.showToast('链接已复制', 'success') });
  // #endif
}

function onWxChannelsTap(p: any) {
  const m = /^wxchannels:\/\/finder=([^&]+)(?:&feed=([^&]+))?/.exec(p.externalUrl || '');
  const finder = m ? decodeURIComponent(m[1]) : '';
  // #ifdef MP-WEIXIN
  if (finder && typeof wx !== 'undefined') {
    const open = (feedId?: string) => wx.openChannelsLive({ finderUserName: finder, feedId });
    if (m?.[2]) { open(decodeURIComponent(m[2])); return; }
    wx.getChannelsLiveInfo({ finderUserName: finder, success: (r: any) => open(r.feedId), fail: () => (wxSheet.value = { finder }) });
    return;
  }
  // #endif
  wxSheet.value = { finder: finder || p.externalUrl };
}

function copyWxChannels() {
  if (!wxSheet.value) return;
  uni.setClipboardData({ data: wxSheet.value.finder, success: () => ui.showToast('视频号名已复制', 'success') });
}
```

`onUnmounted` 回调内加 `// #ifdef H5` + `hls?.destroy(); hls = null;` + `// #endif`。

- [ ] **Step 6.5: style 增量**（`<style scoped>` 末尾追加）

```css
.pills { position: absolute; left: 0; right: 0; bottom: 88rpx; display: flex; gap: 12rpx; justify-content: center; z-index: 3; }
.pill { background: rgba(0,0,0,.55); color: #fff; border-radius: 999rpx; padding: 8rpx 24rpx; font-size: 24rpx; }
.pill.p-wechat_channels { background: #07c160; font-weight: 600; }
.no-live { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx; color: #fff; }
.no-live-cover { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .55; }
.go-btn { position: relative; background: #07c160; color: #fff; border-radius: 999rpx; padding: 14rpx 44rpx; font-size: 28rpx; font-weight: 600; z-index: 1; }
.retry { position: absolute; left: 0; right: 0; bottom: 140rpx; text-align: center; color: #fff; font-size: 26rpx; z-index: 3; }
.sheet-mask { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 99; display: flex; align-items: flex-end; }
.sheet { width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 32rpx; }
.sheet-head { display: flex; justify-content: space-between; align-items: center; }
.sheet-title { font-size: 30rpx; font-weight: 700; }
.sheet-x { color: #999; font-size: 28rpx; }
.sheet-name { display: block; margin: 24rpx 0 8rpx; font-size: 40rpx; font-weight: 700; color: #07c160; }
.sheet-steps { display: flex; flex-direction: column; gap: 8rpx; margin: 16rpx 0 24rpx; }
.sheet-steps text { color: #666; font-size: 26rpx; }
.sheet-btn { background: #07c160; color: #fff; text-align: center; border-radius: 12rpx; padding: 20rpx 0; font-size: 28rpx; font-weight: 700; }
```

- [ ] **Step 6.6: 本地构建验证**

Run: `cd e:\zhao\vshop; npm run build:h5`
Expected: 构建成功，产物含 hls 异步 chunk（`dist/build/h5/assets/` 下出现 `hls*.js`）。

- [ ] **Step 6.7: Commit**

```bash
git add src/api/queries/live.ts src/pkg-promotion/pages/live-room.vue package.json package-lock.json
git commit -m "feat(live): 直播间双形态+平台按钮组+视频号引导弹层（H5/小程序条件编译）"
```

---

### Task 7: H5 构建部署 + 产物入库

- [ ] **Step 7.1: 打包**

Run: `cd e:\zhao\vshop; npm run build:h5; tar -C dist/build/h5 -czf ..\live-h5-platforms.tgz .`

- [ ] **Step 7.2: 部署（先备份）**

```bash
scp e:\zhao\vshop\live-h5-platforms.tgz joho:/tmp/
ssh joho "ts=$(date +%s); sudo cp -r /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index.bak_$ts; sudo rm -rf /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index/assets; sudo tar -xzf /tmp/live-h5-platforms.tgz -C /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index; sudo chmod -R a+rX /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index"
```
Expected: 无报错。

- [ ] **Step 7.3: 公网验证**

Run: `curl -s -o NUL -w "%{http_code}" https://e.joho.cn/`（PowerShell 下 `-o NUL`）与 `curl -s https://e.joho.cn/ | Select-String -Pattern "live-room|hls"`
Expected: index 200；引用 chunk 正常。

- [ ] **Step 7.4: dist 入库 + Commit**（vshop dist 有入库惯例）

```bash
git add dist/build/h5
git commit -m "chore(live): H5 构建产物入库（双形态+平台按钮组）"
```

---

### Task 8: 手机截图验证 + 验收手册

**Files:**
- Create: `docs/verify/_shot_live_platforms.py`
- Create: `docs/verify/2026-10-live-platforms.md`

- [ ] **Step 8.1: 数据准备（生产）**

用 Task 5 脚本模式手工置数据（不再还原）：
- 房间1（status=live）回写 `[{douyin, https://live.douyin.com/12345}, {wechat_channels, wxchannels://finder=joho_test}]` → 形态一 + pill 行
- 若需要纯形态二：另建 scheduled 房间回写平台（stop 现有房间会破坏现网演示，优先新建 scheduled 房间）

- [ ] **Step 8.2: 写截图脚本**（复用 `_shot_live_room.py` 的双上下文/视口/截图模式，断言改为）：

```python
# 断言清单（390x844 dpr=2）：
# ① 形态一房间：.pill 行含「抖音」「视频号」文本
# ② 点击「视频号」pill → .sheet-mask 弹层出现，含 @joho_test 与「复制视频号名」
# ③ 点击复制 → uni-toast 出现「视频号名已复制」
# ④ 形态二房间（scheduled+platforms）：.no-live-cover 海报 + .go-btn「前往抖音观看」
# ⑤ 形态二房间无 platforms：显示「直播未开始」（回归原逻辑）
# 截图 6 张：mode1-pills / wx-sheet / wx-copy-toast / mode2-cover-gobtn / mode2-empty / 形态一播放区（含 hls 失败重试文案）
```

（脚本骨架与 `_shot_live_room.py` 完全一致：admin token 不需要——shop-api 游客可读；用 `page.goto("https://e.joho.cn/#/pkg-promotion/pages/live-room?id=<ID>")` + `wait_for_selector`。）

- [ ] **Step 8.3: 执行截图**

Run: `cd e:\zhao\vshop; python docs/verify/_shot_live_platforms.py`
Expected: 6 张 PNG 生成，断言全 PASS；目检 pill、弹层、海报布局。

- [ ] **Step 8.4: 验收手册** `docs/verify/2026-10-live-platforms.md`：记录双形态判定逻辑、平台值域与 `wxchannels://` URI 约定、冒烟结果（Task 5 五段）、截图清单、遗留项（腾讯云真实拉流、小程序真机 openChannelsLive 验证、防盗链未启用）。

- [ ] **Step 8.5: Commit**

```bash
git add docs/verify/_shot_live_platforms.py docs/verify/2026-10-live-platforms.md
git commit -m "test(live): 平台分发手机截图取证 + 验收手册"
git push
```

---

### Task 9: 收尾 — 记忆 + 汇报

- [ ] **Step 9.1: project_memory.md 追加**：平台分发模型（LiveRoomPlatform + 渠道过滤）、`wxchannels://finder=` URI 约定、`setLiveRoomPlatforms` 整清单回写语义、lib 手工同步与 postgres synchronize 自动建表确认。
- [ ] **Step 9.2: 清理**临时文件（`/tmp/live-h5-platforms.tgz`、`/tmp/*.sh`）。
- [ ] **Step 9.3: 汇报**：变更清单、验证结果、遗留项（用户侧开通腾讯云直播 + CNAME；视频号小程序真机验证）。

---

## Self-Review 记录

1. **Spec 覆盖**：双形态（Task 6 模板 canPlay 分支）✓；数据模型（Task 1）✓；API admin/shop（Task 2/3）✓；前端三分支点击行为含小程序条件编译（Task 6 Step 6.4）✓；腾讯云运维侧零代码（Task 9 汇报遗留项）✓；测试——spec 6.1「vendure 单测」因本地无依赖/插件无测试基建，落地方式调整为生产 GraphQL 冒烟（Task 5，含值域/重复/格式负例），已在 Task 8.4 手册注明 ✓；YAGNI 排除项未引入 ✓。
2. **占位符扫描**：Task 8.2 断言以清单+骨架指引呈现（复用既有脚本模式），非 TBD；无其他占位。
3. **类型一致性**：`setPlatforms(ctx, roomId, inputs)` 签名在 resolver/service/lib 一致；`wxchannels://finder=` 正则 Task 2（校验）与 Task 6（解析）使用同一格式；`platforms { id platform externalUrl }` schema（Task 2）与前端查询（Task 6.2）字段名一致。
