# P7 DIY 设计器体验升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 设计器升级为「直觉流默认 + 专业模式一键切换」双层体验：点卡即上珠、珠子拖拽换位/拖出删除、画布全貌自适应缩放、结位与配饰（吊坠/流苏）挂位渲染与拖拽、分类选料面板、独立引导页；服务端零改动。

**Architecture:** 全部改动在 vshop `src/pkg-diy` 前端分包。直觉流复用既有内部 mode `'free'`（不改 `DesignerMode` 联合类型与服务端 calc-bridge 契约）；`BeadRing.vue` 重写为内部自适应缩放 + canvas touch 交互（命中/ghost/删除态）+ 结位/配饰层；`useDesigner.ts` 扩展 decors 挂位与操作 API；`MaterialSheet.vue` 升级分类侧栏+搜索+角标+长按详情；新增 `guide.vue` 与 `utils/recommend.ts`。

**Tech Stack:** uni-app (Vue3 setup) + canvas 2d + vue-i18n 五语言（zh-CN/en/zh-TW/ja/ko）+ 既有 vendor @diy/calc 纯函数。

**Spec:** `docs/superpowers/specs/2026-10-12-diy-designer-ux-upgrade-design.md`（git 历史 18ea3bb，工作区已删；偏离记录：① 直觉流=内部 mode `'free'` 改 UI 文案，不新增枚举值；② 选料「珠子/配饰双 tab」降级为「分类侧栏（后台 diyCategories 动态数据）」，避免前端硬编码 shape 判定；③ decor 挂位 `slot` 为纯前端展示状态，不落后端新字段）

**约定：**
- 工作目录 `D:\zhao\vshop`；包管理 pnpm；PowerShell 环境（命令用 `;` 分隔，不用 `&&`）。
- 每 Task 结束 `git add <文件>; git commit -m "<message>"`。
- 验证命令统一：`pnpm build:h5`（全量，约 1-3 分钟）；局部验证用 `npx vue-tsc --noEmit`（若项目未配 vue-tsc 则跳过，以 build:h5 成功为准）。
- 提交身份：`git config user.name johocn; git config user.email johocn@163.com`（新克隆时）。

---

### Task 1: i18n 五语言新增词条（全量，后续任务直接引用）

**Files:**
- Modify: `src/i18n/locales/zh-CN.json`、`en.json`、`zh-TW.json`、`ja.json`、`ko.json`（在 `"diy"` 对象内追加）

- [ ] **Step 1: 在 zh-CN.json 的 diy 对象内追加以下键**（若 `diy.mode.free` 已存在则仅改值）

```json
"mode": { "free": "直觉流", "byWrist": "定手围", "byCount": "定颗数", "pattern": "混搭" },
"helpShort": "帮助",
"action": { "clear": "清空", "draft": "暂存", "recommend": "推荐", "finish": "完成设计" },
"emptyHint": "点击下方素材开始串珠",
"confirmClear": "确认清空当前设计？",
"cleared": "已清空",
"draftSaved": "已暂存，下次进入可恢复",
"draftRestored": "已恢复上次草稿",
"recommendDone": "已生成推荐搭配，可继续调整",
"knot": { "show": "显示结位", "hide": "隐藏结位", "label": "打结处" },
"decorRemoveQ": "移除该配饰？",
"searchPlaceholder": "搜索素材",
"catAll": "全部",
"longPressHint": "长按查看素材详情",
"detail": { "title": "素材详情", "spec": "规格", "price": "单价", "pick": "选它" },
"guide": {
  "title": "串珠指南",
  "start": "开始设计",
  "s1t": "三步上手", "s1": "① 点击下方素材卡，珠子立即串上；② 拖动珠子换位置，拖出圆环即删除；③ 点「完成设计」保存并报价。",
  "s2t": "直觉流与专业模式", "s2": "默认直觉流：想串就点。切上方标签可用专业模式——定手围：给礼物量手围自动算颗数；定颗数：照样子手动加减；混搭：多种珠子排布组合。",
  "s3t": "手围怎么量", "s3": "四指并拢最宽处用软尺绕一圈（不含拇指）；或拿现有合适的手串量内圈直径，对照换算。",
  "s4t": "松紧度怎么看", "s4": "画布上方实时显示状态：过短/偏短/合适/偏长/过长。「贴合」「舒适」「宽松」三档松紧对应不同余量，默认舒适。",
  "s5t": "不同直径混搭", "s5": "6颗7mm+6颗8mm+6颗9mm 没问题：系统逐颗求和自动收敛出内孔周长与松紧度，混得越准越见功力。",
  "s6t": "打结与配饰", "s6": "弹力线打结处固定在顶部结位（可隐藏），配线已含打结余量。吊坠/流苏是可选项：不选完全不影响，选了会显示在手串上并可拖动；金属隔珠按珠计价、参与松紧计算。",
  "s7t": "常见问题", "s7": "价格为何变动？——每次调整都会实时重算。作品在哪？——「我的作品」里找。想复刻别人的？——广场点「用这个方案」。"
}
```

- [ ] **Step 2: 其余四个语言文件追加同结构键**，值如下：

en.json：
```json
"mode": { "free": "Intuitive", "byWrist": "By Wrist", "byCount": "By Count", "pattern": "Mix & Match" },
"helpShort": "Help",
"action": { "clear": "Clear", "draft": "Save Draft", "recommend": "Surprise Me", "finish": "Finish Design" },
"emptyHint": "Tap a material below to start",
"confirmClear": "Clear the current design?",
"cleared": "Cleared",
"draftSaved": "Draft saved, restored next visit",
"draftRestored": "Last draft restored",
"recommendDone": "Recommendation ready, keep tweaking",
"knot": { "show": "Show knot", "hide": "Hide knot", "label": "Knot" },
"decorRemoveQ": "Remove this charm?",
"searchPlaceholder": "Search materials",
"catAll": "All",
"longPressHint": "Long-press for details",
"detail": { "title": "Material Detail", "spec": "Spec", "price": "Price", "pick": "Use it" },
"guide": {
  "title": "Beading Guide", "start": "Start Designing",
  "s1t": "Three Steps", "s1": "1. Tap a material card to add a bead; 2. Drag beads to reorder, drag out of the ring to delete; 3. Tap Finish Design to save and get a quote.",
  "s2t": "Intuitive vs Pro Modes", "s2": "Intuitive by default. Switch tags for pro modes: By Wrist auto-counts beads; By Count adjusts manually; Mix & Match arranges multiple beads.",
  "s3t": "Measuring Wrist", "s3": "Wrap a tape around the widest part of your four knuckles; or measure the inner diameter of a bracelet that fits.",
  "s4t": "Fit Feedback", "s4": "The capsule above shows live status: too tight / snug / fit / loose / too loose. Three ease levels with Comfortable as default.",
  "s5t": "Mixed Diameters", "s5": "6x7mm + 6x8mm + 6x9mm is fine: beads are summed one by one to converge the inner circumference and fit.",
  "s6t": "Knot & Charms", "s6": "The elastic knot sits at the top knot marker (hideable); cord includes knot allowance. Pendants/tassels are optional—skip freely; if added they render and drag on the bracelet. Metal spacers count as beads.",
  "s7t": "FAQ", "s7": "Price changes with every tweak. Find works under My Designs. Tap Use This Design in the gallery to replicate."
}
```

