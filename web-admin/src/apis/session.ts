export const AUTH_TOKEN_KEY = 'wa_auth_token';
export const CHANNEL_TOKEN_KEY = 'wa_channel_token';
export const CHANNEL_CODE_KEY = 'wa_channel_code';

let storage: { getItem(k: string): string | null; setItem(k: string, v: string): void } = {
  getItem: () => '',
  setItem: () => {},
};

export function setSessionStorage(s: typeof storage): void { storage = s; }

export function getAuthToken(): string { return storage.getItem(AUTH_TOKEN_KEY) ?? ''; }
export function setAuthToken(t: string): void { storage.setItem(AUTH_TOKEN_KEY, t); }
export function setChannelInfo(code: string, token: string): void {
  storage.setItem(CHANNEL_CODE_KEY, code);
  storage.setItem(CHANNEL_TOKEN_KEY, token);
}
export function getChannelToken(): string { return storage.getItem(CHANNEL_TOKEN_KEY) ?? ''; }
export function getChannelCode(): string { return storage.getItem(CHANNEL_CODE_KEY) ?? ''; }
export function clearSession(): void {
  storage.setItem(AUTH_TOKEN_KEY, '');
  storage.setItem(CHANNEL_CODE_KEY, '');
  storage.setItem(CHANNEL_TOKEN_KEY, '');
}