<template>
  <view class="invoice-list">
    <view v-if="invoices.length === 0" class="empty">
      <text>A02</text>
      <text class="empty__text">{{ t('invoices.empty') }}</text>
    </view>
    <view v-else class="invoice-card" v-for="inv in invoices" :key="inv.id">
      <view class="invoice-card__head">
        <text class="invoice-card__type">{{ inv.invoiceType === 'special' ? t('invoiceApply.typeSpecial') : t('invoiceApply.typeOrdinary') }}</text>
        <text class="invoice-card__status" :class="'status--' + inv.status">{{ statusText(inv.status) }}</text>
      </view>
      <view class="invoice-card__body">
        <text class="invoice-card__title">{{ inv.title }}</text>
        <text v-if="inv.taxNumber" class="invoice-card__tax">{{ t('invoiceTitles.taxNoLabel') }} {{ inv.taxNumber }}</text>
        <text class="invoice-card__amount">{{ t('invoices.totalAmount', { amount: (inv.amount / 100).toFixed(2) }) }}</text>
        <text v-if="inv.totals" class="invoice-card__split">
          {{ t('invoices.taxSplit', { ex: (inv.totals.totalExcludingTax / 100).toFixed(2), tax: (inv.totals.totalTax / 100).toFixed(2) }) }}
        </text>
        <text class="invoice-card__no" v-if="inv.invoiceNo || inv.providerInvoiceNo">{{ t('invoices.invoiceNo', { no: inv.invoiceNo || inv.providerInvoiceNo }) }}</text>
        <text class="invoice-card__time">{{ t('invoices.applyTime', { time: formatTime(inv.createdAt) }) }}</text>
        <view class="invoice-card__lines" v-if="inv.lines && inv.lines.length">
          <view class="lines-toggle" @click="toggleLines(inv.id)">{{ t('invoices.linesCount', { n: inv.lines.length }) }}{{ openLines[inv.id] ? t('review.collapse') : t('review.expand') }}</view>
          <view class="lines-body" v-if="openLines[inv.id]">
            <view class="line-row" v-for="(l, i) in inv.lines" :key="i">
              <view class="line-row__main">
                <text class="line-row__name">{{ l.name }}</text>
                <text class="line-row__sku">{{ l.sku || '' }} × {{ l.quantity }}</text>
              </view>
              <view class="line-row__amt">
                <text>¥{{ (l.amountWithTax / 100).toFixed(2) }}</text>
                <text class="line-row__tax">{{ t('invoices.taxRateAmount', { rate: l.taxRate, tax: (l.taxAmount / 100).toFixed(2) }) }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
      <view class="invoice-card__actions">
        <button v-if="inv.pdfUrl && inv.status === 'issued'" class="card-btn card-btn--primary" @click="download(inv)">{{ t('invoices.downloadPdf') }}</button>
        <text v-else-if="inv.status === 'pending'" class="card-btn-hint">{{ t('invoices.pendingIssue') }}</text>
        <text v-else-if="inv.status === 'reversed'" class="card-btn-hint">{{ t('invoices.reversed') }}</text>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getMyInvoices } from '../../api/queries/invoice';
import { downloadInvoicePdf } from '../../api/mutations/invoice';
const { t } = useI18n();
const invoices = ref<any[]>([]);
const openLines = ref<Record<string, boolean>>({});
// 发票状态 → i18n key
const STATUS_KEY: Record<string, string> = { pending: 'invoices.statusPending', issued: 'invoices.statusIssued', reversed: 'invoices.statusReversed' };
function statusText(s: string) { const k = STATUS_KEY[s]; return k ? t(k) : s; }
function formatTime(t: string) { return t ? new Date(t).toLocaleString('zh-CN') : ''; }
function toggleLines(id: string) { openLines.value[id] = !openLines.value[id]; }

onMounted(async () => {
    try { const res: any = await getMyInvoices(); invoices.value = res.myInvoices || []; } catch (e) { console.error(e); }
});

async function download(inv: any) {
    try {
        const res: any = await downloadInvoicePdf(inv.id);
        const url = res?.downloadInvoicePdf?.pdfUrl;
        if (!url) { uni.showToast({ title: t('invoices.noPdf'), icon: 'none' }); return; }
        const apiBase = (import.meta.env?.VITE_API_URL || 'http://localhost:3000');
        const abs = url.startsWith('http') ? url : apiBase + '/' + url.replace(/^\/+/, '');
        uni.showLoading({ title: t('invoices.downloading') });
        uni.downloadFile({
            url: abs,
            success: (r: any) => {
                uni.hideLoading();
                if (r.statusCode === 200) {
                    uni.openDocument({ filePath: r.tempFilePath, showMenu: true, fail: () => uni.showToast({ title: t('invoices.noPreview'), icon: 'none' }) });
                } else { uni.showToast({ title: t('invoices.downloadFailed'), icon: 'none' }); }
            },
            fail: () => { uni.hideLoading(); uni.showToast({ title: t('invoices.downloadFailed'), icon: 'none' }); },
        });
    } catch (e: any) { uni.showToast({ title: e?.message || t('invoices.downloadFailed'), icon: 'none' }); }
}
</script>
<style lang="scss" scoped>
.invoice-list { padding: 20rpx 0 40rpx; }
.empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 0; color: #ccc; font-size: 80rpx; &__text { font-size: 26rpx; color: #999; margin-top: 20rpx; } }
.invoice-card { background: #fff; margin: 20rpx; border-radius: $radius-md; padding: 30rpx; &__head { display: flex; justify-content: space-between; align-items: center; } &__type { font-size: 30rpx; font-weight: bold; } &__status { font-size: 24rpx; padding: 4rpx 16rpx; border-radius: 20rpx; &.status--issued { background: #e6fff0; color: #07c160; } &.status--pending { background: #fff3e6; color: $brand-color; } &.status--reversed { background: #f2f2f2; color: #999; } }
  &__body { margin-top: 20rpx; display: flex; flex-direction: column; gap: 8rpx; } &__title { font-size: 28rpx; } &__tax, &__no, &__time, &__split { font-size: 24rpx; color: $text-color-secondary; } &__amount { font-size: 32rpx; color: $price-color; margin: 8rpx 0; }
  &__lines { margin-top: 16rpx; border-top: 1rpx solid $border-color; padding-top: 16rpx; } .lines-toggle { font-size: 26rpx; color: $brand-color; } .lines-body { margin-top: 12rpx; } .line-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 12rpx 0; border-bottom: 1rpx solid #f2f2f2; &__main { display: flex; flex-direction: column; gap: 4rpx; } &__name { font-size: 26rpx; } &__sku { font-size: 22rpx; color: $text-color-secondary; } &__amt { display: flex; flex-direction: column; align-items: flex-end; gap: 4rpx; font-size: 26rpx; } &__tax { font-size: 22rpx; color: $text-color-secondary; } }
  &__actions { margin-top: 20rpx; display: flex; justify-content: flex-end; } }
.card-btn { height: 68rpx; font-size: 26rpx; border-radius: $radius-md; padding: 0 36rpx; border: none; &--primary { background: $brand-color; color: #fff; } }
.card-btn-hint { font-size: 26rpx; color: #999; align-self: center; }
</style>