zh-TW.json：mode `"直覺流"/"定手圍"/"定顆數"/"混搭"`；helpShort `"幫助"`；action `"清空"/"暫存"/"推薦"/"完成設計"`；emptyHint `"點擊下方素材開始串珠"`；confirmClear `"確認清空當前設計？"`；cleared `"已清空"`；draftSaved `"已暫存，下次進入可恢復"`；draftRestored `"已恢復上次草稿"`；recommendDone `"已生成推薦搭配，可繼續調整"`；knot `"顯示結位"/"隱藏結位"/"打結處"`；decorRemoveQ `"移除該配飾？"`；searchPlaceholder `"搜尋素材"`；catAll `"全部"`；longPressHint `"長按查看素材詳情"`；detail `"素材詳情"/"規格"/"單價"/"選它"`；guide 標題 `"串珠指南"`、按鈕 `"開始設計"`，s1-s7 與 zh-CN 同文改繁體（s1 `"① 點擊下方素材卡，珠子立即串上；② 拖動珠子換位置，拖出圓環即刪除；③ 點「完成設計」保存並報價。"`，s2 `"預設直覺流：想串就點。切上方標籤可用專業模式——定手圍：給禮物量手圍自動算顆數；定顆數：照樣子手動加減；混搭：多種珠子排布組合。"`，s3 `"四指併攏最寬處用軟尺繞一圈（不含拇指）；或拿現合適的手串量內圈直徑對照換算。"`，s4 `"畫布上方即時顯示狀態：過短/偏短/合適/偏長/過長。「貼合」「舒適」「寬鬆」三檔鬆緊對應不同餘量，預設舒適。"`，s5 `"6顆7mm+6顆8mm+6顆9mm 沒問題：系統逐顆求和自動收斂出內孔周長與鬆緊度，混得越準越見功力。"`，s6 `"彈力線打結處固定在頂部結位（可隱藏），配線已含打結餘量。吊墜/流蘇是可選項：不選完全不影響，選了會顯示在手串上並可拖動；金屬隔珠按珠計價、參與鬆緊計算。"`，s7 `"價格為何變動？——每次調整都會即時重算。作品在哪？——「我的作品」裡找。想復刻別人的？——廣場點「用這個方案」。"`）

ja.json：mode `"直感フロー"/"手首サイズ指定"/"玉数指定"/"ミックス"`；helpShort `"ヘルプ"`；action `"クリア"/"下書き保存"/"おまかせ"/"デザイン完成"`；emptyHint `"下の素材をタップして開始"`；confirmClear `"現在のデザインをクリアしますか？"`；cleared `"クリアしました"`；draftSaved `"下書き保存しました"`；draftRestored `"前回の下書きを復元しました"`；recommendDone `"おすすめコーデを生成しました"`；knot `"結び目を表示"/"結び目を隠す"/"結び目"`；decorRemoveQ `"このチャームを削除しますか？"`；searchPlaceholder `"素材を検索"`；catAll `"すべて"`；longPressHint `"長押しで詳細"`；detail `"素材詳細"/"規格"/"単価"/"使う"`；guide `"ビーズガイド"/"デザインを始める"`、s1 `"① 下の素材カードをタップすると玉が連なる；② 玉をドラッグで並べ替え、輪の外へ出すと削除；③「デザイン完成」で保存・見積り。"`、s2 `"初期は直感フロー。上のタグでプロモード切替——手首サイズ指定は自動で玉数計算、玉数指定は手動調整、ミックスは複数素材の配置。"`、s3 `"拳の最も幅広い部分を柔らかい尺で一周測定。または合うブレスレットの内径を測って換算。"`、s4 `"上部にリアルタイム表示：きつい/ややきつい/ちょうど/ややゆるい/ゆるい。3段階のゆとり、初期は「ちょうど」。"`、s5 `"7mm×6+8mm×6+9mm×6 もOK：一玉ずつ合計して内周とフィット感を自動収束。"`、s6 `"伸縮コードの結び目は上部のマーカーに固定（非表示可）、コード長に結びしろを含む。チャーム/タッセルは任意：選ばなくても全機能利用可。金属スペーサーは玉として計上。"`、s7 `"価格は調整のたびに再計算。作品は「マイデザイン」へ。ギャラリーの「このデザインを使う」で複製。"`

ko.json：mode `"직관 플로우"/"손목 사이즈"/"개수 지정"/"믹스"`；helpShort `"도움말"`；action `"지우기"/"임시 저장"/"추천"/"디자인 완성"`；emptyHint `"아래 소재를 탭해 시작"`；confirmClear `"현재 디자인을 지울까요?"`；cleared `"지웠습니다"`；draftSaved `"임시 저장했습니다"`；draftRestored `"이전 임시본을 복원했습니다"`；recommendDone `"추천 조합을 생성했습니다"`；knot `"매듭 표시"/"매듭 숨기기"/"매듭"`；decorRemoveQ `"이 장식을 삭제할까요?"`；searchPlaceholder `"소재 검색"`；catAll `"전체"`；longPressHint `"길게 눌러 상세 보기"`；detail `"소재 상세"/"규격"/"단가"/"사용"`；guide `"비즈 가이드"/"디자인 시작"`、s1 `"① 아래 소재 카드를 탭하면 구슬이 연결됩니다；② 구슬을 드래그해 순서 변경, 링 밖으로 끌면 삭제；③ '디자인 완성'으로 저장·견적. "`、s2 `"기본은 직관 플로우. 위 태그로 전문 모드 전환—손목 사이즈는 자동 개수 계산, 개수 지정은 수동 조절, 믹스는 여러 소재 배치."`、s3 `"四个손가락을 모은 가장 넓은 부분을 줄자로 측정하거나, 맞는 팔찌의 안지름을 재세요."`、s4 `"상단에 실시간 표시: 너무 타이트/타이트/적당/헐거움/너무 헐거움. 3단 여유, 기본 '적당'."`、s5 `"7mm×6+8mm×6+9mm×6 OK: 한 알씩 합산해 안둘레와 핏을 자동 수렴합니다."`、s6 `"고무줄 매듭은 상단 마커 고정(숨기기 가능), 줄 길이에 매듭 여유 포함. 펜던트/태슬은 선택 사항이며 자유롭게 건너뛸 수 있습니다. 금속 스페이서는 구슬로 계산."`、s7 `"가격은 조정마다 재계산. 작품은 '내 디자인'에서. 갤러리의 '이 디자인 사용'으로 복제."`

- [ ] **Step 3: 校验 JSON 合法性**

