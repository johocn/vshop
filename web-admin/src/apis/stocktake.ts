// 盘库域 admin-api 调用（Task 9）
// 契约来源：cjk-plugin/src/plugin.ts 的 adminApiExtensions 盘库 SDL 块（仅 admin 注册，规格 §3.8）
// 注意：scopeJson 在 SDL 里是 String（前端自行 parseScopeJson）；日期字段是 DateTime（字符串）。
import { getAdminClient, graphQlErrorMsg } from './client';
import type { BinOccupancyRow, StocktakeLineRow } from '../utils/stocktake-grid';

export interface StocktakeTask {
  id: string;
  code: string;
  stockLocationId: string;
  locationName?: string | null;
  activityCode?: string | null;
  name: string;
  scopeJson: string;
  binModeAtCreate: string;
  state: string;
  createdById?: string | null;
  createdByName?: string | null;
  postedStockDocId?: string | null;
  postedAt?: string | null;
  note?: string | null;
  createdAt: string;
  expectedTotal: number;
  countedTotal: number;
  waveCount: number;
  submittedWaveCount: number;
}

export interface StocktakeWave {
  id: string;
  taskId: string;
  scopeType: string;
  zoneId?: string | null;
  zoneCode?: string | null;
  zoneName?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  state: string;
  expectedCount: number;
  countedCount: number;
  claimedAt?: string | null;
  submittedAt?: string | null;
}

export interface StocktakeVarianceRow {
  variantId: string;
  variantSku: string;
  variantName: string;
  countedTotal: number;
  bookQty: number;
  diff: number;
  isExtra: boolean;
  binChanged: boolean;
  targetZoneId?: string | null;
  targetBinId?: string | null;
  targetBinCode?: string | null;
  snapBookQty: number;
  currentBookQty: number;
}

export interface StocktakeDiff {
  expectedTotal: number;
  countedTotal: number;
  uncountedCount: number;
  extraCount: number;
  diffCount: number;
  rows: StocktakeVarianceRow[];
  uncountedLines: StocktakeLineRow[];
  recheck: boolean;
  changedVariants: { variantId: string; variantSku: string; snapBookQty: number; currentBookQty: number }[];
}

export interface StocktakeScanHit {
  kind: string;
  binId?: string | null;
  binCode?: string | null;
  zoneId?: string | null;
  lineId?: string | null;
  variantId?: string | null;
  variantSku?: string | null;
  variantName?: string | null;
  message?: string | null;
}

const TASK_FIELDS = `id code stockLocationId locationName activityCode name scopeJson binModeAtCreate state
  createdById createdByName postedStockDocId postedAt note createdAt
  expectedTotal countedTotal waveCount submittedWaveCount`;

const WAVE_FIELDS = `id taskId scopeType zoneId zoneCode zoneName assigneeId assigneeName state
  expectedCount countedCount claimedAt submittedAt`;

const LINE_FIELDS = `id taskId waveId variantId variantSku variantName zoneId binId zoneCode binCode
  bookQty countedQty isExtra countedById countedByName countedAt note`;

const DIFF_FIELDS = `
  expectedTotal countedTotal uncountedCount extraCount diffCount recheck
  rows { variantId variantSku variantName countedTotal bookQty diff isExtra binChanged targetZoneId targetBinId targetBinCode snapBookQty currentBookQty }
  uncountedLines { ${LINE_FIELDS} }
  changedVariants { variantId variantSku snapBookQty currentBookQty }`;

// ---------------------------------------------------------------- 查询

/** 任务列表（按渠道收口在服务端；state/activityCode/stockLocationId 为可选筛选） */
export async function fetchStocktakeTasks(options?: {
  page?: number; pageSize?: number; state?: string; activityCode?: string; stockLocationId?: string;
}): Promise<{ totalItems: number; items: StocktakeTask[] }> {
  try {
    const r = await getAdminClient().request<{ stocktakeTasks: { totalItems: number; items: StocktakeTask[] } }>(
      `query StocktakeTasks($options: StocktakeTaskOptionsInput) {
        stocktakeTasks(options: $options) { totalItems items { ${TASK_FIELDS} } }
      }`,
      {
        options: {
          page: options?.page ?? 1,
          pageSize: options?.pageSize ?? 20,
          state: options?.state ?? null,
          activityCode: options?.activityCode ?? null,
          stockLocationId: options?.stockLocationId ?? null,
        },
      },
    );
    return r.stocktakeTasks ?? { totalItems: 0, items: [] };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点任务查询失败'));
  }
}

/** 任务详情（不存在返回 null） */
export async function fetchStocktakeTask(id: string): Promise<StocktakeTask | null> {
  try {
    const r = await getAdminClient().request<{ stocktakeTask: StocktakeTask | null }>(
      `query StocktakeTask($id: ID!) { stocktakeTask(id: $id) { ${TASK_FIELDS} } }`,
      { id },
    );
    return r.stocktakeTask ?? null;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点任务详情查询失败'));
  }
}

