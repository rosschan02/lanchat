<template>
  <div class="main-layout">
    <!-- 顶部标题栏 -->
    <div class="main-header">
      <span class="logo">💬 LanChat</span>
      <div class="user-info">
        <span>{{ userStore.nickname }}</span>
        <el-button
          v-if="userStore.isAdmin"
          size="small"
          type="warning"
          plain
          @click="$router.push('/admin')"
        >
          管理后台
        </el-button>
        <el-button size="small" type="danger" plain @click="handleLogout">退出</el-button>
      </div>
    </div>

    <!-- 主体区域 -->
    <div class="main-body">
      <!-- 侧边栏：用户列表 -->
      <div class="sidebar">
        <div class="sidebar-header">
          <span>在线用户 ({{ chatStore.onlineUsers.length }})</span>
        </div>

        <!-- 群聊入口 -->
        <div
          class="user-item"
          :class="{ active: chatStore.currentChat.id === 0 }"
          @click="switchToGroup"
        >
          <span class="status-dot online"></span>
          <span class="user-name">📢 群聊</span>
          <el-badge
            v-if="chatStore.unreadCount[0]"
            :value="chatStore.unreadCount[0]"
            type="danger"
          />
        </div>

        <el-divider style="margin: 4px 0" />

        <!-- 在线用户列表 -->
        <div class="user-list" style="flex: 1; overflow-y: auto">
          <div
            v-for="user in chatStore.onlineUsers"
            :key="user.id"
            class="user-item"
            :class="{ active: chatStore.currentChat.id === user.id }"
            @click="switchToPrivate(user)"
          >
            <span class="status-dot online"></span>
            <span class="user-name">{{ user.nickname }}</span>
            <el-badge
              v-if="chatStore.unreadCount[user.id]"
              :value="chatStore.unreadCount[user.id]"
              type="danger"
            />
          </div>
        </div>
      </div>

      <!-- 聊天区域 -->
      <div class="chat-area">
        <div class="chat-header">
          {{ chatStore.currentChat.name }}
          <span v-if="chatStore.typingUser" style="margin-left: 10px; font-size: 12px; color: #909399; font-weight: normal">
            {{ chatStore.typingUser }} 正在输入...
          </span>
        </div>

        <!-- 消息列表 -->
        <div class="chat-messages" ref="messagesContainer">
          <div
            v-for="msg in chatStore.currentMessages"
            :key="msg.id"
            class="message-item"
            :class="{ self: msg.from_user_id === userStore.userId }"
          >
            <div class="message-avatar">
              {{ (msg.from_nickname || '?').charAt(0) }}
            </div>
            <div class="message-body">
              <div class="message-nickname">{{ msg.from_nickname }}</div>
              <div class="message-content">
                <!-- 文字消息 -->
                <template v-if="msg.type === 'text'">{{ msg.content }}</template>
                <!-- 图片消息 -->
                <template v-else-if="msg.type === 'image'">
                  <img
                    :src="getImageUrl(msg.content)"
                    alt="图片"
                    @click="previewImage(getImageUrl(msg.content))"
                  />
                </template>
              </div>
              <div class="message-time">{{ formatTime(msg.created_at) }}</div>
            </div>
          </div>

          <!-- 空状态 -->
          <el-empty
            v-if="chatStore.currentMessages.length === 0"
            description="暂无消息，发送一条吧"
            :image-size="100"
          />
        </div>

        <!-- 输入区域 -->
        <div class="chat-input-area">
          <!-- 截图预览 -->
          <div v-if="screenshotPreview" class="screenshot-preview">
            <img :src="screenshotPreview" alt="截图预览" />
            <el-icon class="remove-btn" @click="screenshotPreview = null">
              <CircleClose />
            </el-icon>
          </div>

          <!-- 工具栏 -->
          <div class="chat-toolbar">
            <span class="tool-btn" title="发送图片" @click="selectImage">📷</span>
            <span class="tool-btn" title="截图 (Ctrl+Shift+A)" @click="triggerScreenshot">✂️</span>
          </div>

          <!-- 输入框 + 发送按钮 -->
          <div class="chat-input-row">
            <textarea
              v-model="inputText"
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              rows="3"
              @keydown="handleKeydown"
              @input="handleTyping"
            ></textarea>
            <el-button type="primary" @click="handleSend" :disabled="!canSend">发送</el-button>
          </div>
        </div>

        <!-- 隐藏的文件选择器 -->
        <input
          type="file"
          ref="fileInput"
          accept="image/*"
          style="display: none"
          @change="handleFileSelected"
        />
      </div>
    </div>
  </div>

  <!-- 图片预览 -->
  <el-image-viewer
    v-if="showImageViewer"
    :url-list="[previewImageUrl]"
    @close="showImageViewer = false"
  />
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { CircleClose } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import dayjs from 'dayjs';
import { useUserStore } from '@/stores/user';
import { useChatStore } from '@/stores/chat';
import { messageAPI, uploadAPI, getServerUrl } from '@/services/api';
import { connectSocket, disconnectSocket, sendMessage, sendTyping, getSocket } from '@/services/socket';

const router = useRouter();
const userStore = useUserStore();
const chatStore = useChatStore();

const messagesContainer = ref(null);
const fileInput = ref(null);
const inputText = ref('');
const screenshotPreview = ref(null);
const showImageViewer = ref(false);
const previewImageUrl = ref('');

