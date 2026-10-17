/** 剩余毫秒 → `HH:MM:SS`；负数/非法输入归 0（返回 `00:00:00`） */
export function formatRemaining(remainMs: number): string {
    const ms = Number.isFinite(remainMs) ? Math.max(0, remainMs) : 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
