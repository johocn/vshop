import { useTenantStore } from '../../stores/tenant';

const API_URL = (import.meta.env?.VITE_API_URL || 'http://localhost:3000') + '/shop-api';

interface AuthResult {
    token: string;
    userId: string;
    identifier: string;
}

interface GraphQLError {
    errorCode: string;
    message: string;
}

function getAuthHeaders(): Record<string, string> {
    const tenantStore = useTenantStore();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (tenantStore.token) {
        headers['vendure-token'] = tenantStore.token;
    }
    return headers;
}

/** Execute a GraphQL mutation and extract vendure-auth-token from response header */
function authRequest(query: string, variables?: Record<string, any>): Promise<{ data: any; authToken?: string }> {
    return new Promise((resolve, reject) => {
        uni.request({
            url: API_URL,
            method: 'POST',
            header: getAuthHeaders(),
            data: { query, variables },
            success: (res: any) => {
                const authToken = res.header['vendure-auth-token'] || res.header['Vendure-Auth-Token'] || '';
                resolve({ data: res.data, authToken });
            },
            fail: (err: any) => reject(err),
        });
    });
}

export async function login(username: string, password: string): Promise<AuthResult> {
    const { data, authToken } = await authRequest(
        `mutation Login($username: String!, $password: String!) {
            login(username: $username, password: $password) {
                ... on CurrentUser { id identifier }
                ... on ErrorResult { errorCode message }
            }
        }`,
        { username, password }
    );
    if (data?.login?.errorCode) {
        throw new Error(data.login.message);
    }
    return { token: authToken || '', userId: data?.login?.id || '', identifier: data?.login?.identifier || '' };
}

export async function authenticateWithPhone(phoneNumber: string, verificationCode: string): Promise<AuthResult> {
    const { data, authToken } = await authRequest(
        `mutation Authenticate($input: AuthenticationInput!) {
            authenticate(input: $input) {
                ... on CurrentUser { id identifier }
                ... on ErrorResult { errorCode message }
            }
        }`,
        { input: { phone: { phoneNumber, code: verificationCode } } }
    );
    if (data?.authenticate?.errorCode) {
        throw new Error(data.authenticate.message);
    }
    return { token: authToken || '', userId: data?.authenticate?.id || '', identifier: data?.authenticate?.identifier || '' };
}

export async function authenticateWithWechat(code: string, type: string = 'mp'): Promise<AuthResult> {
    const { data, authToken } = await authRequest(
        `mutation Authenticate($input: AuthenticationInput!) {
            authenticate(input: $input) {
                ... on CurrentUser { id identifier }
                ... on ErrorResult { errorCode message }
            }
        }`,
        { input: { wechat: { code, type } } }
    );
    if (data?.authenticate?.errorCode) {
        throw new Error(data.authenticate.message);
    }
    return { token: authToken || '', userId: data?.authenticate?.id || '', identifier: data?.authenticate?.identifier || '' };
}

export async function authenticateWithAlipay(authCode: string, type: string = 'h5'): Promise<AuthResult> {
    const { data, authToken } = await authRequest(
        `mutation Authenticate($input: AuthenticationInput!) {
            authenticate(input: $input) {
                ... on CurrentUser { id identifier }
                ... on ErrorResult { errorCode message }
            }
        }`,
        { input: { alipay: { authCode, type } } }
    );
    if (data?.authenticate?.errorCode) {
        throw new Error(data.authenticate.message);
    }
    return { token: authToken || '', userId: data?.authenticate?.id || '', identifier: data?.authenticate?.identifier || '' };
}

export async function authenticateWithDouyin(code: string, type: string = 'h5'): Promise<AuthResult> {
    const { data, authToken } = await authRequest(
        `mutation Authenticate($input: AuthenticationInput!) {
            authenticate(input: $input) {
                ... on CurrentUser { id identifier }
                ... on ErrorResult { errorCode message }
            }
        }`,
        { input: { douyin: { code, type } } }
    );
    if (data?.authenticate?.errorCode) {
        throw new Error(data.authenticate.message);
    }
    return { token: authToken || '', userId: data?.authenticate?.id || '', identifier: data?.authenticate?.identifier || '' };
}

export async function sendPhoneVerificationCode(phoneNumber: string): Promise<boolean> {
    const { data } = await authRequest(
        `mutation SendPhoneCode($phoneNumber: String!) { sendPhoneVerificationCode(phoneNumber: $phoneNumber) }`,
        { phoneNumber }
    );
    return data?.sendPhoneVerificationCode ?? false;
}

export async function registerCustomer(input: {
    phoneNumber: string;
    code: string;
    password: string;
    emailAddress?: string;
}): Promise<any> {
    const { data } = await authRequest(
        `mutation Register($input: RegisterCustomerInput!) {
            registerCustomer(input: $input) {
                ... on RegisterSuccess { success }
                ... on InvalidCredentialsError { errorCode message }
                ... on PasswordValidationError { errorCode message }
            }
        }`,
        { input }
    );
    return data;
}

export async function logout(): Promise<void> {
    const { data } = await authRequest(`mutation { logout { success } }`);
}