Run: `node -e "['zh-CN','en','zh-TW','ja','ko'].forEach(l=>{JSON.parse(require('fs').readFileSync('src/i18n/locales/'+l+'.json','utf8'));console.log(l+' ok')})"`
Expected: 5 行 `ok`

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales; git commit -m "feat(pkg-diy): P7 五语言新增设计器升级词条"
```

---

### Task 2: useDesigner — 直觉流默认 + 模式反推 + decors 挂位 + 草稿/推荐/清空 API

**Files:**
- Modify: `src/pkg-diy/composables/useDesigner.ts`

- [ ] **Step 1: 类型与状态扩展**

`DesignerMode` 不变（free 即直觉流）。新增接口与状态：

```ts
/** 配饰挂位（纯前端展示状态；保存时按 materialId 聚合回 slotList decor 槽位） */
export interface DecorPlacement {
    /** 实例 id：`${materialId}#${n}`（同素材多件可区分） */
    decorId: string;
    materialId: string;
    /** 间隙索引（第 k 与 k+1 颗珠之间，k 从 0 起）；-1 = 结位（流苏） */
    slot: number;
}
```

在 useDesigner 返回对象内新增状态（`sequence` 声明后）：

```ts
const decors = ref<DecorPlacement[]>([]);
const knotVisible = ref(true);
let decorSeq = 0;
```

`mode` 默认值改为直觉流：`const mode = ref<DesignerMode>('free');`

- [ ] **Step 2: setMode 反推（不再清空序列数据）**

替换现有 `setMode`：

```ts
/** 序列 → 槽位（按 materialId 聚合，qtyOverride=颗数；decor 不在序列中无涉及） */
function slotsFromSequence(seq: string[]): DiySpecSlot[] {
    const counts = new Map<string, number>();
    for (const id of seq) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()].map(([materialId, n]) =>
        ({ role: 'main', materialId, qtyOverride: n }) as DiySpecSlot,
    );
}

/** 切模式：直觉流 → 专业模式时由当前序列反推槽位（颗数带入，byWrist 作收敛权重、byCount 直接命中校验） */
function setMode(m: DesignerMode) {
    if (mode.value === 'free' && m !== 'free' && sequence.value.length >= 2) {
        slots.value = slotsFromSequence(sequence.value);
    }
    if (m === 'pattern' && arrange.value === 'random') {
        patternSeed.value = Date.now() % 2147483647;
    }
    mode.value = m;
}
```

- [ ] **Step 3: 新增操作 API（return 对象中一并导出）**

```ts
/** 直觉流：拖拽换位（from → to，splice 语义） */
function moveBead(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= sequence.value.length || to >= sequence.value.length) return;
    const next = [...sequence.value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    sequence.value = next;
}

/** 加配饰：吊坠默认挂序列中点间隙；流苏（attrs.decor === 'tassel'）默认挂结位（-1）。空序列记 0 待吸附 */
function addDecor(materialId: string) {
    const row = materialsById.value.get(materialId);
    const kind = (row?.attrs as any)?.decor === 'tassel' ? -1
        : (sequence.value.length >= 2 ? Math.floor(sequence.value.length / 2) - 1 : 0);
    decorSeq += 1;
    decors.value = [...decors.value, { decorId: `${materialId}#${decorSeq}`, materialId, slot: kind }];
}
function moveDecor(decorId: string, slot: number) {
    decors.value = decors.value.map(d0 => (d0.decorId === decorId ? { ...d0, slot } : d0));
}
function removeDecor(decorId: string) {
    decors.value = decors.value.filter(d0 => d0.decorId !== decorId);
}

/** 清空全部（确认由 UI 层做） */
function clearAll() {
    sequence.value = [];
    decors.value = [];
    slots.value = [{ role: 'main' }];
    patternSeed.value = Date.now() % 2147483647;
    mode.value = 'free';
}

/** 一键推荐：seeded 序列填充（直觉流） */
function applyRecommend(seq: string[]) {
    sequence.value = [...seq];
    mode.value = 'free';
}
```

- [ ] **Step 4: buildSpec 中 decors 聚合回 decor 槽位**

在 `buildSpec()` 内，`if (filled.length)` 之前插入：

```ts
        // 配饰挂位 → slotList decor 槽位（按 materialId 聚合 qty；slot 为前端展示状态不落库）
        const decorAgg = new Map<string, number>();
        for (const d0 of decors.value) decorAgg.set(d0.materialId, (decorAgg.get(d0.materialId) ?? 0) + 1);
        for (const [materialId, qty] of decorAgg) {
            if (!filled.some(s => s.role === 'decor' && s.materialId === materialId)) {
                filled.push({ role: 'decor', materialId, qtyOverride: qty } as DiySpecSlot);
            }
        }
```

并把 return 增补为（在既有 return 列表中加）：

```ts
        decors, knotVisible,
        moveBead, addDecor, moveDecor, removeDecor, clearAll, applyRecommend,
```

- [ ] **Step 5: 草稿暂存/恢复（页面级，放在同文件导出两个工具函数）**

```ts
const DRAFT_KEY = 'diy_designer_draft';

/** 暂存直觉流草稿（sequence/decors/参数） */
function saveDraft(): void {
    uni.setStorageSync(DRAFT_KEY, JSON.stringify({
        sequence: sequence.value, decors: decors.value,
        wristSize: wristSize.value, fit: fit.value, gap: gap.value,
    }));
}

/** 恢复草稿：有内容返回 true（UI 提示「已恢复上次草稿」） */
function loadDraft(): boolean {
    try {
        const raw = uni.getStorageSync(DRAFT_KEY);
        if (!raw) return false;
        const dft = JSON.parse(raw) as {
            sequence?: string[]; decors?: DecorPlacement[];
            wristSize?: number; fit?: DesignerFit; gap?: number;
        };
        if (!dft.sequence?.length) return false;
        sequence.value = dft.sequence;
        decors.value = (dft.decors ?? []).filter(x => x && x.decorId && x.materialId);
        if (dft.wristSize) wristSize.value = dft.wristSize;
        if (dft.fit) fit.value = dft.fit;
        if (dft.gap != null) gap.value = dft.gap;
        return true;
    } catch {
        return false;
    }
}
```

导出 `saveDraft, loadDraft`。

- [ ] **Step 6: 验证 + Commit**

Run: `npx vue-tsc --noEmit`（未配置则跳过）；`pnpm build:h5` 应成功（此时 UI 未接线不影响构建）。

```bash
git add src/pkg-diy/composables/useDesigner.ts; git commit -m "feat(pkg-diy): 直觉流默认+模式反推+decors挂位+草稿/推荐API"
```

---

### Task 3: utils/recommend.ts — seeded 一键推荐

**Files:**
- Create: `src/pkg-diy/utils/recommend.ts`

- [ ] **Step 1: 写实现**

```ts
/**
 * 一键推荐（seeded 可复现）：按目标手围+松紧余量生成直觉流序列。
 * 规则：从素材列表前 3 个圆珠里随机选主珠，其余珠里随机选点缀珠；
 * 每 4 颗插 1 颗点缀珠；颗数 = floor((手围+松量) / 单珠占位)。
 */
