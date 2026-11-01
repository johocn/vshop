<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusInbox.loading') }}</view>
    <template v-else>
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusInbox.title') }}</text>
          <text class="unread" :class="{ on: unread > 0 }">{{ unread }} {{ $t('campusInbox.unreadUnit') }}</text>
        </view>
        <view class="seg">
          <text class="seg-i" :class="{ on: filter === 'all' }" @tap="filter = 'all'">
            {{ $t('campusInbox.filterAll') }}
          </text>
          <text class="seg-i" :class="{ on: filter === 'unread' }" @tap="filter = 'unread'">
            {{ $t('campusInbox.filterUnread') }}
          </text>
        </view>
        <text class="tip">{{ $t('campusInbox.tip') }}</text>
      </view>

      <view v-if="!visible.length" class="hint empty">
        {{ filter === 'unread' ? $t('campusInbox.emptyUnread') : $t('campusInbox.empty') }}
      </view>
      <view v-else class="list">
        <view v-for="m in visible" :key="m.id" class="msg" :class="{ un: !m.isRead }" @tap="open(m)">
          <view class="m-head">
            <text class="m-scene">{{ sceneText(m.scene) }}</text>
            <text class="m-time">{{ formatDateTime(m.createdAt) }}</text>
          </view>
          <text class="m-title">{{ m.title }}</text>
          <text class="m-content">{{ m.content }}</text>
          <view class="m-foot">
            <text v-if="!m.isRead" class="m-dot">{{ $t('campusInbox.unreadTag') }}</text>
            <text v-if="targetUrl(m.link)" class="m-go">{{ $t('campusInbox.open') }} ›</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { adminInbox, adminInboxUnreadCount, markAdminInboxRead, type AdminInboxRow } from '../../apis/campus';
import { graphQlErrorMsg } from '../../apis/client';
import { formatDateTime } from '../../utils/inventoryFormat';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

// 商家/店主均可进入：ManageOwnShop 为店主角色权限（平台运营的超级管理员也具备）
usePermGuard('ManageOwnShop');

const locale = useLocaleStore();
const loading = ref(true);
const items = ref<AdminInboxRow[]>([]);
const unread = ref(0);
const filter = ref<'all' | 'unread'>('all');

const visible = computed(() => (filter.value === 'unread' ? items.value.filter((m) => !m.isRead) : items.value));

/** 已声明的场景文案；未知场景直接显示原始 scene，避免丢信息 */
const SCENE_KEYS: Record<string, string> = {
  shop_new_order: 'campusInbox.sceneShopNewOrder',
  after_sales: 'campusInbox.sceneAfterSales',
  order_paid: 'campusInbox.sceneOrderPaid',
};

function sceneText(scene: string): string {
  const key = SCENE_KEYS[scene];
  return key ? locale.t(key) : scene;
}

/**
 * 站内信 link → uni-app 页面地址。
 * 目前只有售后提醒带 link（后端写 `/after-sale/detail?id=<requestId>`）；
 * 未识别的 link 一律不跳，避免打开不存在的页面。
 */
function targetUrl(link: string | null): string | null {
  if (!link) return null;
  const [rawPath, qs] = link.split('?');
  const path = rawPath.replace(/^\//, '');
  let page = '';
  if (path === 'after-sale/detail') page = 'pages/after-sale/detail/index';
  else if (path === 'campus/after-sales-detail') page = 'pages/campus/after-sales-detail';
  if (!page) return null;
  return `/${page}${qs ? `?${qs}` : ''}`;
}

async function load(): Promise<void> {
  try {
    const [list, count] = await Promise.all([adminInbox(), adminInboxUnreadCount()]);
    items.value = list?.items ?? [];
    unread.value = Number(count) || 0;
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('campusInbox.loadFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onShow(() => {
  void load();
});

onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

async function open(m: AdminInboxRow): Promise<void> {
  if (!m.isRead) {
    try {
      await markAdminInboxRead(m.id);
      m.isRead = true;
      unread.value = Math.max(0, unread.value - 1);
    } catch {
      // 置读失败不阻断跳转
    }
  }
  const url = targetUrl(m.link);
  if (url) uni.navigateTo({ url });
}
</script>

<style scoped>
.page {
  padding: 12px 12px 24px;
  min-height: 100vh;
  background: #f6f7f9;
}
.hint {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: #99a1ab;
}
.card {
  padding: 12px;
  border-radius: 10px;
  background: #fff;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2429;
}
.unread {
  font-size: 12px;
  color: #99a1ab;
}
.unread.on {
  color: #e05b2b;
  font-weight: 600;
}
.seg {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.seg-i {
  padding: 4px 12px;
  border-radius: 12px;
  background: #f2f3f5;
  font-size: 12px;
  color: #6b7280;
}
.seg-i.on {
  background: #fff1e9;
  color: #e05b2b;
  font-weight: 600;
}
.tip {
  display: block;
  margin-top: 10px;
  font-size: 11px;
  line-height: 1.6;
  color: #99a1ab;
}
.list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg {
  padding: 12px;
  border-radius: 10px;
  background: #fff;
}
.msg.un {
  border-left: 3px solid #e05b2b;
}
.m-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.m-scene {
  padding: 2px 8px;
  border-radius: 10px;
  background: #eef4ff;
  color: #3b6fd4;
  font-size: 11px;
}
.m-time {
  font-size: 11px;
  color: #99a1ab;
}
.m-title {
  display: block;
  margin-top: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2429;
}
.m-content {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: #4b5563;
}
.m-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}
.m-dot {
  font-size: 11px;
  color: #e05b2b;
}
.m-go {
  margin-left: auto;
  font-size: 12px;
  color: #3b6fd4;
}
</style>
