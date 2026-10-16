import { describe, it, expect } from 'vitest';
import { isValidShopContent } from '../templates/shared/schema';

const base = { version: 1 };
describe('新楼层类型校验', () => {
  it('video：缺 videoUrl 拒绝', () => {
    expect(isValidShopContent({ ...base, sections: [{ type: 'video', poster: 'a.png' }] } as any)).toBe(false);
  });
  it('video：合法通过', () => {
    expect(isValidShopContent({ ...base, sections: [{ type: 'video', videoUrl: 'https://x/a.mp4', poster: 'https://x/p.png' }] } as any)).toBe(true);
  });
  it('coupon/pointsGoods：均合法（字段全可选）', () => {
    expect(isValidShopContent({ ...base, sections: [{ type: 'coupon' }, { type: 'pointsGoods' }] } as any)).toBe(true);
  });
  it('未知 type 仍整单拒绝（parseShopContent 语义不变，渲染层另有过滤）', () => {
    expect(isValidShopContent({ ...base, sections: [{ type: 'mystery' }] } as any)).toBe(false);
  });
});