import { mulberry32 } from '../vendor/diy-calc/prng';
import type { DiyMaterialRow } from '../composables/useDesigner';

export function recommendSequence(
    materials: DiyMaterialRow[],
    wristMm: number,
    easeMm: number,
    seed: number,
): string[] {
    const rng = mulberry32(seed);
    const beads = materials.filter(m => (m.diameter ?? 8) >= 4);
    if (!beads.length) return [];
    const main = beads[Math.floor(rng() * Math.min(3, beads.length))];
    const others = beads.filter(m => m.id !== main.id);
    const accent = others.length ? others[Math.floor(rng() * others.length)] : null;
    const perBead = (main.diameter ?? 8) + (accent ? (accent.diameter ?? 4) : 0) / 4 + 1;
    const n = Math.max(6, Math.min(40, Math.floor((wristMm + easeMm) / perBead)));
    const seq: string[] = [];
    for (let i = 0; i < n; i++) seq.push(i % 4 === 3 && accent ? accent.id : main.id);
    return seq;
}
```

- [ ] **Step 2: 快速断言（node 内联，验证确定性）**

Run:
```
node -e "const {mulberry32}=require('crypto');console.log('skip-node-ts')"
```
说明：TS 文件不便 node 直跑，确定性由 Task 10 构建 + 页面操作验证（同 seed 同结果）。

- [ ] **Step 3: Commit**

```bash
git add src/pkg-diy/utils/recommend.ts; git commit -m "feat(pkg-diy): seeded 一键推荐序列生成"
```

---

### Task 4: BeadRing v2 — 全貌自适应缩放（修复「只能看见一部分」）

**Files:**
- Modify: `src/pkg-diy/components/BeadRing.vue`（重写 render 与 props）
- Modify: `src/pkg-diy/pages/designer.vue`（删 `ringMmPerPx` 传参）

- [ ] **Step 1: BeadRing props 改造**

删除 `mmPerPx` prop（含 withDefaults）；保留 `canvasId/width/height/beads`。`BeadRingBead` 不变。

```ts
const props = defineProps<{
    canvasId: string;
    width: number;
    height: number;
    beads: BeadRingBead[];
}>();
```

- [ ] **Step 2: render() 重写为全貌自适应**

替换整个 `render()`：

```ts
/** 全貌自适应缩放：中心线半径由逐颗周长收敛，scale 保证整环+装饰外伸完整可见（spec §4.3） */
function render() {
    if (!ctx) return;
    const w = cssW.value;
    const h = cssH.value;
    ctx.clearRect(0, 0, w, h);
    const beads = props.beads || [];
    if (beads.length === 0) return;
    const gapMm = 1;
    const radiiMm = beads.map(b => Math.max(0.5, b.diameterMm) / 2);
    const maxR = Math.max(...radiiMm);
    // 珠心轨迹半径（mm）：Σ(珠径+间隙) / 2π，下限防 1-2 颗时退化
    const centerR = Math.max(maxR + 4, (beads.length * (maxR * 2 + gapMm)) / (Math.PI * 2));
    const pad = 6;
    const scale = Math.min(6, Math.max(0.3, Math.min((w / 2 - pad) / (centerR + maxR), (h / 2 - pad) / (centerR + maxR))));
    const ringR = centerR * scale;
    const rs: RenderBead[] = beads.map((b, i) => ({
        x: 0, y: 0,
        r: Math.max(1, radiiMm[i] * scale),
        color: b.color,
        preset: b.preset ?? null,
        sprite: (b.renderUrl && spriteMap.value.get(b.renderUrl)) || null,
        seed: hashSeed(b.materialId || b.color),
    }));
    drawRing(ctx, rs, w / 2, h / 2, ringR, ringR);
}
```

- [ ] **Step 3: designer.vue 删除旧缩放逻辑**

删除 `ringMmPerPx` computed（201-209 行区域）与模板中 `:mm-per-px="ringMmPerPx"`，`<BeadRing canvas-id="designerRing" :width="690" :height="620" :beads="d.previewBeads.value" />`（高度 420→620rpx 提升全貌视野）。

- [ ] **Step 4: 验证全貌（三极限 case 手动口径推演 + 构建）**

Run: `pnpm build:h5` 成功。
口径自验（写进提交说明）：20×12mm → centerR≈39.7mm，scale=min(173.5/51.7, 203/51.7)≈3.35（390px 宽屏 cssW≈359）；28 颗混径 → centerR≈47mm 仍完整；1 颗 → centerR=maxR+4 不裁切。

- [ ] **Step 5: Commit**

```bash
git add src/pkg-diy/components/BeadRing.vue src/pkg-diy/pages/designer.vue; git commit -m "fix(pkg-diy): BeadRing 全貌自适应缩放，任意颗数/混径整环完整可见"
```

---

### Task 5: BeadRing v2 — 珠子拖拽换位 / 拖出删除 / 点选

**Files:**
- Modify: `src/pkg-diy/components/BeadRing.vue`
- Modify: `src/pkg-diy/pages/designer.vue`

- [ ] **Step 1: 组件新增拖拽状态与事件**

`<canvas>` 模板加事件：`@touchstart="onTouchStart" @touchmove.stop.prevent="onTouchMove" @touchend="onTouchEnd" @touchcancel="onTouchEnd"`。

script 新增（`render()` 之后）：

```ts
const emit = defineEmits<{
    (e: 'bead-tap', index: number): void;
    (e: 'bead-move', from: number, to: number): void;
    (e: 'bead-remove', index: number): void;
}>();

/** 拖拽运行时：ghost 跟手；phase=delete 时画红圈吸附态 */
interface DragState { index: number; x: number; y: number; phase: 'move' | 'delete'; overRing: boolean }
let drag: DragState | null = null;
let startX = 0, startY = 0, moved = false;
/** 命中结果缓存（几何参数 render 与 touch 共享） */
let geo = { cx: 0, cy: 0, ringR: 0, scale: 1, radii: [] as number[], n: 0 };

function hitBead(x: number, y: number): number {
    // 极坐标最近珠：角距最近且半径差 < 珠半径*1.6
    const dx = x - geo.cx, dy = y - geo.cy;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const ang = Math.atan2(dy, dx);
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < geo.n; i++) {
        const a = -Math.PI / 2 + (Math.PI * 2 * i) / geo.n;
        let d = Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        d = Math.PI - d; // 0=同角
        const radial = Math.abs(dist - geo.ringR);
        const score = d * geo.ringR + radial;
        if (score < bestScore) { bestScore = score; best = i; }
    }
    const r = geo.radii[best] ?? 6;
    return Math.hypot(dx - geo.ringR * Math.cos(ang), dy - geo.ringR * Math.sin(ang)) <= r * 1.6 ? best : -1;
}

