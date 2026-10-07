import { getAdminClient } from './client';

export interface PaymentTimeoutTaskRow {
    id: string; orderId: string; channelId: string;
    orderCode: string | null; orderState: string | null;
    type: 'REMIND' | 'CANCEL';
    status: 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'FAILED';
    dueAt: string; retryCount: number; lastError: string | null;
}
export interface PaymentTimeoutStats { todayRemind: number; todayCancel: number; totalFailed: number; pendingOverdue: number; }

export async function fetchPaymentTimeoutTasks(opts: { status?: string; type?: string; from?: string; to?: string; skip?: number; take?: number }) {
    const res = await getAdminClient().request<any>(`
        query($status: String, $type: String, $from: DateTime, $to: DateTime, $skip: Int, $take: Int) {
            paymentTimeoutTasks(status: $status, type: $type, from: $from, to: $to, skip: $skip, take: $take) {
                items { id orderId channelId orderCode orderState type status dueAt retryCount lastError }
                total
            }
        }`, opts as any);
    return res.paymentTimeoutTasks as { items: PaymentTimeoutTaskRow[]; total: number };
}

export async function fetchPaymentTimeoutStats(): Promise<PaymentTimeoutStats> {
    const res = await getAdminClient().request<any>(`query { paymentTimeoutStats { todayRemind todayCancel totalFailed pendingOverdue } }`);
    return res.paymentTimeoutStats;
}

export async function executePaymentTimeoutTask(id: string): Promise<void> {
    await getAdminClient().request<any>(`mutation($id: ID!) { executePaymentTimeoutTask(id: $id) { id status } }`, { id });
}

export async function resendPaymentTimeoutRemind(taskId: string): Promise<void> {
    await getAdminClient().request<any>(`mutation($taskId: ID!) { resendPaymentTimeoutRemind(taskId: $taskId) }`, { taskId });
}

export async function runPaymentTimeoutCompensation(): Promise<number> {
    const res = await getAdminClient().request<any>(`mutation { runPaymentTimeoutCompensation }`);
    return res.runPaymentTimeoutCompensation as number;
}
