// 作业分析报表纯函数：时间窗口切分、发货件数合计、差异率格式化、CSV 行组装。
// 口径见 docs/superpowers/specs/2026-09-25-web-admin-gap4-design.md §7.3（务必与规格一致，勿自行发明口径）。
//
// 注（D48）：「拣货单数」「盘库次数」的窗口判定与「盘点差异趋势」的按日聚合已整体下沉到后端
// （`pickBatchShippedCount` / `stocktakeKpi`）。原因同 D46：前端原先只能取到被服务端硬顶 100 条的
// 分页结果，窗口内批次/任务超过 100 条时较老记录被截断，三个 KPI 同源同步失真。收益：无上限、
// 单次请求、无分页漂移；代价：这些口径不再有前端单测覆盖，改由 e2e（`_e2e/_verify_d48_dashboard_kpi_window.py`）
// 与 `_e2e/_verify_d46_ops_counter_window.py` 守护。
export interface OpsWindow {
  start: Date;
  /** 含 */
  end: Date;
  /** 7 | 30 */
  days: number;
}

/** 近 N 天窗口（含今日）：[今天-(N-1) 00:00, 明天 00:00) */
export function buildOpsWindow(days: number, now = new Date()): OpsWindow {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  return { start, end, days };
}

/** 'YYYY-MM-DD'（本地时区），用于订单列表 custom 时间窗口与 CSV 文件名 */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function sumShippedItems(rows: Array<{ totalQuantity?: number | null }>): number {
  return rows.reduce((s, r) => s + (r.totalQuantity ?? 0), 0);
}

/** 差异率 = Σ差异件数 ÷ Σ应盘件数（两位小数字符串）；分母为 0 → '0.00' */
export function varianceRate(expected: number, diff: number): string {
  return expected > 0 ? ((diff / expected) * 100).toFixed(2) : '0.00';
}

export interface TrendPointRow {
  day: string;
  expected: number;
  diff: number;
}

export interface CounterRow {
  /** 空串表示未记录操作人（页面渲染为「未记录」占位） */
  operator: string;
  count: number;
  qty: number;
}

// 注（D46）：「作业员明细」聚合（`groupByOperator` + `opsCountableDocs`）已整体下沉到后端
// `stockDocOperatorStats`（SQL GROUP BY 操作人，且口径排除 STOCKTAKE），改由 e2e 守护：
// `_e2e/_verify_d46_ops_counter_window.py`（窗口上限两态）与 `_e2e/_verify_d43_ops_counter_scope.py`（STOCKTAKE 排除口径）。
