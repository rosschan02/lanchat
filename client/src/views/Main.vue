<template>
  <div class="main-layout">
    <div class="main-header">
      <span class="logo">💬 LanChat</span>
      <div class="user-info">
        <el-avatar :size="26" :src="profileAvatarUrl">
          {{ userStore.nickname?.charAt(0) || '?' }}
        </el-avatar>
        <span>{{ userStore.nickname }}</span>
        <el-button size="small" plain @click="openProfileDialog">个人资料</el-button>
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
          <span>频道 ({{ chatStore.channels.length }})</span>
        </div>

        <div
          class="user-item"
          :class="{ active: chatStore.currentChat.id === GROUP_CHAT_KEY }"
          @click="switchToGroup"
        >
          <span class="status-dot online"></span>
          <span class="user-name">📢 群聊</span>
          <span v-if="isPinnedChat(GROUP_CHAT_KEY)" class="session-flag">📌</span>
          <span v-if="isMutedChat(GROUP_CHAT_KEY)" class="session-flag">🔕</span>
          <el-badge
            v-if="groupBadge"
            :value="groupBadge"
            :type="chatStore.mentionCount[GROUP_CHAT_KEY] ? 'warning' : 'danger'"
          />
        </div>

        <div class="user-list" style="max-height: 180px; overflow-y: auto">
          <div
            v-for="channel in sortedChannels"
            :key="channel.id"
            class="user-item"
            :class="{ active: chatStore.currentChat.id === toChannelChatId(channel.id) }"
            @click="switchToChannel(channel)"
          >
            <span class="status-dot online"></span>
            <span class="user-name"># {{ channel.name }}</span>
            <span v-if="isPinnedChat(toChannelChatId(channel.id))" class="session-flag">📌</span>
            <span v-if="isMutedChat(toChannelChatId(channel.id))" class="session-flag">🔕</span>
            <el-badge
              v-if="getChatBadge(toChannelChatId(channel.id))"
              :value="getChatBadge(toChannelChatId(channel.id))"
              :type="chatStore.mentionCount[toChannelChatId(channel.id)] ? 'warning' : 'danger'"
            />
          </div>
        </div>

        <el-divider style="margin: 4px 0" />

        <div class="sidebar-header">
          <span>在线用户 ({{ chatStore.onlineUsers.length }})</span>
        </div>

        <div class="user-list" style="flex: 1; overflow-y: auto">
          <div
            v-for="user in sortedOnlineUsers"
            :key="user.id"
            class="user-item"
            :class="{ active: chatStore.currentChat.id === String(user.id) }"
            @click="switchToPrivate(user)"
          >
            <span class="status-dot online"></span>
            <span class="user-name">{{ user.nickname }}</span>
            <span v-if="isPinnedChat(String(user.id))" class="session-flag">📌</span>
            <span v-if="isMutedChat(String(user.id))" class="session-flag">🔕</span>
            <el-badge
              v-if="getChatBadge(user.id)"
              :value="getChatBadge(user.id)"
              :type="chatStore.mentionCount[String(user.id)] ? 'warning' : 'danger'"
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

          <div class="chat-header-actions">
            <el-button text size="small" @click="togglePinCurrentChat">
              {{ isPinnedChat(chatStore.currentChat.id) ? '取消置顶' : '置顶会话' }}
            </el-button>
            <el-button text size="small" @click="toggleMuteCurrentChat">
              {{ isMutedChat(chatStore.currentChat.id) ? '取消免打扰' : '免打扰' }}
            </el-button>
            <el-button
              v-if="chatStore.currentChat.type === 'channel' && userStore.isAdmin"
              text
              size="small"
              @click="editAnnouncement"
            >
              编辑公告
            </el-button>
            <el-button text size="small" @click="toggleSearchPanel">🔍 搜索</el-button>
          </div>
        </div>

        <div
          v-if="chatStore.currentChat.type === 'channel' && channelAnnouncement"
          class="channel-announcement"
        >
          <span class="channel-announcement-label">📌 频道公告</span>
          <span class="channel-announcement-content">{{ channelAnnouncement.content }}</span>
          <span class="channel-announcement-meta">
            {{ channelAnnouncement.updated_by_nickname || '管理员' }} ·
            {{ formatTime(channelAnnouncement.updated_at) }}
          </span>
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
          <template v-for="msg in chatStore.currentMessages" :key="msg.id">
            <div v-if="firstUnreadMessageId === msg.id" class="unread-divider">
              以下是未读消息
            </div>

            <div
              class="message-item"
              :class="{ self: msg.from_user_id === userStore.userId, revoked: msg.is_revoked, highlight: highlightedMessageId === msg.id }"
              :data-msg-id="msg.id"
              @contextmenu.prevent="showMessageMenu($event, msg)"
            >
              <el-avatar class="message-avatar" :size="36" :src="getImageUrl(msg.from_avatar)" v-if="!msg.is_revoked">
                {{ (msg.from_nickname || '?').charAt(0) }}
              </el-avatar>
              <div class="message-body">
                <div class="message-nickname" v-if="!msg.is_revoked">{{ msg.from_nickname }}</div>
                <div class="message-content">
                  <template v-if="msg.is_revoked">
                    <span class="revoked-text">该消息已被撤回</span>
                  </template>
                  <template v-else>
                    <div v-if="msg.reply_to_message_id" class="reply-quote" @click="jumpToMessage(msg.reply_to_message_id)">
                      <span class="reply-quote-author">{{ msg.reply_from_nickname || '未知用户' }}:</span>
                      <span class="reply-quote-text">{{ formatReplyPreview(msg) }}</span>
                    </div>
                    <template v-if="msg.type === 'text'">
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
                  </template>
                </div>
                <div class="message-time">
                  {{ formatTime(msg.created_at) }}
                  <span v-if="msg.edited_at"> · 已编辑</span>
                  <span v-if="msg.from_user_id === userStore.userId && getReadReceipt(msg)" class="read-flag">
                    · {{ getReadReceipt(msg) }}
                  </span>
                </div>
              </div>
            </div>
          </template>

          <el-empty
            v-if="chatStore.currentMessages.length === 0"
            description="暂无消息，发送一条吧"
            :image-size="100"
          />
        </div>

        <div class="chat-input-area">
          <div v-if="replyingMessage" class="compose-assist">
            <span class="compose-assist-title">回复 {{ replyingMessage.from_nickname }}:</span>
            <span class="compose-assist-text">{{ formatReplyPreview(replyingMessage) }}</span>
            <span class="compose-assist-close" @click="cancelReply">✕</span>
          </div>

          <div v-if="editingMessage" class="compose-assist warning">
            <span class="compose-assist-title">正在编辑消息</span>
            <span class="compose-assist-close" @click="cancelEdit">✕</span>
          </div>

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
              :placeholder="editingMessage ? '编辑消息中... (Enter 保存, Shift+Enter 换行)' : '输入消息... (Enter 发送, Shift+Enter 换行)'"
              rows="3"
              @keydown="handleKeydown"
              @input="handleInput"
            ></textarea>
            <el-button type="primary" @click="handleSend" :disabled="!canSend">
              {{ editingMessage ? '保存' : '发送' }}
            </el-button>
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
        <input
          type="file"
          ref="profileAvatarInput"
          accept="image/*"
          style="display: none"
          @change="handleProfileAvatarSelected"
        />
      </div>
    </div>
  </div>

  <el-image-viewer
    v-if="showImageViewer"
    :url-list="[previewImageUrl]"
    @close="showImageViewer = false"
  />

  <el-dialog v-model="profileDialogVisible" title="个人资料" width="460px">
    <div class="profile-dialog">
      <div class="profile-avatar-row">
        <el-avatar :size="72" :src="getImageUrl(profileForm.avatar)">
          {{ userStore.nickname?.charAt(0) || '?' }}
        </el-avatar>
        <div class="profile-avatar-actions">
          <el-button @click="triggerProfileAvatarUpload" :loading="profileAvatarUploading">上传头像</el-button>
          <div class="profile-avatar-tip">支持图片文件，最大 10MB</div>
        </div>
      </div>
      <el-form label-width="70px">
        <el-form-item label="简介">
          <el-input
            v-model="profileForm.bio"
            type="textarea"
            :rows="4"
            maxlength="300"
            show-word-limit
            placeholder="介绍一下你自己..."
          />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="profileDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="profileSaving" @click="saveProfile">保存</el-button>
    </template>
  </el-dialog>

  <teleport to="body">
    <div
      v-if="showMenu"
      class="message-menu"
      :style="{ left: `${menuPosition.x}px`, top: `${menuPosition.y}px` }"
      @click.stop
    >
      <div class="menu-item" @click="startReply">回复</div>
      <div v-if="canEditSelectedMessage" class="menu-item" @click="startEdit">编辑消息</div>
      <div v-if="canRevokeSelectedMessage" class="menu-item" @click="handleRevoke">撤回消息</div>
    </div>
    <div v-if="showMenu" class="menu-overlay" @click="closeMenu"></div>
  </teleport>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { CircleClose } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import dayjs from 'dayjs';
