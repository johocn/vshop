// 临时调试：打印 webpack-chain 中的 rule / oneOf / use 名称，便于注入 postcss 插件
class MiniCssProbePlugin {
  apply(compiler) {
    console.error('[PROBE-MINI] (webpack options) rule count=' + ((compiler.options.module && compiler.options.module.rules) || []).length)
  }
}

module.exports = MiniCssProbePlugin
