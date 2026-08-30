import { i18n } from '../i18n';

export function vendorLangCode(): string {
    const l = String((i18n.global as any)?.locale?.value ?? 'zh-CN').toLowerCase();
    if (l.startsWith('zh')) return 'zh_Hans';
    return l.startsWith('en') ? 'en' : 'zh_Hans';
}

export function pickTranslation(
    translations: Array<{ languageCode: string; description?: string }> = [],
): string {
    const code = vendorLangCode();
    const hit = translations.find((t) => t.languageCode === code);
    const zh = translations.find((t) => t.languageCode === 'zh_Hans');
    const first = translations[0];
    return hit?.description ?? zh?.description ?? first?.description ?? '';
}