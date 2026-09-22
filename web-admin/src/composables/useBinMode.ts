// 库位三档开关（off / zone / bin）的**唯一**判定入口。
// 所有消费点都必须经这里判断，禁止各处硬写 if —— 这是避免「半开状态」的唯一防线。
// 数据来源：Channel.customFields.binMode（与后端 StorageBinService.resolveMode 同语义，缺省按 off）。
import { computed, ref } from 'vue';
import { fetchActiveChannel } from '../apis/channel';

export type BinMode = 'off' | 'zone' | 'bin';

// 模块级缓存：一次会话只拉一次渠道开关（多页面共用，避免重复请求）
const modeRef = ref<BinMode>('off');
let loaded = false;
let inflight: Promise<void> | null = null;

/** 拉取并缓存当前渠道的库位档位。失败按 off 处理（宁可不显示库位，也不出现半开状态）。 */
export async function ensureBinMode(force = false): Promise<void> {
  if (loaded && !force) return;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    try {
      const ch = await fetchActiveChannel();
      const v = ch?.customFields?.binMode;
      modeRef.value = v === 'zone' || v === 'bin' ? v : 'off';
      loaded = true;
    } catch (_e) {
      // 网络/权限异常不写入 loaded，下次仍可重试
      modeRef.value = 'off';
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 切店后强制失效缓存（档位可能随渠道变化） */
export function resetBinMode(): void {
  loaded = false;
  inflight = null;
  modeRef.value = 'off';
}

export function useBinMode() {
  /** 档位：off / zone / bin */
  const mode = computed<BinMode>(() => modeRef.value);
  /** 是否展示库区（zone 与 bin 档都为 true） */
  const showZone = computed(() => modeRef.value === 'zone' || modeRef.value === 'bin');
  /** 是否展示具体库位编码（仅 bin 档） */
  const showBin = computed(() => modeRef.value === 'bin');

  return { mode, showZone, showBin, ensureBinMode, resetBinMode };
}