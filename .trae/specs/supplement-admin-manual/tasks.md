# Tasks

- [x] Task 1: 功能素材核实（7 章并行调研，产出素材笔记）
  - [x] 1.1 阅读 `web-admin/src/pages/points/goods`、`points/orders` 页面代码，产出「积分商品上架/兑换流程、积分订单发货」素材笔记
  - [x] 1.2 阅读 `promotion/flash-sale`、`promotion/group-buy` 页面代码，产出「秒杀场次配置、拼团玩法与状态流」素材笔记
  - [x] 1.3 阅读 `lottery/prizes`、`member/level-config`、`review/list` 页面代码，产出「奖品配置、等级规则、评价回复」素材笔记
  - [x] 1.4 阅读 `balance/withdraw`、`feedback/faq`、`feedback/list` 页面代码，产出「提现审核、FAQ 维护、反馈处理」素材笔记
  - [x] 1.5 盘点可复用截图（`web-admin/docs/superpowers/manual/usemall-parity-batch3/`、`docs/screenshots/`），列出缺口清单
- [x] Task 2: dev 环境截图补齐（依赖 Task 1.5 缺口清单）
  - [x] 2.1 启动本地 dev 环境（vendure dev 后端 + web-admin H5 dev），以超管账号登录
  - [x] 2.2 按 Playwright 390×844 dpr=2 移动视口对缺口页面逐一截图，存 `web-admin/src/static/manual/shots/`（命名对齐既有 `xxx_390.png` 风格）——实际 780×1688 十页全拍
  - [x] 2.3 关闭 dev 进程，不留后台残留
- [x] Task 3: 编写 7 个新章节并合入手册（依赖 Task 1 全部 + Task 2；单点编辑 index.html 避免冲突）
  - [x] 3.1 在 index.html 的 op 册数组按 op-46～op-52 追加章节（内容依据 Task 1 素材笔记，路径/字段名与实机一致）
  - [x] 3.2 每章插入对应截图与 imgcap 图注；检查图片文件名与 shots/ 实际文件一致
  - [x] 3.3 封面页尾部加「修订记录」块，登记本次 7 章补充
  - [x] 3.4 校验章节 id/编号连续、无重复 id、HTML 无未闭合标签
- [ ] Task 4: 验证与交付（依赖 Task 3）
  - [x] 4.1 浏览器打开 index.html：目录/搜索含新章节、样式正常、图片全部加载（无 404）
  - [ ] 4.2 提交 vshop（仅手册相关文件）→ 推送 → `cd web-admin; node scripts/deploy.mjs` 部署
  - [ ] 4.3 生产验证：e.joho.cn/guanli 手册入口可达、新章节在线可读

# Task Dependencies
- Task 2 依赖 Task 1.5（先有缺口清单再截屏）
- Task 3 依赖 Task 1 全部子项与 Task 2（素材+截图齐备才动笔）
- Task 4 依赖 Task 3
- Task 1 的 1.1～1.5 可并行
