# 项目当前快照

更新时间：2026-10-11（Asia/Shanghai）

- 项目：红豆粉小酒馆 / `AliceNekoqqq/Aliceneko-Discord-Holdem`；主分支 `main`；Worker `discord-holdem`。
- 版本存在未对齐：用户说项目应已到 beta59，但 `main/package.json` 仍为 `1.0.1-beta.57`，默认分支搜索也未找到 beta58/59 标记。Cloudflare 当前部署是 Worker 版本 #102（100%），这是 Cloudflare 序号，不能直接换算为游戏 beta。继续讨论/发布前先确认 beta59 对应代码或健康接口版本。
- 最近用户报告的待查问题：灯下迷城选完遗物后不能进入下一页，重开后无响应；尚无修复记录。若继续处理，从 `npm run scope -- lantern` 和对应状态迁移测试开始。
- 最近状态记录：聊天短回复改动提交 `da9a893` 当时标为本地提交、GitHub 同步未通过；生产记录仍为 beta.57。继续相关工作前先核对 main，勿盲目重做或重推。
- 本轮已将 Codex 入口精简到 `PROJECT_NOW.md` 和按范围读取；纯文档提交已同步 GitHub，不触发 Worker 部署。后续普通逻辑任务不读完整历史或全仓。
- 文件清点：424 个跟踪文件，约 19.84 MB；29 个生成数据/字形/精灵模块约 9.51 MB，`assets/` 约 6.90 MB。体积本身不会自动变成模型上下文，只有读入的内容才会增加上下文。
- 主要源码体积热点：`ai-chat.mjs` 59.7 KB、`rogue-ui.mjs` 58.5 KB、`bot-knowledge.mjs` 43.4 KB、`worker.mjs` 37.6 KB；仅凭文件大小不能判定代码质量或直接重写。
- `PROJECT_STATE.md` 是长历史记录；只用 `rg -n` 搜对应主题，再读命中段落。不要默认全文或固定读取前 80 行。
- 当前本轮只改开发说明和状态入口；不改 Worker 业务行为、不部署。