import { useUserStore } from '@/stores/user';
import { useChatStore } from '@/stores/chat';
import { authAPI, messageAPI, uploadAPI, getServerUrl, channelAPI } from '@/services/api';
import {
  connectSocket,
  disconnectSocket,
  sendMessage,
  sendTyping,
  revokeMessage,
  editMessage,
  markChatRead,
} from '@/services/socket';
import EmojiPicker from '@/components/EmojiPicker.vue';

const router = useRouter();
const userStore = useUserStore();
const chatStore = useChatStore();

const messagesContainer = ref(null);
const textareaRef = ref(null);
const imageInput = ref(null);
const fileInput = ref(null);
const profileAvatarInput = ref(null);
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

const replyingMessage = ref(null);
const editingMessage = ref(null);
const channelAnnouncement = ref(null);
const readStateMap = ref({});
const sessionPrefs = ref({});
const profileDialogVisible = ref(false);
const profileAvatarUploading = ref(false);
const profileSaving = ref(false);
const profileForm = ref({
  avatar: userStore.avatar || '',
  bio: userStore.bio || '',
});

let searchTimer = null;
let typingTimer = null;
let readTimer = null;

const GROUP_CHAT_KEY = '0';
const EDIT_WINDOW_MS = 2 * 60 * 1000;