/** 盘次列表（含未认领；按 zoneCode 排序由服务端保证，前端只做展示） */
export async function fetchStocktakeWaves(taskId: string): Promise<StocktakeWave[]> {
  try {
    const r = await getAdminClient().request<{ stocktakeWaves: StocktakeWave[] }>(
      `query StocktakeWaves($taskId: ID!) { stocktakeWaves(taskId: $taskId) { ${WAVE_FIELDS} } }`,
      { taskId },
    );
    return r.stocktakeWaves ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点盘次查询失败'));
  }
}

/** 应盘行（waveId 可空 = 全任务；filter/keyword 由服务端过滤） */
export async function fetchStocktakeExpectedLines(args: {
  taskId: string; waveId?: string | null; filter?: Record<string, boolean> | null;
  keyword?: string | null; page?: number; pageSize?: number;
}): Promise<{ totalItems: number; items: StocktakeLineRow[] }> {
  try {
    const r = await getAdminClient().request<{ stocktakeExpectedLines: { totalItems: number; items: StocktakeLineRow[] } }>(
      `query StocktakeExpectedLines($taskId: ID!, $waveId: ID, $filter: StocktakeLineFilterInput, $keyword: String, $page: Int, $pageSize: Int) {
        stocktakeExpectedLines(taskId: $taskId, waveId: $waveId, filter: $filter, keyword: $keyword, page: $page, pageSize: $pageSize) {
          totalItems items { ${LINE_FIELDS} }
        }
      }`,
      {
        taskId: args.taskId,
        waveId: args.waveId ?? null,
        filter: args.filter ?? null,
        keyword: args.keyword ?? null,
        page: args.page ?? 1,
        pageSize: args.pageSize ?? 200,
      },
    );
    return r.stocktakeExpectedLines ?? { totalItems: 0, items: [] };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '应盘清单查询失败'));
  }
}

/** 差异（过账前唯一决策点） */
export async function fetchStocktakeDiff(taskId: string): Promise<StocktakeDiff> {
  try {
    const r = await getAdminClient().request<{ stocktakeDiff: StocktakeDiff }>(
      `query StocktakeDiff($taskId: ID!) { stocktakeDiff(taskId: $taskId) { ${DIFF_FIELDS} } }`,
      { taskId },
    );
    return r.stocktakeDiff;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点差异查询失败'));
  }
}

/** 扫码解析：库位码 → 定位格子；内部码/条形码 → 命中断行；两者都不是 → 清单外盘盈候选 */
export async function resolveStocktakeCode(taskId: string, code: string): Promise<StocktakeScanHit> {
  try {
    const r = await getAdminClient().request<{ stocktakeResolveCode: StocktakeScanHit }>(
      `query StocktakeResolveCode($taskId: ID!, $code: String!) {
        stocktakeResolveCode(taskId: $taskId, code: $code) { kind binId binCode zoneId lineId variantId variantSku variantName message }
      }`,
      { taskId, code },
    );
    return r.stocktakeResolveCode;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '扫码解析失败'));
  }
}

// ---------------------------------------------------------------- 变更

/** 建任务（服务端在同一事务内固化应盘清单 + 拆盘次） */
export async function createStocktakeTask(input: {
  stockLocationId: string; name: string; activityCode?: string | null;
  scope?: { zones?: number[]; categoryIds?: number[]; variantIds?: number[]; includeZeroBook?: boolean } | null;
  autoSplitByZone?: boolean | null; note?: string | null;
}): Promise<StocktakeTask> {
  try {
    const r = await getAdminClient().request<{ createStocktakeTask: StocktakeTask }>(
      `mutation CreateStocktakeTask($input: StocktakeTaskInput!) { createStocktakeTask(input: $input) { ${TASK_FIELDS} } }`,
      {
        input: {
          stockLocationId: input.stockLocationId,
          name: input.name,
          activityCode: input.activityCode ?? null,
          scope: input.scope ?? null,
          autoSplitByZone: input.autoSplitByZone ?? null,
          note: input.note ?? null,
        },
      },
    );
    return r.createStocktakeTask;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点任务创建失败'));
  }
}

/** 追加盘次（本轮最小实现：服务端会返回「暂不支持」的明确原因） */
export async function addStocktakeWave(taskId: string, input: { scopeType: string; zoneId?: string | null }): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ addStocktakeWave: StocktakeWave }>(
      `mutation AddStocktakeWave($taskId: ID!, $input: StocktakeWaveInput!) { addStocktakeWave(taskId: $taskId, input: $input) { ${WAVE_FIELDS} } }`,
      { taskId, input: { scopeType: input.scopeType, zoneId: input.zoneId ?? null } },
    );
    return r.addStocktakeWave;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘次新增失败'));
  }
}

