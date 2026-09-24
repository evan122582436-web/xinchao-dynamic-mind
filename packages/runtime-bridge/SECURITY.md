# Security Policy

## 先保护什么

- `XINCHAO_BRIDGE_MACHINE_TOKEN` 只能放在用户自己的机器或 secret store；
- Webhook Token 与机器 Token 必须不同；
- `.env`、日志、截图、Issue 和公开仓库中不得出现任何真实 Token；
- Runtime Adapter 必须按 `deliveryId` 幂等，并确认目标账号与会话；
- 不要用本工具绕过平台权限，也不要声称能唤醒没有后台接口的官方关闭窗口。

## 报告漏洞

公开 Issue 只提交复现步骤和脱敏日志。涉及凭据、正文或可利用细节时，请先通过仓库维护者的 GitHub 私密渠道报告，不要附带真实用户数据。

## 支持范围

当前公开候选版支持 Node.js 20 及以上。安全修复优先进入最新小版本；旧版本不保证单独维护。
