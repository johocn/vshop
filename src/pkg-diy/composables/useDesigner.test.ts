/**
 * useDesigner P8 特性单元测试（vitest，node 环境）：
 * - 步进器「−」removeOneMaterial 全分支（序列优先 → 挂饰回退 → no-op → 减到 0 校验恢复）
 * - 步进器「＋」/ ×N 徽标数据源：BOM 聚合口径（与统计胶囊、CTA 同源）
 * - 分模式素材桶隔离（virgin 一次性拷贝 / 专业模式零带入 / 往返保留 / decors setter 指 free 桶）
 */
import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useDesigner, type DiyMaterialRow } from './useDesigner';

/** 构造素材行（BOM 计价 1 元/颗 = 100 分，便于断言金额） */
function mat(id: string, over: Partial<DiyMaterialRow> = {}): DiyMaterialRow {
    return {
        id, code: id, name: id, categoryId: null, shape: 'round',
        diameter: 8, axialLength: null, holeSize: null, attrs: {},
        renderUrl: null, renderPreset: null, price: 100, ...over,
    };
}
/** 挂饰素材（attrs.decor=true；非 tassel 默认挂序列中点间隙） */
const pendant = (id: string) => mat(id, { attrs: { decor: true }, shape: 'charm', diameter: 10 });

const setup = (materials: DiyMaterialRow[]) => useDesigner(ref(materials), ref('zh-CN'));

describe('步进器「−」removeOneMaterial', () => {
    it('序列多颗同类：只移除最后一颗，其余保序', () => {
        const d = setup([mat('a'), mat('b')]);
        ['a', 'a', 'b', 'a'].forEach(id => d.appendBead(id));
        d.removeOneMaterial('a');
        expect(d.sequence.value).toEqual(['a', 'a', 'b']);
    });

    it('序列无该素材：回退移除最后一个挂饰实例', () => {
        const d = setup([mat('a'), pendant('p')]);
        d.appendBead('a');
        d.appendBead('a');
        d.addDecor('p');
        d.addDecor('p');
        d.removeOneMaterial('p');
        expect(d.decors.value).toHaveLength(1);
        expect(d.decors.value[0].decorId).toBe('p#1'); // 后加的 p#2 被移除
        expect(d.sequence.value).toEqual(['a', 'a']); // 序列不受影响
    });

    it('序列与挂饰同有该素材：优先动序列，挂饰不动', () => {
        const d = setup([mat('a'), pendant('p')]);
        d.appendBead('a');
        d.addDecor('p');
        d.removeOneMaterial('a');
        expect(d.sequence.value).toEqual([]);
        expect(d.decors.value).toHaveLength(1);
    });

    it('两处都没有：no-op 不抛错', () => {
        const d = setup([mat('a'), pendant('p')]);
        d.appendBead('a');
        d.addDecor('p');
        d.removeOneMaterial('x'); // 序列与挂饰都无 'x'
        expect(d.sequence.value).toEqual(['a']);
        expect(d.decors.value).toHaveLength(1);
    });

    it('逐颗减到 0：低于 free 最小 2 颗恢复 diy.needMain（CTA 置灰）', () => {
        const d = setup([mat('a')]);
        ['a', 'a', 'a', 'a'].forEach(id => d.appendBead(id));
        d.removeOneMaterial('a'); // 3 颗
        expect(d.canSave.value).toBe(true);
        d.removeOneMaterial('a'); // 2 颗（free 最小可保存）
        expect(d.canSave.value).toBe(true);
        d.removeOneMaterial('a'); // 1 颗 → 低于最小 2 颗
        expect(d.validationKey.value).toBe('diy.needMain');
        d.removeOneMaterial('a'); // 0 颗
        expect(d.sequence.value).toEqual([]);
        expect(d.canSave.value).toBe(false);
    });
});

