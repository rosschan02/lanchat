/**
 * 聊天状态管理 (Pinia)
 */
import { defineStore } from 'pinia';

export const useChatStore = defineStore('chat', {
    state: () => ({
        // 在线用户列表
        onlineUsers: [],
        // 我加入的频道
        channels: [],
        // 当前聊天对象 (0 = 群聊, userId = 私聊, channel:* = 频道)
        currentChat: { id: '0', name: '群聊', type: 'group' },
        // 消息列表 (按聊天对象分组): { [chatId]: Message[] }
        messagesMap: {},
        // 未读消息计数: { [chatId]: number }
        unreadCount: {},
        mentionCount: {},
        // 正在输入提示
        typingUser: null,
    }),

    getters: {
        // 当前聊天的消息列表
        currentMessages: (state) => {
            return state.messagesMap[String(state.currentChat.id)] || [];
        },
        // 总未读数
        totalUnread: (state) => {
            return Object.values(state.unreadCount).reduce((sum, count) => sum + count, 0);
        },
    },

    actions: {
        /**
         * 设置在线用户列表
         */
        setOnlineUsers(users) {
            this.onlineUsers = users;
        },

        setChannels(channels) {
            this.channels = channels;
        },

        /**
         * 用户上线
         */
        addOnlineUser(user) {
            if (!this.onlineUsers.find(u => u.id === user.id)) {
                this.onlineUsers.push(user);
            }
        },

        /**
         * 用户下线
         */
        removeOnlineUser(userId) {
            this.onlineUsers = this.onlineUsers.filter(u => u.id !== userId);
        },

        updateOnlineUserProfile(userId, patch = {}) {
            this.onlineUsers = this.onlineUsers.map((user) => {
                if (user.id !== userId) return user;
                return { ...user, ...patch };
            });
        },

        /**
         * 切换聊天对象
         */
        switchChat(chatId, name, type = 'private', extra = {}) {
            const key = String(chatId);
            this.currentChat = { id: key, name, type, ...extra };
            // 清除该聊天的未读计数
            if (this.unreadCount[key]) {
                this.unreadCount[key] = 0;
            }
            if (this.mentionCount[key]) {
                this.mentionCount[key] = 0;
            }
        },

        /**
         * 设置历史消息
         */
        setMessages(chatId, messages) {
            this.messagesMap[String(chatId)] = messages;
        },

        /**
         * 添加新消息
         */
        addMessage(chatId, message) {
            const key = String(chatId);
            if (!this.messagesMap[key]) {
                this.messagesMap[key] = [];
            }
            // 避免重复消息
            const exists = this.messagesMap[key].find(m => m.id === message.id);
            if (!exists) {
                this.messagesMap[key].push(message);
            }
        },

        markMessageRevoked(messageId) {
            Object.keys(this.messagesMap).forEach((chatId) => {
                const list = this.messagesMap[chatId];
                const target = list.find(m => m.id === messageId);
                if (target) {
                    target.is_revoked = 1;
                }
            });
        },

        markMessageEdited(messageId, content, editedAt) {
            Object.keys(this.messagesMap).forEach((chatId) => {
                const list = this.messagesMap[chatId];
                const target = list.find(m => m.id === messageId);
                if (target) {
                    target.content = content;
                    target.edited_at = editedAt || target.edited_at || null;
                }
            });
        },

        /**
         * 增加未读计数
         */
        incrementUnread(chatId) {
            const key = String(chatId);
            if (!this.unreadCount[key]) {
                this.unreadCount[key] = 0;
            }
            this.unreadCount[key]++;
        },

        incrementMention(chatId) {
            const key = String(chatId);
            if (!this.mentionCount[key]) {
                this.mentionCount[key] = 0;
            }
            this.mentionCount[key]++;
        },

        /**
         * 设置正在输入
         */
        setTyping(user) {
            this.typingUser = user;
            // 3 秒后自动清除
            setTimeout(() => {
                this.typingUser = null;
            }, 3000);
        },

        /**
         * 清空所有状态
         */
        reset() {
            this.onlineUsers = [];
            this.channels = [];
            this.currentChat = { id: '0', name: '群聊', type: 'group' };
            this.messagesMap = {};
            this.unreadCount = {};
            this.mentionCount = {};
            this.typingUser = null;
        },
    },
});
