<template>
  <view class="lottery-page">
    <view class="points-card">
      <view class="points-card__row">
        <text class="points-card__label">我的积分</text>
        <text class="points-card__value">{{ points === null ? '—' : points }}</text>
      </view>
      <text class="points-card__tip">抽中奖品按其「消耗积分」扣减，0 积分奖品为免费抽奖</text>
    </view>

    <view class="wheel-card">
      <view class="wheel">
        <template v-for="(cell, gi) in cells" :key="gi">
          <view v-if="gi === 4" class="wheel__slot wheel__slot--center">
            <view class="wheel__draw" :class="{ 'wheel__draw--busy': spinning }" @tap="onDraw">
              <text class="wheel__draw-txt">{{ spinning ? '抽奖中' : '抽奖' }}</text>
            </view>
          </view>
          <view v-else class="wheel__slot">
            <view v-if="cell.prize" class="wheel__box" :class="{ 'wheel__box--on': highlight === cell.slot }">
              <image v-if="cell.prize.image" class="wheel__img" :src="cell.prize.image" mode="aspectFill" />
              <view v-else class="wheel__img wheel__img--ph" />
              <text class="wheel__name">{{ cell.prize.name }}</text>
              <text class="wheel__consume" :class="{ 'wheel__consume--free': !cell.prize.consume }">
                {{ consumeText(cell.prize.consume) }}
              </text>
            </view>
            <view v-else class="wheel__box wheel__box--empty" />
          </view>
        </template>
      </view>
      <text v-if="!prizes.length && !prizesLoading" class="wheel-card__empty">暂未配置奖品，敬请期待</text>
    </view>

    <view v-if="showResult && result" class="result-mask" @tap="closeResult">
      <view class="result" @tap.stop>
        <text class="result__badge">中奖结果</text>
        <image v-if="result.prize.image" class="result__img" :src="result.prize.image" mode="aspectFit" />
        <text class="result__title">恭喜获得「{{ result.prize.name }}」</text>
        <text class="result__consume">{{ result.prize.consume > 0 ? '本次消耗 ' + result.prize.consume + ' 积分' : '本次为免费抽奖' }}</text>
        <button class="result__btn" @tap="closeResult">开心收下</button>
      </view>
    </view>

    <view class="records">
      <text class="records__title">我的中奖记录</text>
      <view v-for="rec in recordItems" :key="rec.id" class="records__item">
        <image v-if="rec.prizeImage" class="records__img" :src="rec.prizeImage" mode="aspectFill" />
        <view v-else class="records__img records__img--ph" />
        <view class="records__main">
          <text class="records__name">{{ rec.prizeName }}</text>
          <text class="records__time">{{ fmtTime(rec.createdAt) }}</text>
        </view>
        <text class="records__consume" :class="{ 'records__consume--free': !rec.consume }">
          {{ rec.consume > 0 ? '-' + rec.consume + ' 积分' : '免费' }}
        </text>
      </view>
      <EmptyState v-if="recordItems.length === 0 && !recordsLoading" :text="authStore.token ? '暂无中奖记录' : '登录后可查看中奖记录'" />
      <view v-if="recordsLoading" class="records__loading">加载中...</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onReachBottom, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { getMyLotteryPrizes, drawLottery, getMyLotteryRecords, type LotteryPrizeInfo } from '../../api/queries/lottery';
import { getMyMemberInfo } from '../../api/queries/member';
import { useAuthStore } from '../../stores/auth';
import { usePagination } from '../../composables/usePagination';
import EmptyState from '../../components/EmptyState.vue';

const authStore = useAuthStore();

const prizes = ref<LotteryPrizeInfo[]>([]);
const prizesLoading = ref(false);
const points = ref<number | null>(null);

const spinning = ref(false);
const highlight = ref(-1);
const showResult = ref(false);
const result = ref<{ prize: LotteryPrizeInfo } | null>(null);

