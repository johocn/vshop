export const AUTH_TOKEN_KEY = 'wa_auth_token';
export const CHANNEL_TOKEN_KEY = 'wa_channel_token';
export const CHANNEL_CODE_KEY = 'wa_channel_code';
export const USER_ID_KEY = 'wa_user_id';

type StorageLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };

function createBrowserStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') {
      return {
        getItem: (k) => localStorage.getItem(k),
        setItem: (k, v) => localStorage.setItem(k, v),
      };
    }
  } catch { /* ignore */ }
  return { getItem: () => '', setItem: () => {} };
}

let storage: StorageLike = createBrowserStorage();

export function setSessionStorage(s: StorageLike): void { storage = s; }

export function getAuthToken(): string { return storage.getItem(AUTH_TOKEN_KEY) ?? ''; }
export function setAuthToken(t: string): void { storage.setItem(AUTH_TOKEN_KEY, t); }
export function getUserId(): string { return storage.getItem(USER_ID_KEY) ?? ''; }
export function setUserId(id: string): void { storage.setItem(USER_ID_KEY, id); }
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
  storage.setItem(USER_ID_KEY, '');
}