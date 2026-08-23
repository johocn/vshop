<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">名称 *</text>
        <input class="ipt" v-model="form.name" placeholder="如 北京朝阳自提点" />
      </view>
      <view class="field">
        <text class="label">类型 *</text>
        <picker :range="typeLabels" @change="form.type = typeKeys[$event.detail.value]">
          <view class="ipt picker">{{ mapTypeLabel(form.type) }}</view>
        </picker>
      </view>
      <view class="field">
        <text class="label">联系人</text>
        <input class="ipt" v-model="form.contactPerson" placeholder="如 王店长" />
      </view>
      <view class="field">
        <text class="label">联系电话</text>
        <input class="ipt" v-model="form.phoneNumber" placeholder="如 010-88886666" />
      </view>
      <view class="field">
        <text class="label">营业时间</text>
        <input class="ipt" v-model="form.businessHours" placeholder="如 09:00-21:00" />
      </view>
      <view class="field">
        <text class="label">省份</text>
        <input class="ipt" v-model="form.province" placeholder="如 北京市" />
      </view>
      <view class="field">
        <text class="label">城市</text>
        <input class="ipt" v-model="form.city" placeholder="如 北京市" />
      </view>
      <view class="field">
        <text class="label">区县</text>
        <input class="ipt" v-model="form.district" placeholder="如 朝阳区" />
      </view>
      <view class="field">
        <text class="label">街道/详细地址</text>
        <input class="ipt" v-model="form.street" placeholder="如 望京街道XX路1号" />
      </view>
      <view class="field">
        <text class="label">完整地址</text>
        <input class="ipt" v-model="form.address" placeholder="省市区 + 详细地址" />
      </view>
      <view class="field row2">
        <text class="label">纬度 lat</text>
        <input class="ipt half" v-model="form.lat" type="digit" placeholder="39.9042" />
      </view>
      <view class="field row2">
        <text class="label">经度 lng</text>
        <input class="ipt half" v-model="form.lng" type="digit" placeholder="116.4074" />
      </view>
      <view class="field">
        <text class="label">备注</text>
        <textarea class="area" v-model="form.remark" placeholder="如 临街商铺，进门报手机号取件"></textarea>
      </view>
      <view class="field">
        <text class="label">排序</text>
        <input class="ipt" v-model="form.sortOrder" type="number" placeholder="0" />
      </view>
      <view class="field">
        <text class="label">启用</text>
        <switch :checked="form.enabled" @change="form.enabled = $event.detail.value" color="#2563eb" />
      </view>

      <view class="field">
        <text class="label">自提点照片</text>
        <view class="media">
          <image v-for="(u, i) in photos" :key="i" class="mimg" :src="u" mode="aspectFill" @tap="preview(i)" @longpress="removePhoto(i)" />
          <view class="madd" @tap="onAddPhoto">＋</view>
        </view>
        <input class="ipt" v-model="photoUrl" placeholder="粘贴图片 URL 后点右侧 + 添加" />
      </view>
    </view>

    <view class="ops">
      <button class="btn ghost" @tap="goBack">返回</button>
      <button class="btn main" @tap="onSave">保存</button>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchPickupLocation, createPickupLocation, updatePickupLocation,
  PickupLocationItem, PickupLocationType,
} from '../../../apis/pickup-location';

const id = ref<string | null>(null);
const typeKeys: PickupLocationType[] = ['store', 'point', 'employee'];
const typeLabels = ['门店（store）', '自提点（point）', '职工单位（employee）'];
const mapType = (t: string) => ({ store: 'store', point: 'point', employee: 'employee' }[t] || t);
const mapTypeLabel = (t: string) => ({ store: '门店（store）', point: '自提点（point）', employee: '职工单位（employee）' }[t] || t);

const form = ref({
  name: '', type: 'point' as PickupLocationType, contactPerson: '', phoneNumber: '',
  businessHours: '', province: '', city: '', district: '', street: '', address: '',
  lat: '', lng: '', remark: '', sortOrder: '0', enabled: true,
});
const photos = ref<string[]>([]);
const photoUrl = ref('');

onLoad((query: any) => {
  if (query?.id) id.value = query?.id as string;
});