const canSend = computed(() => {
  if (editingMessage.value) {
    return !!inputText.value.trim();
  }
  return !!inputText.value.trim() || !!screenshotPreview.value;
});

const profileAvatarUrl = computed(() => getImageUrl(userStore.avatar));

const filteredMentionUsers = computed(() => {
  const q = mentionQuery.value.trim().toLowerCase();
  if (!q) return chatStore.onlineUsers;
  return chatStore.onlineUsers.filter(
    (u) => u.nickname.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
  );
});

const groupBadge = computed(() => {
  if (chatStore.mentionCount[GROUP_CHAT_KEY]) return '@';
  return chatStore.unreadCount[GROUP_CHAT_KEY] || '';
});

const sortedChannels = computed(() => {
  return [...chatStore.channels].sort((a, b) => {
    const aPinned = isPinnedChat(toChannelChatId(a.id)) ? 1 : 0;
    const bPinned = isPinnedChat(toChannelChatId(b.id)) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return a.id - b.id;
  });
});

const sortedOnlineUsers = computed(() => {
  return [...chatStore.onlineUsers].sort((a, b) => {
    const aPinned = isPinnedChat(String(a.id)) ? 1 : 0;
    const bPinned = isPinnedChat(String(b.id)) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return a.nickname.localeCompare(b.nickname, 'zh-CN');
  });
});

const firstUnreadMessageId = computed(() => {
  const chatId = String(chatStore.currentChat.id);
  const ownReadId = readStateMap.value[chatId]?.[String(userStore.userId)];
  if (ownReadId === undefined || ownReadId === null) return null;
  const target = chatStore.currentMessages.find(
    (msg) => msg.from_user_id !== userStore.userId && msg.id > ownReadId
  );
  return target?.id || null;
});

const canRevokeSelectedMessage = computed(() => {
  const msg = selectedMessage.value;
  if (!msg || msg.is_revoked) return false;
  return msg.from_user_id === userStore.userId || userStore.isAdmin;
});

const canEditSelectedMessage = computed(() => {
  const msg = selectedMessage.value;
  if (!msg || msg.is_revoked || msg.type !== 'text') return false;
  if (userStore.isAdmin) return true;
  if (msg.from_user_id !== userStore.userId) return false;
  return (Date.now() - new Date(msg.created_at).getTime()) < EDIT_WINDOW_MS;
});

function getSessionPrefsKey() {
  return `lanchat_session_prefs_${userStore.userId || 'guest'}`;
}

function loadSessionPrefs() {
  try {
    const raw = localStorage.getItem(getSessionPrefsKey());
    sessionPrefs.value = raw ? JSON.parse(raw) : {};
  } catch (err) {
    sessionPrefs.value = {};
  }
}

function persistSessionPrefs() {
  localStorage.setItem(getSessionPrefsKey(), JSON.stringify(sessionPrefs.value));
}