// 是否可以发送
const canSend = computed(() => {
  return inputText.value.trim() || screenshotPreview.value;
});

// ===== 生命周期 =====

onMounted(async () => {
  // 建立 Socket 连接
  const socket = connectSocket(userStore.token);

  // 监听在线用户列表
  socket.on('user:list', (users) => {
    // 过滤掉自己
    chatStore.setOnlineUsers(users.filter(u => u.id !== userStore.userId));
  });

  // 用户上线
  socket.on('user:joined', (user) => {
    if (user.id !== userStore.userId) {
      chatStore.addOnlineUser(user);
      ElMessage.info(`${user.nickname} 上线了`);
    }
  });

  // 用户下线
  socket.on('user:left', ({ id }) => {
    chatStore.removeOnlineUser(id);
  });

  // 接收消息
  socket.on('chat:message', (message) => {
    // 判断消息属于哪个聊天
    const chatId = message.to_user_id === 0
      ? 0  // 群聊
      : (message.from_user_id === userStore.userId ? message.to_user_id : message.from_user_id);

    chatStore.addMessage(chatId, message);

    // 如果不是当前聊天窗口的消息，增加未读计数
    if (chatId !== chatStore.currentChat.id && message.from_user_id !== userStore.userId) {
      chatStore.incrementUnread(chatId);

      // 发送桌面通知
      if (window.electronAPI) {
        window.electronAPI.notification.show(
          'LanChat 新消息',
          `${message.from_nickname}: ${message.type === 'text' ? message.content : '[图片]'}`
        );
      }
    }

    // 滚动到底部
    scrollToBottom();
  });

  // 正在输入提示
  socket.on('chat:typing', ({ from, fromNickname }) => {
    if (chatStore.currentChat.id === from || chatStore.currentChat.id === 0) {
      chatStore.setTyping(fromNickname);
    }
  });

  // 监听截图结果（从 Electron 主进程）
  if (window.electronAPI) {
    window.electronAPI.screenshot.onCaptured((imageDataUrl) => {
      screenshotPreview.value = imageDataUrl;
    });
  }

  // 加载群聊历史消息
  await loadMessages(0);
});

onBeforeUnmount(() => {
  disconnectSocket();
  chatStore.reset();
});

// 切换聊天时加载历史消息
watch(() => chatStore.currentChat.id, async (newId) => {
  if (!chatStore.messagesMap[newId]) {
    await loadMessages(newId);
  }
  scrollToBottom();
});

// ===== 方法 =====

async function loadMessages(chatId) {
  try {
    let result;
    if (chatId === 0) {
      result = await messageAPI.getGroupMessages();
    } else {
      result = await messageAPI.getPrivateMessages(chatId);
    }
    chatStore.setMessages(chatId, result.messages);
    await nextTick();
    scrollToBottom();
  } catch (err) {
    console.error('加载消息失败:', err);
  }
}

function switchToGroup() {
  chatStore.switchChat(0, '群聊', 'group');
}

function switchToPrivate(user) {
  chatStore.switchChat(user.id, user.nickname, 'private');
}

async function handleSend() {
  // 发送截图
  if (screenshotPreview.value) {
    await sendScreenshot();
  }

  // 发送文字
  if (inputText.value.trim()) {
    sendMessage(chatStore.currentChat.id, 'text', inputText.value.trim());
    inputText.value = '';
  }
}

async function sendScreenshot() {
  try {
    // 将 base64 截图转为 Blob 文件后上传
    const response = await fetch(screenshotPreview.value);
    const blob = await response.blob();
    const file = new File([blob], `screenshot_${Date.now()}.png`, { type: 'image/png' });

    const result = await uploadAPI.uploadImage(file);
    sendMessage(chatStore.currentChat.id, 'image', result.url);
    screenshotPreview.value = null;
  } catch (err) {
    ElMessage.error('截图发送失败');
  }
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

let typingTimer = null;
function handleTyping() {
  if (typingTimer) return;
  sendTyping(chatStore.currentChat.id);
  typingTimer = setTimeout(() => {
    typingTimer = null;
  }, 2000);
}

function selectImage() {
  fileInput.value?.click();
}

async function handleFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 10MB');
    return;
  }

  try {
    const result = await uploadAPI.uploadImage(file);
    sendMessage(chatStore.currentChat.id, 'image', result.url);
  } catch (err) {
    ElMessage.error('图片上传失败');
  }

  // 清空文件选择器
  e.target.value = '';
}

function triggerScreenshot() {
  if (window.electronAPI) {
    // 通过 Electron 主进程的快捷键逻辑触发截图
    // 实际上直接调用快捷键 Ctrl+Shift+A 即可
    ElMessage.info('请使用快捷键 Ctrl+Shift+A 进行截图');
  } else {
    ElMessage.warning('截图功能需要在桌面客户端中使用');
  }
}

function getImageUrl(path) {
  if (path.startsWith('http') || path.startsWith('data:')) {
    return path;
  }
  return `${getServerUrl()}${path}`;
}

function previewImage(url) {
  previewImageUrl.value = url;
  showImageViewer.value = true;
}

function formatTime(time) {
  return dayjs(time).format('HH:mm:ss');
}

function scrollToBottom() {
  nextTick(() => {
    const container = messagesContainer.value;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
}

async function handleLogout() {
  disconnectSocket();
  chatStore.reset();
  userStore.logout();
  router.push('/login');
  ElMessage.success('已退出登录');
}
</script>
