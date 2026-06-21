import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUIStore = defineStore('ui', () => {
    const loading = ref(false);
    const toastMessage = ref('');

    function showLoading() { loading.value = true; uni.showLoading({ title: '加载中...' }); }
    function hideLoading() { loading.value = false; uni.hideLoading(); }
    function showToast(msg: string, icon: 'success' | 'error' | 'none' = 'none') {
        uni.showToast({ title: msg, icon, duration: 2000 });
    }

    return { loading, toastMessage, showLoading, hideLoading, showToast };
});