<template>
  <view v-if="visible" class="mask" @tap.self="close">
    <view class="modal">
      <view class="head">
        <text class="t">{{ $t('couponMarketing.title') }}</text>
        <text class="x" @tap="close">✕</text>
      </view>

      <view class="tabs">
        <text :class="{ on: tab === 'campaign' }" @tap="tab = 'campaign'">{{ $t('couponMarketing.tabCampaign') }}</text>
        <text :class="{ on: tab === 'fission' }" @tap="tab = 'fission'">{{ $t('couponMarketing.tabFission') }}</text>
      </view>

      <scroll-view scroll-y class="body">
        <!-- 新客 1 元购（FR-D，复用倒计时活动位） -->
        <template v-if="tab === 'campaign'">
          <view class="row-switch">
            <text class="lbl">{{ $t('couponMarketing.enabled') }}</text>
            <switch :checked="campaign.enabled" color="#e1251b" @change="(e: any) => (campaign.enabled = e.detail.value)" />
          </view>
          <view class="hint">{{ $t('couponMarketing.campaignHint') }}</view>
          <view class="field">
            <text class="lbl">{{ $t('couponMarketing.fieldName') }}</text>
            <input class="ipt" v-model="campaign.name" :placeholder="$t('couponMarketing.phName')" />
          </view>
          <view class="field">
            <text class="lbl">{{ $t('couponMarketing.fieldEndsAt') }}</text>
            <picker mode="date" :value="campaign.endsAt" @change="(e: any) => (campaign.endsAt = e.detail.value)">
              <view class="ipt">{{ campaign.endsAt || $t('couponMarketing.pickDate') }}</view>
            </picker>
          </view>
          <view class="field">
            <text class="lbl">{{ $t('couponMarketing.fieldTemplates') }}</text>
            <view class="tpl-list">
              <text
                v-for="t in campaignCandidates" :key="t.id"
                class="tpl-chip" :class="{ on: campaign.templateIds.includes(t.id) }"
                @tap="toggleCampaignTemplate(t.id)"
              >{{ t.name }}</text>
              <text v-if="!campaignCandidates.length" class="empty">{{ $t('couponMarketing.noSaleTemplates') }}</text>
            </view>
            <view class="hint">{{ $t('couponMarketing.priceHint') }}</view>
          </view>
          <view class="row-switch">
            <text class="lbl">{{ $t('couponMarketing.newCustomerOnly') }}</text>
            <switch :checked="campaign.newCustomerOnly" color="#e1251b" @change="(e: any) => (campaign.newCustomerOnly = e.detail.value)" />
          </view>
          <view class="hint">{{ $t('couponMarketing.newCustomerHint') }}</view>
        </template>

        <!-- 分享裂变（FR-C） -->
        <template v-else>
          <view class="row-switch">
            <text class="lbl">{{ $t('couponMarketing.enabled') }}</text>
            <switch :checked="fission.enabled" color="#e1251b" @change="(e: any) => (fission.enabled = e.detail.value)" />
          </view>
          <view class="hint">{{ $t('couponMarketing.fissionHint') }}</view>
          <view class="field">
            <text class="lbl">{{ $t('couponMarketing.fieldName') }}</text>
            <input class="ipt" v-model="fission.name" :placeholder="$t('couponMarketing.phName')" />
          </view>
          <view class="field">
            <text class="lbl">{{ $t('couponMarketing.fieldSubtitle') }}</text>
            <input class="ipt" v-model="fission.subtitle" :placeholder="$t('couponMarketing.phSubtitle')" />
          </view>
          <view class="field">
            <text class="lbl">{{ $t('couponMarketing.fieldRules') }}</text>
            <textarea class="ipt area" v-model="fission.rules" :placeholder="$t('couponMarketing.phRules')" />
          </view>
          <view class="field half">
            <view class="col">
              <text class="lbl">{{ $t('couponMarketing.fieldStartsAt') }}</text>
              <picker mode="date" :value="fission.startsAt" @change="(e: any) => (fission.startsAt = e.detail.value)">
                <view class="ipt">{{ fission.startsAt || $t('couponMarketing.pickDate') }}</view>
              </picker>
            </view>
            <view class="col">
              <text class="lbl">{{ $t('couponMarketing.fieldEndsAt') }}</text>
              <picker mode="date" :value="fission.endsAt" @change="(e: any) => (fission.endsAt = e.detail.value)">
                <view class="ipt">{{ fission.endsAt || $t('couponMarketing.pickDate') }}</view>
              </picker>
            </view>
          </view>
          <view class="field">
            <text class="lbl">{{ $t('couponMarketing.fieldInviteeTemplate') }}</text>
            <picker :range="grantCandidates.map(t => t.name)" @change="(e: any) => (fission.inviteeTemplateId = grantCandidates[Number(e.detail.value)]?.id ?? 0)">
              <view class="ipt">{{ templateName(fission.inviteeTemplateId) || $t('couponMarketing.pickTemplate') }}</view>
            </picker>
          </view>
          <view class="field">
            <text class="lbl">{{ $t('couponMarketing.fieldInviterTemplate') }}</text>
            <picker :range="['—', ...grantCandidates.map(t => t.name)]" @change="(e: any) => (fission.inviterTemplateId = Number(e.detail.value) === 0 ? 0 : grantCandidates[Number(e.detail.value) - 1]?.id ?? 0)">
              <view class="ipt">{{ templateName(fission.inviterTemplateId) || $t('couponMarketing.pickNone') }}</view>
            </picker>
          </view>
          <view class="field">
            <text class="lbl">{{ $t('couponMarketing.fieldInviterLimit') }}</text>
            <input class="ipt" type="number" v-model="fission.inviterRewardLimit" />
          </view>
          <view class="row-switch">
            <text class="lbl">{{ $t('couponMarketing.fissionNewCustomerOnly') }}</text>
            <switch :checked="fission.newCustomerOnly" color="#e1251b" @change="(e: any) => (fission.newCustomerOnly = e.detail.value)" />
          </view>
        </template>
      </scroll-view>

      <view class="foot">
        <button class="save" :disabled="saving" @tap="save">{{ saving ? $t('couponMarketing.saving') : $t('couponMarketing.save') }}</button>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, reactive, watch } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../apis/channel';
