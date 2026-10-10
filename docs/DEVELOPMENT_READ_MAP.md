# 开发读取地图

这份地图用于减少重复读取。仓库里的图片、字形和牌面数据是运行时资源，不应全文读入模型上下文。

## 每次接续只做两步

1. 读 `PROJECT_NOW.md` 的短快照。若 `AGENTS.md` 已出现在当前 Codex 上下文中，不要再用命令重读；缺失时才读一次。
2. 运行 `npm run scope -- <chat|lantern|tavern|worker|assets>`，只查看本任务范围。

续接旧事项时，用 `rg -n` 在 `PROJECT_STATE.md` 定位标题或关键词，再读匹配段落；不要默认全文读取或固定读取前80行。scope 只输出路径、文件数量和大小，不输出源码。

## 任务与最小读取范围

| 任务 | 先读 | 通常不需要读 |
|---|---|---|
| 聊天、人设、记忆、图片消息 | `ai-chat.mjs`、`chat-enrichment.mjs`、`discord-chat-context.mjs`、`discord-gateway.mjs`、对应测试 | 牌桌、伙伴、菜单和全部知识文档 |
| 灯下迷城 | 当前版本的 `rogue-*.mjs`、对应 `rogue-*.test.mjs`、`docs/roguelike/CARD_GUIDANCE.md` | 旧版本 `v04/v06/v07` 模块，除非任务明确涉及旧局兼容 |
| 大厅、菜单、装修、地图 | 对应 `tavern-*.mjs`、对应测试、相关 `*_SPEC.md` | 聊天和肉鸽完整实现 |
| 部署、Worker、路由、绑定 | `worker.mjs`、`wrangler.jsonc`、`.github/workflows/deploy-cloudflare.yml`、`lifecycle.mjs` | 生成图片数据和无关游戏模块 |
| 图片或静态资源 | `scripts/build-*.py`、资源 manifest、具体资源测试 | `*-data.mjs`、`*-glyphs.mjs` 的全文 |

## 默认禁止全文读取的生成文件

这些文件由脚本生成，单个文件可达数百 KB 到数 MB。要改内容时改源图片、manifest 或生成脚本；要验证时读哈希、导出名或测试结果。

- `pet-art-data.mjs`
- `pet-art-data-v2.mjs`
- `pet-walk-art-data.mjs`
- `nickname-glyphs.mjs`
- `card-glyphs.mjs`
- `emoji-sprites.mjs`
- `pet-walk-map-data.mjs`
- `tavern-art-data-*.mjs`
- `docs/roguelike/PLAYTHROUGH_*.json`、`FULL_RUN_RESULTS_*.json`

## 读取和验证规则

1. 先用 `rg -n "符号|错误文本|路由"` 定位，再读前后文；不要先 `cat` 大文件。
2. 先看 `git diff --stat` 和目标文件 diff；只有行为不清楚时才读实现全文。
3. 测试按范围运行：`npm run test:chat`、`npm run test:lantern`、`npm run test:tavern`、`npm run test:worker`。
4. 只有跨模块发布或用户明确要求全量回归时，才运行 `npm test`。
5. 生成文件只用路径、字节数、SHA256 和测试结果作为证据，不把 base64、完整日志或完整 JSON 贴进上下文。
6. 已确认且未变的内容只引用上次状态摘要，不重复读取。

文档、测试、开发依赖清单和读取辅助脚本的提交会被部署工作流跳过；只有涉及运行时代码、Worker 配置或资源构建脚本的提交才触发 Worker 部署。手动 `workflow_dispatch` 仍可用于需要时的重新发布。

## 屎山治理顺序

先拆“边界”，再拆内部实现：

1. 入口/路由层：`worker.mjs`、`tavern-ui.mjs`、`rogue-interactions.mjs`。
2. 领域服务层：聊天、酒馆、肉鸽分别保持独立，不跨域复制状态对象。
3. 渲染层：文字 UI、图片渲染和静态资源构建分开。
4. 生成数据：保持构建产物可复现，不手改 `*-data.mjs`。

每次只重构一个边界，并用对应范围测试验证；不要为了“变干净”一次性重写整个 Worker。