// 九宫格：奖品槽固定 8 个，槽 k 展示 prizes[k % len]（不足 8 循环补位）。
// 服务端 prizeIndex = myLotteryPrizes 数组下标，槽位与数组同序 → 高亮槽位即中奖奖品格。
const SLOT_COUNT = 8;
// 槽序 → 3×3 格位（顺时针，左上起）；格位 4 留给抽奖按钮
const CLOCKWISE_CELLS = [0, 1, 2, 5, 8, 7, 6, 3];

const slots = computed<Array<LotteryPrizeInfo | null>>(() => {
  const len = prizes.value.length;
  return Array.from({ length: SLOT_COUNT }, (_, k) => (len ? prizes.value[k % len] : null));
});

// 按格位顺序输出 9 格（index 4 = 抽奖按钮）
const cells = computed(() => {
  const arr: Array<{ slot: number; prize: LotteryPrizeInfo | null }> = [];
  for (let gi = 0; gi < 9; gi++) arr.push({ slot: -1, prize: null });
  slots.value.forEach((p, k) => {
    arr[CLOCKWISE_CELLS[k]] = { slot: k, prize: p };
  });
  return arr;
});

function consumeText(consume: number): string {
  return consume > 0 ? consume + '积分' : '免费';
}

function fmtTime(s: string): string {
  return s ? String(s).replace('T', ' ').slice(0, 16) : '';
}

async function loadPrizes() {
  prizesLoading.value = true;
  try {
    const r: any = await getMyLotteryPrizes();
    prizes.value = r?.myLotteryPrizes ?? [];
  } catch (e) {
    // 未登录也可看；失败展示空态即可
  }
  prizesLoading.value = false;
}

async function loadPoints() {
  if (!authStore.token) {
    points.value = null;
    return;
  }
  try {
    const r: any = await getMyMemberInfo();
    points.value = r?.myMemberInfo?.points ?? null;
  } catch (e) {
    // 静默：积分展示失败不阻断抽奖
  }
}

const { items: recordItems, loading: recordsLoading, loadMore: loadMoreRecords, refresh: refreshRecords } = usePagination<any>({
  fetchFn: async ({ take, skip }) => {
    if (!authStore.token) return { items: [], totalItems: 0 };
    const r: any = await getMyLotteryRecords(skip, take);
    return r?.myLotteryRecords || { items: [], totalItems: 0 };
  },
});

// 跑马灯：先快后慢（1.5 圈起步），最终停在 prizeIndex 对应槽位；服务端开奖结果唯一可信，前端不随机
function spinTo(prizeIndex: number): Promise<void> {
  return new Promise((resolve) => {
    const loops = 12; // 1.5 圈
    const extra = ((((prizeIndex - loops) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT) || SLOT_COUNT;
    const total = loops + extra;
    let step = 0;
    const tick = () => {
      step += 1;
      highlight.value = step % SLOT_COUNT;
      if (step >= total) {
        resolve();
        return;
      }
      setTimeout(tick, 80 + (step / total) * 260);
    };
    highlight.value = 0;
    setTimeout(tick, 80);
  });
}

async function onDraw() {
  if (spinning.value || !prizes.value.length) return;
  if (!authStore.requireLogin('/pkg-user/pages/lottery')) return;
  spinning.value = true;
  try {
    const r: any = await drawLottery();
    const prizeIndex = Number(r?.drawLottery?.prizeIndex);
    const prize = r?.drawLottery?.prize as LotteryPrizeInfo | undefined;
    if (prize) {
      await spinTo(prizeIndex);
      result.value = { prize };
      showResult.value = true;
    }
    void loadPoints();
    void refreshRecords();
  } catch (e: any) {
    // 积分不足等后端报错原样透出
    uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || '抽奖失败', icon: 'none' });
  }
  spinning.value = false;
}

function closeResult() {
  showResult.value = false;
  highlight.value = -1;
}

