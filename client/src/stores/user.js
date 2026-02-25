/**
 * 用户状态管理 (Pinia)
 */
import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
    state: () => ({
        // 当前登录用户
        user: JSON.parse(localStorage.getItem('lanchat_user') || 'null'),
        // JWT Token
        token: localStorage.getItem('lanchat_token') || '',
    }),

    getters: {
        isLoggedIn: (state) => !!state.token,
        isAdmin: (state) => state.user?.role === 'admin',
        userId: (state) => state.user?.id,
        nickname: (state) => state.user?.nickname || '未知',
    },

    actions: {
        /**
         * 设置登录信息
         */
        setLogin(token, user) {
            this.token = token;
            this.user = user;
            localStorage.setItem('lanchat_token', token);
            localStorage.setItem('lanchat_user', JSON.stringify(user));
        },

        /**
         * 清除登录信息
         */
        logout() {
            this.token = '';
            this.user = null;
            localStorage.removeItem('lanchat_token');
            localStorage.removeItem('lanchat_user');
        },
    },
});
