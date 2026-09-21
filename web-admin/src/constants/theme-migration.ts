// 旧 themeId（channel.customFields.themeId → C 端 data-theme）→ L3 令牌覆盖 迁移映射。
// 仅覆盖 V 端实际存在的 3 个色卡（taobao-orange / jd-red / modern-minimal）；
// brand / default / 空值 不产生覆盖（迁移后仅清空 themeId）。
export interface ThemeIdMigrationResult {
  themeTokensOverride: Record<string, any> | null;
  matched: boolean;
}

const MAP: Record<string, { primaryColor: string; radius: number }> = {
  'taobao-orange': { primaryColor: '#FF5000', radius: 8 },
  'jd-red': { primaryColor: '#E1251B', radius: 6 },
  'modern-minimal': { primaryColor: '#111827', radius: 6 },
};

/** themeId 是否为「需要迁移的旧版主题」（brand/default/空 → false） */
export function isLegacyThemeId(themeId: string | null | undefined): boolean {
  const id = (themeId ?? '').trim();
  return !!id && id !== 'brand' && id !== 'default';
}

/** 生成迁移结果；未命中映射表时 matched=false（只清空 themeId，不写覆盖） */
export function buildThemeIdMigration(themeId: string | null | undefined): ThemeIdMigrationResult {
  const id = (themeId ?? '').trim();
  const hit = MAP[id];
  if (!hit) return { themeTokensOverride: null, matched: false };
  return { themeTokensOverride: { ...hit }, matched: true };
}
