<template>
  <div class="main-layout">
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

    <div class="main-body">
      <div class="sidebar">
        <div class="sidebar-header">
          <span>在线用户 ({{ chatStore.onlineUsers.length }})</span>
        </div>

        <div
          class="user-item"
          :class="{ active: chatStore.currentChat.id === 0 }"
          @click="switchToGroup"
        >
          <span class="status-dot online"></span>
          <span class="user-name">📢 群聊</span>
          <el-badge
            v-if="groupBadge"
            :value="groupBadge"
            :type="chatStore.mentionCount[0] ? 'warning' : 'danger'"
          />
        </div>

        <el-divider style="margin: 4px 0" />

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
              v-if="getChatBadge(user.id)"
              :value="getChatBadge(user.id)"
              :type="chatStore.mentionCount[user.id] ? 'warning' : 'danger'"
            />
          </div>
        </div>
      </div>

      <div class="chat-area">
        <div class="chat-header">
          <span>{{ chatStore.currentChat.name }}</span>
          <span
            v-if="chatStore.typingUser"
            style="margin-left: 10px; font-size: 12px; color: #909399; font-weight: normal"
          >
            {{ chatStore.typingUser }} 正在输入...
          </span>

          <el-button text size="small" style="margin-left: auto" @click="toggleSearchPanel">
            🔍 搜索
          </el-button>
        </div>

        <div v-if="showSearchPanel" class="search-panel">
          <div class="search-row">
            <el-input
              v-model="searchKeyword"
              clearable
              placeholder="输入关键词搜索消息"
              @input="handleSearchInput"
            />
            <el-select v-model="searchScope" style="width: 110px" @change="handleSearchInput">
              <el-option label="当前聊天" value="current" />
              <el-option label="全部聊天" value="all" />
            </el-select>
          </div>

          <div v-if="searchLoading" class="search-tip">搜索中...</div>
          <div v-else-if="searchKeyword && searchResults.length === 0" class="search-tip">未找到结果</div>

          <div v-if="searchResults.length" class="search-results">
            <div
              v-for="item in searchResults"
              :key="item.id"
              class="search-item"
              @click="scrollToMessage(item)"
            >
              <span class="search-from">{{ item.from_nickname }}:</span>
              <span class="search-content" v-html="highlightKeyword(item.content)"></span>
              <span class="search-time">{{ formatTime(item.created_at) }}</span>
            </div>
          </div>
        </div>

        <div class="chat-messages" ref="messagesContainer">
          <div
            v-for="msg in chatStore.currentMessages"
            :key="msg.id"
            class="message-item"
            :class="{ self: msg.from_user_id === userStore.userId, revoked: msg.is_revoked, highlight: highlightedMessageId === msg.id }"
            :data-msg-id="msg.id"
            @contextmenu.prevent="showMessageMenu($event, msg)"
          >
            <div class="message-avatar" v-if="!msg.is_revoked">
              {{ (msg.from_nickname || '?').charAt(0) }}
            </div>
            <div class="message-body">
              <div class="message-nickname" v-if="!msg.is_revoked">{{ msg.from_nickname }}</div>
              <div class="message-content">
                <template v-if="msg.is_revoked">
                  <span class="revoked-text">该消息已被撤回</span>
                </template>
                <template v-else-if="msg.type === 'text'">
                  <span v-html="highlightMention(msg.content)"></span>
                </template>
                <template v-else-if="msg.type === 'image'">
                  <img
                    :src="getImageUrl(msg.content)"
                    alt="图片"
                    @click="previewImage(getImageUrl(msg.content))"
                  />
                </template>
                <template v-else-if="msg.type === 'file'">
                  <div class="file-card" @click="downloadFile(msg)">
                    <span class="file-icon">📄</span>
                    <div class="file-meta">
                      <div class="file-name">{{ parseFileContent(msg.content).name }}</div>
                      <div class="file-sub">点击下载</div>
                    </div>
                  </div>
                </template>
              </div>
              <div class="message-time">{{ formatTime(msg.created_at) }}</div>
            </div>
          </div>

          <el-empty
            v-if="chatStore.currentMessages.length === 0"
            description="暂无消息，发送一条吧"
            :image-size="100"
          />
        </div>

        <div class="chat-input-area">
          <div v-if="screenshotPreview" class="screenshot-preview">
            <img :src="screenshotPreview" alt="截图预览" />
            <el-icon class="remove-btn" @click="screenshotPreview = null">
              <CircleClose />
            </el-icon>
          </div>

          <div class="chat-toolbar">
            <span class="tool-btn" title="发送图片" @click="selectImage">📷</span>
            <span class="tool-btn" title="发送文件" @click="selectFile">📎</span>
            <span class="tool-btn" title="截图 (Ctrl+Shift+A)" @click="triggerScreenshot">✂️</span>
            <span class="tool-btn" title="表情" @click="toggleEmoji">😀</span>
          </div>

          <EmojiPicker v-if="showEmoji" @select="insertEmoji" @close="showEmoji = false" />

          <div v-if="showMentionPanel" class="mention-panel">
            <div
              v-for="user in filteredMentionUsers"
              :key="user.id"
              class="mention-item"
              @click="selectMention(user)"
            >
              <span class="mention-avatar">{{ user.nickname.charAt(0) }}</span>
              <span>{{ user.nickname }}</span>
            </div>
            <div v-if="filteredMentionUsers.length === 0" class="mention-empty">未匹配到用户</div>
          </div>

          <div class="chat-input-row">
            <textarea
              ref="textareaRef"
              v-model="inputText"
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              rows="3"
              @keydown="handleKeydown"
              @input="handleInput"
            ></textarea>
            <el-button type="primary" @click="handleSend" :disabled="!canSend">发送</el-button>
          </div>
        </div>

        <input
          type="file"
          ref="imageInput"
          accept="image/*"
          style="display: none"
          @change="handleImageSelected"
        />
        <input
          type="file"
          ref="fileInput"
          accept="*"
          style="display: none"
          @change="handleFileSelected"
        />
      </div>
    </div>
  </div>

  <el-image-viewer
    v-if="showImageViewer"
    :url-list="[previewImageUrl]"
    @close="showImageViewer = false"
  />

  <teleport to="body">
    <div
      v-if="showMenu"
      class="message-menu"
      :style="{ left: `${menuPosition.x}px`, top: `${menuPosition.y}px` }"
      @click.stop
    >
      <div class="menu-item" @click="handleRevoke">撤回消息</div>
    </div>
    <div v-if="showMenu" class="menu-overlay" @click="closeMenu"></div>
  </teleport>
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
import { connectSocket, disconnectSocket, sendMessage, sendTyping, revokeMessage } from '@/services/socket';
import EmojiPicker from '@/components/EmojiPicker.vue';

