# 项目状态

- 版本：v1.0.0，虚拟筹码休闲版。
- Worker 名称：discord-holdem；公开品牌：Aliceneko。
- 已实现规则、私密手牌、按钮/加注 modal、边池分池、超时告警处理、命令自动注册。
- 10 项测试通过，包括 300 局随机模拟；第一版已部署 Cloudflare。
- 2026-10-07：BOT_TOKEN 已配置为 Cloudflare secret_text 加密变量并部署；Discord API 已确认 Token 有效且属于对应机器人。
- Discord API 已确认全局 /德州 指令注册成功，包含 创建、帮助、牌桌 三个子指令；每分钟命令检查计划已配置。
- 验证时机器人尚未加入服务器。下一步：用户通过仅含查看频道、发送消息、嵌入链接权限的邀请链接加入服务器，再进行两名玩家的真实牌局及超时刷新验证。
- 禁止将任何 Token、邮箱、私人账号、具体服务器 ID 或 Cloudflare 凭据写入 GitHub、公开响应或日志。
- 真实牌局仍待验证，不声称生产实测通过；公开端点只暴露必要状态。牌桌状态仅允许 Discord 签名验证后的对应频道访问。
- GitHub 私有仓库：AliceNekoqqq/Aliceneko-Discord-Holdem。后续修改和发布已获用户授权。
- 交互端点使用 Cloudflare 子域名 aliceneko，保留 /interactions 路径。
