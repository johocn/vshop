<template>
  <view class="page">
    <view v-if="sections.length === 0" class="muted empty">还没有装修区块，点击下方按钮添加</view>

    <view class="block" v-for="(sec, si) in sections" :key="si">
      <view class="block-head">
        <text class="block-title">{{ typeLabel(sec.type) }}</text>
        <text class="del" @tap="removeSection(si)">删除区块</text>
      </view>

      <!-- banner：轮播图 -->
      <template v-if="sec.type === 'banner'">
        <view class="item" v-for="(im, ii) in sec.images" :key="ii">
          <view class="field">
            <text class="lbl">图片 URL</text>
            <input v-model="im.image" placeholder="请输入图片地址" />
          </view>
          <view class="field">
            <text class="lbl">跳转链接</text>
            <input v-model="im.link" placeholder="可选" />
          </view>
          <view class="item-foot">
            <text class="pill">第 {{ ii + 1 }} 张</text>
            <text class="del" @tap="removeBannerItem(sec, ii)">删除该图</text>
          </view>
        </view>
        <view class="add" @tap="addBannerItem(sec)">+ 轮播图</view>
      </template>

      <!-- notice：公告 -->
      <view v-else-if="sec.type === 'notice'" class="field">
        <text class="lbl">公告文本</text>
        <input v-model="sec.text" placeholder="请输入公告内容" />
      </view>

      <!-- nav：宫格导航 -->
      <template v-else-if="sec.type === 'nav'">
        <view class="item" v-for="(it, ii) in sec.items" :key="ii">
          <view class="field">
            <text class="lbl">名称</text>
            <input v-model="it.label" placeholder="如：分类" />
          </view>
          <view class="field">
            <text class="lbl">图标</text>
            <input v-model="it.icon" placeholder="可选" />
          </view>
          <view class="field">
            <text class="lbl">链接</text>
            <input v-model="it.link" placeholder="可选" />
          </view>
          <view class="item-foot">
            <text class="pill">第 {{ ii + 1 }} 项</text>
            <text class="del" @tap="removeNavItem(sec, ii)">删除该格</text>
          </view>
        </view>
        <view class="add" @tap="addNavItem(sec)">+ 宫格</view>
      </template>

      <!-- goods：商品推荐 -->
      <template v-else-if="sec.type === 'goods'">
        <view class="field">
          <text class="lbl">区块标题</text>
          <input v-model="sec.title" placeholder="可选，如：热销推荐" />
        </view>
        <view class="field">
          <text class="lbl">商品集合 ID (collectionId)</text>
          <input v-model="sec.collectionId" placeholder="请输入集合 ID" />
        </view>
      </template>

      <!-- richText：富文本 -->
      <view v-else-if="sec.type === 'richText'" class="field">
        <text class="lbl">富文本 HTML</text>
        <textarea v-model="sec.html" placeholder="粘贴 HTML 片段" auto-height />
      </view>
    </view>

    <view class="addbar">
      <button class="mini" @tap="addBanner">+ 轮播图</button>
      <button class="mini" @tap="addNotice">+ 公告</button>
      <button class="mini" @tap="addNav">+ 宫格</button>
      <button class="mini" @tap="addGoods">+ 商品推荐</button>
      <button class="mini" @tap="addRichText">+ 富文本</button>
    </view>

    <button class="save" @tap="save" :disabled="saving">保存装修</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import { parseShopContent, isValidShopContent, ShopSection, ShopContent } from '../../../templates/shared/schema';

// 编辑态视图模型：可选字段覆盖所有 section type，便于模板直接访问（vue-tsc 不会在模板内做联合类型收窄）
interface SectionVM {
  type: string;
  images?: { image: string; link?: string }[];
  text?: string;
  items?: { label: string; icon?: string; link?: string }[];
  title?: string;
  collectionId?: string;
  html?: string;
}

const sections = ref<SectionVM[]>([]);
const channelId = ref('');
const saving = ref(false);

onMounted(async () => {
  try {
    const ch = await fetchActiveChannel();
    channelId.value = ch.id;
    const raw = (ch.customFields as any)?.shopContent;
    const parsed = parseShopContent(raw);
    sections.value = parsed ? parsed.sections as unknown as SectionVM[] : [];
  } catch {
    // 读取失败置空，用户仍可通过保存重新写入
    sections.value = [];
  }
});

function typeLabel(t: string): string {
  switch (t) {
    case 'banner': return '轮播图';
    case 'notice': return '公告';
    case 'nav': return '宫格导航';
    case 'goods': return '商品推荐';
    case 'richText': return '富文本';
    default: return t;
  }
}

function removeSection(i: number) { sections.value.splice(i, 1); }
function addBanner() { sections.value.push({ type: 'banner', images: [{ image: '' }] }); }
function addNotice() { sections.value.push({ type: 'notice', text: '' }); }
function addNav() { sections.value.push({ type: 'nav', items: [{ label: '' }] }); }
function addGoods() { sections.value.push({ type: 'goods', collectionId: '' }); }
function addRichText() { sections.value.push({ type: 'richText', html: '' }); }

function addBannerItem(sec: SectionVM) { sec.images?.push({ image: '' }); }
function removeBannerItem(sec: SectionVM, i: number) { sec.images?.splice(i, 1); }
function addNavItem(sec: SectionVM) { sec.items?.push({ label: '' }); }
function removeNavItem(sec: SectionVM, i: number) { sec.items?.splice(i, 1); }

async function save() {
  if (sections.value.length === 0) {
    uni.showToast({ title: '请至少添加一个区块', icon: 'none' });
    return;
  }
  const content = buildContent();
  if (!content) {
    uni.showToast({ title: '内容不完整或格式非法', icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    let id = channelId.value;
    if (!id) {
      // 当前店铺 channelId 取自 fetchActiveChannel，tenantStore 没有该字段
      const ch = await fetchActiveChannel();
      id = ch.id;
      channelId.value = id;
    }
    await updateChannelCustomFields(id, { shopContent: JSON.stringify(content) });
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch {
    uni.showToast({ title: '保存失败', icon: 'none' });
  } finally {
    saving.value = false;
  }
}

// 组装顶层 JSON 并经 schema 校验；非法返回 null
function buildContent(): ShopContent | null {
  const content: ShopContent = {
    version: 1,
    sections: sections.value as unknown as ShopSection[],
  };
  return isValidShopContent(content) ? content : null;
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .empty { text-align: center; padding: 80rpx 0 40rpx; }
  .block { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx;
      .block-title { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
    }
    .item { background: $wa-bg; border-radius: $wa-radius; padding: 20rpx; margin-bottom: 16rpx;
      .item-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 4rpx;
        .pill { font-size: 22rpx; color: $wa-muted; }
      }
    }
    .field { margin-bottom: 16rpx;
      .lbl { font-size: 24rpx; color: $wa-muted; display: block; margin-bottom: 8rpx; }
      input, textarea { background: $wa-card; border: 1rpx solid $wa-rule; border-radius: $wa-radius;
        padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; width: 100%; box-sizing: border-box; }
    }
    .add { margin-top: 8rpx; text-align: center; color: $wa-accent; font-size: 26rpx;
      border: 1rpx dashed $wa-accent; border-radius: $wa-radius; padding: 16rpx 0; }
  }
  .addbar { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 24rpx;
    .mini { flex: 1 1 40%; font-size: 26rpx; color: $wa-accent; background: $wa-card;
      border: 1rpx solid $wa-rule; border-radius: $wa-radius; }
  }
  .save { margin-top: 16rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
  .del { color: $wa-danger; font-size: 26rpx; }
}
</style>