/** 落点插入间隙：角度最近两珠之间 → 目标 index（splice 语义） */
function insertIndexAt(x: number, y: number): number {
    const ang = Math.atan2(y - geo.cy, x - geo.cx);
    const a0 = -Math.PI / 2;
    const rel = ((ang - a0) / (Math.PI * 2) * geo.n + geo.n) % geo.n;
    return Math.round(rel) % geo.n;
}

function toLocal(e: any): { x: number; y: number } | null {
    const t = e.touches?.[0] ?? e.changedTouches?.[0];
    if (!t) return null;
    // canvas 页面内偏移：用 boundingRect（H5）；mp 端 offset 兜底 0
    // #ifdef H5
    const el = document.getElementById(props.canvasId);
    const rect = el?.getBoundingClientRect();
    if (rect) return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    // #endif
    return { x: (t.x ?? 0) as number, y: (t.y ?? 0) as number };
}

function onTouchStart(e: any) {
    const p = toLocal(e);
    if (!p || !props.beads.length) return;
    startX = p.x; startY = p.y; moved = false;
    const i = hitBead(p.x, p.y);
    if (i >= 0) drag = { index: i, x: p.x, y: p.y, phase: 'move', overRing: true };
}
function onTouchMove(e: any) {
    if (!drag) return;
    const p = toLocal(e);
    if (!p) return;
    if (!moved && Math.hypot(p.x - startX, p.y - startY) < 6) return;
    moved = true;
    drag.x = p.x; drag.y = p.y;
    drag.overRing = Math.hypot(p.x - geo.cx, p.y - geo.cy) <= geo.ringR * 1.6;
    drag.phase = drag.overRing ? 'move' : 'delete';
    render();
}
function onTouchEnd() {
    if (drag && moved) {
        if (drag.phase === 'delete') emit('bead-remove', drag.index);
        else {
            const to = insertIndexAt(drag.x, drag.y);
            emit('bead-move', drag.index, to);
        }
    } else if (drag) {
        emit('bead-tap', drag.index);
    }
    drag = null; moved = false;
    render();
}
```

- [ ] **Step 2: render() 融合拖拽视觉**

`render()` 中 `drawRing(...)` 前把 `geo` 更新为当前几何；drawRing 后追加 ghost 绘制：

```ts
    geo = { cx: w / 2, cy: h / 2, ringR, scale, radii: radiiMm, n: beads.length };
    drawRing(ctx, rs, w / 2, h / 2, ringR, ringR);
    if (drag && moved) {
        const i = drag.index;
        // 原位半透明
        ctx.globalAlpha = 0.35;
        drawBead(ctx, rs[i]);
        ctx.globalAlpha = 1;
        // ghost 珠（跟手）
        drawBead(ctx, { ...rs[i], x: drag.x, y: drag.y });
        if (drag.phase === 'delete') {
            ctx.strokeStyle = '#E8463A';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(drag.x, drag.y, (geo.radii[i] ?? 6) * scale + 4, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#E8463A';
            ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('✕', drag.x, drag.y + 4);
        }
    }
```

（`drawBead` 从 `../utils/bead-render` 追加 import。）

- [ ] **Step 3: designer.vue 接线**

`<BeadRing ...>` 上加事件：

```html
@bead-tap="onBeadTap" @bead-move="onBeadMove" @bead-remove="onBeadRemove"
```

script 追加（沿用 SequenceStrip 的确认弹窗交互习惯）：

```ts
function onBeadMove(from: number, to: number) { d.moveBead(from, to); }
function onBeadRemove(i: number) { d.removeBeadAt(i); }
function onBeadTap(i: number) {
    uni.showModal({
        title: t('diy.removeBeadQ'),
        success: (res: UniApp.ShowModalRes) => { if (res.confirm) d.removeBeadAt(i); },
    });
}
```

- [ ] **Step 4: 验证 + Commit**

Run: `pnpm build:h5` 成功；H5 手动验证：拖动换位、拖出删除、点选弹确认。

```bash
git add src/pkg-diy/components/BeadRing.vue src/pkg-diy/pages/designer.vue; git commit -m "feat(pkg-diy): 珠子拖拽换位/拖出删除/点选移除"
```

---

### Task 6: BeadRing v2 — 结位与配饰挂位渲染/拖拽

**Files:**
- Modify: `src/pkg-diy/components/BeadRing.vue`
- Modify: `src/pkg-diy/pages/designer.vue`

- [ ] **Step 1: 组件新增 props 与绘制**

props 追加（`beads` 后）：

```ts
import type { DecorPlacement } from '../composables/useDesigner';
// props:
    /** 配饰挂位（slot=-1 结位；空数组不渲染任何挂点——配饰可选可跳过） */
    decors?: DecorPlacement[];
    knotVisible?: boolean;
```

`render()` 中 scale 计算行替换（decor 外伸计入 fit）：

```ts
    const decorExt = (props.decors?.length ?? 0) > 0 || props.knotVisible !== false ? 18 : 0;
    const scale = Math.min(6, Math.max(0.3, Math.min(
        (w / 2 - pad) / (centerR + maxR),
        (h / 2 - pad) / (centerR + maxR + decorExt),
    )));
```

drawRing 后、ghost 前追加绘制段：

```ts
    // 结位（12 点位，rotation 起点）：结点 + 双线尾；隐藏时仅留小刻度点
    const knotY = h / 2 - ringR - maxR * scale - 8;
    if (props.knotVisible !== false) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(w / 2, knotY, 3.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w / 2 - 5, knotY + 2); ctx.lineTo(w / 2 - 11, knotY + 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w / 2 + 5, knotY + 2); ctx.lineTo(w / 2 + 11, knotY + 12); ctx.stroke();
    } else {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.arc(w / 2, knotY, 2, 0, Math.PI * 2); ctx.fill();
    }
    // 配饰挂点：间隙 k 中点角向外偏移；decor 图三级回退 sprite→preset→纯色
    for (const d0 of props.decors ?? []) {
        if (d0.slot < 0) { drawDecorAt(w / 2, knotY - 12, d0.materialId); continue; }
        const a = -Math.PI / 2 + (Math.PI * 2 * (d0.slot + 0.5)) / geo.n;
        const ex = w / 2 + (ringR + maxR * scale) * Math.cos(a);
        const ey = h / 2 + (ringR + maxR * scale) * Math.sin(a);
        drawDecorAt(ex, ey, d0.materialId);
    }
