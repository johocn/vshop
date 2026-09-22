<template>
  <view>
    <view v-if="show" class="mask" @tap="$emit('close')" />
    <view v-if="show" class="drawer">
      <view class="head">
        <text class="store">{{ tenant.name || tenant.code || locale.t('menu.noStore') }}</text>
        <text class="store-code" v-if="tenant.name && tenant.code">{{ tenant.code }}</text>
        <view class="sub-row">
          <text class="switch" @tap="switchStore">{{ locale.t('menu.switchStore') }} ›</text>
          <text class="lang" @tap="toggleLang">{{ locale.locale === 'zh-Hans' ? locale.t('login.en') : locale.t('login.zh') }}</text>
        </view>
      </view>
      <scroll-view scroll-y class="body">
        <view class="group" v-for="g in shownGroups" :key="g.domain">
          <view class="g-band">
            <view class="band" :style="{ background: g.color }" />
            <text class="g-title">{{ locale.t(g.domain) }}</text>
          </view>
          <view class="tags">
            <text v-for="it in g.items" :key="it.label" class="tag"
              :style="tierStyle(g.color, g.grad, it.tier)" @tap="go(it)">{{ locale.t(it.label) }}</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { computed, onMounted } from 'vue';
import { useTenantStore } from '../stores/tenantStore';
import { useAuthStore } from '../stores/authStore';
import { useLocaleStore } from '../stores/localeStore';
import { tierStyle } from '../theme';
import { visibleMenus } from '../constants/menus';
import { useBinMode } from '../composables/useBinMode';
import { confirmExit } from '../utils/h5Nav';
const emit = defineEmits(['close']);
const tenant = useTenantStore();
const auth = useAuthStore();
const locale = useLocaleStore();
const { showZone, ensureBinMode } = useBinMode();
defineProps<{ show: boolean }>();

const shownGroups = computed(() => visibleMenus(auth, showZone.value));
// 库位菜单按渠道档位门控：进后台时拉一次（失败按 off，宁可不显示也不半开）
onMounted(() => { ensureBinMode(); });

function switchStore() { uni.redirectTo({ url: '/pages/channel-select/index' }); }
function toggleLang() {
  const next = locale.locale === 'zh-Hans' ? 'en' : 'zh-Hans';
  locale.apply(next);
  uni.showToast({ title: next === 'en' ? locale.t('login.en') : locale.t('login.zh'), icon: 'none' });
}
// 公开手册：独立新窗口打开，无需登录鉴权
function openManual() {
  const base = (location.pathname.match(/^.*\/guanli\/?/) || ['/guanli/'])[0].replace(/\/$/, '');
  const url = location.origin + base + '/static/manual/index.html';
  window.open(url, '_blank');
}
function go(it: any) {
  emit('close');
  if (it.action === 'logout') return confirmExit();
  if (it.action === 'switchStore') return switchStore();
  if (it.action === 'manual') return openManual();
  if (it.url) uni.navigateTo({ url: it.url });
}
</script>
<style lang="scss" scoped>
.mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0,0,0,.45); z-index: 90; }
.drawer { position: fixed; left: 0; top: 0; bottom: 0; width: 78vw; max-width: 620rpx; background: #fff; z-index: 91; display: flex; flex-direction: column; overflow: hidden; box-shadow: 4rpx 0 24rpx rgba(0,0,0,.1); }
.head { padding: 32rpx 32rpx 22rpx; border-bottom: 1px solid #f0f0f0;
  .store { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
  .store-code { display: inline-block; font-size: 18rpx; color: $wa-muted; margin-left: 12rpx; padding: 2rpx 12rpx; border-radius: 999rpx; background: #f5f5f5; vertical-align: middle; }
  .sub-row { display: flex; align-items: center; justify-content: space-between; margin-top: 8rpx;
    .switch { font-size: 22rpx; color: $pm-info; }
    .lang { font-size: 22rpx; color: $wa-accent; padding: 4rpx 20rpx; border: 1rpx solid $wa-rule; border-radius: 999rpx; }
  }
}
.body { flex: 1; min-height: 0; padding: 20rpx 28rpx 40rpx; }
.group { margin-bottom: 28rpx; }
.g-band { display: flex; align-items: center; gap: 12rpx; margin-bottom: 16rpx;
  .band { width: 10rpx; height: 30rpx; border-radius: 6rpx; }
  .g-title { font-size: 26rpx; font-weight: 700; color: $wa-ink; }
}
.tags { display: flex; flex-wrap: wrap; gap: 14rpx; }
.tag { padding: 12rpx 22rpx; border-radius: 14rpx; font-size: 24rpx; font-weight: 500; white-space: nowrap; }
</style>