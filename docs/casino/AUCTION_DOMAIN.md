# Aliceneko 拍卖官网域名

2026-11-03，用户要求网址包含 Aliceneko 和拍卖元素。

- 主入口：`https://auction.alicenekoqqq.cc.cd/`，根路径转到 `/auction/`。绑定已有 `discord-holdem` Worker，共享原 Durable Object、会话服务、小酒馆钱包、藏品与拍卖；不复制数据库或启动第二个机器人。
- Cloudflare 自定义域名已绑定；Wrangler 记录该路由并显式保留原 workers.dev。原入口继续可用；前端仅认可这两个正式来源为同源游戏客户端，其他镜像引导到新主入口。
- Discord 应用 `1557397878702346321` 已保存新增回调 `https://auction.alicenekoqqq.cc.cd/auction/auth/callback`，旧回调保留。未重置或读取密钥，权限仍为 identify/guilds。
- 新旧域名各用自己的 Host Cookie、同源 CSRF 和 OAuth 回调；跨域不会复制登录 Cookie，资产仍由同一 Discord 用户 ID 与服务器 ID 定位。
- 首页配图使用新域名；CSP 仅增加该正式图片来源。未改汇率、价格、掉率、游戏逻辑、绑定、Secrets、迁移或 Cron。

验证：本地新域名下 Worker 104 项通过、网页静态构建与脚本语法检查通过。完整 CI、正式部署与新域名实际登录回执待发布后追加。
