# Aliceneko 拍卖官网域名

2026-11-03，用户要求网址包含 Aliceneko 和拍卖元素。

- 主入口：`https://auction.alicenekoqqq.cc.cd/`，根路径转到 `/auction/`。绑定已有 `discord-holdem` Worker，共享原 Durable Object、会话服务、小酒馆钱包、藏品与拍卖；不复制数据库或启动第二个机器人。
- Cloudflare 自定义域名已绑定；Wrangler 记录该路由并显式保留原 workers.dev。原入口继续可用；前端仅认可这两个正式来源为同源游戏客户端，其他镜像引导到新主入口。
- Discord 应用 `1557397878702346321` 已保存新增回调 `https://auction.alicenekoqqq.cc.cd/auction/auth/callback`，旧回调保留。未重置或读取密钥，权限仍为 identify/guilds。
- 新旧域名各用自己的 Host Cookie、同源 CSRF 和 OAuth 回调；跨域不会复制登录 Cookie，资产仍由同一 Discord 用户 ID 与服务器 ID 定位。
- 首页配图使用新域名；CSP 仅增加该正式图片来源。未改汇率、价格、掉率、游戏逻辑、绑定、Secrets、迁移或 Cron。

验证：本地新域名下 Worker 104 项通过、网页静态构建与脚本语法检查通过。

## 发布与真人验收

- PR #80特性 aa07c86e59c84c0a9e407bf468e88befd20f0fb0，完整PR CI41614814017成功；合并 cb9cec8a4ce0fd7958dfb6469f294c7f4be03939，main完整CI/部署41615186423成功。源码树 d03783478f51dc819e9435b24a511ce50fca0a0a 与本地 fa4c83b 相同。
- Cloudflare域名 e3913edf3a679e25f737f78d4e318a525e3242c8 已启用并签发证书；生产部署005d415b-907a-45bb-8986-5f7ed317a359、版本cb3e3b3a-cfde-4128-a5f5-cf8e5615c4fb接收100%。与此前已配置OAuth版本b42d7a61-c696-4a96-9fdb-2155182543eb对比，全部16bindings（含变量与Secret名类型）及script_runtime完全相同，仅script etag/last_deployed_from改变；health仍casino.16、ready/Gateway ready:true。未提高游戏版本。
- 实际Chrome从新域名发起OAuth，正确新回调、S256、原identify/guilds范围；授权后回到新域名/auction/#play。新鲜页面显示真实已登录身份、原共同服务器、同样双币钱包、同一局拍卖进度与个人仓库，证实同源登录/共享资产读取成功。未代用户竞价、兑换、揭晓、出售或陈列；未保存身份/余额/会话或私人截图。
- 本人预览镜像保持owner-only，源8ea6b48189ed9951061f9a0e6480a3f0ec535c0c，部署appgdep_6ae9afdfa41c81918d513fbc81583a39成功；其登录入口也指向新域名。新域名与发布验收闭环，不重复发布。
