import { ref } from 'vue'
import { api } from '../services/api'

/**
 * 空列表时区分「有绑定但无数据」与「账号未绑定诊所」。
 * 列表为空才请求 myStaff：有 binding → 普通空态；无 binding → 引导态。
 */
export function useClinicBinding() {
  const bound = ref(true)
  const loaded = ref(false)

  async function check(listLength: number) {
    if (listLength > 0) {
      bound.value = true
      loaded.value = true
      return
    }
    const staff = await api.myStaff().catch(() => [])
    bound.value = Array.isArray(staff) && staff.length > 0
    loaded.value = true
  }

  return { bound, loaded, check }
}
