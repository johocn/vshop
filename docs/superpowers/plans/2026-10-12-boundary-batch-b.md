# 已知边界批次 B Implementation Plan（#4 余额提现收款账号加密）

**Goal:** F05 `BalanceWithdrawalRequest.accountInfo` 由明文存储改为 aes-256-gcm 静态加密（at-rest）；API 对外仍返回明文，后台审核展示不变；存量明文行读取时天然兼容（decrypt 非密文原样返回），无需迁移。

**Architecture:** 复用 distribution-plugin 既有加密模式（同款 `account-crypto.ts`：aes-256-gcm，`enc:iv:tag:data` 前缀格式，env `BALANCE_ACCOUNT_SECRET`，dev 兜底）。仅改 vendure recharge-card-plugin；C 端与 web-admin 无感知、零改动。

**Tech Stack:** Vendure 3.x（node crypto、vitest e2e）。

**注意：** lib/ 编译产物被 git 跟踪，须本地 `npm run build` 后一并提交推送；服务器只 git pull + pm2 restart。

---

### Task 1: 加密工具 + 写入/读取改造（vendure recharge-card-plugin）

**Files:**
- Create: `d:\zhao\vendure\packages\recharge-card-plugin\src\account-crypto.ts`（仿 distribution-plugin 同名文件，SECRET 改 `BALANCE_ACCOUNT_SECRET`）
- Modify: `balance-withdrawal.service.ts`（request 写入前 encryptAccount；findMyRequests/findAll/transition 返回前 decryptAccount）
- Modify: `balance-withdrawal-request.entity.ts`（accountInfo 注释更新为密文存储）
- Modify: `e2e/balance-withdrawal.e2e-spec.ts`（补用例）

- [ ] Step 1: account-crypto.ts（encryptAccount/decryptAccount）
- [ ] Step 2: service 四处读写点加密/解密；`request` 返回 saved 前解密（distribution 口径一致）
- [ ] Step 3: e2e 补用例——申请后直查 DB `accountInfo` 以 `enc:` 开头、API 返回明文 `test@example.com`；存量明文兼容（手工塞明文行 → findAll 解密原样返回）

### Task 2: 收尾一气呵成

- [ ] Step 1: `npx tsc --noEmit -p packages/recharge-card-plugin` + e2e 回归（balance-withdrawal + recharge-card 两套）
- [ ] Step 2: `npm run build`（lib 产物）
- [ ] Step 3: 生产存量 accountInfo 检查（明文行数，可留待自然兼容）
- [ ] Step 4: 手册 batch3「五、已知边界」#4 标注已处理 + 批次 B 章节；提交推送；服务器 git pull + pm2 restart；curl 验证 shop-api 200
