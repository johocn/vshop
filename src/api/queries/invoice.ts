import { getGraphQLClient } from '../client';

/** 我的发票列表 */
export async function getMyInvoices() {
    const client = getGraphQLClient();
    return client.request(
        `query MyInvoices { myInvoices { id invoiceType status title taxNumber email amount orderIds pdfUrl providerInvoiceNo issuedAt reversedAt createdAt } }`,
    );
}

/** 我的发票抬头列表 */
export async function getMyInvoiceTitles() {
    const client = getGraphQLClient();
    return client.request(
        `query MyInvoiceTitles { myInvoiceTitles { id title taxNumber email companyAddress companyPhone bankName bankAccount isDefault } }`,
    );
}