onMounted(async () => {
  if (id.value) {
    const s = await fetchPickupLocation(id.value);
    if (s) {
      form.value = {
        name: s.name || '', type: s.type, contactPerson: s.contactPerson || '',
        phoneNumber: s.phoneNumber || '', businessHours: s.businessHours || '',
        province: s.province || '', city: s.city || '', district: s.district || '',
        street: s.street || '', address: s.address || '',
        lat: s.coordinates?.lat != null ? String(s.coordinates.lat) : '',
        lng: s.coordinates?.lng != null ? String(s.coordinates.lng) : '',
        remark: s.remark || '', sortOrder: String(s.sortOrder ?? 0),
        enabled: s.enabled !== false,
      };
      photos.value = s.photos || [];
    }
  }
});

function preview(i: number) {
  uni.previewImage({ urls: photos.value, current: photos.value[i] });
}
function onAddPhoto() {
  const u = photoUrl.value.trim();
  if (!u) { uni.showToast({ title: '请输入图片 URL', icon: 'none' }); return; }
  if (!photos.value.includes(u)) photos.value.push(u);
  photoUrl.value = '';
}
function removePhoto(i: number) {
  uni.showModal({
    title: '移除照片', content: '确认移除这张照片？',
    success: (r) => { if (r.confirm) photos.value.splice(i, 1); },
  });
}

function goBack() { uni.navigateBack(); }

async function onSave() {
  if (!form.value.name.trim()) { uni.showToast({ title: '请填写名称', icon: 'none' }); return; }
  const coordinates = form.value.lat && form.value.lng &&
    !isNaN(Number(form.value.lat)) && !isNaN(Number(form.value.lng))
    ? { lat: Number(form.value.lat), lng: Number(form.value.lng) }
    : undefined;
  const payload = {
    name: form.value.name.trim(),
    type: form.value.type,
    contactPerson: form.value.contactPerson.trim() || undefined,
    phoneNumber: form.value.phoneNumber.trim() || undefined,
    businessHours: form.value.businessHours.trim() || undefined,
    province: form.value.province.trim() || undefined,
    city: form.value.city.trim() || undefined,
    district: form.value.district.trim() || undefined,
    street: form.value.street.trim() || undefined,
    address: form.value.address.trim(),
    remark: form.value.remark.trim() || undefined,
    sortOrder: Number(form.value.sortOrder) || 0,
    enabled: form.value.enabled,
    photos: photos.value.length ? photos.value : undefined,
    ...(coordinates ? { coordinates } : {}),
  };
  try {
    let savedId = id.value;
    if (id.value) {
      await updatePickupLocation({ id: id.value, ...payload });
    } else {
      savedId = await createPickupLocation(payload as any);
      uni.$emit('pickup-created', savedId);
    }
    uni.showToast({ title: '保存成功' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '保存失败', icon: 'none' });
  }
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .field { margin-bottom: 20rpx;
      &.row2 { width: 48%; display: inline-block; margin-right: 0; }
      .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx; }
      .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; box-sizing: border-box; width: 100%;
        &.half { width: 100%; }
      }
      .picker { display: flex; align-items: center; }
      .area { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; width: 100%; height: 140rpx; box-sizing: border-box; }
      .media { display: flex; flex-wrap: wrap; margin-bottom: 16rpx;
        .mimg { width: 140rpx; height: 140rpx; border-radius: $wa-radius; margin: 0 12rpx 12rpx 0; background: $wa-bg; }
        .madd { width: 140rpx; height: 140rpx; border-radius: $wa-radius; border: 2rpx dashed $wa-rule; display: flex; align-items: center; justify-content: center; font-size: 56rpx; color: $wa-muted; }
      }
    }
  }
  .ops { display: flex; position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx; background: #fff; box-shadow: 0 -2rpx 12rpx rgba(0,0,0,.04);
    .btn { flex: 1; margin: 0 8rpx; font-size: 28rpx; border-radius: $wa-radius; line-height: 80rpx; }
    .main { background: $wa-accent; color: #fff; }
    .ghost { background: $wa-bg; color: $wa-muted; }
  }
}
</style>