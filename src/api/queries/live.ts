import { getGraphQLClient } from '../client';

export async function getLiveRooms(status?: string) {
    const client = getGraphQLClient();
    const fields = 'id name coverUrl streamerName status type scheduledStartAt replayUrl playUrl likeCount viewCount';
    if (status) {
        return client.request(`query LiveRooms($status: String) { liveRooms(status: $status) { ${fields} } }`, { status });
    }
    return client.request(`query LiveRooms { liveRooms { ${fields} } }`);
}

export async function getLiveRoom(id: string) {
    const client = getGraphQLClient();
    return client.request(
        `query LiveRoom($id: ID!) { liveRoom(id: $id) {
            id name coverUrl streamerName status type scheduledStartAt startedAt endedAt playUrl replayUrl likeCount viewCount
            products { id variantId name price imageUrl sortOrder }
        } }`,
        { id },
    );
}

export async function enterLiveRoom(roomId: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation EnterLiveRoom($roomId: ID!) { enterLiveRoom(roomId: $roomId) { roomId playUrl pushUrl wsUrl wsTicket } }`,
        { roomId },
    );
}

export async function setOrderLiveRoom(roomId: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation SetOrderLiveRoom($roomId: ID!) { setOrderLiveRoom(roomId: $roomId) { id } }`,
        { roomId },
    );
}