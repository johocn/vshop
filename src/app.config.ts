/**
 * 注意：这里刻意不 import @tarojs/taro 的 defineAppConfig。
 * Taro 4.3.0 在编译期会用 Node 执行本文件打包产物来读取 AppConfig，
 * 一旦引入 @tarojs/taro，就会连带把 @tarojs/runtime 的 DOM 实现拉进 Node 侧执行，
 * 从而抛 ReferenceError: window/document is not defined。
 * 纯对象导出可以完全避免这条依赖链，行为等价。
 */
export default {
  pages: [
    'pages/designer/index',
    'pages/generator/index',
    'pages/bom/index',
    'pages/export/index',
    'pages/works/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#1C1613',
    navigationBarTitleText: '我的手串',
    navigationBarTextStyle: 'white',
    backgroundColor: '#1C1613',
  },
  style: 'v2',
  lazyCodeLoading: 'requiredComponents',
}
