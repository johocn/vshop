// 积木楼层组件表（dynamic 版式专用）：未知 type 由渲染层过滤跳过（容错），不整单拒绝
import type { Component } from 'vue';
import BannerSection from './sections/BannerSection.vue';
import NoticeSection from './sections/NoticeSection.vue';
import NavSection from './sections/NavSection.vue';
import GoodsSection from './sections/GoodsSection.vue';
import RichTextSection from './sections/RichTextSection.vue';
import FlashSection from './sections/FlashSection.vue';
import VideoSection from './sections/VideoSection.vue';
import CouponSection from './sections/CouponSection.vue';
import PointsGoodsSection from './sections/PointsGoodsSection.vue';
import LimitGoodsSection from './sections/LimitGoodsSection.vue';
import HotGoodsSection from './sections/HotGoodsSection.vue';

export const SECTION_COMPONENTS: Record<string, Component> = {
  banner: BannerSection,
  notice: NoticeSection,
  nav: NavSection,
  goods: GoodsSection,
  richText: RichTextSection,
  flash: FlashSection,
  video: VideoSection,
  coupon: CouponSection,
  pointsGoods: PointsGoodsSection,
  limitGoods: LimitGoodsSection,
  hotGoods: HotGoodsSection,
};
