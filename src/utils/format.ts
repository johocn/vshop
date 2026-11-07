import { fmtUser } from './datetime';

/** Format price from cents (fen) to yuan */
export function formatPrice(cents: number): string {
    return '¥' + (cents / 100).toFixed(2);
}

/** Format date */
export function formatDate(dateStr: string): string {
    return fmtUser(dateStr, 'date');
}

/** Format countdown */
export function formatCountdown(endTime: string): string {
    const diff = new Date(endTime).getTime() - Date.now();
    if (diff <= 0) return '已结束';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

/** Truncate text */
export function truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}