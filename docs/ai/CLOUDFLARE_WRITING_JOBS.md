# 跨会话 Gemini 写作任务

用户已明确授权使用 https://gcli.ggchan.dev 生成项目文案，并允许发送本项目资料。生产Worker的GEMINI_WRITER_API_KEY及GEMINI_WRITER_BASE_URL已作为受保护Secret保存。后续已连接本仓库、Cloudflare的会话使用服务器任务队列，无需再次要求用户贴密钥；不读取、导出或打印Secret。

通过已认证Cloudflare D1 API操作CHAT_DB（数据库b9327b3d-b549-4c48-b221-689c5f4aa3a9）的ai_writing_jobs表。新任务使用唯一id，brief是JSON，包含purpose、requirements、locked_facts，可选max_tokens（512至4096，默认3000）；brief不超过16000字符。只发送当前写作必要资料，不发Discord私人聊天和凭据。

```sql
INSERT INTO ai_writing_jobs (id,brief,status,created_at,updated_at)
VALUES (?,?,'queued',?,?);
SELECT status,draft,error FROM ai_writing_jobs WHERE id=?;
```

时间字段为毫秒Unix时间。每分钟Cron最多处理一个queued任务，服务器使用Secret调用/v1/chat/completions。状态queued→requesting→draft；截断为needs_revision，HTTP拒绝为blocked，网络结果不明或超时遗留为unknown，不自动重试。读取具体任务，未知结果先核验，不能盲目重新提交收费请求。

主agent审查事实、锁定设定和质量后才将通过稿导出到产品/仓库，并标记approved。返修用新任务id，带必要的原稿和具体反馈；保留已通过内容。队列不会自动发布文案、修改NPC或向Discord发送消息。没有公开HTTP任务接口。

跨对话复用依赖后续会话能访问本仓库和已连接Cloudflare；Secret持久保存不代表任意聊天都能直接读取凭据。

2026-10-13实际验收：city2-writing-secret-probe-20261013由Cron领取，但状态unknown/error network_result_unknown_may_be_billed，正文为空。Secret已保存及任务处理已验证；服务生成成功尚未验证。不得将此任务盲目重发；下一次先补充安全的错误类别/阶段诊断，避免记录凭据或原始响应。
