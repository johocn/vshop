<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { gql } from '@apollo/client/core';
import { apolloClient } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useSessionStore } from '@/stores/session';

interface Terminal {
  id: string;
  code: string;
  name: string;
  active: boolean;
  channel: { id: string; code: string };
  stockLocation: { id: string; name: string } | null;
}

const POS_TERMINALS = gql`
  query PosTerminals {
    posTerminals {
      id
      code
      name
      active
      channel {
        id
        code
      }
      stockLocation {
        id
        name
      }
    }
  }
`;

const router = useRouter();
const authStore = useAuthStore();
const sessionStore = useSessionStore();

const channelCode = authStore.activeChannel?.code || '';
const terminals = ref<Terminal[]>([]);
const loadingTerminals = ref(false);
const selectedTerminalCode = ref('');
// 备用金输入（元），提交时转分
const openingFloatYuan = ref<number | null>(null);
const opening = ref(false);
const checking = ref(true);

async function loadTerminals() {
  loadingTerminals.value = true;
  try {
    const { data, errors } = await apolloClient.query({
      query: POS_TERMINALS,
      fetchPolicy: 'network-only',
    });
    if (errors?.length && !data) throw new Error(errors[0].message);
    terminals.value = (data?.posTerminals || []) as Terminal[];
  } catch (e) {
    ElMessage.error('加载终端失败：' + (e instanceof Error ? e.message : ''));
    terminals.value = [];
  } finally {
    loadingTerminals.value = false;
  }
}

function handleTerminalSelect(row: Terminal) {
  if (!row.active) {
    ElMessage.warning('该终端已停用');
    return;
  }
  selectedTerminalCode.value = row.code;
}

async function handleOpenSession() {
  if (!selectedTerminalCode.value) {
    ElMessage.warning('请选择终端');
    return;
  }
  opening.value = true;
  try {
    // 元转分
    const openingFloatCents =
      openingFloatYuan.value != null ? Math.round(openingFloatYuan.value * 100) : undefined;
    await sessionStore.openSession(selectedTerminalCode.value, openingFloatCents);
    ElMessage.success('开班成功');
    router.replace('/cashier');
  } catch (e) {
    ElMessage.error('开班失败：' + (e instanceof Error ? e.message : ''));
  } finally {
    opening.value = false;
  }
}

async function handleLogout() {
  authStore.logoutToAdmin();
}

onMounted(async () => {
  // 检查是否已开班
  try {
    await sessionStore.loadMySession();
    if (sessionStore.isOpen) {
      router.replace('/cashier');
      return;
    }
  } catch {
    // 忽略，继续显示开班界面
  }
  checking.value = false;
  await loadTerminals();
});
</script>

<template>
  <div class="setup-container">
    <el-card class="setup-card">
      <template #header>
        <div class="setup-header">
          <span>开班设置 <span class="sub">（{{ channelCode || '-' }}）</span></span>
          <el-button link type="danger" @click="handleLogout">退出登录</el-button>
        </div>
      </template>

      <div v-if="checking" v-loading="true" style="min-height: 200px"></div>

      <template v-else>
        <el-form label-position="top">
          <el-form-item label="终端列表">
            <el-table
              :data="terminals"
              v-loading="loadingTerminals"
              highlight-current-row
              style="width: 100%"
              @current-change="handleTerminalSelect"
              empty-text="当前 Channel 下暂无终端"
            >
              <el-table-column prop="code" label="编码" width="120" />
              <el-table-column prop="name" label="名称" />
              <el-table-column label="仓库" width="140">
                <template #default="{ row }">
                  {{ row.stockLocation?.name || '-' }}
                </template>
              </el-table-column>
              <el-table-column label="状态" width="80">
                <template #default="{ row }">
                  <el-tag :type="row.active ? 'success' : 'info'" size="small">
                    {{ row.active ? '启用' : '停用' }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-form-item>

          <el-form-item label="备用金（元）">
            <el-input-number
              v-model="openingFloatYuan"
              :min="0"
              :precision="2"
              :step="100"
              placeholder="0.00"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              :loading="opening"
              :disabled="!selectedTerminalCode"
              style="width: 100%"
              @click="handleOpenSession"
            >
              开班
            </el-button>
          </el-form-item>
        </el-form>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.setup-container {
  display: flex;
  justify-content: center;
  padding: 40px 16px;
  background: #f0f2f5;
  min-height: 100vh;
  box-sizing: border-box;
}
.setup-card {
  width: 640px;
}
.setup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 18px;
  font-weight: 600;
}
.setup-header .sub {
  font-size: 13px;
  font-weight: 400;
  color: #909399;
}
</style>