import { fetchCouponTemplates, type CouponTemplateItem } from '../../apis/coupon';
import { useLocaleStore } from '../../stores/localeStore';

const locale = useLocaleStore();

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const tab = ref<'campaign' | 'fission'>('campaign');
const saving = ref(false);
const templates = ref<CouponTemplateItem[]>([]);

const campaign = reactive({ enabled: false, name: '', endsAt: '', templateIds: [] as number[], newCustomerOnly: true });
const fission = reactive({
  enabled: false, name: '', subtitle: '', rules: '', startsAt: '', endsAt: '',
  inviteeTemplateId: 0, inviterTemplateId: 0, inviterRewardLimit: 1, newCustomerOnly: false,
});

const campaignCandidates = ref<CouponTemplateItem[]>([]);
const grantCandidates = ref<CouponTemplateItem[]>([]);

function templateName(id: number): string {
  return templates.value.find((t) => String(t.id) === String(id))?.name || '';
}

function toggleCampaignTemplate(id: number) {
  const i = campaign.templateIds.indexOf(id);
  if (i >= 0) campaign.templateIds.splice(i, 1);
  else campaign.templateIds.push(id);
}

async function load() {
  try {
    const [ch, res] = await Promise.all([fetchActiveChannel(), fetchCouponTemplates({ skip: 0, take: 100 })]);
    templates.value = res.items;
    // 新客购位候选：SALE 渠道在售券（价格取券模板 salePrice）
    campaignCandidates.value = res.items.filter(
      (t) => t.enabled && String(t.distributionChannels || '').toUpperCase().includes('SALE'),
    );
    // 裂变奖励候选：本店启用券（GRANT 语义）
    grantCandidates.value = res.items.filter((t) => t.enabled);
    // 回显
    try {
      const c = ch?.customFields?.couponCampaign ? JSON.parse(ch.customFields.couponCampaign) : null;
      if (c) {
        campaign.enabled = c.enabled !== false;
        campaign.name = typeof c.name === 'string' ? c.name : c.name?.zh_Hans || '';
        campaign.endsAt = c.endsAt ? String(c.endsAt).slice(0, 10) : '';
        campaign.templateIds = Array.isArray(c.templateIds) ? c.templateIds.map(Number) : [];
        campaign.newCustomerOnly = c.newCustomerOnly === true;
      }
    } catch { /* 坏 JSON 按空处理 */ }
    try {
      const f = ch?.customFields?.couponFission ? JSON.parse(ch.customFields.couponFission) : null;
      if (f) {
        fission.enabled = f.enabled !== false;
        fission.name = typeof f.name === 'string' ? f.name : f.name?.zh_Hans || '';
        fission.subtitle = typeof f.subtitle === 'string' ? f.subtitle : f.subtitle?.zh_Hans || '';
        fission.rules = typeof f.rules === 'string' ? f.rules : f.rules?.zh_Hans || '';
        fission.startsAt = f.startsAt ? String(f.startsAt).slice(0, 10) : '';
        fission.endsAt = f.endsAt ? String(f.endsAt).slice(0, 10) : '';
        fission.inviteeTemplateId = Number(f.inviteeTemplateId) || 0;
        fission.inviterTemplateId = Number(f.inviterTemplateId) || 0;
        fission.inviterRewardLimit = Number(f.inviterRewardLimit) || 0;
        fission.newCustomerOnly = f.newCustomerOnly === true;
      }
    } catch { /* 坏 JSON 按空处理 */ }
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponList.opFailed'), icon: 'none' });
  }
}

