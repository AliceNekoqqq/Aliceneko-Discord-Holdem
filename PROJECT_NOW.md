# 项目当前快照

更新时间：2026-10-11（Asia/Shanghai）

- 项目：红豆粉小酒馆 / `AliceNekoqqq/Aliceneko-Discord-Holdem`；主分支 `main`；Worker `discord-holdem`。
- 版本核实：GitHub `main/package.json` 与当前生产 Worker 脚本的 `/health` 处理器都标记为 `1.0.1-beta.57`。静态资源迁移不改游戏版本号；当前 main 与线上没有 beta59 代码证据。
- 最近用户报告的待查问题：灯下迷城选完遗物后不能进入下一页，重开后无响应；尚无修复记录。若继续处理，从 `npm run scope -- lantern` 和对应状态迁移测试开始。
- 最近状态记录：聊天短回复改动提交 `da9a893` 当时标为本地提交、GitHub 同步未通过；继续相关工作前先核对 main，勿盲目重做或重推。
- 本轮已将 Codex 入口精简到 `PROJECT_NOW.md` 和按范围读取；纯文档提交只同步 GitHub，不触发 Worker 部署。后续普通逻辑任务不读完整历史或全仓。
- 静态资源迁移删除了 29 个生成图像/字形/精灵模块，约 9.51 MB；这些静态载荷不再作为 Base64 JavaScript 模块读取。仓库体积不会自动进入模型上下文，只有读入的内容才会增加上下文。
- 主要源码体积热点（此前测量）：`ai-chat.mjs` 59.7 KB、`rogue-ui.mjs` 58.5 KB、`bot-knowledge.mjs` 43.4 KB、`worker.mjs` 37.6 KB；仅凭文件大小不能判定代码质量或直接重写。
- `PROJECT_STATE.md` 是长历史记录；只用 `rg -n` 搜对应主题，再读命中段落。不要默认全文或固定读取前 80 行。
- 图片迁移 PR #2 已 squash 合并到 main，合并提交 `78cb8258f70d47e615fcf6d354cbf97d696fdad8`。PR 验证 run 38089950780 通过；生产部署 run 38090063427 通过。
- 生产 Worker 当前 Cloudflare deployment ID 为 `4749c273-d887-46fc-83c6-3f172b213c45`，版本 `f1e4cb91-e9d8-4057-b66a-ac8dfe3cc8e2` 接收 100% 流量。线上脚本保留 `ASSETS` binding，健康处理器版本为 beta57；脚本文本长度从迁移前约 10.82M 字符降至约 1.34M，约减少 87.6%。脚本扫描未发现 PNG/JPEG/WebP 静态图片 data URI。当前连接无法直接完成 `workers.dev` HTTP smoke request，因此健康处理器和静态资源 URL 的实际 HTTP 响应仍未独立验证。
- 迁移后仍保留运行时生成图片及外部 API 所需的二进制/Base64 传输；它们不是静态资源打包路径。