onShow(() => {
  void loadPrizes();
  void loadPoints();
  if (authStore.token) void refreshRecords();
});

onReachBottom(() => loadMoreRecords());
onPullDownRefresh(async () => {
  await loadPrizes();
  await refreshRecords();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.lottery-page {
  min-height: 100vh; background: $bg-color; padding: 20rpx; padding-bottom: 60rpx;
}
.points-card {
  background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx;
  &__row { display: flex; align-items: baseline; gap: 16rpx; }
  &__label { font-size: 26rpx; color: #666; }
  &__value { font-size: 40rpx; font-weight: bold; color: $brand-color; }
  &__tip { display: block; font-size: 22rpx; color: #999; margin-top: 8rpx; }
}
.wheel-card {
  background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 20rpx;
  &__empty { display: block; text-align: center; color: #999; font-size: 24rpx; padding: 20rpx 0; }
}
.wheel { display: flex; flex-wrap: wrap; }
.wheel__slot {
  width: 33.33%; box-sizing: border-box; padding: 8rpx; height: 220rpx;
  &--center { display: flex; align-items: center; justify-content: center; }
}
.wheel__draw {
  width: 100%; height: 100%; border-radius: $radius-md;
  background: $brand-color; display: flex; align-items: center; justify-content: center;
  &--busy { opacity: 0.7; }
}
.wheel__draw-txt { color: #fff; font-size: 32rpx; font-weight: bold; }
.wheel__box {
  width: 100%; height: 100%; border-radius: $radius-md; background: $bg-color;
  border: 3rpx solid transparent; box-sizing: border-box; padding: 12rpx;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  &--on { border-color: $brand-color; background: #fff3e6; transform: scale(1.04); }
  &--empty { background: #f7f7f7; }
}
.wheel__img {
  width: 96rpx; height: 96rpx; border-radius: 12rpx;
  &--ph { background: #e5e5e5; }
}
.wheel__name {
  font-size: 24rpx; color: #333; margin-top: 8rpx; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wheel__consume { font-size: 20rpx; color: $brand-color; margin-top: 4rpx; &--free { color: $success-color; } }
.result-mask {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 999;
  display: flex; align-items: center; justify-content: center;
}
.result {
  width: 560rpx; background: #fff; border-radius: $radius-md; padding: 48rpx 32rpx 32rpx;
  display: flex; flex-direction: column; align-items: center;
  &__badge {
    font-size: 24rpx; color: $brand-color; background: #fff3e6;
    border-radius: 999rpx; padding: 6rpx 28rpx; margin-bottom: 24rpx;
  }
  &__img { width: 200rpx; height: 200rpx; border-radius: 16rpx; margin-bottom: 20rpx; }
  &__title { font-size: 32rpx; font-weight: bold; color: #333; text-align: center; }
  &__consume { font-size: 24rpx; color: #999; margin-top: 12rpx; }
  &__btn {
    margin-top: 36rpx; width: 320rpx; height: 80rpx; line-height: 80rpx;
    background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; padding: 0;
  }
}
.records {
  background: #fff; border-radius: $radius-md; padding: 24rpx;
  &__title { display: block; font-size: 30rpx; font-weight: bold; color: #333; margin-bottom: 16rpx; }
  &__item {
    display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid $border-color;
    &:last-of-type { border-bottom: none; }
  }
  &__img {
    width: 88rpx; height: 88rpx; border-radius: 12rpx; flex-shrink: 0;
    &--ph { background: #eee; }
  }
  &__main { flex: 1; display: flex; flex-direction: column; margin-left: 16rpx; min-width: 0; }
  &__name { font-size: 28rpx; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__time { font-size: 22rpx; color: #999; margin-top: 6rpx; }
  &__consume { font-size: 26rpx; color: $brand-color; font-weight: bold; &--free { color: $success-color; } }
  &__loading { text-align: center; color: #999; font-size: 24rpx; padding: 20rpx; }
}
</style>
