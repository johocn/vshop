<template>
  <view class="page">
    <!-- 骨架槽位（只读）：展示最终渲染顺序与每个槽位的状态；兜底槽位可「移除 / 恢复」 -->
    <view class="slots">
      <view class="slots-head">{{ $t('decorateHome.slotOrderTitle') }}</view>
      <view class="slot" v-for="s in SLOTS" :key="s.key">
        <text class="slot-name">{{ $t(`decorateHome.${s.labelKey}`) }}</text>
        <text class="slot-tag">{{ s.fallback ? $t('decorateHome.slotFallback') : $t('decorateHome.slotOptional') }}</text>
        <text class="slot-state">{{ $t(`decorateHome.${slotStateKey(s)}`) }}</text>
        <text v-if="s.fallback" class="slot-toggle" @tap="toggleSlot(s)">
          {{ hiddenSlots.includes(s.key) ? $t('decorateHome.slotRestore') : $t('decorateHome.slotRemove') }}
        </text>
      </view>
      <view class="muted hint">{{ $t('decorateHome.slotHint') }}</view>
    </view>

    <view v-if="sections.length === 0 && hiddenSlots.length === 0" class="muted empty">{{ $t('decorateHome.empty') }}</view>

    <view class="block" v-for="(sec, si) in sections" :key="si">
      <view class="block-head">
        <text class="block-title">{{ typeLabel(sec.type) }}</text>
        <text class="del" @tap="removeSection(si)">{{ $t('decorateHome.deleteSection') }}</text>
      </view>

      <!-- banner：轮播图 -->
      <template v-if="sec.type === 'banner'">
        <view class="item" v-for="(im, ii) in sec.images" :key="ii">
          <view class="field">
            <text class="lbl">{{ $t('decorateHome.imgUrl') }}</text>
            <input v-model="im.image" :placeholder="$t('decorateHome.imgUrlPlaceholder')" />
          </view>
          <view class="field">
            <text class="lbl">{{ $t('decorateHome.link') }}</text>
            <input v-model="im.link" :placeholder="$t('decorateHome.optional')" />
          </view>
          <view class="item-foot">
            <text class="pill">{{ $t('decorateHome.bannerIndex').replace('{n}', ii + 1) }}</text>
            <text class="del" @tap="removeBannerItem(sec, ii)">{{ $t('decorateHome.deleteBannerItem') }}</text>
          </view>
        </view>
        <view class="add" @tap="addBannerItem(sec)">{{ $t('decorateHome.addBanner') }}</view>
      </template>

      <!-- notice：公告 -->
      <view v-else-if="sec.type === 'notice'" class="field">
        <text class="lbl">{{ $t('decorateHome.noticeText') }}</text>
        <input v-model="sec.text" :placeholder="$t('decorateHome.noticePlaceholder')" />
      </view>

      <!-- nav：宫格导航 -->
      <template v-else-if="sec.type === 'nav'">
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.iconShape') }}</text>
          <view class="btns">
            <text class="btn" :class="{ active: sec.shape !== 'round' }" @tap="sec.shape = 'square'">{{ $t('decorateHome.shapeSquareJd') }}</text>
            <text class="btn" :class="{ active: sec.shape === 'round' }" @tap="sec.shape = 'round'">{{ $t('decorateHome.shapeRoundTb') }}</text>
          </view>
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.gridLayout') }}</text>
          <view class="btns">
            <text class="btn" :class="{ active: !sec.layout || sec.layout === 'grid5x2' }" @tap="sec.layout = 'grid5x2'">{{ $t('decorateHome.grid5x2') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'grid4x2' }" @tap="sec.layout = 'grid4x2'">{{ $t('decorateHome.grid4x2') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'row' }" @tap="sec.layout = 'row'">{{ $t('decorateHome.layoutRow') }}</text>
          </view>
        </view>
        <view class="item" v-for="(it, ii) in sec.items" :key="ii">
          <view class="field">
            <text class="lbl">{{ $t('decorateHome.name') }}</text>
            <input v-model="it.label" :placeholder="$t('decorateHome.namePlaceholder')" />
          </view>
          <view class="field">
            <text class="lbl">{{ $t('decorateHome.icon') }}</text>
            <input v-model="it.image" :placeholder="$t('decorateHome.iconPlaceholder')" />
          </view>
          <view class="field">
            <text class="lbl">{{ $t('decorateHome.link') }}</text>
            <input v-model="it.link" :placeholder="$t('decorateHome.optional')" />
          </view>
          <view class="item-foot">
            <text class="pill">{{ $t('decorateHome.navIndex').replace('{n}', ii + 1) }}</text>
            <text class="del" @tap="removeNavItem(sec, ii)">{{ $t('decorateHome.deleteNavItem') }}</text>
          </view>
        </view>
        <view class="add" @tap="addNavItem(sec)">{{ $t('decorateHome.addNav') }}</view>
      </template>

      <!-- goods：商品推荐 -->
      <template v-else-if="sec.type === 'goods'">
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.title') }}</text>
          <input v-model="sec.title" :placeholder="$t('decorateHome.titlePlaceholder')" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.collectionId') }}</text>
          <input v-model="sec.collectionId" :placeholder="$t('decorateHome.collectionIdPlaceholder')" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.cardLayout') }}</text>
          <view class="btns">
            <text class="btn" :class="{ active: !sec.layout || sec.layout === 'compact' }" @tap="sec.layout = 'compact'">{{ $t('decorateHome.layoutCompact') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'masonry' }" @tap="sec.layout = 'masonry'">{{ $t('decorateHome.layoutMasonry') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'single' }" @tap="sec.layout = 'single'">{{ $t('decorateHome.layoutSingle') }}</text>
          </view>
        </view>
        <view class="muted hint">{{ $t('decorateHome.goodsHint') }}</view>
      </template>

      <!-- hot：热门商品 -->
      <template v-else-if="sec.type === 'hot'">
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.title') }}</text>
          <input v-model="sec.title" :placeholder="$t('decorateHome.titlePlaceholder')" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.source') }}</text>
          <view class="btns">
            <text class="btn" :class="{ active: !sec.source || sec.source === 'auto' }" @tap="sec.source = 'auto'">{{ $t('decorateHome.sourceAuto') }}</text>
            <text class="btn" :class="{ active: sec.source === 'collection' }" @tap="sec.source = 'collection'">{{ $t('decorateHome.sourceCollection') }}</text>
          </view>
        </view>
        <view class="field" v-if="sec.source === 'collection'">
          <text class="lbl">{{ $t('decorateHome.collectionId') }}</text>
          <input v-model="sec.collectionId" :placeholder="$t('decorateHome.collectionIdPlaceholder')" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.limit') }}</text>
          <input type="number" v-model.number="sec.limit" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.goodsLayout') }}</text>
          <view class="btns">
            <text class="btn" :class="{ active: !sec.layout || sec.layout === 'compact' }" @tap="sec.layout = 'compact'">{{ $t('decorateHome.goodsLayoutCompact') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'sliding' }" @tap="sec.layout = 'sliding'">{{ $t('decorateHome.goodsLayoutSliding') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'hero' }" @tap="sec.layout = 'hero'">{{ $t('decorateHome.goodsLayoutHero') }}</text>
          </view>
        </view>
      </template>

      <!-- recommend：推荐商品 -->
      <template v-else-if="sec.type === 'recommend'">
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.title') }}</text>
          <input v-model="sec.title" :placeholder="$t('decorateHome.titlePlaceholder')" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.source') }}</text>
          <view class="btns">
            <text class="btn" :class="{ active: !sec.source || sec.source === 'auto' }" @tap="sec.source = 'auto'">{{ $t('decorateHome.sourceAuto') }}</text>
            <text class="btn" :class="{ active: sec.source === 'collection' }" @tap="sec.source = 'collection'">{{ $t('decorateHome.sourceCollection') }}</text>
            <text class="btn" :class="{ active: sec.source === 'slugs' }" @tap="sec.source = 'slugs'">{{ $t('decorateHome.sourceSlugs') }}</text>
          </view>
        </view>
        <view class="field" v-if="sec.source === 'collection'">
          <text class="lbl">{{ $t('decorateHome.collectionId') }}</text>
          <input v-model="sec.collectionId" :placeholder="$t('decorateHome.collectionIdPlaceholder')" />
        </view>
        <view class="field" v-if="sec.source === 'slugs'">
          <text class="lbl">{{ $t('decorateHome.slugList') }}</text>
          <textarea v-model="sec.slugsText" :placeholder="$t('decorateHome.slugPlaceholder')" auto-height />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.limit') }}</text>
          <input type="number" v-model.number="sec.limit" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.goodsLayout') }}</text>
          <view class="btns">
            <text class="btn" :class="{ active: !sec.layout || sec.layout === 'compact' }" @tap="sec.layout = 'compact'">{{ $t('decorateHome.goodsLayoutCompact') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'sliding' }" @tap="sec.layout = 'sliding'">{{ $t('decorateHome.goodsLayoutSliding') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'hero' }" @tap="sec.layout = 'hero'">{{ $t('decorateHome.goodsLayoutHero') }}</text>
          </view>
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.dedupe') }}</text>
          <view class="btns">
            <text class="btn" :class="{ active: sec.dedupe !== false }" @tap="sec.dedupe = true">{{ $t('decorateHome.toggleOn') }}</text>
            <text class="btn" :class="{ active: sec.dedupe === false }" @tap="sec.dedupe = false">{{ $t('decorateHome.toggleOff') }}</text>
          </view>
        </view>
      </template>

      <!-- brandFloor：品牌闪购 -->
      <view v-else-if="sec.type === 'brandFloor'" class="field">
        <text class="lbl">{{ $t('decorateHome.title') }}</text>
        <input v-model="sec.title" :placeholder="$t('decorateHome.titlePlaceholder')" />
        <view class="muted hint">{{ $t('decorateHome.brandFloorHint') }}</view>
      </view>

      <!-- plaza：品质专区 -->
      <view v-else-if="sec.type === 'plaza'" class="field">
        <text class="lbl">{{ $t('decorateHome.title') }}</text>
        <input v-model="sec.title" :placeholder="$t('decorateHome.titlePlaceholder')" />
        <view class="muted hint">{{ $t('decorateHome.plazaHint') }}</view>
      </view>

      <!-- coupon：领券楼层 -->
      <template v-else-if="sec.type === 'coupon'">
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.title') }}</text>
          <input v-model="sec.title" :placeholder="$t('decorateHome.titlePlaceholder')" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.couponLimit') }}</text>
          <input type="number" v-model.number="sec.limit" />
        </view>
        <view class="muted hint">{{ $t('decorateHome.couponHint') }}</view>
      </template>

      <!-- latest：最新商品 -->
      <template v-else-if="sec.type === 'latest'">
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.title') }}</text>
          <input v-model="sec.title" :placeholder="$t('decorateHome.titlePlaceholder')" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.newCollection') }}</text>
          <input v-model="sec.collectionId" :placeholder="$t('decorateHome.collectionIdPlaceholder')" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.limit') }}</text>
          <input type="number" v-model.number="sec.limit" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.cardLayout') }}</text>
          <view class="btns">
            <text class="btn" :class="{ active: !sec.layout || sec.layout === 'compact' }" @tap="sec.layout = 'compact'">{{ $t('decorateHome.layoutCompact') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'masonry' }" @tap="sec.layout = 'masonry'">{{ $t('decorateHome.layoutMasonry') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'single' }" @tap="sec.layout = 'single'">{{ $t('decorateHome.layoutSingle') }}</text>
          </view>
        </view>
        <view class="muted hint">{{ $t('decorateHome.latestHint') }}</view>
      </template>

      <!-- richText：富文本 -->
      <view v-else-if="sec.type === 'richText'" class="field">
        <text class="lbl">{{ $t('decorateHome.richText') }}</text>
        <textarea v-model="sec.html" :placeholder="$t('decorateHome.richTextPlaceholder')" auto-height />
      </view>
    </view>

    <view class="addbar">
      <button class="mini" @tap="addBanner">{{ $t('decorateHome.addBanner') }}</button>
      <button class="mini" @tap="addNotice">{{ $t('decorateHome.addNotice') }}</button>
      <button class="mini" @tap="addNav">{{ $t('decorateHome.addNav') }}</button>
      <button class="mini" @tap="addGoods">{{ $t('decorateHome.addGoods') }}</button>
      <button class="mini" @tap="addHot">{{ $t('decorateHome.addHot') }}</button>
      <button class="mini" @tap="addRecommend">{{ $t('decorateHome.addRecommend') }}</button>
      <button class="mini" @tap="addBrandFloor">{{ $t('decorateHome.addBrandFloor') }}</button>
      <button class="mini" @tap="addPlaza">{{ $t('decorateHome.addPlaza') }}</button>
      <button class="mini" @tap="addCoupon">{{ $t('decorateHome.addCoupon') }}</button>
      <button class="mini" @tap="addLatest">{{ $t('decorateHome.addLatest') }}</button>
      <button class="mini" @tap="addRichText">{{ $t('decorateHome.addRichText') }}</button>
    </view>

    <button class="save" @tap="save" :disabled="saving">{{ $t('decorateHome.save') }}</button>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import { parseShopContent, isValidShopContent, ShopSection, ShopContent } from '../../../templates/shared/schema';
import { useLocaleStore } from '../../../stores/localeStore';

// 编辑态视图模型：可选字段覆盖所有 section type，便于模板直接访问（vue-tsc 不会在模板内做联合类型收窄）
interface SectionVM {
  type: string;
  images?: { image: string; link?: string }[];
  text?: string;
  items?: { label: string; icon?: string; image?: string; link?: string }[];
  title?: string;
  collectionId?: string;
  shape?: string;
  layout?: string;
  html?: string;
  // hot / recommend 专属
  source?: string;
  limit?: number;
  dedupe?: boolean;
  // recommend source=slugs 的编辑态原文（落库时拆成 slugs: string[]）
  slugsText?: string;
}

const locale = useLocaleStore();
const sections = ref<SectionVM[]>([]);

/** 骨架槽位表（与前台 utils/home-skeleton.ts 的 HOME_SKELETON 一一对应，顺序即最终渲染顺序） */
const SLOTS: { key: string; match: string; labelKey: string; fallback: boolean }[] = [
  { key: 'banner', match: 'banner', labelKey: 'slotBanner', fallback: true },
  { key: 'notice', match: 'notice', labelKey: 'slotNotice', fallback: false },
  { key: 'functionGrid', match: 'nav', labelKey: 'slotFunctionGrid', fallback: true },
  { key: 'coupon', match: 'coupon', labelKey: 'slotCoupon', fallback: false },
  { key: 'brandFloor', match: 'brandFloor', labelKey: 'slotBrandFloor', fallback: true },
  { key: 'plaza', match: 'plaza', labelKey: 'slotPlaza', fallback: true },
  { key: 'goods', match: 'goods', labelKey: 'slotGoods', fallback: false },
  { key: 'hot', match: 'hot', labelKey: 'slotHot', fallback: true },
  { key: 'recommend', match: 'recommend', labelKey: 'slotRecommend', fallback: true },
  { key: 'latest', match: 'latest', labelKey: 'slotLatest', fallback: false },
];

/** 已显式移除的兜底槽位 key（写回 shopContent.hiddenSlots） */
const hiddenSlots = ref<string[]>([]);

/** 槽位状态：removed（已移除）> covered（已被同类型区块覆盖）> auto（自动兜底）> unset（可选未配置） */
function slotStateKey(slot: { key: string; match: string; fallback: boolean }): string {
  if (hiddenSlots.value.includes(slot.key)) return 'slotRemoved';
  if (sections.value.some((s) => s.type === slot.match)) return 'slotCovered';
  return slot.fallback ? 'slotAuto' : 'slotUnset';
}

/** 兜底槽位「移除 / 恢复」开关；可选槽位无兜底，不可移除 */
function toggleSlot(slot: { key: string; fallback: boolean }) {
  if (!slot.fallback) return;
  const i = hiddenSlots.value.indexOf(slot.key);
  if (i >= 0) hiddenSlots.value.splice(i, 1);
  else hiddenSlots.value.push(slot.key);
}

const channelId = ref('');
const saving = ref(false);

onMounted(async () => {
  try {
    const ch = await fetchActiveChannel();
    channelId.value = ch.id;
    const raw = (ch.customFields as any)?.shopContent;
    const parsed = parseShopContent(raw);
    sections.value = parsed ? (parsed.sections as unknown as SectionVM[]).map(toViewModel) : [];
    hiddenSlots.value =
      parsed && Array.isArray((parsed as any).hiddenSlots)
        ? ((parsed as any).hiddenSlots as unknown[]).filter((k): k is string => typeof k === 'string')
        : [];
  } catch {
    // 读取失败置空，用户仍可通过保存重新写入
    sections.value = [];
  }
});

function typeLabel(t: string): string {
  switch (t) {
    case 'banner': return locale.t('decorateHome.typeBanner');
    case 'notice': return locale.t('decorateHome.typeNotice');
    case 'nav': return locale.t('decorateHome.typeNav');
    case 'goods': return locale.t('decorateHome.typeGoods');
    case 'hot': return locale.t('decorateHome.typeHot');
    case 'recommend': return locale.t('decorateHome.typeRecommend');
    case 'brandFloor': return locale.t('decorateHome.typeBrandFloor');
    case 'plaza': return locale.t('decorateHome.typePlaza');
    case 'coupon': return locale.t('decorateHome.typeCoupon');
    case 'latest': return locale.t('decorateHome.typeLatest');
    case 'richText': return locale.t('decorateHome.typeRichText');
    default: return t;
  }
}

function removeSection(i: number) { sections.value.splice(i, 1); }
function addBanner() { sections.value.push({ type: 'banner', images: [{ image: '' }] }); }
function addNotice() { sections.value.push({ type: 'notice', text: '' }); }
function addNav() { sections.value.push({ type: 'nav', items: [{ label: '' }], shape: 'square', layout: 'grid5x2' }); }
function addGoods() { sections.value.push({ type: 'goods', collectionId: '', layout: 'compact' }); }
function addHot() { sections.value.push({ type: 'hot', source: 'auto', limit: 10, layout: 'compact' }); }
function addRecommend() { sections.value.push({ type: 'recommend', source: 'auto', limit: 10, layout: 'compact', dedupe: true }); }
function addBrandFloor() { sections.value.push({ type: 'brandFloor', title: '' }); }
function addPlaza() { sections.value.push({ type: 'plaza', title: '' }); }
function addCoupon() { sections.value.push({ type: 'coupon', title: '', limit: 6 }); }
function addLatest() { sections.value.push({ type: 'latest', title: '', collectionId: '', limit: 10, layout: 'compact' }); }
function addRichText() { sections.value.push({ type: 'richText', html: '' }); }

// 落库 JSON → 编辑态（slugs 数组转为多行文本，便于 textarea 编辑）
function toViewModel(sec: any): SectionVM {
  const vm = { ...sec } as SectionVM;
  if (sec?.type === 'recommend' && Array.isArray(sec.slugs)) vm.slugsText = sec.slugs.join('\n');
  return vm;
}

// 编辑态 → 落库 JSON：空字符串字段不写入，缺失项由前台按默认值兜底
function toSection(vm: SectionVM): any {
  if (vm.type === 'hot' || vm.type === 'recommend') return toCuratedSection(vm);
  const sec: any = { ...vm };
  delete sec.slugsText;
  if (typeof sec.title === 'string' && !sec.title.trim()) delete sec.title;
  if (sec.type === 'latest' && typeof sec.collectionId === 'string' && !sec.collectionId.trim()) delete sec.collectionId;
  if (sec.type === 'latest' || sec.type === 'coupon') {
    if (typeof sec.limit === 'number' && Number.isFinite(sec.limit)) {
      sec.limit = Math.min(30, Math.max(1, Math.round(sec.limit)));
    } else {
      delete sec.limit;
    }
  }
  return sec;
}

function toCuratedSection(vm: SectionVM): any {
  const sec: any = { type: vm.type };
  const title = (vm.title ?? '').trim();
  if (title) sec.title = title;
  const source = vm.source || 'auto';
  sec.source = source;
  if (source === 'collection') {
    const cid = (vm.collectionId ?? '').trim();
    if (cid) sec.collectionId = cid;
  }
  if (vm.type === 'recommend' && source === 'slugs') {
    const slugs = parseSlugs(vm.slugsText ?? '');
    if (slugs.length) sec.slugs = slugs;
  }
  if (typeof vm.limit === 'number' && Number.isFinite(vm.limit)) {
    sec.limit = Math.min(30, Math.max(1, Math.round(vm.limit)));
  }
  sec.layout = vm.layout || 'compact';
  if (vm.type === 'recommend') sec.dedupe = vm.dedupe !== false;
  return sec;
}

// 多行 / 逗号分隔 → string[]，trim + 过滤空项
function parseSlugs(text: string): string[] {
  return text.split(/[\n,]/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function addBannerItem(sec: SectionVM) { sec.images?.push({ image: '' }); }
function removeBannerItem(sec: SectionVM, i: number) { sec.images?.splice(i, 1); }
function addNavItem(sec: SectionVM) { sec.items?.push({ label: '' }); }
function removeNavItem(sec: SectionVM, i: number) { sec.items?.splice(i, 1); }

async function save() {
  // 允许「全部走兜底、但移除某个楼层」的表达：只有既无区块又无 hiddenSlots 才拒绝
  if (sections.value.length === 0 && hiddenSlots.value.length === 0) {
    uni.showToast({ title: locale.t('decorateHome.needSection'), icon: 'none' });
    return;
  }
  const content = buildContent();
  if (!content) {
    uni.showToast({ title: locale.t('decorateHome.invalidContent'), icon: 'none' });
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
    uni.showToast({ title: locale.t('decorateHome.saved'), icon: 'success' });
  } catch {
    uni.showToast({ title: locale.t('decorateHome.saveFailed'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

// 组装顶层 JSON 并经 schema 校验；非法返回 null
function buildContent(): ShopContent | null {
  const content: ShopContent = {
    version: 1,
    sections: sections.value.map(toSection) as unknown as ShopSection[],
  };
  const hidden = hiddenSlots.value.filter((k) => typeof k === 'string' && k.trim().length > 0);
  if (hidden.length) content.hiddenSlots = hidden;
  return isValidShopContent(content) ? content : null;
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .slots { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 32rpx; margin-bottom: 24rpx;
    .slots-head { font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-bottom: 16rpx; }
    .slot { display: flex; align-items: center; gap: 12rpx; padding: 12rpx 0; border-bottom: 1rpx solid $wa-rule;
      &:last-of-type { border-bottom: 0; }
      .slot-name { flex: 1; font-size: 26rpx; color: $wa-ink; }
      .slot-tag { font-size: 22rpx; color: $wa-muted; }
      .slot-state { font-size: 22rpx; color: $wa-accent; }
      .slot-toggle { font-size: 22rpx; color: $wa-danger; }
    }
  }
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
    .btns { display: flex; flex-wrap: wrap; gap: 12rpx;
      .btn { flex: 1 1 30%; text-align: center; font-size: 24rpx; color: $wa-ink;
        background: $wa-card; border: 1rpx solid $wa-rule; border-radius: $wa-radius;
        padding: 14rpx 0;
        &.active { color: #fff; background: $wa-accent; border-color: $wa-accent; } }
    }
    .hint { font-size: 22rpx; }
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