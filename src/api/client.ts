/** shop-api GraphQL 客户端；API_BASE_URL 由构建期 defineConstants 注入 */
declare const API_BASE_URL: string

interface GqlResponse<T> {
  data?: T
  errors?: { message: string }[]
}

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  // 运行时动态加载 @tarojs/taro：避免纯 node 环境（单元测试）在模块加载期引入
  // Taro 运行时对构建期注入全局常量（如 ENABLE_INNER_HTML）的依赖
  // 注意：这里不能命名为 Taro —— babel-plugin-transform-taroapi 会把名为 Taro 的
  // 标识符成员访问（如 Taro.request）盲改写为具名导入 _request，而本文件只有动态
  // import、没有静态导入声明，改写后会得到未定义引用（_request is not defined）
  // 另外：H5/weapp 构建期 @tarojs/taro 别名到平台 runtime 模块，default 对象不含
  // 全部 API（如 request 只在具名导出上）；node（单测）环境是 CJS interop，
  // default 才是完整对象。按 request 是否存在取其一。
  const mod: any = await import('@tarojs/taro')
  const taro = mod.default?.request ? mod.default : mod
  const res = await taro.request({
    url: API_BASE_URL,
    method: 'POST',
    data: { query, variables: variables ?? {} },
    header: { 'Content-Type': 'application/json' },
  })
  const body = res.data as GqlResponse<T>
  if (body.errors?.length) throw new Error(body.errors[0].message)
  if (!body.data) throw new Error('Empty GraphQL response')
  return body.data
}