function ensureSession(chatId) {
  const key = String(chatId);
  if (!sessionPrefs.value[key]) {
    sessionPrefs.value[key] = { pinned: false, muted: false, draft: '' };
  }
  return sessionPrefs.value[key];
}

function isPinnedChat(chatId) {
  return !!sessionPrefs.value[String(chatId)]?.pinned;
}

function isMutedChat(chatId) {
  return !!sessionPrefs.value[String(chatId)]?.muted;
}

function getChatDraft(chatId) {
  return sessionPrefs.value[String(chatId)]?.draft || '';
}

function setChatDraft(chatId, draft) {
  const session = ensureSession(chatId);
  session.draft = String(draft || '');
  persistSessionPrefs();
}

function clearCurrentDraft() {
  setChatDraft(chatStore.currentChat.id, '');
}

function togglePinCurrentChat() {
  const session = ensureSession(chatStore.currentChat.id);
  session.pinned = !session.pinned;
  persistSessionPrefs();
}

function toggleMuteCurrentChat() {
  const session = ensureSession(chatStore.currentChat.id);
  session.muted = !session.muted;
  persistSessionPrefs();
}

function toChannelChatId(channelId) {
  return `channel:${channelId}`;
}

function parseChannelChatId(chatId) {
  const value = String(chatId || '');
  if (!value.startsWith('channel:')) return null;
  const id = parseInt(value.slice('channel:'.length), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function resolveChatKeyFromMessage(message) {
  if (message.channel_id) {
    return toChannelChatId(message.channel_id);
  }
  if (message.to_user_id === 0) {
    return GROUP_CHAT_KEY;
  }
  return String(message.from_user_id === userStore.userId ? message.to_user_id : message.from_user_id);
}

function getSendPayload() {
  if (chatStore.currentChat.type === 'channel' && chatStore.currentChat.channelId) {
    return { to: 0, options: { channelId: chatStore.currentChat.channelId } };
  }
  return { to: Number(chatStore.currentChat.id), options: {} };
}

function getChatBadge(chatId) {
  const key = String(chatId);
  if (chatStore.mentionCount[key]) return '@';
  return chatStore.unreadCount[key] || '';
}

function setReadState(chatId, userId, lastReadMessageId) {
  const key = String(chatId);
  const uid = String(userId);
  if (!readStateMap.value[key]) {
    readStateMap.value[key] = {};
  }
  const prev = readStateMap.value[key][uid] || 0;
  readStateMap.value[key][uid] = Math.max(prev, Number(lastReadMessageId) || 0);
}

function applyReadEvent(payload) {
  if (!payload || !payload.scope) return;
  if (payload.scope === 'group') {
    setReadState(GROUP_CHAT_KEY, payload.readerId, payload.lastReadMessageId);
    return;
  }
  if (payload.scope === 'channel' && payload.channelId) {
    setReadState(toChannelChatId(payload.channelId), payload.readerId, payload.lastReadMessageId);
    return;
  }
  if (payload.scope === 'private' && payload.peerId) {
    const chatId = payload.readerId === userStore.userId
      ? String(payload.peerId)
      : (payload.peerId === userStore.userId ? String(payload.readerId) : null);
    if (chatId) {
      setReadState(chatId, payload.readerId, payload.lastReadMessageId);
    }
  }
}

async function loadReadState(chatId) {
  try {
    if (chatId === GROUP_CHAT_KEY) {
      const result = await messageAPI.getReadState(0);
      (result.records || []).forEach((record) => {
        setReadState(GROUP_CHAT_KEY, record.user_id, record.last_read_message_id);
      });
      return;
    }

    if (String(chatId).startsWith('channel:')) {
      const channelId = parseChannelChatId(chatId);
      if (!channelId) return;
      const result = await messageAPI.getReadState(undefined, channelId);
      (result.records || []).forEach((record) => {
        setReadState(chatId, record.user_id, record.last_read_message_id);
      });
      return;
    }

    const userId = parseInt(chatId, 10);
    if (!Number.isInteger(userId) || userId <= 0) return;
    const result = await messageAPI.getReadState(userId);
    (result.records || []).forEach((record) => {
      setReadState(chatId, record.user_id, record.last_read_message_id);
    });
  } catch (err) {
    console.error('加载已读状态失败:', err);
  }
}

function scheduleMarkCurrentChatRead(delay = 600) {
  if (readTimer) {
    clearTimeout(readTimer);
  }
  readTimer = setTimeout(() => {
    const payload = getSendPayload();
    markChatRead(payload.to, payload.options, (result) => {
      if (result?.ok) {
        setReadState(chatStore.currentChat.id, userStore.userId, result.lastReadMessageId);
      }
    });
    readTimer = null;
  }, delay);
}

async function refreshMyProfile() {
  try {
    const result = await authAPI.getProfile();
    if (result?.user) {
      userStore.updateProfile(result.user);
      profileForm.value.avatar = result.user.avatar || '';
      profileForm.value.bio = result.user.bio || '';
    }
  } catch (err) {
    console.error('加载个人资料失败:', err);
  }
}

function openProfileDialog() {
  profileForm.value.avatar = userStore.avatar || '';
  profileForm.value.bio = userStore.bio || '';
  profileDialogVisible.value = true;
}

function triggerProfileAvatarUpload() {
  profileAvatarInput.value?.click();
}

async function handleProfileAvatarSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = '';

  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('头像图片不能超过 10MB');
    return;
  }

  profileAvatarUploading.value = true;
  try {
    const result = await uploadAPI.uploadFile(file);
    profileForm.value.avatar = result.url || '';
    ElMessage.success('头像上传成功');
  } catch (err) {
    ElMessage.error('头像上传失败');
  } finally {
    profileAvatarUploading.value = false;
  }
}