```

`drawDecorAt`（组件内工具，挂件渲染半径 9px 基准 × scale，吊坠画圆+小挂环，流苏画扇形须）：

```ts
function drawDecorAt(x: number, y: number, materialId: string) {
    const m = props.beads.find(b => b.materialId === materialId);
    const r = 9 * Math.max(0.7, geo.scale);
    const row = (props as any).__rows?.find?.((r0: any) => r0.id === materialId);
    const preset = m?.preset ?? row?.renderPreset ?? null;
    const sprite = m?.renderUrl ? spriteMap.value.get(m.renderUrl) ?? null : null;
    if (sprite) { ctx!.drawImage(sprite, x - r, y - r, r * 2, r * 2); }
    else drawBead(ctx!, { x, y, r, color: m?.color ?? '#C8A23A', preset, seed: hashSeed(materialId) });
    // 挂环
    ctx!.strokeStyle = 'rgba(0,0,0,0.4)'; ctx!.lineWidth = 1;
    ctx!.beginPath(); ctx!.arc(x, y - r - 3, 2.5, 0, Math.PI * 2); ctx!.stroke();
}
```

（`__rows` 方案繁琐——改用新增 prop `decorRows: DiyMaterialRow[]` 由 designer.vue 传入素材行，`drawDecorAt` 用 `decorRows.find` 取 color/preset/renderUrl；`beads.find` 删除。）

- [ ] **Step 2: decor 触摸命中与事件**

emit 追加 `decor-tap(decorId)/decor-move(decorId, slot)/decor-remove(decorId)`。`onTouchStart` 改为：先命中 decor（距离 ≤ 16px），命中则 `dragDecor = { decorId, x, y }`；未命中再走珠子命中。`onTouchMove` 中 decor 拖动更新坐标并重绘（ghost 同款）。`onTouchEnd`：decor 拖动落点 → `hitDecorSlot(x,y)`：

```ts
function hitDecorSlot(x: number, y: number): number {
    const ang = Math.atan2(y - geo.cy, x - geo.cx);
    const rel = ((ang + Math.PI / 2) / (Math.PI * 2) * geo.n + geo.n) % geo.n;
    const dist = Math.hypot(x - geo.cx, y - geo.cy);
    // 靠近结位（12 点位上外侧）吸附 -1
    if (dist > geo.ringR * 1.35 && rel < 0.5 || rel > geo.n - 0.5) return -1;
    return Math.max(0, Math.min(geo.n - 1, Math.floor(rel)));
}
```

拖出 1.6× 环径 → emit `decor-remove`。

- [ ] **Step 3: designer.vue 接线 + 结位显隐**

模板 `<BeadRing ... :decors="d.decors.value" :knot-visible="d.knotVisible.value" :decor-rows="materials" @decor-tap="onDecorTap" @decor-move="onDecorMove" @decor-remove="onDecorRemove" />`；preview-meta 行尾加结位显隐小按钮：

```html
<text class="designer__knot-toggle" @tap="d.knotVisible.value = !d.knotVisible.value">
    {{ d.knotVisible.value ? t('diy.knot.hide') : t('diy.knot.show') }}
</text>
```

```ts
function onDecorMove(decorId: string, slot: number) { d.moveDecor(decorId, slot); }
function onDecorRemove(decorId: string) { d.removeDecor(decorId); }
function onDecorTap(decorId: string) {
    uni.showModal({
        title: t('diy.decorRemoveQ'),
        success: (res: UniApp.ShowModalRes) => { if (res.confirm) d.removeDecor(decorId); },
    });
}
```

- [ ] **Step 4: 验证 + Commit**

Run: `pnpm build:h5` 成功；手动：加吊坠→默认 6 点方向显示；加流苏（attrs.decor='tassel'）→结位；拖动换隙；拖出删除；隐藏结位。

```bash
git add src/pkg-diy/components/BeadRing.vue src/pkg-diy/pages/designer.vue; git commit -m "feat(pkg-diy): 结位与吊坠/流苏挂位渲染+拖拽"
```

---

### Task 7: MaterialSheet v2 — 分类侧栏 + 搜索 + 角标 + 长按详情 + 直觉流连选

**Files:**
- Modify: `src/pkg-diy/components/MaterialSheet.vue`
- Create: `src/pkg-diy/components/MaterialDetailPopup.vue`
- Modify: `src/pkg-diy/pages/designer.vue`、`src/api/queries/diy.ts`（已有 getDiyCategories，无需改）

- [ ] **Step 1: 新建 MaterialDetailPopup.vue**

```vue
<template>
    <view v-if="material" class="mdp" @touchmove.stop.prevent>
        <view class="mdp__mask" @tap="close" />
        <view class="mdp__panel">
            <view class="mdp__dot" :style="{ background: materialColor(material), width: '160rpx', height: '160rpx' }" />
            <text class="mdp__name">{{ materialName(material, locale) }}</text>
            <view class="mdp__row"><text class="mdp__k">{{ t('diy.detail.spec') }}</text><text>{{ material.diameter ?? material.axialLength ?? 0 }}mm</text></view>
            <view class="mdp__row"><text class="mdp__k">{{ t('diy.detail.price') }}</text><text class="mdp__price">¥{{ yuan(material.price) }}{{ t('diy.perBead') }}</text></view>
            <view class="mdp__btn" @tap="$emit('pick', material.id); close()">{{ t('diy.detail.pick') }}</view>
        </view>
    </view>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { materialColor, materialName, yuan, type DiyMaterialRow } from '../composables/useDesigner';