const router = useRouter();
const userStore = useUserStore();
const chatStore = useChatStore();

const messagesContainer = ref(null);
const textareaRef = ref(null);
const imageInput = ref(null);
const fileInput = ref(null);
const inputText = ref('');
const screenshotPreview = ref(null);
const showImageViewer = ref(false);
const previewImageUrl = ref('');
const highlightedMessageId = ref(null);

const showMenu = ref(false);
const menuPosition = ref({ x: 0, y: 0 });
const selectedMessage = ref(null);

const showEmoji = ref(false);

const showMentionPanel = ref(false);
const mentionQuery = ref('');

const showSearchPanel = ref(false);
const searchKeyword = ref('');
const searchScope = ref('current');
const searchLoading = ref(false);
const searchResults = ref([]);
let searchTimer = null;

const canSend = computed(() => inputText.value.trim() || screenshotPreview.value);

const filteredMentionUsers = computed(() => {
  const q = mentionQuery.value.trim().toLowerCase();
  if (!q) return chatStore.onlineUsers;
  return chatStore.onlineUsers.filter(
    (u) => u.nickname.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
  );
});

const groupBadge = computed(() => {
  if (chatStore.mentionCount[0]) return '@';
  return chatStore.unreadCount[0] || '';
});

function getChatBadge(chatId) {
  if (chatStore.mentionCount[chatId]) return '@';
  return chatStore.unreadCount[chatId] || '';
}

