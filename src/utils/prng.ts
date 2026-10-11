/**
 * 确定性伪随机：同一种子永远产出同一序列。
 * 用于珠子纹理旋转 / 随机混色，保证"同一方案每次渲染结果一致"。
 */

/** 把字符串或数字散列成 32 位整型种子 */
export function xmur3(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

/** mulberry32：快速、质量足够的 32 位 PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 便捷：根据种子构造一个取值 [0,1) 的随机函数 */
export function rngFromSeed(seed: number | string): () => number {
  const s = typeof seed === 'string' ? xmur3(seed) : seed >>> 0
  return mulberry32(s)
}

/** 把 [0,1) 映射到整数区间 [min, max] */
export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}