async function saveProfile() {
  profileSaving.value = true;
  try {
    const bio = String(profileForm.value.bio || '').trim();
    const result = await authAPI.updateProfile({
      avatar: profileForm.value.avatar || '',
      bio,
    });
    if (result?.user) {
      userStore.updateProfile(result.user);
      chatStore.updateOnlineUserProfile(result.user.id, {
        nickname: result.user.nickname,
        avatar: result.user.avatar,
      });
    }
    profileDialogVisible.value = false;
    ElMessage.success(result?.message || '个人资料已保存');
  } catch (err) {
    // API 拦截器会提示错误
  } finally {
    profileSaving.value = false;
  }
}

async function loadCurrentAnnouncement() {
  if (chatStore.currentChat.type !== 'channel' || !chatStore.currentChat.channelId) {
    channelAnnouncement.value = null;
    return;
  }
  try {
    const result = await channelAPI.getAnnouncement(chatStore.currentChat.channelId);
    channelAnnouncement.value = result.announcement || null;
  } catch (err) {
    channelAnnouncement.value = null;
  }
}

onMounted(async () => {
  loadSessionPrefs();
  inputText.value = getChatDraft(chatStore.currentChat.id);
  await refreshMyProfile();

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

  socket.on('user:profile-updated', ({ id, nickname, avatar, bio }) => {
    chatStore.updateOnlineUserProfile(id, { nickname, avatar });
    if (Number(id) === Number(userStore.userId)) {
      userStore.updateProfile({ nickname, avatar, bio });
    }
  });

  socket.on('chat:message', (message) => {
    const chatId = resolveChatKeyFromMessage(message);
    chatStore.addMessage(chatId, message);

    if (chatId !== chatStore.currentChat.id && message.from_user_id !== userStore.userId) {
      chatStore.incrementUnread(chatId);
      if (!isMutedChat(chatId) && window.electronAPI) {
        const display = message.type === 'text'
          ? message.content
          : (message.type === 'image' ? '[图片]' : '[文件]');
        window.electronAPI.notification.show('LanChat 新消息', `${message.from_nickname}: ${display}`);
      }
    } else if (chatId === chatStore.currentChat.id && message.from_user_id !== userStore.userId) {
      scheduleMarkCurrentChatRead(300);
    }

    scrollToBottom();
  });

  socket.on('chat:typing', ({ from, fromNickname, channelId }) => {
    if (channelId) {
      if (chatStore.currentChat.type === 'channel' && chatStore.currentChat.channelId === channelId) {
        chatStore.setTyping(fromNickname);
      }
      return;
    }

    if (chatStore.currentChat.id === String(from) || chatStore.currentChat.id === GROUP_CHAT_KEY) {
      chatStore.setTyping(fromNickname);
    }
  });

  socket.on('chat:revoked', ({ messageId, revokedBy }) => {
    chatStore.markMessageRevoked(messageId);
    ElMessage.info(`${revokedBy} 撤回了一条消息`);
  });

  socket.on('chat:edited', ({ messageId, content, editedAt, editedBy }) => {
    chatStore.markMessageEdited(messageId, content, editedAt);
    if (editingMessage.value?.id === messageId) {
      editingMessage.value = null;
    }
    ElMessage.info(`${editedBy} 编辑了一条消息`);
  });

  socket.on('chat:read', (payload) => {
    applyReadEvent(payload);
  });

  socket.on('chat:mentioned', ({ from, chatId }) => {
    const key = String(chatId);
    chatStore.incrementMention(key);
    if (key !== chatStore.currentChat.id) {
      chatStore.incrementUnread(key);
    }
    if (window.electronAPI) {
      window.electronAPI.notification.show('LanChat @提醒', `${from} 提到了你`);
    }
  });

  socket.on('channel:updated', async () => {
    await loadChannels();
  });

  socket.on('channel:announcement', ({ channelId, announcement }) => {
    if (chatStore.currentChat.type === 'channel' && chatStore.currentChat.channelId === channelId) {
      channelAnnouncement.value = announcement || null;
    }
  });

  if (window.electronAPI) {
    window.electronAPI.screenshot.onCaptured((imageDataUrl) => {
      screenshotPreview.value = imageDataUrl;
    });
  }

  await loadChannels();
  await loadMessages(GROUP_CHAT_KEY);
  await loadReadState(GROUP_CHAT_KEY);
  await loadCurrentAnnouncement();
  scheduleMarkCurrentChatRead(500);
});