function endOfDay(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T23:59:59+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function startOfDay(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function save() {
  if (saving.value) return;
  // 校验：开启的活动必须有名称与结束时间；裂变还需被分享者奖励券
  if (campaign.enabled && (!campaign.name.trim() || !campaign.endsAt || !campaign.templateIds.length)) {
    uni.showToast({ title: locale.t('couponMarketing.campaignInvalid'), icon: 'none' });
    return;
  }
  if (fission.enabled && (!fission.name.trim() || !fission.endsAt || !fission.inviteeTemplateId)) {
    uni.showToast({ title: locale.t('couponMarketing.fissionInvalid'), icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    const ch = await fetchActiveChannel();
    const mergedCampaign = ch?.customFields?.couponCampaign
      ? JSON.parse(ch.customFields.couponCampaign)
      : {};
    const mergedFission = ch?.customFields?.couponFission ? JSON.parse(ch.customFields.couponFission) : {};
    // 保留运营已配置的多语言对象字段（web-admin 仅写 zh_Hans 键）
    const keepText = (prev: any, cur: string) =>
      cur || (prev && typeof prev === 'object' ? prev : prev || null);
    const campaignPayload = {
      ...mergedCampaign,
      enabled: campaign.enabled,
      name: keepText(mergedCampaign.name, campaign.name.trim()),
      endsAt: endOfDay(campaign.endsAt),
      templateIds: campaign.templateIds,
      newCustomerOnly: campaign.newCustomerOnly,
    };
    const fissionPayload = {
      ...mergedFission,
      enabled: fission.enabled,
      name: keepText(mergedFission.name, fission.name.trim()),
      subtitle: fission.subtitle.trim() ? keepText(mergedFission.subtitle, fission.subtitle.trim()) : null,
      rules: fission.rules.trim() ? keepText(mergedFission.rules, fission.rules.trim()) : null,
      startsAt: startOfDay(fission.startsAt),
      endsAt: endOfDay(fission.endsAt),
      inviteeTemplateId: fission.inviteeTemplateId,
      inviterTemplateId: fission.inviterTemplateId,
      inviterRewardLimit: Number(fission.inviterRewardLimit) || 0,
      newCustomerOnly: fission.newCustomerOnly,
    };
    await updateChannelCustomFields(String(ch.id), {
      couponCampaign: JSON.stringify(campaignPayload),
      couponFission: JSON.stringify(fissionPayload),
    });
    uni.showToast({ title: locale.t('couponMarketing.saved'), icon: 'success' });
    close();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponMarketing.saveFailed'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

function close() { emit('update:visible', false); }

watch(() => props.visible, (v) => { if (v) load(); });
</script>

<style lang="scss" scoped>
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 999; display: flex; align-items: flex-end; }
.modal { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; max-height: 82vh; display: flex; flex-direction: column; }
.head { display: flex; align-items: center; justify-content: space-between; padding: 28rpx 32rpx 16rpx;
  .t { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
  .x { font-size: 32rpx; color: $wa-muted; padding: 0 8rpx; } }
.tabs { display: flex; gap: 12rpx; padding: 0 32rpx 16rpx;
  text { font-size: 26rpx; color: $wa-muted; padding: 8rpx 28rpx; border-radius: 999rpx; background: $wa-rule;
    &.on { background: $wa-accent; color: #fff; } } }
.body { flex: 1; min-height: 360rpx; padding: 0 32rpx; box-sizing: border-box;
  .field { margin-bottom: 20rpx;
    .lbl { display: block; font-size: 24rpx; color: $wa-muted; margin-bottom: 8rpx; }
    .ipt { width: 100%; box-sizing: border-box; background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 26rpx; color: $wa-ink; }
    .area { height: 140rpx; }
    .half, &.half { display: flex; gap: 16rpx; .col { flex: 1; } }
  }
  .row-switch { display: flex; align-items: center; justify-content: space-between; padding: 10rpx 0;
    .lbl { font-size: 26rpx; color: $wa-ink; } }
  .hint { font-size: 22rpx; color: $wa-muted; margin: 6rpx 0 16rpx; line-height: 1.5; }
  .tpl-list { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 8rpx;
    .tpl-chip { font-size: 24rpx; color: $wa-muted; background: $wa-bg; border-radius: 999rpx; padding: 8rpx 24rpx; border: 1rpx solid transparent;
      &.on { color: $wa-accent; border-color: $wa-accent; background: transparent; } }
    .empty { font-size: 22rpx; color: $wa-muted; padding: 8rpx 0; } }
  .empty { font-size: 22rpx; color: $wa-muted; } }
.foot { padding: 16rpx 32rpx 32rpx;
  .save { width: 100%; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; }
  .save[disabled] { opacity: 0.6; } }
</style>
