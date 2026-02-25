/**
 * HTTP API 服务封装
 * 基于 axios 封装所有后端接口调用
 */
import axios from 'axios';
import { ElMessage } from 'element-plus';

// 创建 axios 实例
const api = axios.create({
    timeout: 10000,
});

/**
 * 获取服务器地址
 */
export function getServerUrl() {
    return localStorage.getItem('lanchat_server') || 'http://localhost:3000';
}

/**
 * 设置服务器地址
 */
export function setServerUrl(url) {
    localStorage.setItem('lanchat_server', url);
}

// 请求拦截器 - 添加 Token 和 baseURL
api.interceptors.request.use((config) => {
    config.baseURL = getServerUrl();
    const token = localStorage.getItem('lanchat_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// 响应拦截器 - 统一错误处理
api.interceptors.response.use(
    (response) => response.data,
    (error) => {
        const msg = error.response?.data?.error || '网络请求失败';
        if (error.response?.status === 401) {
            localStorage.removeItem('lanchat_token');
            localStorage.removeItem('lanchat_user');
            window.location.hash = '#/login';
        }
        ElMessage.error(msg);
        return Promise.reject(error);
    }
);

// ===== 认证接口 =====

export const authAPI = {
    login: (username, password) => api.post('/api/auth/login', { username, password }),
    getProfile: () => api.get('/api/auth/profile'),
};

// ===== 用户管理接口 =====

export const userAPI = {
    getUsers: () => api.get('/api/users'),
    createUser: (data) => api.post('/api/users', data),
    updateUser: (id, data) => api.put(`/api/users/${id}`, data),
    deleteUser: (id) => api.delete(`/api/users/${id}`),
    resetPassword: (id, password) => api.put(`/api/users/${id}/reset-password`, { password }),
};

// ===== 消息接口 =====

export const messageAPI = {
    getGroupMessages: (limit = 50, offset = 0) =>
        api.get('/api/messages/group', { params: { limit, offset } }),
    getPrivateMessages: (userId, limit = 50, offset = 0) =>
        api.get(`/api/messages/private/${userId}`, { params: { limit, offset } }),
};

// ===== 文件上传 =====

export const uploadAPI = {
    uploadImage: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post('/api/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
};

export default api;
