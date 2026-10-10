# 项目当前快照

更新时间：2026-10-11（Asia/Shanghai）

- 项目：红豆粉小酒馆 / `AliceNekoqqq/Aliceneko-Discord-Holdem`；主分支 `main`；Worker `discord-holdem`。
- 当前版本：GitHub main 与生产 /health 均为 `1.0.1-beta.59`；灯下迷城规则仍 v0.8，保留已有存档。
- 灯下迷城卡加载已修复并上线：路线页重复地图 custom_id 导致 Discord HTTP 400 / COMPONENT_CUSTOM_ID_DUPLICATED。beta.58 删除重复按钮，修复详情/实体牌分页编号碰撞，增加唯一性校验。四规则版本存档通过命令/主页/过期刷新重进测试；无需重置存档，真人 Discord 重进尚待确认。
- 最近状态记录：聊天短回复改动提交 `da9a893` 当时标为本地提交、GitHub 同步未通过；继续相关工作前先核对 main，勿盲目重做或重推。
- 本轮已将 Codex 入口精简到 `PROJECT_NOW.md` 和按范围读取；纯文档提交只同步 GitHub，不触发 Worker 部署。后续普通逻辑任务不读完整历史或全仓。
- 静态资源迁移删除了 29 个生成图像/字形/精灵模块，约 9.51 MB；这些静态载荷不再作为 Base64 JavaScript 模块读取。仓库体积不会自动进入模型上下文，只有读入的内容才会增加上下文。
- 主要源码体积热点（此前测量）：`ai-chat.mjs` 59.7 KB、`rogue-ui.mjs` 58.5 KB、`bot-knowledge.mjs` 43.4 KB、`worker.mjs` 37.6 KB；仅凭文件大小不能判定代码质量或直接重写。
- `PROJECT_STATE.md` 是长历史记录；只用 `rg -n` 搜对应主题，再读命中段落。不要默认全文或固定读取前 80 行。
- 图片迁移 PR #2 已 squash 合并到 main，合并提交 `78cb8258f70d47e615fcf6d354cbf97d696fdad8`。PR 验证 run 38089950780 通过；生产部署 run 38090063427 通过。
- beta.59 生产部署 ID `198b3621-aedd-4c60-8a28-c1c71ce33f82`，版本 `395b054b-5db1-4a16-b28f-8c8c15f41942` 接收 100% 流量；实际 HTTPS /health 返回 ok:true、beta.59。静态资源迁移成果保留。
- 迁移后仍保留运行时生成图片及外部 API 所需的二进制/Base64 传输；它们不是静态资源打包路径。

- beta.58 修复 PR #3 已 squash 合并，提交 `de5d1f356b2f7aae58f883d52caefe317ea9c7de`；PR 检查 run 38090935190、生产发布 run 38091026940 均成功。局部测试 lantern 140/140、worker 25/25；发布工作流所有检查通过。用户在本对话明确授权合并 PR #3 和发布 beta.58，先前审批拦截已解决。

- beta.59 路线页界面改版已上线：每个地点使用独立 Discord embed field，隐藏内部节点编号，展示对应序号、基础属性、风险/收益、禁用原因；编号按钮与存档 nodeId 保持一致，危险路线红色提示；首领信息单列，Boss交易显示为削弱首领。用户明确要求表述包含界面表现；文案建议由 Luna 子 agent 提供。lantern 141/141、worker 25/25 通过。

- beta.59 PR #4 已合并，提交 `b29d1eddee92a81d087840394175c0e416e37fc8`；生产发布 run 38091503414 成功。界面改为分条字段、编号按钮、首领信息独立显示；实际 Discord 手机上视觉效果待用户确认。

- beta.60 整体体验改进待发布：奖励页显示当前选择及效果、下拉默认选项保留选择，确认按钮明确所选奖励，满道具栏说明替换；战斗显示玩家灼烧、当前生命上限及剩余出牌次数；首页/设置区分正式和练习局奖励；结算显示金币单位/上限/失败原因，再来一局保留原职业。lantern 143/143、worker 25/25 通过。Luna 只读审查完成，主 agent 接入验证；玩法与经济数值未改。
