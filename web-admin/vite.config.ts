import { defineConfig } from 'vite';
import uniPlugin from '@dcloudio/vite-plugin-uni';

const uni = typeof uniPlugin === 'function' ? uniPlugin : (uniPlugin as any)?.default;

export default defineConfig({
    plugins: [uni()],
    server: {
        port: 5280,
        strictPort: true,
        host: '0.0.0.0',
        proxy: {
            '/admin-api': {
                // 仅 dev server 用；缺失 env 时回退本地后端并打日志提醒，避免静默指错目标
                target: process.env.VITE_API_URL || 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
});