onBeforeUnmount(() => {
  setChatDraft(chatStore.currentChat.id, inputText.value);
  disconnectSocket();
  chatStore.reset();

  if (searchTimer) clearTimeout(searchTimer);
  if (typingTimer) clearTimeout(typingTimer);
  if (readTimer) clearTimeout(readTimer);
});

watch(
  () => chatStore.currentChat.id,
  async (newId, oldId) => {
    if (oldId !== undefined && oldId !== null) {
      setChatDraft(oldId, inputText.value);
    }

    if (!chatStore.messagesMap[newId]) {
      await loadMessages(newId);
    }
    await loadReadState(newId);
    await loadCurrentAnnouncement();

    inputText.value = getChatDraft(newId);
    showMentionPanel.value = false;
    mentionQuery.value = '';
    replyingMessage.value = null;
    editingMessage.value = null;
    await nextTick();
    scrollToBottom();
    scheduleMarkCurrentChatRead(700);
  }
);

async function loadChannels() {
  try {
    const result = await channelAPI.getMyChannels();
    chatStore.setChannels(result.channels || []);

    if (chatStore.currentChat.type === 'channel') {
      const exists = chatStore.channels.some((c) => c.id === chatStore.currentChat.channelId);
      if (!exists) {
        switchToGroup();
      }
    }
  } catch (err) {
    console.error('加载频道失败:', err);
  }
}

async function loadMessages(chatId) {
  try {
    let result;
    if (chatId === GROUP_CHAT_KEY) {
      result = await messageAPI.getGroupMessages();
    } else if (String(chatId).startsWith('channel:')) {
      const channelId = parseChannelChatId(chatId);
      if (!channelId) return;
      result = await messageAPI.getChannelMessages(channelId);
    } else {
      result = await messageAPI.getPrivateMessages(parseInt(chatId, 10));
    }
    chatStore.setMessages(chatId, result.messages || []);
    await nextTick();
    scrollToBottom();
  } catch (err) {
    console.error('加载消息失败:', err);
  }
}

function switchToGroup() {
  chatStore.switchChat(GROUP_CHAT_KEY, '群聊', 'group');
}

function switchToPrivate(user) {
  chatStore.switchChat(String(user.id), user.nickname, 'private');
}

function switchToChannel(channel) {
  chatStore.switchChat(toChannelChatId(channel.id), `# ${channel.name}`, 'channel', { channelId: channel.id });
}

async function handleSend() {
  if (editingMessage.value) {
    const text = inputText.value.trim();
    if (!text) return;
    editMessage(editingMessage.value.id, text, (result) => {
      if (!result?.ok) {
        ElMessage.error(result?.error || '消息编辑失败');
        return;
      }
      editingMessage.value = null;
      inputText.value = '';
      clearCurrentDraft();
      showEmoji.value = false;
    });
    return;
  }

  const replyToMessageId = replyingMessage.value?.id || undefined;
  if (screenshotPreview.value) {
    await sendScreenshot(replyToMessageId);
  }

  if (inputText.value.trim()) {
    const payload = getSendPayload();
    sendMessage(payload.to, 'text', inputText.value.trim(), {
      ...payload.options,
      replyToMessageId,
    });
    inputText.value = '';
    clearCurrentDraft();
    showMentionPanel.value = false;
    showEmoji.value = false;
  }

  replyingMessage.value = null;
}

