# 项目状态

- 版本：v1.0.0，虚拟筹码休闲版。
- Worker 名称：discord-holdem；公开品牌：Aliceneko。
- 已实现规则、私密手牌、按钮/加注 modal、边池分池、超时告警处理、命令自动注册。
- 10 项测试通过，包括 300 局随机模拟；第一版已部署 Cloudflare。
- 待用户在 Cloudflare Secret 中添加 BOT_TOKEN，再验证命令注册、服务器权限和双人实际牌局。
- 禁止将任何 Token、邮箱、私人账号、具体服务器 ID 或 Cloudflare 凭据写入 GitHub、公开响应或日志。
- 测试前不声称可正式游玩；公开端点只暴露必要状态。牌桌状态仅允许 Discord 签名验证后的对应频道访问。
- GitHub 私有仓库：AliceNekoqqq/Aliceneko-Discord-Holdem。后续修改和发布已获用户授权。
- 交互端点使用 Cloudflare 子域名 aliceneko，保留 /interactions 路径。
