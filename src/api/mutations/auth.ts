import { useTenantStore } from '../../stores/tenant';
import { useAuthStore } from '../../stores/auth';
import { setSessionToken, getShopApiUrl, getShopApiHeaders } from '../client';

interface AuthResult {
    token: string;
    userId: string;
    identifier: string;
}

interface GraphQLError {
    errorCode: string;
    message: string;
}

/** Execute a GraphQL mutation and extract vendure-auth-token from response header */
function authRequest(query: string, variables?: Record<string, any>): Promise<{ data: any; authToken?: string }> {
    return new Promise((resolve, reject) => {
        uni.request({
            url: getShopApiUrl(),
            method: 'POST',
            header: getShopApiHeaders(),
            data: { query, variables },
            success: (res: any) => {
                const authToken = res.header['vendure-auth-token'] || res.header['Vendure-Auth-Token'] || '';
                // Persist session token from response (covers anonymous session creation & reissue)
                if (authToken) {
                    setSessionToken(authToken);
                }
                // nginx IP 级限流：超限返回 HTTP 429（响应体通常不是 GraphQL JSON），
                // 必须显式抛出，否则解包后 data 为空、登录页会静默无反应。
                if (Number(res.statusCode) === 429) {
                    const err: any = new Error('TOO_MANY_REQUESTS');
                    err.code = 'TOO_MANY_REQUESTS';
                    reject(err);
                    return;
                }
                // res.data 是完整 GraphQL 响应体 { data: {...}, errors?: [...] }
                // 解包返回 data 字段（GraphQL 查询结果），与 graphql-request 行为一致
                const body = res.data || {};
                if (body.errors && body.errors.length > 0) {
                    const first = body.errors[0] || {};
                    const err: any = new Error(first.message || '登录失败');
                    // 保留 extensions.code / retryAfterSeconds：登录限流（LOGIN_RATE_LIMITED）提示依赖它们
                    err.code = first.extensions?.code || first.errorCode || '';
                    const retryAfter = first.extensions?.retryAfterSeconds ?? first.retryAfterSeconds;
                    if (retryAfter != null) err.retryAfterSeconds = Number(retryAfter);
                    reject(err);
                    return;
                }
                resolve({ data: body.data, authToken });
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
        const err: any = new Error(data.login.message);
        // 保留 errorCode：登录页据此做本地化提示（如 INVALID_CREDENTIALS_ERROR）
        err.code = data.login.errorCode;
        throw err;
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

export async function ssoLogin(providerKey: string, code: string): Promise<AuthResult> {
    const { data, authToken } = await authRequest(
        `mutation Authenticate($input: AuthenticationInput!) {
            authenticate(input: $input) {
                ... on CurrentUser { id identifier }
                ... on ErrorResult { errorCode message }
            }
        }`,
        { input: { sso: { providerKey, code } } }
    );
    if (data?.authenticate?.errorCode) {
        throw new Error(data.authenticate.message);
    }
    return { token: authToken || '', userId: data?.authenticate?.id || '', identifier: data?.authenticate?.identifier || '' };
}

/** SSO 统一页（h.joho.cn）token 直验：统一页登录成功回跳携带 accessToken，直验换 Vendure 会话 */
export async function authenticateSsoWithToken(providerKey: string, accessToken: string): Promise<AuthResult> {
    const { data, authToken } = await authRequest(
        `mutation Authenticate($input: AuthenticationInput!) {
            authenticate(input: $input) {
                ... on CurrentUser { id identifier }
                ... on ErrorResult { errorCode message }
            }
        }`,
        { input: { sso: { providerKey, accessToken } } }
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
    phoneNumber?: string;
    code?: string;
    emailAddress?: string;
    password: string;
    referredBy?: string;
}): Promise<any> {
    const { data } = await authRequest(
        `mutation Register($input: RegisterCustomerInput!) {
            registerCustomerAccount(input: $input) {
                ...on Success { success }
                ...on MissingPasswordError { errorCode message }
                ...on PasswordValidationError { errorCode message validationErrorMessage }
                ...on NativeAuthStrategyError { errorCode message }
            }
        }`,
        { input }
    );
    return data;
}

export async function resetPasswordWithPhoneCode(phoneNumber: string, code: string, newPassword: string): Promise<boolean> {
    const { data } = await authRequest(
        `mutation ResetPwd($phoneNumber: String!, $code: String!, $newPassword: String!) {
            resetPasswordWithPhoneCode(phoneNumber: $phoneNumber, code: $code, newPassword: $newPassword)
        }`,
        { phoneNumber, code, newPassword }
    );
    return data?.resetPasswordWithPhoneCode ?? false;
}

export async function logout(): Promise<void> {
    const { data } = await authRequest(`mutation { logout { success } }`);
}

type UpdateCustomerPasswordResult =
    | { __typename: 'Success' }
    | { __typename: 'InvalidCredentialsError'; errorCode: string; message: string }
    | { __typename: 'PasswordValidationError'; errorCode: string; message: string }
    | { __typename: 'NativeAuthStrategyError'; errorCode: string; message: string };

export async function updateCustomerPassword(currentPassword: string, newPassword: string): Promise<UpdateCustomerPasswordResult> {
    const { data } = await authRequest(
        `mutation UpdateCustomerPassword($currentPassword: String!, $newPassword: String!) {
            updateCustomerPassword(currentPassword: $currentPassword, newPassword: $newPassword) {
                __typename
                ... on ErrorResult { errorCode message }
            }
        }`,
        { currentPassword, newPassword }
    );
    return data?.updateCustomerPassword as UpdateCustomerPasswordResult;
}
