import { defineConfig } from '@tarojs/cli'
import path from 'node:path'

// Taro 4.3 的 postcss 配置只识别内置插件白名单，自定义插件不会被注入，
// 因此这里直接把 tailwindcss 插件塞进各条 CSS 规则的 postcss-loader。
/* eslint-disable @typescript-eslint/no-var-requires */
const tailwindcss = require('tailwindcss')
const { UnifiedWebpackPluginV5 } = require('weapp-tailwindcss/webpack')

const isProd = process.env.NODE_ENV === 'production'
const projectRoot = path.resolve(__dirname, '..')

/**
 * 遍历所有含 postcss-loader 的 rule / oneOf，追加 tailwindcss 插件。
 * 小程序端与 H5 端的 rule 命名不同，这里用动态遍历避免写死。
 */
function injectTailwindPostcss(chain: any) {
  const rulesMap = (chain.module.rules && chain.module.rules.entries && chain.module.rules.entries()) || {}
  Object.keys(rulesMap).forEach((ruleName) => {
    const rule = rulesMap[ruleName]
    const targets: Array<{ parent: any; key: string }> = []

    const ownUses = (rule.uses && rule.uses.entries && rule.uses.entries()) || {}
    Object.keys(ownUses).forEach((k) => targets.push({ parent: rule, key: k }))

    const oneOfs = (rule.oneOfs && rule.oneOfs.entries && rule.oneOfs.entries()) || {}
    Object.keys(oneOfs).forEach((of) => {
      const oneOfRule = oneOfs[of]
      const uses = (oneOfRule.uses && oneOfRule.uses.entries && oneOfRule.uses.entries()) || {}
      Object.keys(uses).forEach((k) => targets.push({ parent: oneOfRule, key: k }))
    })

    targets.forEach(({ parent, key }) => {
      const uses = parent.uses.entries()
      const loader = String((uses[key] && uses[key].get && uses[key].get('loader')) || '')
      if (!loader.includes('postcss-loader')) return

      parent.use(key).tap((options: any = {}) => {
        const postcssOptions = options.postcssOptions || {}
        const plugins = [...(postcssOptions.plugins || [])]
        const hasTailwind = plugins.some((p: any) => p && p.postcssPlugin === 'tailwindcss')
        if (!hasTailwind) {
          plugins.push(tailwindcss())
        }
        return { ...options, postcssOptions: { ...postcssOptions, plugins } }
      })
    })
  })
}

export default defineConfig(async (merge) => {
  const baseConfig = {
    projectName: 'bead-diy',
    date: '2026-10-11',
    designWidth: 375,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot: `dist/${process.env.TARO_ENV}`,
    plugins: [],
    defineConstants: {
      // shop-api 地址：构建期注入，禁止硬编码生产域名；本地 dev 默认 localhost
      API_BASE_URL: JSON.stringify(process.env.TARO_APP_API_BASE || 'http://localhost:3000/shop-api'),
    },
    copy: {
      patterns: [],
      options: {},
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      prebundle: {
        enable: false,
      },
    },
    cache: {
      enable: false,
    },
    alias: {
      '@': path.resolve(projectRoot, 'src'),
      '@engine': path.resolve(projectRoot, 'src/engine'),
      '@data': path.resolve(projectRoot, 'src/data'),
      '@store': path.resolve(projectRoot, 'src/store'),
      '@components': path.resolve(projectRoot, 'src/components'),
    },
    mini: {
      postcss: {
        // Tailwind 产出的是 px 单位（375 设计稿基准），禁用 px→rpx 转换，
        // 否则原子类会被二次换算，尺寸全部失真。
        pxtransform: {
          enable: false,
        },
        url: {
          enable: true,
          config: { limit: 1024 },
        },
        cssModules: {
          enable: false,
        },
      },
      optimizeMainPackage: {
        enable: false,
      },
      webpackChain(chain: any) {
        injectTailwindPostcss(chain)
        chain.merge({
          plugin: {
            // 把 Tailwind 原子类转义为小程序合法选择器（如 `mt-4` → `_mt-4`）
            install: {
              plugin: UnifiedWebpackPluginV5,
              args: [
                {
                  appType: 'taro',
                  rem2rpx: false,
                },
              ],
            },
          },
        })
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      router: {
        mode: 'hash',
      },
      devServer: {
        port: 10086,
        host: '0.0.0.0',
        allowedHosts: 'all',
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        pxtransform: {
          enable: false,
        },
        cssModules: {
          enable: false,
        },
      },
      webpackChain(chain: any) {
        injectTailwindPostcss(chain)
        chain.stats({ errorStack: true, errorDetails: true })
      },
    },
  }

  return merge({}, baseConfig, isProd ? { terser: { enable: true } } : {})
})
