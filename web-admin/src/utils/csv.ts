// utils/csv.ts —— H5 CSV 导出（Blob + BOM，Excel 中文兼容）
import { fmtBeijing } from './datetime';
export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const esc = (v: string): string => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(esc).join(','));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function fmtDateTime(d: Date): string {
  return fmtBeijing(d, 'datetime');
}
