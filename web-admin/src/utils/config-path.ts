/** 点路径读写（结构化表单 ↔ JSON 双向同步用）。坏路径返回 undefined，写入时按需建中间对象。 */
export function getByPath(obj: Record<string, any> | null | undefined, path: string): unknown {
  if (!obj) return undefined;
  return path.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

export function setByPath(obj: Record<string, any>, path: string, value: unknown): Record<string, any> {
  const keys = path.split('.');
  const root: Record<string, any> = { ...(obj ?? {}) };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = typeof cur[k] === 'object' && cur[k] !== null ? { ...cur[k] } : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return root;
}