defineProps<{ material: DiyMaterialRow | null }>();
const emit = defineEmits<{ (e: 'update:material', v: DiyMaterialRow | null): void; (e: 'pick', id: string): void }>();
const { t, locale } = useI18n();
function close() { emit('update:material', null); }
</script>
<style lang="scss" scoped>
.mdp { position: fixed; inset: 0; z-index: 1000;
  &__mask { position: absolute; inset: 0; background: rgba(0,0,0,0.45); }
  &__panel { position: absolute; left: 60rpx; right: 60rpx; top: 50%; transform: translateY(-50%);
    background: #fff; border-radius: $radius-lg; padding: 40rpx; display: flex; flex-direction: column; align-items: center; }
  &__dot { border-radius: 50%; box-shadow: inset -6rpx -8rpx 14rpx rgba(0,0,0,0.18), inset 6rpx 8rpx 14rpx rgba(255,255,255,0.5); }
  &__name { margin-top: 20rpx; font-size: 30rpx; font-weight: 600; color: $text-color; }
  &__row { width: 100%; display: flex; justify-content: space-between; margin-top: 20rpx; font-size: 26rpx; color: $text-color; }
  &__k { color: $text-color-secondary; }
  &__price { color: $price-color; }
  &__btn { margin-top: 32rpx; width: 100%; height: 80rpx; line-height: 80rpx; text-align: center;
    background: $brand-color; color: #fff; border-radius: $radius-md; font-size: 28rpx; }
}
</style>
```

- [ ] **Step 2: MaterialSheet.vue 升级**

props 追加：`categories?: { id: string; code: string; name: any }[]`（LocalizedText name）、`counts?: Record<string, number>`、`freeMode?: boolean`（free 连选不关）。内部新增：

```ts
const activeCat = ref('');
const keyword = ref('');
const detailRow = ref<DiyMaterialRow | null>(null);

const filtered = computed(() => props.materials.filter(m => {
    if (activeCat.value && m.categoryId !== activeCat.value) return false;
    if (!keyword.value) return true;
    const k = keyword.value.toLowerCase();
    return materialName(m, locale.value).toLowerCase().includes(k) || m.code.toLowerCase().includes(k);
}));
const catName = (c: any) => typeof c.name === 'string' ? c.name : (c.name?.[locale.value] || c.name?.['zh-CN'] || c.code);
```

模板：head 下加搜索行 `<input class="mat-sheet__search" :placeholder="t('diy.searchPlaceholder')" v-model="keyword" />`；list 区改左右结构——左分类竖栏（`全部` + categories，tap 切 activeCat）、右网格 `v-for="m in filtered"`；网格 item 加角标 `<view v-if="(counts?.[m.id] ?? 0) > 0" class="mat-sheet__qx">×{{ counts[m.id] }}</view>` 与 `@longpress="detailRow = m"`；hint 行加 `{{ t('diy.longPressHint') }}`。

`onPick` 改：

```ts
function onPick(id: string) {
    emit('pick', id);
    if (!props.freeMode) emit('update:show', false);  // 直觉流保持面板打开连选
}
```

样式：`__search`（高 64rpx 圆角背景 $bg-color margin-top 16rpx padding 0 20rpx）、`__qx`（绝对定位右上 -10rpx brand 圆角白字 20rpx）、`__body`（flex：`__cats` 宽 152rpx 竖向 scroll-view，项 padding 12rpx 8rpx 24rpx 字号 22rpx 选中 brand 左竖条）、`__grid` flex:1 三列（item 宽 30%，间距 12rpx）。

- [ ] **Step 3: designer.vue 接线**

onLoad 并行取分类：

```ts
const categories = ref<any[]>([]);
// onLoad 内（materials 拉取旁，Promise.all 可并行）：
try {
    const cres: any = await getDiyCategories();
    categories.value = (cres?.diyCategories ?? []).filter((c: any) => c.enabled !== false);
} catch { categories.value = []; }
```

（import 行加 `getDiyCategories`。）

counts computed：

```ts
const pickCounts = computed<Record<string, number>>(() => {
    const c: Record<string, number> = {};
    for (const id of d.sequence.value) c[id] = (c[id] ?? 0) + 1;
    for (const x of d.decors.value) c[x.materialId] = (c[x.materialId] ?? 0) + 1;
    return c;
});
```

`<MaterialSheet ... :categories="categories" :counts="pickCounts" :free-mode="d.mode.value === 'free'" @pick="onPickMaterial" />`；模板尾加 `<MaterialDetailPopup v-model:material="detailRow" @pick="onPickMaterial" />`（`detailRow` ref 从组件抽到 designer 或组件内部——放 MaterialSheet 内部持有 detailRow 即可，Popup 也放 MaterialSheet 模板内，designer 无需接线 detail）。

- [ ] **Step 4: 验证 + Commit**

Run: `pnpm build:h5` 成功；手动：分类过滤、搜索、角标随点卡增长、长按详情、直觉流连选面板不关。

```bash
git add src/pkg-diy/components/MaterialSheet.vue src/pkg-diy/components/MaterialDetailPopup.vue src/pkg-diy/pages/designer.vue; git commit -m "feat(pkg-diy): 选料面板 v2 分类侧栏+搜索+角标+长按详情+连选"
```

---

### Task 8: designer.vue — 胶囊条 + 操作行 + 空态 + 草稿恢复 + 帮助入口

**Files:**
- Modify: `src/pkg-diy/pages/designer.vue`

- [ ] **Step 1: 顶部胶囊条（替换 preview-meta）**

```html
<view class="designer__capsules">
    <text class="designer__caps designer__caps--state">
        {{ d.mode.value === 'free' ? t('diy.innerCirc') : t('diy.wristSize') + ' ' + (d.wristSize.value / 10).toFixed(1) + 'cm' }}
        · {{ t(feedbackI18nKey(d.result.value?.bom?.geometry?.feedback)) }}
    </text>
    <text class="designer__caps">¥{{ yuan(d.result.value?.bom?.totalAmount) }}</text>
    <text class="designer__caps designer__caps--link" @tap="goGuide">{{ t('diy.helpShort') }} ?</text>
</view>
```

（内孔周长文本保留在点击胶囊展开的明细抽屉里，`@tap="showCalc = true"` 移到第一个胶囊上。）

- [ ] **Step 2: 操作行（ModeChips 下方）**

```html
<view class="designer__actions">
    <text class="designer__act" @tap="onClear">{{ t('diy.action.clear') }}</text>
    <text class="designer__act" @tap="onDraft">{{ t('diy.action.draft') }}</text>
    <text class="designer__act" @tap="onRecommend">↻ {{ t('diy.action.recommend') }}</text>
</view>
```

```ts
import { recommendSequence } from '../utils/recommend';

function onClear() {
    uni.showModal({ title: t('diy.confirmClear'), success: r => { if (r.confirm) { d.clearAll(); uni.showToast({ title: t('diy.cleared'), icon: 'none' }); } } });
}
function onDraft() { d.saveDraft(); uni.showToast({ title: t('diy.draftSaved'), icon: 'none' }); }
function onRecommend() {
    d.applyRecommend(recommendSequence(materials.value, d.wristSize.value, easeOf(d.fit.value), Date.now() % 2147483647));
    uni.showToast({ title: t('diy.recommendDone'), icon: 'none' });
}
function goGuide() { uni.navigateTo({ url: '/pkg-diy/pages/guide' }); }
```

（`easeOf` 从 useDesigner 的 re-export 导入。）

- [ ] **Step 3: 空态引导 + 草稿恢复（onLoad）**

预览区内加空态覆盖（`v-if="!d.previewBeads.value.length"`）：

```html
<view class="designer__empty"><text>{{ t('diy.emptyHint') }}</text></view>
```

onLoad 末尾追加：

```ts
    if (d.loadDraft()) uni.showToast({ title: t('diy.draftRestored'), icon: 'none' });
```

- [ ] **Step 4: CTA 文案改「完成设计」**

`ctaLabel` 最后一行改：`return t('diy.action.finish') + ' · ¥' + yuan(d.result.value?.bom?.totalAmount);`

- [ ] **Step 5: 样式 + 验证 + Commit**

样式追加 `&__capsules`（flex gap 12rpx padding 8rpx 8rpx 16rpx）、`&__caps`（圆角胶囊 bg $bg-color border 24rpx 字号 22rpx；`--state` brand 浅底；`--link` brand 色 margin-left auto）、`&__actions`（flex gap 16rpx margin 0 20rpx 16rpx；`&__act` 胶囊按钮同 `__chip`）、`&__empty`（预览区绝对定位居中，文字 $text-color-placeholder 26rpx）。

Run: `pnpm build:h5` 成功。

```bash
git add src/pkg-diy/pages/designer.vue; git commit -m "feat(pkg-diy): 胶囊条+操作行(清空/暂存/推荐)+空态+草稿恢复"
```

---

### Task 9: guide.vue 引导页 + 注册 + 首次自动引导

**Files:**
- Create: `src/pkg-diy/pages/guide.vue`
- Modify: `src/pages.json`（pkg-diy pages 数组追加）
- Modify: `src/pkg-diy/pages/designer.vue`（onLoad 首次跳转）

- [ ] **Step 1: pages.json 注册**

pkg-diy `pages` 数组（plan-detail 条目后）追加：

```json
                {
                    "path": "guide",
                    "style": {
                        "navigationBarTitleText": "串珠指南"
                    }
                }
```

- [ ] **Step 2: 新建 guide.vue**

```vue
<template>
    <view class="guide">
        <view v-for="s in sections" :key="s.k" class="guide__sec">
            <text class="guide__t">{{ s.icon + ' ' + t('diy.guide.' + s.k + 't') }}</text>
            <text class="guide__p">{{ t('diy.guide.' + s.k) }}</text>
        </view>
        <view class="guide__foot">
            <view class="guide__btn" @tap="back">{{ t('diy.guide.start') }}</view>
        </view>
    </view>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const sections = [
    { k: 's1', icon: '🧵' }, { k: 's2', icon: '✨' }, { k: 's3', icon: '📏' },
    { k: 's4', icon: '🎚️' }, { k: 's5', icon: '🔮' }, { k: 's6', icon: '🎀' }, { k: 's7', icon: '❓' },
];
function back() {
    const pages = getCurrentPages();
    if (pages.length > 1) uni.navigateBack();
    else uni.redirectTo({ url: '/pkg-diy/pages/designer' });
}
</script>
<style lang="scss" scoped>
.guide { min-height: 100vh; background: $bg-color; padding: 24rpx 24rpx 200rpx;
  &__sec { background: #fff; border-radius: $radius-md; padding: 28rpx 32rpx; margin-bottom: 20rpx; }
  &__t { display: block; font-size: 30rpx; font-weight: 600; color: $text-color; }
  &__p { display: block; margin-top: 14rpx; font-size: 26rpx; line-height: 1.7; color: $text-color-secondary; }
  &__foot { position: fixed; left: 0; right: 0; bottom: 0; padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom)); background: #fff; box-shadow: 0 -2rpx 12rpx rgba(0,0,0,0.06); }
  &__btn { height: 88rpx; line-height: 88rpx; text-align: center; border-radius: $radius-md; background: $brand-color; color: #fff; font-size: 30rpx; }
}
</style>
```

- [ ] **Step 3: designer.vue 首次自动引导**

onLoad 开头（setNavigationBarTitle 后）：

```ts
    if (!uni.getStorageSync('diy_guide_seen')) {
        uni.setStorageSync('diy_guide_seen', '1');
        uni.navigateTo({ url: '/pkg-diy/pages/guide' });
    }
```

- [ ] **Step 4: 验证 + Commit**

Run: `pnpm build:h5` 成功；手动：首次进 designer 跳指南；? 随时进；底部按钮返回。

```bash
git add src/pages.json src/pkg-diy/pages/guide.vue src/pkg-diy/pages/designer.vue; git commit -m "feat(pkg-diy): 独立引导页（7节）+首次自动引导+帮助入口"
```

---

### Task 10: 构建验证 + 回归 + 手机截图

**Files:** 无新改动（验证任务）

- [ ] **Step 1: 双端构建**

Run: `pnpm build:h5`；`pnpm build:mp-weixin`（若 script 不存在则 `npx uni build -p mp-weixin`）。
Expected: 双端 0 error；`dist/build/h5/assets/` 含 pkg-diy 各页面 chunk。

- [ ] **Step 2: 本地预览回归**

Run: `pnpm dev:h5`，浏览器 390×844 视口逐条验证：
1. 空态文案 + 推荐一键生成序列；
2. 连点素材卡上珠、角标增长；拖拽换位、拖出删除、点选删除；
3. 20 颗 12mm / 28 颗混径 / 含吊坠：整环完整可见（全貌修复）；
4. 吊坠默认 6 点方向、流苏（attrs.decor='tassel' 素材）默认结位、可拖换隙/拖出删除、结位显隐；
5. chips 切定手围/定颗数/混搭：序列反推槽位、qtyOverride 带入；切回直觉流展开序列；价格一致；
6. 暂存→刷新页面→草稿恢复 toast；清空确认；
7. 保存方案（完成设计）→ plan-detail 正常（服务端复算价一致）；
8. 引导页 7 节五语言抽查 zh-CN/en/ja。

- [ ] **Step 3: 手机视口截图（390×844 dpr=2，硬规范）**

用既有截图方式（Playwright 移动视口 390×844 deviceScaleFactor=2）截：空态、串珠中（含拖拽删除红圈态）、全貌 20 颗、含吊坠+结位、专业模式、引导页。存 `docs/pkg-diy-p7-screens/`。

- [ ] **Step 4: Commit 截图**

```bash
git add docs/pkg-diy-p7-screens; git commit -m "docs(pkg-diy): P7 手机视口截图"
```

---

### Task 11: 部署 e.joho.cn + 线上冒烟

- [ ] **Step 1: 部署（本地构建产物，铁律：服务器不构建）**

按 P6 方式：`pnpm build:h5` → 打包 `dist/build/h5` → tar → scp 上传 → 备份线上目录（`/tmp/esite-backup-p7-*.tar.gz`）→ 容器内站点目录（1Panel openresty `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index/`）替换。服务器地址与 SSH 目标取自项目运维记录/memory。

- [ ] **Step 2: 线上冒烟**

1. `https://e.joho.cn/` 资产哈希为新构建；
2. designer 页可开、引导页首次跳转；
3. `https://e.joho.cn/shop-api` GraphQL `diyGalleryPlans` 正常（后端零改动应不受影响）；
4. 手机真机/视口走一遍 Task 10 Step 2 的 1-7 条。

- [ ] **Step 3: 收尾提交推送**

```bash
git push origin master
```

---

## Self-Review 结论

1. **Spec 覆盖**：直觉流默认+chips（T2/T8）、拖拽/删除/点选（T5）、全貌自适应（T4）、混径收敛显性化（引导页 s5，T1/T9）、结位+配饰挂位渲染与拖拽+默认挂位+显隐（T6）、选料面板分类/搜索/角标/长按详情/连选（T7）、推荐/暂存/清空/完成设计（T2/T8）、引导页 7 节+首次自动+帮助入口（T9）、五语言（T1）、验证与部署（T10/T11）。无缺口。
2. **占位符扫描**：无 TBD/TODO；所有代码步骤给出完整代码；Task 3 Step 2 的 node 断言不可行已改为构建期验证并说明。
3. **类型一致性**：`DecorPlacement` 在 T2 定义、T6 引用一致；`moveBead(from,to)` T2 定义 T5 调用一致；`recommendSequence(materials, wristMm, easeMm, seed)` T3 定义 T8 调用一致；`drawDecorAt` 最终采用 `decorRows` prop 方案（正文已注明替换 `__rows` 草案）；`geo` 在 T5 定义、T6 复用一致。