/** 指派（assigneeId 传 null 表示改为待认领） */
export async function assignStocktakeWave(waveId: string, assigneeId?: string | null): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ assignStocktakeWave: StocktakeWave }>(
      `mutation AssignStocktakeWave($waveId: ID!, $assigneeId: String) { assignStocktakeWave(waveId: $waveId, assigneeId: $assigneeId) { ${WAVE_FIELDS} } }`,
      { waveId, assigneeId: assigneeId ?? null },
    );
    return r.assignStocktakeWave;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘次指派失败'));
  }
}

/** 认领（独占锁定；他人已认领会被拒并回传原因） */
export async function claimStocktakeWave(waveId: string): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ claimStocktakeWave: StocktakeWave }>(
      `mutation ClaimStocktakeWave($waveId: ID!) { claimStocktakeWave(waveId: $waveId) { ${WAVE_FIELDS} } }`,
      { waveId },
    );
    return r.claimStocktakeWave;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘次认领失败'));
  }
}

/** 释放（退回待认领，清空负责人） */
export async function releaseStocktakeWave(waveId: string): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ releaseStocktakeWave: StocktakeWave }>(
      `mutation ReleaseStocktakeWave($waveId: ID!) { releaseStocktakeWave(waveId: $waveId) { ${WAVE_FIELDS} } }`,
      { waveId },
    );
    return r.releaseStocktakeWave;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘次释放失败'));
  }
}

/** 批量录入（lineId 命中清单行；variantId 用于清单外盘盈行） */
export async function saveStocktakeCounts(
  waveId: string,
  inputs: { lineId?: string | null; variantId?: string | null; countedQty: number; zoneId?: string | null; binId?: string | null; note?: string | null }[],
): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ saveStocktakeCounts: StocktakeWave }>(
      `mutation SaveStocktakeCounts($waveId: ID!, $inputs: [StocktakeCountEntryInput!]!) { saveStocktakeCounts(waveId: $waveId, inputs: $inputs) { ${WAVE_FIELDS} } }`,
      {
        waveId,
        inputs: inputs.map((i) => ({
          lineId: i.lineId ?? null,
          variantId: i.variantId ?? null,
          countedQty: i.countedQty,
          zoneId: i.zoneId ?? null,
          binId: i.binId ?? null,
          note: i.note ?? null,
        })),
      },
    );
    return r.saveStocktakeCounts;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点录入失败'));
  }
}

/** 提交盘次（终态；提交后不可再录入） */
export async function submitStocktakeWave(waveId: string): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ submitStocktakeWave: StocktakeWave }>(
      `mutation SubmitStocktakeWave($waveId: ID!) { submitStocktakeWave(waveId: $waveId) { ${WAVE_FIELDS} } }`,
      { waveId },
    );
    return r.submitStocktakeWave;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘次提交失败'));
  }
}

/** 过账（confirm=true 才允许跳过未盘项/接受账面变动） */
export async function postStocktake(
  taskId: string,
  confirm = false,
): Promise<{ ok: boolean; stockDocId?: string | null; diff?: StocktakeDiff | null; message?: string | null }> {
  try {
    const r = await getAdminClient().request<{ postStocktake: { ok: boolean; stockDocId?: string | null; diff?: StocktakeDiff | null; message?: string | null } }>(
      `mutation PostStocktake($taskId: ID!, $confirm: Boolean) {
        postStocktake(taskId: $taskId, confirm: $confirm) { ok stockDocId message diff { ${DIFF_FIELDS} } }
      }`,
      { taskId, confirm },
    );
    return r.postStocktake;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点过账失败'));
  }
}

/** 取消任务（非终态可取消） */
export async function cancelStocktakeTask(taskId: string): Promise<StocktakeTask> {
  try {
    const r = await getAdminClient().request<{ cancelStocktakeTask: StocktakeTask }>(
      `mutation CancelStocktakeTask($taskId: ID!) { cancelStocktakeTask(taskId: $taskId) { ${TASK_FIELDS} } }`,
      { taskId },
    );
    return r.cancelStocktakeTask;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘点任务取消失败'));
  }
}

/** 取消单个盘次（任务状态随之派生） */
export async function cancelStocktakeWave(waveId: string): Promise<StocktakeWave> {
  try {
    const r = await getAdminClient().request<{ cancelStocktakeWave: StocktakeWave }>(
      `mutation CancelStocktakeWave($waveId: ID!) { cancelStocktakeWave(waveId: $waveId) { ${WAVE_FIELDS} } }`,
      { waveId },
    );
    return r.cancelStocktakeWave;
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '盘次取消失败'));
  }
}