onMounted(async () => {
  const socket = connectSocket(userStore.token);

  socket.on('user:list', (users) => {
    chatStore.setOnlineUsers(users.filter((u) => u.id !== userStore.userId));
  });

  socket.on('user:joined', (user) => {
    if (user.id !== userStore.userId) {
      chatStore.addOnlineUser(user);
      ElMessage.info(`${user.nickname} 上线了`);
    }
  });

  socket.on('user:left', ({ id }) => {
    chatStore.removeOnlineUser(id);
  });

  socket.on('chat:message', (message) => {
    const chatId = message.to_user_id === 0
      ? 0
      : (message.from_user_id === userStore.userId ? message.to_user_id : message.from_user_id);

    chatStore.addMessage(chatId, message);

    if (chatId !== chatStore.currentChat.id && message.from_user_id !== userStore.userId) {
      chatStore.incrementUnread(chatId);
      if (window.electronAPI) {
        const display = message.type === 'text'
          ? message.content
          : (message.type === 'image' ? '[图片]' : '[文件]');
        window.electronAPI.notification.show('LanChat 新消息', `${message.from_nickname}: ${display}`);
      }
    }

    scrollToBottom();
  });

  socket.on('chat:typing', ({ from, fromNickname }) => {
    if (chatStore.currentChat.id === from || chatStore.currentChat.id === 0) {
      chatStore.setTyping(fromNickname);
    }
  });

  socket.on('chat:revoked', ({ messageId, revokedBy }) => {
    chatStore.markMessageRevoked(messageId);
    ElMessage.info(`${revokedBy} 撤回了一条消息`);
  });

  socket.on('chat:mentioned', ({ from, chatId }) => {
    chatStore.incrementMention(chatId);
    if (chatId !== chatStore.currentChat.id) {
      chatStore.incrementUnread(chatId);
    }
    if (window.electronAPI) {
      window.electronAPI.notification.show('LanChat @提醒', `${from} 提到了你`);
    }
  });

  if (window.electronAPI) {
    window.electronAPI.screenshot.onCaptured((imageDataUrl) => {
      screenshotPreview.value = imageDataUrl;
    });
  }

  await loadMessages(0);
});

onBeforeUnmount(() => {
  disconnectSocket();
  chatStore.reset();
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
});

watch(
  () => chatStore.currentChat.id,
  async (newId) => {
    if (!chatStore.messagesMap[newId]) {
      await loadMessages(newId);
    }
    scrollToBottom();
  }
);

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
  if (screenshotPreview.value) {
    await sendScreenshot();
  }

  if (inputText.value.trim()) {
    sendMessage(chatStore.currentChat.id, 'text', inputText.value.trim());
    inputText.value = '';
    showMentionPanel.value = false;
    showEmoji.value = false;
  }
}

