/**
 * 聊天状态管理 (Pinia)
 */
import { defineStore } from 'pinia';

export const useChatStore = defineStore('chat', {
    state: () => ({
        // 在线用户列表
        onlineUsers: [],
        // 当前聊天对象 (0 = 群聊, userId = 私聊)
        currentChat: { id: 0, name: '群聊', type: 'group' },
        // 消息列表 (按聊天对象分组): { [chatId]: Message[] }
        messagesMap: {},
        // 未读消息计数: { [chatId]: number }
        unreadCount: {},
        // 正在输入提示
        typingUser: null,
    }),

    getters: {
        // 当前聊天的消息列表
        currentMessages: (state) => {
            return state.messagesMap[state.currentChat.id] || [];
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

        /**
         * 切换聊天对象
         */
        switchChat(chatId, name, type = 'private') {
            this.currentChat = { id: chatId, name, type };
            // 清除该聊天的未读计数
            if (this.unreadCount[chatId]) {
                this.unreadCount[chatId] = 0;
            }
        },

        /**
         * 设置历史消息
         */
        setMessages(chatId, messages) {
            this.messagesMap[chatId] = messages;
        },

        /**
         * 添加新消息
         */
        addMessage(chatId, message) {
            if (!this.messagesMap[chatId]) {
                this.messagesMap[chatId] = [];
            }
            // 避免重复消息
            const exists = this.messagesMap[chatId].find(m => m.id === message.id);
            if (!exists) {
                this.messagesMap[chatId].push(message);
            }
        },

        /**
         * 增加未读计数
         */
        incrementUnread(chatId) {
            if (!this.unreadCount[chatId]) {
                this.unreadCount[chatId] = 0;
            }
            this.unreadCount[chatId]++;
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
            this.currentChat = { id: 0, name: '群聊', type: 'group' };
            this.messagesMap = {};
            this.unreadCount = {};
            this.typingUser = null;
        },
    },
});
