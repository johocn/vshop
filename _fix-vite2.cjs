const fs = require('fs');
const content = `import { defineConfig } from 'vite';
import uniPlugin from '@dcloudio/vite-plugin-uni';

const uni = typeof uniPlugin === 'function' ? uniPlugin : (uniPlugin as any)?.default;

export default defineConfig({
    plugins: [uni()],
    server: {
        proxy: {
            '/shop-api': {
                target: process.env.VITE_API_URL || 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
});
`;
fs.writeFileSync('e:/code/vshop/vite.config.ts', content, 'utf8');
console.log('vite.config.ts rewritten successfully');
