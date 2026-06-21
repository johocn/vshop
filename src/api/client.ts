import { GraphQLClient } from 'graphql-request';
import { useTenantStore } from '../stores/tenant';
import { useAuthStore } from '../stores/auth';

const API_URL = (import.meta.env?.VITE_API_URL || 'http://localhost:3000') + '/shop-api';

let clientInstance: GraphQLClient | null = null;
const inFlight = new Map<string, Promise<any>>();

export function getGraphQLClient(): GraphQLClient {
    if (!clientInstance) {
        clientInstance = new GraphQLClient(API_URL, { headers: {} });
    }
    // Update headers on each access
    const tenantStore = useTenantStore();
    const authStore = useAuthStore();
    const headers: Record<string, string> = {
        'vendure-token': tenantStore.token,
    };
    if (authStore.token) {
        headers['Authorization'] = 'Bearer ' + authStore.token;
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
