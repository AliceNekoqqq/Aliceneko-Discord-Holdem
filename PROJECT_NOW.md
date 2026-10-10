# 项目当前快照

更新时间：2026-10-11（Asia/Shanghai）

- 项目：红豆粉小酒馆 / `AliceNekoqqq/Aliceneko-Discord-Holdem`；主分支 `main`；Worker `discord-holdem`。
- `main/package.json` 当前版本：`1.0.1-beta.57`。项目记录中 beta.57 已发布；真正发布前仍核对 Cloudflare 当前版本。
- 最近用户报告的待查问题：灯下迷城选完遗物后不能进入下一页，重开后无响应；尚无修复记录。若继续处理，从 `npm run scope -- lantern` 和对应状态迁移测试开始。
- 最近状态记录：聊天短回复改动提交 `da9a893` 当时标为本地提交、GitHub 同步未通过；生产记录仍为 beta.57。继续相关工作前先核对 main，勿盲目重做或重推。
- 本轮主题：减少 Codex 重复读取与额度消耗。已确认有 `npm run scope` 和 `docs/DEVELOPMENT_READ_MAP.md`，接下来只需维护精简入口；普通逻辑任务不读完整历史或全仓。
- 文件清点：424 个跟踪文件，约 19.84 MB；29 个生成数据/字形/精灵模块约 9.51 MB，`assets/` 约 6.90 MB。体积本身不会自动变成模型上下文，只有读入的内容才会增加上下文。
- 主要源码体积热点：`ai-chat.mjs` 59.7 KB、`rogue-ui.mjs` 58.5 KB、`bot-knowledge.mjs` 43.4 KB、`worker.mjs` 37.6 KB；仅凭文件大小不能判定代码质量或直接重写。
- `PROJECT_STATE.md` 是长历史记录；只用 `rg -n` 搜对应主题，再读命中段落。不要默认全文或固定读取前 80 行。
- 当前本轮只改开发说明和状态入口；不改 Worker 业务行为、不部署。