async function sendScreenshot() {
  try {
    const response = await fetch(screenshotPreview.value);
    const blob = await response.blob();
    const file = new File([blob], `screenshot_${Date.now()}.png`, { type: 'image/png' });

    const result = await uploadAPI.uploadFile(file);
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
function handleInput(e) {
  handleMentionDetect(e.target.value, e.target.selectionStart || 0);

  if (typingTimer) return;
  sendTyping(chatStore.currentChat.id);
  typingTimer = setTimeout(() => {
    typingTimer = null;
  }, 2000);
}

function handleMentionDetect(value, cursor) {
  const left = value.slice(0, cursor);
  const match = left.match(/@([^\s@]*)$/);
  if (!match) {
    showMentionPanel.value = false;
    mentionQuery.value = '';
    return;
  }
  mentionQuery.value = match[1] || '';
  showMentionPanel.value = true;
}

function selectMention(user) {
  const textarea = textareaRef.value;
  if (!textarea) return;

  const cursor = textarea.selectionStart || inputText.value.length;
  const left = inputText.value.slice(0, cursor);
  const right = inputText.value.slice(cursor);
  const replacedLeft = left.replace(/@([^\s@]*)$/, `@${user.nickname} `);
  inputText.value = replacedLeft + right;
  showMentionPanel.value = false;

  nextTick(() => {
    const pos = replacedLeft.length;
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  });
}

function toggleEmoji() {
  showEmoji.value = !showEmoji.value;
}

function insertEmoji(emoji) {
  inputText.value += emoji;
  showEmoji.value = false;
}

function selectImage() {
  imageInput.value?.click();
}

function selectFile() {
  fileInput.value?.click();
}

async function handleImageSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 10MB');
    e.target.value = '';
    return;
  }

  try {
    const result = await uploadAPI.uploadFile(file);
    sendMessage(chatStore.currentChat.id, 'image', result.url);
  } catch (err) {
    ElMessage.error('图片上传失败');
  }

  e.target.value = '';
}

async function handleFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('文件大小不能超过 10MB');
    e.target.value = '';
    return;
  }

  try {
    const result = await uploadAPI.uploadFile(file);
    const payload = JSON.stringify({
      name: result.filename || file.name,
      url: result.url,
      size: result.size || file.size,
    });
    sendMessage(chatStore.currentChat.id, 'file', payload);
  } catch (err) {
    ElMessage.error('文件上传失败');
  }

  e.target.value = '';
}

function triggerScreenshot() {
  if (window.electronAPI) {
    ElMessage.info('请使用快捷键 Ctrl+Shift+A 进行截图');
  } else {
    ElMessage.warning('截图功能需要在桌面客户端中使用');
  }
}

