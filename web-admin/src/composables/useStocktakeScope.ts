// 盘次上下文（录入页版式 B / 扫码快盘版式 C 共用）：任务 + 当前盘次 + 应盘行 + 草稿 + 进度
// 所有写操作都经服务端独占锁裁决，前端只负责把明确的错误原因透传出来。
import { computed, ref } from 'vue';
import {
  fetchStocktakeExpectedLines, fetchStocktakeTask, fetchStocktakeWaves, saveStocktakeCounts,
  type StocktakeTask, type StocktakeWave,
} from '../apis/stocktake';
import {
  clampCounted, filterLines, isCounted, sortLines, waveProgress,
  type LineFilter, type StocktakeLineRow,
} from '../utils/stocktake-grid';

const PAGE_SIZE = 500;

export function useStocktakeScope() {
  const taskId = ref('');
  const waveId = ref('');
  const task = ref<StocktakeTask | null>(null);
  const wave = ref<StocktakeWave | null>(null);
  const lines = ref<StocktakeLineRow[]>([]);
  const filter = ref<LineFilter>({});
  const loading = ref(false);
  const saving = ref(false);

  /** 本地草稿：lineId → 输入框字符串；不存在的键表示该行未改动 */
  const drafts = ref<Record<string, string>>({});

  const progress = computed(() =>
    waveProgress(wave.value ?? { expectedCount: 0, countedCount: 0, state: 'OPEN' }),
  );

  /** 只看当前盘次：CLAIMED/COUNTING 可写，SUBMITTED/CANCELLED 只读 */
  const canEdit = computed(() => !!wave.value && ['CLAIMED', 'COUNTING'].includes(wave.value.state));

  const visibleLines = computed(() => filterLines(lines.value, filter.value));

  /** 未归位桶的行（zoneId 为 null）单独成区块 */
  const unassignedLines = computed(() => visibleLines.value.filter((l) => !l.zoneId));

  function setDraft(lineId: string, v: string) {
    drafts.value = { ...drafts.value, [lineId]: v };
  }

  /** 输入框的值：优先草稿，其次已盘值，未盘为空串 */
  function draftOf(line: StocktakeLineRow): string {
    const d = drafts.value[line.id];
    if (d !== undefined) return d;
    return isCounted(line) ? String(line.countedQty) : '';
  }

  /** 待保存行：草稿钳制值与该行已盘值不同才提交（避免无改动也打网络） */
  function pendingInputs(): { lineId: string; countedQty: number }[] {
    const out: { lineId: string; countedQty: number }[] = [];
    for (const l of lines.value) {
      const raw = drafts.value[l.id];
      if (raw === undefined) continue;
      const qty = clampCounted(raw);
      const cur = isCounted(l) ? Number(l.countedQty) : null;
      if (cur === qty) continue;
      out.push({ lineId: String(l.id), countedQty: qty });
    }
    return out;
  }

  async function loadLines() {
    if (!taskId.value) return;
    const r = await fetchStocktakeExpectedLines({
      taskId: taskId.value,
      waveId: waveId.value || null,
      page: 1,
      pageSize: PAGE_SIZE,
    });
    lines.value = sortLines(r.items);
    drafts.value = {};
  }

  /** 打开盘次上下文（count.vue / scan.vue 共用入口） */
  async function load(id: string, wid: string) {
    loading.value = true;
    try {
      taskId.value = id;
      waveId.value = wid;
      task.value = await fetchStocktakeTask(id);
      const waves = await fetchStocktakeWaves(id);
      wave.value = waves.find((w) => String(w.id) === String(wid)) ?? null;
      if (!wave.value && waves.length) {
        wave.value = waves[0];
        waveId.value = String(waves[0].id);
      }
      await loadLines();
    } finally {
      loading.value = false;
    }
  }

  /** 仅刷新盘次（录入后同步 countedCount / state） */
  async function refreshWave() {
    if (!taskId.value) return;
    const waves = await fetchStocktakeWaves(taskId.value);
    wave.value = waves.find((w) => String(w.id) === String(waveId.value)) ?? wave.value;
  }

  /** 批量保存草稿；返回实际写入行数 */
  async function save(): Promise<number> {
    const inputs = pendingInputs();
    if (!inputs.length) return 0;
    saving.value = true;
    try {
      wave.value = await saveStocktakeCounts(waveId.value, inputs);
      await loadLines();
      return inputs.length;
    } finally {
      saving.value = false;
    }
  }

  /** 单行即时保存（扫码快盘用） */
  async function saveLine(lineId: string, qty: number): Promise<void> {
    const v = clampCounted(qty);
    saving.value = true;
    try {
      wave.value = await saveStocktakeCounts(waveId.value, [{ lineId, countedQty: v }]);
      const hit = lines.value.find((l) => String(l.id) === String(lineId));
      if (hit) hit.countedQty = v;
      drafts.value = {};
    } finally {
      saving.value = false;
    }
  }

  /** 清单外盘盈登记（variantId + 实盘数） */
  async function addExtra(variantId: string, qty: number): Promise<void> {
    saving.value = true;
    try {
      wave.value = await saveStocktakeCounts(waveId.value, [{ variantId, countedQty: clampCounted(qty) }]);
      await loadLines();
    } finally {
      saving.value = false;
    }
  }

  return {
    taskId, waveId, task, wave, lines, filter, loading, saving, drafts,
    progress, canEdit, visibleLines, unassignedLines,
    setDraft, draftOf, pendingInputs, load, refreshWave, loadLines, save, saveLine, addExtra,
  };
}