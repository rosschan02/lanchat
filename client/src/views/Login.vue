<template>
  <div class="login-container">
    <div class="login-card">
      <h1>💬 LanChat</h1>
      <p class="subtitle">局域网即时通讯工具</p>

      <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent="handleLogin">
        <!-- 服务器地址 -->
        <el-form-item>
          <el-input
            v-model="form.server"
            placeholder="服务器地址 (如: http://192.168.1.100:3000)"
            :prefix-icon="Link"
            size="large"
          />
        </el-form-item>

        <!-- 用户名 -->
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="用户名"
            :prefix-icon="User"
            size="large"
          />
        </el-form-item>

        <!-- 密码 -->
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            :prefix-icon="Lock"
            size="large"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <!-- 记住密码 -->
        <el-form-item>
          <el-checkbox v-model="form.remember">记住密码</el-checkbox>
        </el-form-item>

        <!-- 登录按钮 -->
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            style="width: 100%"
            :loading="loading"
            @click="handleLogin"
          >
            登 录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { User, Lock, Link } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { authAPI, setServerUrl, getServerUrl } from '@/services/api';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const userStore = useUserStore();
const formRef = ref(null);
const loading = ref(false);

const form = ref({
  server: getServerUrl(),
  username: '',
  password: '',
  remember: false,
});

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

// 页面加载时恢复记住的账号密码
onMounted(() => {
  const saved = localStorage.getItem('lanchat_remember');
  if (saved) {
    const data = JSON.parse(saved);
    form.value.username = data.username || '';
    form.value.password = data.password || '';
    form.value.remember = true;
  }
});

async function handleLogin() {
  // 表单验证
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  // 保存服务器地址
  if (form.value.server) {
    setServerUrl(form.value.server.replace(/\/+$/, ''));
  }

  loading.value = true;
  try {
    const result = await authAPI.login(form.value.username, form.value.password);

    // 保存登录信息
    userStore.setLogin(result.token, result.user);

    // 记住密码
    if (form.value.remember) {
      localStorage.setItem('lanchat_remember', JSON.stringify({
        username: form.value.username,
        password: form.value.password,
      }));
    } else {
      localStorage.removeItem('lanchat_remember');
    }

    ElMessage.success(`欢迎回来，${result.user.nickname}！`);
    router.push('/main');
  } catch (err) {
    // 错误已在 API 拦截器中处理
  } finally {
    loading.value = false;
  }
}
</script>