function getImageUrl(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${getServerUrl()}${path}`;
}

function parseFileContent(content) {
  try {
    const parsed = JSON.parse(content);
    if (parsed && parsed.name && parsed.url) {
      return parsed;
    }
  } catch (err) {
    // ignore
  }
  return { name: content || '未知文件', url: content || '' };
}

async function downloadFile(msg) {
  const fileInfo = parseFileContent(msg.content);
  const url = getImageUrl(fileInfo.url);

  if (window.electronAPI?.file?.saveAs) {
    try {
      const result = await window.electronAPI.file.saveAs(url, fileInfo.name);
      if (result.success) {
        ElMessage.success('文件下载成功');
      } else if (!result.canceled) {
        ElMessage.error(result.error || '文件下载失败');
      }
    } catch (err) {
      ElMessage.error('文件下载失败');
    }
    return;
  }

  window.open(url, '_blank');
}

function previewImage(url) {
  previewImageUrl.value = url;
  showImageViewer.value = true;
}

function formatTime(time) {
  return dayjs(time).format('HH:mm:ss');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withLineBreaks(html) {
  return html.replace(/\r?\n/g, '<br>');
}

function highlightMention(content) {
  const safe = escapeHtml(content);
  const highlighted = safe.replace(/@([\w\u4e00-\u9fa5-]+)/g, '<span class="mention">@$1</span>');
  return withLineBreaks(highlighted);
}

function showMessageMenu(event, msg) {
  if (msg.is_revoked) return;
  if (msg.from_user_id !== userStore.userId && !userStore.isAdmin) return;

  selectedMessage.value = msg;
  menuPosition.value = { x: event.clientX, y: event.clientY };
  showMenu.value = true;
}

function handleRevoke() {
  if (!selectedMessage.value) return;
  revokeMessage(selectedMessage.value.id);
  closeMenu();
}

function closeMenu() {
  showMenu.value = false;
  selectedMessage.value = null;
}

function toggleSearchPanel() {
  showSearchPanel.value = !showSearchPanel.value;
  if (!showSearchPanel.value) {
    searchKeyword.value = '';
    searchResults.value = [];
  }
}

function handleSearchInput() {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }

  if (!searchKeyword.value.trim()) {
    searchResults.value = [];
    return;
  }

  searchTimer = setTimeout(() => {
    doSearch();
  }, 300);
}

async function doSearch() {
  searchLoading.value = true;
  try {
    const chatId = searchScope.value === 'current' ? chatStore.currentChat.id : undefined;
    const result = await messageAPI.searchMessages(searchKeyword.value.trim(), chatId, 1, 20);
    searchResults.value = result.messages || [];
  } catch (err) {
    ElMessage.error('消息搜索失败');
  } finally {
    searchLoading.value = false;
  }
}

function highlightKeyword(content) {
  const safeContent = escapeHtml(content);
  const keyword = searchKeyword.value.trim();
  if (!keyword) return withLineBreaks(safeContent);
  const safeKeyword = escapeHtml(keyword);
  const re = new RegExp(`(${escapeRegExp(safeKeyword)})`, 'gi');
  return withLineBreaks(safeContent.replace(re, '<mark>$1</mark>'));
}

async function scrollToMessage(item) {
  const chatId = item.to_user_id === 0
    ? 0
    : (item.from_user_id === userStore.userId ? item.to_user_id : item.from_user_id);

  if (chatId === 0) {
    switchToGroup();
  } else {
    const target = chatStore.onlineUsers.find((u) => u.id === chatId);
    chatStore.switchChat(chatId, target?.nickname || `用户${chatId}`, 'private');
  }

  if (!chatStore.messagesMap[chatId]) {
    await loadMessages(chatId);
  }

  await nextTick();
  const container = messagesContainer.value;
  if (!container) return;

  const targetEl = container.querySelector(`[data-msg-id="${item.id}"]`);
  if (!targetEl) {
    ElMessage.info('该消息不在当前加载的历史范围内');
    return;
  }

  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  highlightedMessageId.value = item.id;
  setTimeout(() => {
    if (highlightedMessageId.value === item.id) {
      highlightedMessageId.value = null;
    }
  }, 2000);
  showSearchPanel.value = false;
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

<style scoped>
.search-panel {
  border-bottom: 1px solid #dcdfe6;
  background: #fff;
  padding: 10px 12px;
}

.search-row {
  display: flex;
  gap: 8px;
}

.search-tip {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
}

.search-results {
  margin-top: 8px;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}

.search-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  cursor: pointer;
  border-bottom: 1px solid #f2f3f5;
}

.search-item:last-child {
  border-bottom: none;
}

.search-item:hover {
  background: #f5f7fa;
}

.search-from {
  color: #409eff;
  font-size: 12px;
  flex-shrink: 0;
}

.search-content {
  flex: 1;
  color: #303133;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-time {
  color: #909399;
  font-size: 11px;
  flex-shrink: 0;
}

.mention-panel {
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fff;
  margin-bottom: 8px;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
}

.mention-item:hover {
  background: #f5f7fa;
}

.mention-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.mention-empty {
  padding: 10px;
  color: #909399;
  font-size: 12px;
}

.file-card {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 180px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
}

.file-card:hover {
  background: #ecf5ff;
}

.file-icon {
  font-size: 22px;
}

.file-meta {
  min-width: 0;
}

.file-name {
  color: #303133;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-sub {
  color: #909399;
  font-size: 11px;
}

.revoked-text {
  color: #909399;
  font-style: italic;
}

.message-item.revoked .message-content {
  background: #f2f3f5;
}

.message-item.highlight .message-content {
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.25);
}

.message-menu {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.menu-item {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
}

.menu-item:hover {
  background: #f5f7fa;
}

.menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

:deep(mark) {
  background: #fff3bf;
  color: inherit;
  padding: 0 2px;
}

:deep(.mention) {
  color: #e67e22;
  font-weight: 600;
}
</style>
