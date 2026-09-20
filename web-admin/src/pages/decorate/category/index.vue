<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">{{ $t('decorateCategory.title') }}</text>
        <text class="sub">{{ $t('decorateCategory.sub') }}</text>
      </view>
      <view class="cell">
        <text class="lbl">{{ $t('decorateCategory.titleLabel') }}</text>
        <input v-model="f.title" :placeholder="$t('decorateCategory.titlePlaceholder')" />
      </view>
      <view class="cell">
        <text class="lbl">{{ $t('decorateCategory.subtitleLabel') }}</text>
        <input v-model="f.subtitle" :placeholder="$t('decorateCategory.optional')" />
      </view>
      <view class="cell">
        <text class="lbl">{{ $t('decorateCategory.bgColor') }}</text>
        <input v-model="f.bgColor" placeholder="#ffffff" />
      </view>
      <view class="cell row-in">
        <text class="lbl">{{ $t('decorateCategory.listStyle') }}</text>
        <view class="seg">
          <text :class="{ on: f.listStyle === 'grid' }" @tap="f.listStyle = 'grid'">{{ $t('decorateCategory.grid') }}</text>
          <text :class="{ on: f.listStyle === 'list' }" @tap="f.listStyle = 'list'">{{ $t('decorateCategory.list') }}</text>
        </view>
      </view>
      <view class="cell">
        <text class="lbl">{{ $t('decorateCategory.floorTitle') }}</text>
        <input v-model="f.floorTitle" :placeholder="$t('decorateCategory.floorTitlePlaceholder')" />
      </view>
      <view class="cell">
        <text class="lbl">{{ $t('decorateCategory.floorSubtitle') }}</text>
        <input v-model="f.floorSubtitle" :placeholder="$t('decorateCategory.optional')" />
      </view>
    </view>
    <button class="save" :disabled="saving" @tap="save">{{ saving ? $t('decorateCategory.saving') : $t('decorateCategory.save') }}</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import { graphQlErrorMsg } from '../../../apis/client';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const f = ref({
  title: '分类',
  subtitle: '',
  bgColor: '#ffffff',
  listStyle: 'grid',
  floorTitle: '',
  floorSubtitle: '',
});
const saving = ref(false);
let channelId = '';

function safeParse(raw: string | undefined): any {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

onMounted(async () => {
  const ch = await fetchActiveChannel();
  channelId = ch.id;
  const cfg = safeParse((ch.customFields as any).pageCategoryConfig);
  if (cfg) {
    f.value = {
      title: cfg.title ?? f.value.title,
      subtitle: cfg.subtitle ?? '',
      bgColor: cfg.bgColor ?? '#ffffff',
      listStyle: cfg.listStyle === 'list' ? 'list' : 'grid',
      floorTitle: cfg.floorTitle ?? '',
      floorSubtitle: cfg.floorSubtitle ?? '',
    };
  }
});

async function save() {
  saving.value = true;
  try {
    await updateChannelCustomFields(channelId, { pageCategoryConfig: JSON.stringify({ version: 1, ...f.value }) });
    uni.showToast({ title: locale.t('decorateCategory.saved'), icon: 'success' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('decorateCategory.saveFailed')), icon: 'none' });
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 32rpx; }
  .head { display: flex; align-items: baseline; justify-content: space-between; padding: 20rpx 0 8rpx;
    .title { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
    .sub { font-size: 22rpx; color: $wa-muted; }
  }
  .cell { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $wa-rule;
    .lbl { width: 180rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
    input { flex: 1; font-size: 28rpx; }
    &.row-in { justify-content: space-between; }
    &:last-child { border-bottom: none; }
    .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx;
      text { font-size: 24rpx; color: $wa-muted; padding: 8rpx 22rpx; border-radius: 999rpx;
        &.on { background: $wa-accent; color: #fff; }
      }
    }
  }
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
