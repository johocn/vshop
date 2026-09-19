// 项目未配置 vitest，使用 node:test + tsx 临时运行（npx tsx --test src/utils/orderListConfig.test.ts）
// @ts-nocheck 项目未装 @types/node，node:test 类型不在 tsconfig types 环境内；运行由 tsx 保证
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLayout, parseOrderListConfig } from './orderListConfig';

describe('parseLayout', () => {
  it('合法 key 原样返回', () => {
    assert.equal(parseLayout('status-first'), 'status-first');
  });
  it('非法值回退默认 classic', () => {
    assert.equal(parseLayout('bogus'), 'classic');
    assert.equal(parseLayout(null), 'classic');
    assert.equal(parseLayout(123), 'classic');
  });
});

describe('parseOrderListConfig', () => {
  it('坏 JSON 回退默认', () => {
    const c = parseOrderListConfig('{oops');
    assert.equal(c.layout, 'classic');
    assert.equal(c.blocks.showAddress, true);
  });
  it('缺字段回退默认', () => {
    const c = parseOrderListConfig('{}');
    assert.equal(c.layout, 'classic');
  });
  it('页面配置覆盖 layout 与 blocks', () => {
    const c = parseOrderListConfig('{"layout":"status-group","blocks":{"showAddress":false}}');
    assert.equal(c.layout, 'status-group');
    assert.equal(c.blocks.showAddress, false);
    assert.equal(c.blocks.stateColors, true); // 未覆盖字段保持默认
  });
});
