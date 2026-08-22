import { getGraphQLClient } from '../client';

/** C端申请发票（进入 pending，由后台 issue 后生成 PDF） */
export async function createInvoice(input: any) {
    const client = getGraphQLClient();
    return client.request(
        `mutation CreateInvoice($input: CreateInvoiceInput!) { createInvoice(input: $input) { id invoiceType status title taxNumber email amount pdfUrl providerInvoiceNo invoiceNo lines { orderId orderCode sku name quantity unitPrice unitPriceWithTax amount taxRate taxAmount amountWithTax } totals { totalExcludingTax totalTax totalWithTax } issuedAt reversedAt createdAt } }`,
        { input },
    );
}

/** 取发票 PDF 下载地址（幂等，不重复生成） */
export async function downloadInvoicePdf(id: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation DownloadInvoicePdf($id: ID!) { downloadInvoicePdf(id: $id) { id status pdfUrl providerInvoiceNo } }`,
        { id },
    );
}

/** 新增发票抬头 */
export async function createInvoiceTitle(input: any) {
    const client = getGraphQLClient();
    return client.request(
        `mutation CreateInvoiceTitle($input: CreateInvoiceTitleInput!) { createInvoiceTitle(input: $input) { id title taxNumber email companyAddress companyPhone bankName bankAccount isDefault } }`,
        { input },
    );
}

/** 编辑发票抬头 */
export async function updateInvoiceTitle(id: string, input: any) {
    const client = getGraphQLClient();
    return client.request(
        `mutation UpdateInvoiceTitle($id: ID!, $input: UpdateInvoiceTitleInput!) { updateInvoiceTitle(id: $id, input: $input) { id title taxNumber email isDefault } }`,
        { id, input },
    );
}

/** 设为默认抬头 */
export async function setDefaultInvoiceTitle(id: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation SetDefaultInvoiceTitle($id: ID!) { setDefaultInvoiceTitle(id: $id) { id isDefault } }`,
        { id },
    );
}

/** 删除抬头 */
export async function deleteInvoiceTitle(id: string) {
    const client = getGraphQLClient();
    return client.request(`mutation DeleteInvoiceTitle($id: ID!) { deleteInvoiceTitle(id: $id) }`, { id });
}