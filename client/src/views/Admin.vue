<template>
  <div class="main-layout">
    <div class="main-header">
      <span class="logo">💬 LanChat - 后台管理</span>
      <div class="user-info">
        <el-button size="small" plain @click="$router.push('/main')">返回聊天</el-button>
        <el-button size="small" type="danger" plain @click="handleLogout">退出</el-button>
      </div>
    </div>

    <div style="flex: 1; padding: 20px; overflow-y: auto; background: #f5f7fa; display: grid; gap: 16px">
      <el-card>
        <template #header>
          <div style="display: flex; justify-content: space-between; align-items: center">
            <span style="font-weight: bold; font-size: 16px">用户管理</span>
            <el-button type="primary" @click="showCreateDialog">新建用户</el-button>
          </div>
        </template>

        <el-table :data="users" stripe style="width: 100%" v-loading="loadingUsers">
          <el-table-column prop="id" label="ID" width="60" />
          <el-table-column prop="username" label="用户名" width="120" />
          <el-table-column prop="nickname" label="昵称" width="120" />
          <el-table-column prop="role" label="角色" width="100">
            <template #default="{ row }">
              <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small">
                {{ row.role === 'admin' ? '管理员' : '普通用户' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'warning'" size="small">
                {{ row.status === 'active' ? '正常' : '已禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="创建时间" width="170" />
          <el-table-column label="操作" min-width="240">
            <template #default="{ row }">
              <el-button size="small" @click="showEditDialog(row)">编辑</el-button>
              <el-button size="small" type="warning" @click="showResetDialog(row)">重置密码</el-button>
              <el-button
                size="small"
                :type="row.status === 'active' ? 'warning' : 'success'"
                plain
                @click="toggleStatus(row)"
              >
                {{ row.status === 'active' ? '禁用' : '启用' }}
              </el-button>
              <el-popconfirm title="确定删除该用户？" @confirm="deleteUser(row)">
                <template #reference>
                  <el-button size="small" type="danger">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card>
        <template #header>
          <div style="display: flex; justify-content: space-between; align-items: center">
            <span style="font-weight: bold; font-size: 16px">频道管理</span>
            <el-button type="primary" @click="showCreateChannelDialog">新建频道</el-button>
          </div>
        </template>

        <el-table :data="channels" stripe style="width: 100%" v-loading="loadingChannels">
          <el-table-column prop="id" label="ID" width="60" />
          <el-table-column prop="name" label="频道名" min-width="180" />
          <el-table-column label="成员" min-width="260">
            <template #default="{ row }">
              <div style="display: flex; flex-wrap: wrap; gap: 4px">
                <el-tag v-for="member in row.members" :key="`${row.id}-${member.id}`" size="small" type="info">
                  {{ member.nickname }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="member_count" label="成员数" width="90" />
          <el-table-column prop="created_at" label="创建时间" width="170" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" @click="showEditChannelDialog(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建用户' : '编辑用户'"
      width="450px"
    >
      <el-form :model="formData" :rules="formRules" ref="formRef" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="formData.username" :disabled="dialogMode === 'edit'" />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'create'" label="密码" prop="password">
          <el-input v-model="formData.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="formData.nickname" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="formData.role" style="width: 100%">
            <el-option label="普通用户" value="user" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resetDialogVisible" title="重置密码" width="400px">
      <el-form :model="resetForm" :rules="resetRules" ref="resetFormRef" label-width="80px">
        <el-form-item label="新密码" prop="password">
          <el-input v-model="resetForm.password" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleReset" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="channelDialogVisible"
      :title="channelMode === 'create' ? '新建频道' : '编辑频道'"
      width="500px"
    >
      <el-form :model="channelForm" :rules="channelRules" ref="channelFormRef" label-width="90px">
        <el-form-item label="频道名称" prop="name">
          <el-input v-model="channelForm.name" maxlength="30" show-word-limit />
        </el-form-item>
        <el-form-item label="频道成员" prop="memberIds">
          <el-select
            v-model="channelForm.memberIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="请选择成员"
            style="width: 100%"
          >
            <el-option
              v-for="user in selectableUsers"
              :key="user.id"
              :label="`${user.nickname} (${user.username})`"
              :value="user.id"
            />
          </el-select>
          <div style="font-size: 12px; color: #909399; margin-top: 6px">管理员本人会自动加入频道</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="channelDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleChannelSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { userAPI, channelAPI } from '@/services/api';
import { useUserStore } from '@/stores/user';
import { disconnectSocket } from '@/services/socket';
import { useChatStore } from '@/stores/chat';

const router = useRouter();
const userStore = useUserStore();
const chatStore = useChatStore();

const users = ref([]);
const channels = ref([]);
const loadingUsers = ref(false);
const loadingChannels = ref(false);
const submitting = ref(false);

// 用户对话框
const dialogVisible = ref(false);
const dialogMode = ref('create');
const formRef = ref(null);
const formData = ref({ username: '', password: '', nickname: '', role: 'user' });
const editUserId = ref(null);

const formRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度 3-20 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 个字符', trigger: 'blur' },
  ],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
};

// 重置密码对话框
const resetDialogVisible = ref(false);
const resetFormRef = ref(null);
const resetForm = ref({ password: '' });
const resetUserId = ref(null);

const resetRules = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 个字符', trigger: 'blur' },
  ],
};

// 频道对话框
const channelDialogVisible = ref(false);
const channelMode = ref('create');
const channelFormRef = ref(null);
const channelForm = ref({ name: '', memberIds: [] });
const editChannelId = ref(null);

const channelRules = {
  name: [{ required: true, message: '请输入频道名称', trigger: 'blur' }],
};

const selectableUsers = computed(() => users.value);

onMounted(async () => {
  await Promise.all([loadUsers(), loadChannels()]);
});

async function loadUsers() {
  loadingUsers.value = true;
  try {
    const result = await userAPI.getUsers();
    users.value = result.users || [];
  } finally {
    loadingUsers.value = false;
  }
}

async function loadChannels() {
  loadingChannels.value = true;
  try {
    const result = await channelAPI.getAdminChannels();
    channels.value = result.channels || [];
  } finally {
    loadingChannels.value = false;
  }
}

function showCreateDialog() {
  dialogMode.value = 'create';
  formData.value = { username: '', password: '', nickname: '', role: 'user' };
  dialogVisible.value = true;
}

function showEditDialog(row) {
  dialogMode.value = 'edit';
  editUserId.value = row.id;
  formData.value = { username: row.username, nickname: row.nickname, role: row.role };
  dialogVisible.value = true;
}

function showResetDialog(row) {
  resetUserId.value = row.id;
  resetForm.value = { password: '' };
  resetDialogVisible.value = true;
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    if (dialogMode.value === 'create') {
      await userAPI.createUser(formData.value);
      ElMessage.success('用户创建成功');
    } else {
      await userAPI.updateUser(editUserId.value, {
        nickname: formData.value.nickname,
        role: formData.value.role,
      });
      ElMessage.success('用户信息已更新');
    }
    dialogVisible.value = false;
    await loadUsers();
  } finally {
    submitting.value = false;
  }
}

async function handleReset() {
  const valid = await resetFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    await userAPI.resetPassword(resetUserId.value, resetForm.value.password);
    ElMessage.success('密码已重置');
    resetDialogVisible.value = false;
  } finally {
    submitting.value = false;
  }
}

