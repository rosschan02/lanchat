/**
 * Vue Router 路由配置
 */
import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
    {
        path: '/',
        redirect: '/login',
    },
    {
        path: '/login',
        name: 'Login',
        component: () => import('@/views/Login.vue'),
    },
    {
        path: '/main',
        name: 'Main',
        component: () => import('@/views/Main.vue'),
        meta: { requiresAuth: true },
    },
    {
        path: '/admin',
        name: 'Admin',
        component: () => import('@/views/Admin.vue'),
        meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
        path: '/screenshot',
        name: 'Screenshot',
        component: () => import('@/views/Screenshot.vue'),
    },
];

const router = createRouter({
    // 使用 hash 模式，兼容 Electron 文件加载
    history: createWebHashHistory(),
    routes,
});

// 路由守卫 - 检查登录状态
router.beforeEach((to, from, next) => {
    const token = localStorage.getItem('lanchat_token');

    if (to.meta.requiresAuth && !token) {
        next('/login');
    } else if (to.path === '/login' && token) {
        next('/main');
    } else {
        next();
    }
});

export default router;
