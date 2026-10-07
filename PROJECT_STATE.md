# 项目状态

- 版本：v1.0.1-beta.1，虚拟筹码休闲版。
- Worker 名称：discord-holdem；公开品牌：Aliceneko。
- 已实现规则、私密手牌、按钮/加注 modal、边池分池、超时告警处理、命令自动注册。
- 14 项测试通过，包括原有 300 局随机模拟和 200 局电脑陪练模拟；测试版已部署 Cloudflare，保留原加密变量与牌局存储。
- BOT_TOKEN 已配置为 Cloudflare 加密变量并部署，Discord API 确认 Token 有效且应用匹配。
- Discord API 确认 /德州 的 创建、测试、帮助、牌桌 子指令均已确认注册成功；机器人尚未加入服务器，等待邀请和双人实测。
- 禁止将任何 Token、邮箱、私人账号、具体服务器 ID 或 Cloudflare 凭据写入 GitHub、公开响应或日志。
- 测试前不声称可正式游玩；公开端点只暴露必要状态。牌桌状态仅允许 Discord 签名验证后的对应频道访问。
- GitHub 私有仓库：AliceNekoqqq/Aliceneko-Discord-Holdem。后续修改和发布已获用户授权。
- 交互端点使用 Cloudflare 子域名 aliceneko，保留 /interactions 路径。

- 本次新增电脑陪练：`/德州 测试` 默认两位，可选 1～8 位；桌主可用按钮增减。
- 电脑约 1.5 秒自动行动，使用本地规则策略，仅使用自身底牌和公共信息。无需新建 Discord 账号或提供新 Token。
- 电脑归零后下一手自动补充；所有真人离桌后自动关桌，避免孤立电脑牌桌。
