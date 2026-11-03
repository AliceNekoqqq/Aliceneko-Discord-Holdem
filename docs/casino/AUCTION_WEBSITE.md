# 仓库盲拍官网与同源网页客户端

2026-11-03，用户要求官网风格的网站、Discord登录、与小酒馆钱包/拍卖/藏品全互通，以及图鉴/人物技能/规则。复用现有GitHub/Cloudflare发布授权，明确新功能而非重构。

本轮：正式入口在原Worker /auction/，后端同源，复用tavern:<guild> Durable Object、TavernAuction、AuctionCurrency、Inventory。Sites另保留本人可预览的官网镜像，进入真实游戏跳转同源正式入口，避免跨站Cookie/第二套钱包。公开主页/204图鉴/四区掉率/三角色技能/完整规则无需登录，资产与操作只在OAuth会话后可访问。

登录：Discord授权码+PKCE；state与HttpOnly/Secure/__Host浏览器随机Cookie绑定，一次消费，短过期；会话为随机不透明Cookie，服务端哈希存储、可注销、有限期限。只使用identify/guilds，不索取消息权限。Discord用户ID由服务端获取，任何传入id/name/channel等身份字段不可信；选择服务器必须为用户和Bot共同服务器，资金/资产动作再检查当前成员身份。所有私有响应no-store；变更只接受同源JSON POST与会话CSRF Token，限制长度和动作白名单。OAuth token不进浏览器/localStorage/日志，服务器完成身份读取后丢弃。

互通：网页使用保留频道0为来源；拥有者的网页可继续Discord局，Discord可继续网页局；其他真实Discord频道既有隔离保留。不复制/重算资产，不改钱币汇率/价格/概率/技能/预算/旧版本；并发由同一DO事务和既有token/round/销售收据去重。网站含真实格板、五轮出价、逐件/全开、单仓盈亏、双向兑换、个人仓库/批卖/展示柜。

边界：最多30功能文件、5500已知文本行；不改模型、人设、旧Secrets、绑定/迁移/Cron、其他游戏。允许新增OAuth Client Secret配置说明，禁止把凭据提交代码；初次发布时生产缺DISCORD_CLIENT_SECRET和回调注册，后续真人授权验收见末尾记录，不用假账户或假余额代替。

验证：OAuth伪造/过期/state重放/CSRF/越权/退出/拒绝成员/未知动作；真实sqlite钱包/开拍/跨端继续/揭晓/入库/批卖/陈列/重试；公开资料一致性/资产遮罩；桌面手机浏览器QA；相关完整测试、现有PR/main CI、部署后网页/API/老Bot health和配置核验。不操作真人余额、不发测试消息。PROJECT_NOW为当前恢复入口，本文件是本轮范围与验收记录。


用户追加“弄得好看点，可以生图”：新增原创仓库环境主视觉与三位鉴赏师形象图。由内置imagegen生成，无第三方人像/官方角色图；源PNG留在生成目录，交付以WebP项目素材存储。官网使用暖铜/胡桃木/深青影调，真实藏品图保持原材质。环境仅作背景，人物图为本作原创视觉演绎，不改变能力。具体尺寸/哈希与最终目检随发布回执记录。


生产OAuth配置：现有应用1557397878702346321的OAuth2 Redirects新增 `https://discord-holdem.aliceneko.workers.dev/auction/auth/callback`；在Worker `discord-holdem` 添加加密Secret `DISCORD_CLIENT_SECRET`，值为该应用OAuth2 Client Secret（不是Bot Token）。凭据不经聊天或仓库。网站有配置缺失提示；用户现已完成配置并通过真实授权与资产读取验收，见末尾记录。