async function sendScreenshot(replyToMessageId) {
  try {
    const response = await fetch(screenshotPreview.value);
    const blob = await response.blob();
    const file = new File([blob], `screenshot_${Date.now()}.png`, { type: 'image/png' });

    const result = await uploadAPI.uploadFile(file);
    const payload = getSendPayload();
    sendMessage(payload.to, 'image', result.url, {
      ...payload.options,
      replyToMessageId,
    });
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

function handleInput(e) {
  setChatDraft(chatStore.currentChat.id, inputText.value);
  handleMentionDetect(e.target.value, e.target.selectionStart || 0);

  if (typingTimer) return;
  const payload = getSendPayload();
  sendTyping(payload.to, payload.options);
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
  setChatDraft(chatStore.currentChat.id, inputText.value);

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
  setChatDraft(chatStore.currentChat.id, inputText.value);
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
    const payload = getSendPayload();
    sendMessage(payload.to, 'image', result.url, {
      ...payload.options,
      replyToMessageId: replyingMessage.value?.id,
    });
    replyingMessage.value = null;
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
    const sendPayload = getSendPayload();
    sendMessage(sendPayload.to, 'file', payload, {
      ...sendPayload.options,
      replyToMessageId: replyingMessage.value?.id,
    });
    replyingMessage.value = null;
  } catch (err) {
    ElMessage.error('文件上传失败');
  }

  e.target.value = '';
}

function triggerScreenshot() {
  if (window.electronAPI?.screenshot?.start) {
    window.electronAPI.screenshot.start();
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

function getMessagePreview(type, content) {
  if (type === 'image') return '[图片]';
  if (type === 'file') {
    const file = parseFileContent(content);
    return `[文件] ${file.name}`;
  }
  return String(content || '').replace(/\s+/g, ' ').slice(0, 80);
}

function formatReplyPreview(msg) {
  if (msg.reply_to_message_id) {
    return getMessagePreview(msg.reply_type, msg.reply_content);
  }
  return getMessagePreview(msg.type, msg.content);
}

function jumpToMessage(messageId) {
  if (!messageId) return;
  const container = messagesContainer.value;
  if (!container) return;
  const targetEl = container.querySelector(`[data-msg-id="${messageId}"]`);
  if (!targetEl) return;
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  highlightedMessageId.value = messageId;
  setTimeout(() => {
    if (highlightedMessageId.value === messageId) {
      highlightedMessageId.value = null;
    }
  }, 1800);
}

function showMessageMenu(event, msg) {
  if (msg.is_revoked) return;
  selectedMessage.value = msg;
  menuPosition.value = { x: event.clientX, y: event.clientY };
  showMenu.value = true;
}

function startReply() {
  if (!selectedMessage.value) return;
  replyingMessage.value = selectedMessage.value;
  closeMenu();
  nextTick(() => textareaRef.value?.focus());
}

function cancelReply() {
  replyingMessage.value = null;
}

function startEdit() {
  if (!selectedMessage.value || !canEditSelectedMessage.value) return;
  editingMessage.value = selectedMessage.value;
  replyingMessage.value = null;
  inputText.value = selectedMessage.value.content || '';
  setChatDraft(chatStore.currentChat.id, inputText.value);
  closeMenu();
  nextTick(() => textareaRef.value?.focus());
}

function cancelEdit() {
  editingMessage.value = null;
}

function handleRevoke() {
  if (!selectedMessage.value || !canRevokeSelectedMessage.value) return;
  revokeMessage(selectedMessage.value.id);
  if (editingMessage.value?.id === selectedMessage.value.id) {
    editingMessage.value = null;
    inputText.value = '';
  }
  closeMenu();
}

function closeMenu() {
  showMenu.value = false;
  selectedMessage.value = null;
}

function getReadReceipt(msg) {
  if (msg.is_revoked || msg.from_user_id !== userStore.userId) return '';

  const chatId = String(chatStore.currentChat.id);
  if (chatStore.currentChat.type === 'private') {
    const peerId = parseInt(chatId, 10);
    if (!Number.isInteger(peerId) || peerId <= 0) return '';
    const peerReadId = readStateMap.value[chatId]?.[String(peerId)] || 0;
    return peerReadId >= msg.id ? '已读' : '未读';
  }

  if (chatStore.currentChat.type === 'channel') {
    const states = readStateMap.value[chatId] || {};
    const channel = chatStore.channels.find((c) => c.id === chatStore.currentChat.channelId);
    const othersTotal = Math.max((channel?.member_count || 1) - 1, 0);
    if (othersTotal === 0) return '仅你可见';
    const readCount = Object.entries(states).filter(([uid, readId]) => {
      return Number(uid) !== userStore.userId && Number(readId) >= msg.id;
    }).length;
    return `${readCount}/${othersTotal} 已读`;
  }

  return '';
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
    const currentIsChannel = searchScope.value === 'current' && chatStore.currentChat.type === 'channel';
    const chatId = searchScope.value === 'current' && !currentIsChannel
      ? chatStore.currentChat.id
      : undefined;
    const channelId = currentIsChannel ? chatStore.currentChat.channelId : undefined;
    const result = await messageAPI.searchMessages(searchKeyword.value.trim(), chatId, 1, 20, channelId);
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
  const chatId = item.channel_id
    ? toChannelChatId(item.channel_id)
    : (item.to_user_id === 0
      ? GROUP_CHAT_KEY
      : String(item.from_user_id === userStore.userId ? item.to_user_id : item.from_user_id));

  if (chatId === GROUP_CHAT_KEY) {
    switchToGroup();
  } else if (String(chatId).startsWith('channel:')) {
    const channelId = parseChannelChatId(chatId);
    const target = chatStore.channels.find((c) => c.id === channelId);
    if (target) {
      switchToChannel(target);
    } else {
      await loadChannels();
      const latest = chatStore.channels.find((c) => c.id === channelId);
      if (!latest) {
        ElMessage.warning('你已不在该频道中');
        return;
      }
      switchToChannel(latest);
    }
  } else {
    const target = chatStore.onlineUsers.find((u) => String(u.id) === String(chatId));
    chatStore.switchChat(String(chatId), target?.nickname || `用户${chatId}`, 'private');
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

async function editAnnouncement() {
  if (chatStore.currentChat.type !== 'channel' || !chatStore.currentChat.channelId) return;
  try {
    const result = await ElMessageBox.prompt('设置频道公告（留空可清空）', '频道公告', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputValue: channelAnnouncement.value?.content || '',
      inputPlaceholder: '请输入公告内容',
    });
    const response = await channelAPI.updateAnnouncement(chatStore.currentChat.channelId, result.value || '');
    channelAnnouncement.value = response.announcement || null;
    ElMessage.success(response.message || '公告已更新');
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') {
      ElMessage.error('公告更新失败');
    }
  }
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
  setChatDraft(chatStore.currentChat.id, inputText.value);
  disconnectSocket();
  chatStore.reset();
  userStore.logout();
  router.push('/login');
  ElMessage.success('已退出登录');
}
</script>

<style scoped>
.chat-header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.session-flag {
  font-size: 12px;
  color: #909399;
}

.profile-dialog {
  display: grid;
  gap: 14px;
}

.profile-avatar-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.profile-avatar-actions {
  display: grid;
  gap: 6px;
}

.profile-avatar-tip {
  font-size: 12px;
  color: #909399;
}

.channel-announcement {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fff9e8;
  border-bottom: 1px solid #f2e3b0;
  font-size: 12px;
}

.channel-announcement-label {
  font-weight: 600;
  color: #b88230;
  flex-shrink: 0;
}

.channel-announcement-content {
  flex: 1;
  color: #5f4a2d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-announcement-meta {
  color: #9c8a67;
  flex-shrink: 0;
}

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

.unread-divider {
  margin: 8px auto 16px;
  width: fit-content;
  padding: 2px 10px;
  border-radius: 999px;
  background: #e8f3ff;
  color: #409eff;
  font-size: 12px;
}

.reply-quote {
  margin-bottom: 8px;
  padding: 6px 8px;
  border-left: 3px solid #c0dfff;
  background: #f5faff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #5d6f83;
}

.reply-quote-author {
  color: #409eff;
  margin-right: 6px;
}

.reply-quote-text {
  word-break: break-all;
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

.read-flag {
  color: #909399;
}

.compose-assist {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: #f5f7fa;
  color: #606266;
}

.compose-assist.warning {
  background: #fff7e6;
  color: #8a5a00;
}

.compose-assist-title {
  font-weight: 600;
  flex-shrink: 0;
}

.compose-assist-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-assist-close {
  cursor: pointer;
  flex-shrink: 0;
  color: #909399;
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
