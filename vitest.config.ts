/**
 * vitest 独立配置：不合并项目 vite.config.ts（uni-app 插件依赖 uni 环境，node 单测用不到）。
 * 运行：pnpm test（= vitest run --config vitest.config.ts）
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/pkg-diy/**/*.test.ts'],
        environment: 'node',
    },
});
