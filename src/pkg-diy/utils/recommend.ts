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
