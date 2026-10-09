import { getGraphQLClient } from '../client';

// 积分抽奖（lottery-plugin）shop-api 调用。
// SDL 校准要点（以 vendure packages/lottery-plugin/src/plugin.ts 为准）：
//   - myLotteryPrizes 未登录可看；返回顺序 = sort ASC/id ASC（含 enabled + 库存可用 + 渠道匹配）
//   - drawLottery 需登录；prizeIndex 即 myLotteryPrizes 返回顺序的数组下标，九宫格必须同序渲染
//   - 每次抽中按所中奖品的 consume 扣积分（consume=0 为免费抽奖）
//   - weight<=0 的奖项仅展示、永不抽中

export interface LotteryPrizeInfo {
    id: string;
    name: string;
    image?: string | null;
    consume: number;
}

/** 九宫格奖品列表（未登录可看；顺序与开奖 prizeIndex 同源） */
export async function getMyLotteryPrizes() {
    const client = getGraphQLClient();
    return client.request(`query MyLotteryPrizes { myLotteryPrizes { id name image consume } }`);
}

/** 抽奖（登录；服务端加权开奖，返回 prizeIndex + 中奖奖品） */
export async function drawLottery() {
    const client = getGraphQLClient();
    return client.request(
        `mutation DrawLottery { drawLottery { prizeIndex prize { id name image consume } } }`,
    );
}

/** 我的中奖记录（登录；id 倒序分页） */
export async function getMyLotteryRecords(skip: number, take: number) {
    const client = getGraphQLClient();
    return client.request(
        `query MyLotteryRecords($skip: Int, $take: Int) {
            myLotteryRecords(options: { skip: $skip, take: $take }) {
                items { id prizeName prizeImage consume createdAt }
                totalItems
            }
        }`,
        { skip, take },
    );
}
