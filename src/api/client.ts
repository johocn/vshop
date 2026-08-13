import { GraphQLClient } from 'graphql-request';
import { useTenantStore } from '../stores/tenant';
import { useAuthStore } from '../stores/auth';

const API_URL = (import.meta.env?.VITE_API_URL || 'http://localhost:3000') + '/shop-api';
const SESSION_TOKEN_KEY = 'vendure_session_token';
const AUTH_TOKEN_HEADER = 'vendure-auth-token';

export function getSessionToken(): string {
    return uni.getStorageSync(SESSION_TOKEN_KEY) || '';
}

export function setSessionToken(token: string) {
    if (token) {
        uni.setStorageSync(SESSION_TOKEN_KEY, token);
    } else {
        uni.removeStorageSync(SESSION_TOKEN_KEY);
    }
}

// Capture session token from vendure-auth-token response header
const customFetch: typeof fetch = (input, init) => {
    return fetch(input, init).then((response) => {
        const token = response.headers.get(AUTH_TOKEN_HEADER);
        if (token) {
            setSessionToken(token);
        }
        return response;
    });
};

let clientInstance: GraphQLClient | null = null;
const inFlight = new Map<string, Promise<any>>();

export function getGraphQLClient(): GraphQLClient {
    if (!clientInstance) {
        clientInstance = new GraphQLClient(API_URL, {
            fetch: customFetch as any,
            headers: {},
        });
    }
    // Update headers on each access
    const tenantStore = useTenantStore();
    const authStore = useAuthStore();
    const headers: Record<string, string> = {
        'vendure-channel-token': tenantStore.token,
    };
    if (authStore.token) {
        headers['Authorization'] = 'Bearer ' + authStore.token;
    } else {
        const sessionToken = getSessionToken();
        if (sessionToken) {
            headers['Authorization'] = 'Bearer ' + sessionToken;
        }
    }
    clientInstance.setHeaders(headers);
    return clientInstance;
}

/** Deduplicate identical in-flight requests */
export function deduped<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (inFlight.has(key)) return inFlight.get(key) as Promise<T>;
    const promise = fn().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
}

/** Reset client (e.g. after tenant switch) */
export function resetClient() {
    clientInstance = null;
}
