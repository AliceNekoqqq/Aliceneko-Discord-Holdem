# 项目当前快照

更新时间：2026-10-11（Asia/Shanghai）

- 项目：红豆粉小酒馆 / `AliceNekoqqq/Aliceneko-Discord-Holdem`；主分支 `main`；Worker `discord-holdem`。
- 版本核实：GitHub `main/package.json` 与 Cloudflare 当前脚本的 `/health` 响应代码都标记为 `1.0.1-beta.57`。Cloudflare 部署记录显示版本 #102（100% 流量）。因此当前可验证的仓库和线上版本都是 beta57；尚无证据表明 beta59 已进入 main 或生产。本次静态资源迁移不改游戏版本号。
- 最近用户报告的待查问题：灯下迷城选完遗物后不能进入下一页，重开后无响应；尚无修复记录。若继续处理，从 `npm run scope -- lantern` 和对应状态迁移测试开始。
- 最近状态记录：聊天短回复改动提交 `da9a893` 当时标为本地提交、GitHub 同步未通过；生产记录仍为 beta.57。继续相关工作前先核对 main，勿盲目重做或重推。
- 本轮已将 Codex 入口精简到 `PROJECT_NOW.md` 和按范围读取；纯文档提交已同步 GitHub，不触发 Worker 部署。后续普通逻辑任务不读完整历史或全仓。
- 文件清点：424 个跟踪文件，约 19.84 MB；29 个生成数据/字形/精灵模块约 9.51 MB，`assets/` 约 6.90 MB。体积本身不会自动变成模型上下文，只有读入的内容才会增加上下文。
- 主要源码体积热点：`ai-chat.mjs` 59.7 KB、`rogue-ui.mjs` 58.5 KB、`bot-knowledge.mjs` 43.4 KB、`worker.mjs` 37.6 KB；仅凭文件大小不能判定代码质量或直接重写。
- `PROJECT_STATE.md` 是长历史记录；只用 `rg -n` 搜对应主题，再读命中段落。不要默认全文或固定读取前 80 行。
- 图片静态资源迁移在分支 `codex/static-assets-no-base64-20261011`，PR #2：把嵌入 JavaScript 的静态图/字形载荷改为构建期生成 `public/art/` 与二进制图集，由 Worker 的 `ASSETS` 读取；删除 29 个生成模块（约 9.51 MB）。实现提交 `8b4757d` 的 CI run 38088754741 已通过；其后的本快照更新仅修改文档，等待当前 PR head 的 CI 完成。
- 迁移后仍保留运行时生成图片及外部 API 所需的二进制/Base64 传输；它们不是静态资源打包路径。PR 合并后由 main 工作流部署；发布后核验线上健康版本与静态资源响应。
