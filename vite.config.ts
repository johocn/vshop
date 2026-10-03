import { defineConfig, loadEnv } from 'vite';
import uniPlugin from '@dcloudio/vite-plugin-uni';

const uni = typeof uniPlugin === 'function' ? uniPlugin : (uniPlugin as any)?.default;

export default defineConfig(({ mode }) => {
    // loadEnv 读取 .env*（含 .env.local），供 dev 代理与页面端 VITE_API_URL 解耦：
    // 本地联调可设 VITE_API_URL=http://localhost:5180（同源自引用走代理）+ VITE_API_PROXY=<真实后端>
    const env = loadEnv(mode, process.cwd(), '');

    return {
        plugins: [uni()],
        server: {
            port: 5180,
            strictPort: true,
            host: '0.0.0.0',
            proxy: {
                '/shop-api': {
                    target: env.VITE_API_PROXY || env.VITE_API_URL || 'http://localhost:3000',
                    changeOrigin: true,
                },
            },
        },
    };
});
