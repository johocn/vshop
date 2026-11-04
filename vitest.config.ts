/**
 * vitest 独立配置：不合并项目 vite.config.ts（uni-app 插件依赖 uni 环境，node 单测用不到）。
 * 运行：pnpm test（= vitest run --config vitest.config.ts）
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/pkg-diy/**/*.test.ts', 'src/utils/**/*.test.ts', 'src/templates/**/*.test.ts', 'src/composables/**/*.spec.ts', 'src/pkg-promotion/pages/group-join/**/*.spec.ts', 'src/pkg-user/**/*.spec.ts',
            // web-admin 纯函数测试单独指定（其余 admin 测试不在本配置范围内）
            'web-admin/src/utils/sanitizeHtml.test.ts', 'web-admin/src/utils/routeGuard.test.ts',
            'web-admin/src/utils/loginError.test.ts', 'web-admin/src/utils/telemetry.test.ts',
            'web-admin/src/utils/region.test.ts', 'web-admin/src/utils/media.test.ts'],
        exclude: ['**/node_modules/**', '**/dist/**'],
        environment: 'node',
    },
});