describe('步进器「＋」/ ×N 徽标数据源（BOM 同源口径）', () => {
    it('重复追加同素材：BOM 按 materialId 聚合 qty（×N 徽标与统计胶囊同源）', () => {
        const d = setup([mat('a'), mat('b')]);
        d.appendBead('a');
        d.appendBead('a');
        d.appendBead('b');
        const bom = d.result.value.bom!;
        const itemA = bom.items.find(i => i.materialId === 'a');
        expect(itemA?.qty).toBe(2);
        expect(bom.totalCount).toBe(3);
        expect(bom.totalAmount).toBe(300); // 3 × 100 分
    });

    it('挂饰入 BOM 计价（qty 聚合）但不进几何环', () => {
        const d = setup([mat('a'), pendant('p')]);
        d.appendBead('a');
        d.appendBead('a');
        d.addDecor('p');
        d.addDecor('p');
        const bom = d.result.value.bom!;
        expect(bom.items.find(i => i.materialId === 'p')?.qty).toBe(2);
        expect(bom.totalCount).toBe(4);       // 2 珠 + 2 挂饰（计价口径）
        expect(d.previewBeads.value).toHaveLength(2); // 几何环只有 2 颗珠
    });

    it('「−」减一颗：BOM 数量与金额同步下降（¥3.6 → ¥2.4 场景）', () => {
        const d = setup([mat('a'), mat('b'), mat('c')]);
        ['a', 'b', 'c'].forEach(id => d.appendBead(id));
        expect(d.result.value.bom!.totalAmount).toBe(300);
        d.removeOneMaterial('c');
        const bom = d.result.value.bom!;
        expect(bom.items.some(i => i.materialId === 'c')).toBe(false);
        expect(bom.totalCount).toBe(2);
        expect(bom.totalAmount).toBe(200);
    });
});

describe('分模式素材桶隔离', () => {
    it('free → byCount：virgin 桶一次性按序列聚合拷贝（qty=颗数）', () => {
        const d = setup([mat('a'), mat('b')]);
        ['a', 'a', 'b'].forEach(id => d.appendBead(id));
        d.setMode('byCount');
        expect(d.slots.value).toEqual([
            { role: 'main', materialId: 'a', qtyOverride: 2 },
            { role: 'main', materialId: 'b', qtyOverride: 1 },
        ]);
    });

    it('序列 <2 颗：切专业模式不拷贝（保持原始空桶）', () => {
        const d = setup([mat('a')]);
        d.appendBead('a');
        d.setMode('byCount');
        expect(d.slots.value).toHaveLength(1);
        expect(d.slots.value[0].materialId).toBeUndefined();
    });

    it('byCount → pattern：专业模式之间零带入', () => {
        const d = setup([mat('a')]);
        ['a', 'a'].forEach(id => d.appendBead(id));
        d.setMode('byCount');
        d.setMode('pattern');
        expect(d.slots.value).toHaveLength(1);
        expect(d.slots.value[0].materialId).toBeUndefined();
    });

    it('两模式各自独立演进：往返编辑互不覆盖', () => {
        const d = setup([mat('a'), mat('b')]);
        ['a', 'a'].forEach(id => d.appendBead(id));
        d.setMode('byCount');
        d.patchSlot(0, { qtyOverride: 5 });
        d.setMode('pattern');
        d.assignSlot(0, 'b');
        d.setMode('byCount');
        expect(d.slots.value[0]).toMatchObject({ materialId: 'a', qtyOverride: 5 });
        d.setMode('pattern');
        expect(d.slots.value[0]).toMatchObject({ materialId: 'b' });
    });

    it('挂饰挂位随模式隔离；decors setter 固定写 free 桶（草稿恢复语义）', () => {
        const d = setup([mat('a'), pendant('p')]);
        d.addDecor('p'); // 进 free 桶
        d.setMode('pattern');
        d.addDecor('p'); // 进 pattern 桶
        expect(d.decors.value).toHaveLength(1);
        d.setMode('free');
        expect(d.decors.value).toHaveLength(1); // free 桶挂饰仍在
        d.setMode('byCount');
        d.decors.value = []; // setter 指 free 桶
        d.setMode('free');
        expect(d.decors.value).toHaveLength(0);
    });

    it('clearAll：重置全部模式桶 + 清序列 + 回 free', () => {
        const d = setup([mat('a'), pendant('p')]);
        ['a', 'a'].forEach(id => d.appendBead(id));
        d.addDecor('p');
        d.setMode('byCount');
        d.assignSlot(0, 'a');
        d.patchSlot(0, { qtyOverride: 3 });
        d.clearAll();
        expect(d.mode.value).toBe('free');
        expect(d.sequence.value).toEqual([]);
        expect(d.decors.value).toHaveLength(0);
        expect(d.slots.value).toHaveLength(1);
        expect(d.slots.value[0].materialId).toBeUndefined();
    });
});