async function toggleStatus(row) {
  const newStatus = row.status === 'active' ? 'disabled' : 'active';
  await userAPI.updateUser(row.id, { status: newStatus });
  ElMessage.success(newStatus === 'active' ? '已启用' : '已禁用');
  await Promise.all([loadUsers(), loadChannels()]);
}

async function deleteUser(row) {
  await userAPI.deleteUser(row.id);
  ElMessage.success('用户已删除');
  await Promise.all([loadUsers(), loadChannels()]);
}

function showCreateChannelDialog() {
  channelMode.value = 'create';
  editChannelId.value = null;
  channelForm.value = { name: '', memberIds: [] };
  channelDialogVisible.value = true;
}

function showEditChannelDialog(channel) {
  channelMode.value = 'edit';
  editChannelId.value = channel.id;
  channelForm.value = {
    name: channel.name,
    memberIds: (channel.members || []).map((item) => item.id),
  };
  channelDialogVisible.value = true;
}

async function handleChannelSubmit() {
  const valid = await channelFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    if (channelMode.value === 'create') {
      await channelAPI.createChannel({
        name: channelForm.value.name,
        memberIds: channelForm.value.memberIds,
      });
      ElMessage.success('频道创建成功');
    } else {
      await channelAPI.updateChannel(editChannelId.value, {
        name: channelForm.value.name,
        memberIds: channelForm.value.memberIds,
      });
      ElMessage.success('频道已更新');
    }

    channelDialogVisible.value = false;
    await loadChannels();
  } finally {
    submitting.value = false;
  }
}

function handleLogout() {
  disconnectSocket();
  chatStore.reset();
  userStore.logout();
  router.push('/login');
  ElMessage.success('已退出登录');
}
</script>
