import { getGraphQLClient } from '../client';

export async function getPickupLocations(
    type?: 'store' | 'point',
    location?: { lat: number; lng: number },
) {
    const client = getGraphQLClient();
    const variables: any = {};
    if (type) variables.type = type;
    if (location) {
        variables.lat = location.lat;
        variables.lng = location.lng;
    }
    return client.request(
        `query($type: String, $lat: Float, $lng: Float) {
            pickupLocations(type: $type, lat: $lat, lng: $lng) {
                id name type address phoneNumber businessHours coordinates isPublic
            }
        }`,
        variables,
    );
}

export async function getEmployeePickupLocations(
    location?: { lat: number; lng: number },
) {
    const client = getGraphQLClient();
    const variables: any = {};
    if (location) {
        variables.lat = location.lat;
        variables.lng = location.lng;
    }
    return client.request(
        `query($lat: Float, $lng: Float) {
            employeePickupLocations(lat: $lat, lng: $lng) {
                id name type address phoneNumber businessHours coordinates isPublic
            }
        }`,
        variables,
    );
}
