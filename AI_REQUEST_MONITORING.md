# 每次模型请求监控

从本补丁部署后开始记录；旧失败不能补查。

## 查看完整请求

Cloudflare Dashboard → Workers & Pages → D1 → aliceneko-ai → Console。

先查最近请求：

```sql
SELECT id, generation_id, attempt, context, model, status, duration_ms,
       error, response_model, datetime(created_at / 1000, 'unixepoch') AS time_utc
FROM ai_request_logs
ORDER BY created_at DESC
LIMIT 30;
```

选一个 id 后查看完整内容：

```sql
SELECT request_json FROM ai_request_logs WHERE id = '粘贴请求id';
```

request_json 保存实际发送的完整 JSON：系统提示词、人设、知识、历史消息、本轮消息以及生成参数。API key、Bot token 的原文若意外出现在正文会替换成 [REDACTED]；认证头不会保存。

每次实际调用（包括重试、续写、游戏解说）独立记录，generation_id 可关联同一轮生成。status 为 HTTP 状态；网络错误没有 HTTP 状态，查 error。尚未完成的请求结果列为空。response_model 和 usage_json 只记录服务商实际返回的字段；模型别名或扣费归因仍需中转后台核验。

Workers & Pages → discord-holdem → Observability / Logs 中搜索 ai_request_sent 或 ai_request_result，可以查看索引和结果摘要。完整正文以 D1 为准，避免 Workers 单次日志大小限制；D1 写入失败会输出 ai_request_log_storage_failed 并尝试分块输出 ai_request_body。

## 保留和开关

默认开启，日志清理最长每小时随新请求运行一次，删除超过7天的记录；停止请求期间不会执行清理。监控独立于聊天记忆开关，即使成员关闭对话记忆，请求诊断仍记录实际发送的内容。记录仅供有Cloudflare后台访问权限者查看。

在Worker变量中设置 AI_REQUEST_LOG_ENABLED=false 可关闭新增监控记录，已存记录不会自动即时删除。删除历史记录：

```sql
DELETE FROM ai_request_logs;
```
