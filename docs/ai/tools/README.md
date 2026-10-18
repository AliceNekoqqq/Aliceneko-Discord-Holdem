# Gemini 文案工具

Node.js 24，无额外依赖。此目录在部署工作流的 docs 忽略范围内，不触发游戏部署。

凭据通过受保护环境注入 `GEMINI_WRITER_API_KEY`，不得提交真实密钥。
可选配置：`GEMINI_WRITER_BASE_URL`（默认 https://gcli.ggchan.dev/v1）、`GEMINI_WRITER_MODEL`（默认 pggo-gemini-3.8-flash）。
新工作环境必须重新注入凭据；工具不会从 GitHub、文档或历史对话里抓取密钥。当前会话的受保护本地凭据不是跨环境 secret 服务。

创建 brief.json，包含 purpose、requirements、locked_facts，按需添加 min_chars、max_chars、required_literals、forbidden_literals、max_tokens（默认4096）、max_calls（默认9）。事实、人名、性别、实际功能必须明确写进 locked_facts。

```sh
node docs/ai/tools/gemini-writer.mjs init writer-tasks/task.json brief.json
node docs/ai/tools/gemini-writer.mjs generate writer-tasks/task.json
node docs/ai/tools/gemini-writer.mjs review writer-tasks/task.json review.json
# revise 后再次 generate，pass 后才允许 export
node docs/ai/tools/gemini-writer.mjs export writer-tasks/task.json final.md
node --test docs/ai/tools/gemini-writer.test.mjs
```

review.json 由主 agent 阅读正文后填写，例如：

```json
{"verdict":"revise","rationale":"角色动机与锁定设定冲突","issues":["第三段保留已通过的对话，修改冲突的角色动机"]}
```

通过使用 verdict=pass，仍需 rationale；不能批准违反字数/必需用词/截断检查的稿。verdict=blocked 用于无法继续的任务。
工具不是自动评审模型：活动会话中的主 agent 负责语义审查和反馈，工具负责 API 请求、硬检查与任务状态。
状态和每轮草稿保存到任务 JSON，generate 不覆盖历史；终止后继续同一个任务，不重新 init。旧任务不会自动应用新的 brief 文件；设定需要更正时先在任务 brief 中更新并记录原因。

安全与恢复：

- 任务路径目录应保持私密，任务与凭据不提交 Git。只有通过稿可导出，export 默认拒绝覆盖已有文件。
- 请求前保存 requesting 并获取任务锁，防止同时重复发起。正常结束自动释放锁。
- 超时/连接中断进入 blocked，标记“结果未知，可能已计费”；不自动重试。HTTP 错误不保存服务端响应正文，避免泄漏或日志膨胀。
- 意外终止留下 requesting 或 .lock 时，先确认无活动进程，再移除旧锁。不要直接再发；核对服务端结果/费用后，人工记录恢复理由并明确决定是否重新生成。
- 达到9次默认调用预算时停止付费调用；改预算必须有明确任务依据，不自动绕过。
- 不跨重定向传递凭据；不得把密钥放到 URL、brief 或正文。若服务端意外回显本次密钥，拒绝保存正文。
- 如 Node 的环境需使用已配置代理，可设置 NODE_USE_ENV_PROXY=1；不修改系统网络设置。

当前实现：生成、定点返修、主 agent 审核、批准导出、状态保存与费用熔断。批量条目冻结、无人值守评审 API、自动调度和跨环境 secret 注入尚未实现。