GitHub Actions仅补一行web/**到PR触发路径，保证今后的纯HTML/CSS/JS美术修改也跑原有完整CI；其余工作流、运行时依赖与配置保持。所有私有变更实时验证成员；只读查询复用服务端60秒成员证明以减少Discord限流，不复用前端传入身份。前端静态资源构建追加内容哈希查询参数，避免部署后旧JS/CSS缓存。


## 本地与视觉验收

- 11项新增测试（OAuth码+S256、state与Cookie绑定/重放/取消/过期/限流/退出、CSRF/同源/超长JSON/伪造身份/未知动作/服务器越权/即时成员检查、读缓存、共享兑换幂等、双向跨端竞拍/冷启/揭晓/陈列/出售），完整Worker104、酒馆333通过。Node检查与esbuild打包通过，仅既有重复z键警告。
- 浏览器实际检查首页、角色配图、图鉴红+大件+旅行箱组合筛选/概率详情、390px iframe布局（内容375px，无横向溢出）。单独内存SQL隔离QA运行兑换100酒馆币、13件大仓五轮、逐件+全开、单仓盈亏、9格冰箱陈列、批卖12件避开陈列，均成功。QA访客明确命名隔离测试，无真实OAuth或真人资金操作；脚本不被Worker导入，Sites发布前移除了其服务器和临时public资产。
- 原创图片warehouse-v1.webp：1536×1024 RGB、290908字节，SHA256 814c0cc78380191d4691e4ab14b082165d39e33ad4387d00e2dc391131715a97；appraisers-v1.webp：1536×1024 RGB、309228字节，SHA256 7338de95eb7fcbf318848d4dee211835d965c4418b7d8d65e4f07747cb5906ca。前者暖铜/深青仓库光影、后者三列人物，imagegen原创，使用WebP资产无图片Base64。
- Sites私人官网镜像已保存并部署成功：appgprj_6ae996f99c208191ae684c2b3aedf3d4，源6aeee45f11be3b3889142c176379533772152ead，部署appgdep_6ae99ea4a6708191afea94b8f189936d，https://tavern-auction.amioalice.chatgpt.site 。此处只保留owner-only预览，不替代正式同源登录入口。


## casino.16 网站发布回执（2026-11-03）

- PR #79特性b9df840b727623e50053ddde930a7d3cb3bf483f，完整PR CI41606023210成功；合并ea2da0fde34d09430dcf26343d6fcbcdb1896b10，main完整CI/部署41606429536成功。功能树70dd529a8eb926a73c6582400824692b13299b0a与本地b64ac44同树；19功能文件5396已知行，2张600136字节WebP单独核验，30文件5500行预算内（回执文档另计少量）。
- CF部署cd2ca2a9-c614-45b4-b73d-83633a3c3923，版本6fadea2e-e67a-4e15-927b-f37363b542dc接收100%。15bindings和settings所有字段与发布前一致。真实HTTP health：casino.16、ok/ready:true、Gateway ready:true、identity1指纹匹配；casino3 registered:true，failures/missing/pending空。
- https://discord-holdem.aliceneko.workers.dev/auction/ 正式HTML200，浏览器实际首页/登录配置提示通过，无本站CSP错误；典藏图鉴204条，两张新配图线上哈希与本地一致；无会话私有API401/no-store，无登录凭据时auth/login明确303回未开放提示，me.user:null、loginConfigured:false。未绕过OAuth、未部署QA访客、未操作真实玩家资产；真实登录与钱包读取须待用户完成回调注册及DISCORD_CLIENT_SECRET后验收，不能标记整体100%。
- Sites本人官网镜像保持owner-only：appgprj_6ae996f99c208191ae684c2b3aedf3d4，源6aeee45f11be3b3889142c176379533772152ead，部署appgdep_6ae99ea4a6708191afea94b8f189936d succeeded，https://tavern-auction.amioalice.chatgpt.site 。其中进入实际游戏跳转正式同源入口。网页前端/后端/发布已完成，不重复发布；下一步仅用户配置与真人OAuth验收。不要回退丢失网页会话/资产识别的旧代码，不更改模型/人设/旧Secrets/绑定/迁移/Cron或其他游戏。


## 真人OAuth与共享资产只读验收（2026-11-03）

- 用户完成现有应用的OAuth回调与加密DISCORD_CLIENT_SECRET配置；公开me.loginConfigured:true，登录跳转使用原应用ID、正确同源回调与S256。health仍为casino.16，ready/Gateway ready:true。未读取、输出或代用户重置密钥。
- 用户在安全登录流程中完成Discord登录、人机验证与授权，实际返回正式/auction/#play。新鲜浏览器页面显示真实已登录身份和共同服务器，并成功读取所选服务器双币钱包、已有中仓12件拍卖及8/12揭晓进度、个人仓库17件/4件待开仓、六格展示柜、钱包双向兑换说明。只记录功能证据，不存用户身份、余额、Cookie、state、授权码或私人截图。
- 真人OAuth码交换、服务端会话及同一小酒馆资产读取通过；本次代理只切换只读页面，没有代用户兑换、出价、揭晓、出售或陈列。生产写入动作仍以既有隔离SQL/浏览器端到端和104/333完整测试为证据，真人游戏手感继续收集反馈。
- 仅补验收文档，不修改功能、不提高版本、不重复部署。此前发布回执中的配置缺失属于初次发布时状态，以本节为准。


## 网页逐件自动揭露（2026-11-03，执行者 DeepSeek）

本轮由 DeepSeek 独立完成，分支 `deepseek/auction-autoreveal`、PR #81；此前官网与拍卖功能（#73–#80）由 Codex 完成，本节不回改其记录。

- 目标：结算后逐件自动揭露，支持暂停／继续／跳过；切页、开详情、标签页后台、网络异常时停止，恢复前先刷新服务端状态，避免重复翻牌。
- 实现：`web/auction/assets/reveal-loop.mjs` 为纯调度器，步进值只取服务端 `reveal.count`；丢失或过期响应只会让循环停下，不会跳件或二次解锁。`app.js` 负责按钮态、进度条与 `just-revealed` 入场动画；离开 `#play`、`view` 改变、`document.hidden`、其它操作进行中即停。服务端动作动词、CSP、汇率、价格、概率、预算、技能、绑定、Secret 均未改动；仅在静态白名单加入 `reveal-loop.mjs`，并在构建脚本中把模块哈希写进 `app.js` 的 import。
- 幂等与兼容：服务端对 `step < opened` 幂等返回、`step > opened` 拒绝、`all` 一次全开；旧局（已开一部分）可从中途续播，因为 step 始终来自服务端。
- 测试：`reveal-loop.test.mjs` 9 项（注入时钟）；`auction-website.test.mjs` 增加白名单与揭露幂等合同。本地 20/20 通过，PR CI 41626423367 通过。
- 发布：起始 main `471fbf59…`，特性 `ebd1d11…`，合并 main `a9be0bed…`；main CI/部署 41627039787 成功；CF 部署 `f1989889-e5f1-4c5e-b6a2-f4b9d5c1c6cd`、版本 `f1602647-4f01-4aec-87d3-43ed39a3b4a4`（#234）100%；16 bindings 未变。
- 未验收：`/health` 因本机 SNI 阻断未直连（Analytics 0 错误替代）；真人逐件揭露手感与窄屏观感待试玩。
- 风险：单次揭露仍是一次 POST，服务端每次做 Discord 成员校验，件数多时需观察 429；若超限再提案批量动词，需同步白名单与权限。
