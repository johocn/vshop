/** 自提点实体（对应后端 PickupLocation） */
export interface PickupLocation {
    id: string;
    name: string;
    type: string;
    address: string;
    contactPerson?: string;
    phoneNumber?: string;
    businessHours?: string;
    coordinates?: { lat: number; lng: number } | null;
    photos?: string[] | null;
    isPublic?: boolean;
}

/** 用户定位坐标 */
export interface UserLocation {
    lat: number;
    lng: number;
}
