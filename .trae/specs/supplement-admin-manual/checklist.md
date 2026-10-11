# Checklist

## 章节完整性
- [x] op-46 积分商城章节存在，覆盖积分商品管理（points/goods）与积分订单管理（points/orders）两个菜单入口
- [x] op-47 促销活动章节存在，覆盖限时秒杀（flash-sale）与拼团（group-buy），并说明场次自动开/结束依赖 worker（与 op-40 呼应）
- [x] op-48 抽奖活动章节存在，覆盖奖品配置（lottery/prizes）
- [x] op-49 会员等级章节存在，覆盖等级规则配置（member/level-config）
- [x] op-50 评价管理章节存在，覆盖评价查看/回复（review/list）
- [x] op-51 余额与提现章节存在，覆盖提现审核（balance/withdraw）
- [x] op-52 反馈与 FAQ 章节存在，覆盖 FAQ 维护与意见反馈处理（feedback/faq、feedback/list）

## 内容质量
- [x] 全部操作路径（菜单层级/按钮/字段名）与实际页面代码或实机截图一致，无虚构
- [x] 每个新章节至少 1 张 390×844 手机视口实机截图，imgcap 图注规范
- [x] 引用的截图文件全部存在于 manual/shots/，无 404
- [x] 章节样式沿用既有类（steps/table/note/warn/tip/mark/imgcap），与旧章节视觉一致
- [x] 章节 id 无重复、编号连续，目录与搜索能索引到新章节
- [x] 修订记录块已添加并登记本次补充

## 交付
- [x] 手册直接用浏览器打开验证渲染正常（本机 file:// 或 dev）
- [x] 仅手册相关文件被提交（不夹带工作区其他未提交变更）
- [x] 已推送 vshop 并通过 deploy.mjs 部署
- [x] 生产环境 e.joho.cn/guanli 手册入口可达，新章节在线可读
- [x] 项目记忆已更新（手册覆盖范围结论、缺失模块清单）
