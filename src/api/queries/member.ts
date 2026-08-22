import { getGraphQLClient } from '../client';

/** 我的会员信息（等级/成长值/积分/权益倍率） */
export async function getMyMemberInfo() {
    const client = getGraphQLClient();
    return client.request(`query MyMemberInfo {
        myMemberInfo { customerId level levelName growthValue points nextLevelThreshold nextLevelName pointsMultiplier redeemDiscountRate redeemCapRatio specialDiscountRate }
    }`);
}

/** 我的积分明细（分页） */
export async function getMyPointsHistory(options: { take: number; skip: number }) {
    const client = getGraphQLClient();
    return client.request(
        `query MyPointsHistory($skip: Int, $take: Int) { myPointsHistory(options: { skip: $skip, take: $take }) { items { id type amount balanceBefore balanceAfter orderId remark expiresAt createdAt } totalItems } }`,
        { skip: options.skip, take: options.take },
    );
}

/** 积分抵现：绑定即扣，返回重算价后的订单 */
export async function redeemPoints(points: number) {
    const client = getGraphQLClient();
    return client.request(
        `mutation RedeemPoints($points: Int!) { redeemPoints(points: $points) { id totalWithTax customFields } }`,
        { points },
    );
}

/** 今日签到状态 */
export async function getCheckinToday() {
    const client = getGraphQLClient();
    return client.request(`query { checkinToday { checkedIn streak canCheckin } }`);
}

/** 签到 */
export async function doCheckin() {
    const client = getGraphQLClient();
    return client.request(`mutation { checkin { success reason points growth streak } }`);
}

/** 积分兑换商城：可兑换券列表 */
export async function getPointsMallTemplates() {
    const client = getGraphQLClient();
    return client.request(`query PointsMallTemplates {
        pointsMallTemplates {
            id name type discountValue minSpend pointsPrice totalCount claimedCount perUserLimit enabled
        }
    }`);
}

/** 积分兑换优惠券（成功扣积分并发放一张券） */
export async function exchangeCouponWithPoints(templateId: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation ExchangeCouponWithPoints($templateId: ID!) {
            exchangeCouponWithPoints(templateId: $templateId) { coupon { code status } spentPoints }
        }`,
        { templateId },
    );
}