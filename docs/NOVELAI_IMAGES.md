# 红小豆 NovelAI 生图

## 当前开放状态

首次接入默认 `enabled:false`。先由开发者调整默认参数、试画，再开放。密钥仅在 Cloudflare 的 `NOVELAI_API_KEY` Secret 中；不进入模型提示词、队列或仓库。

## 使用

- 开放后可直接 @红小豆说“帮我画只猫”“想看看你今天的穿搭”。本轮聊天模型同时整理英文提示词与隐藏调用；后台只接受当前用户消息的意图证据。引用、假设、否定与旧记录不应触发。
- `/ai 生图 查看` 私密显示默认值、本人偏好和排队状态。
- 可直接选择尺寸、步数、引导强度、采样器、数量、种子、质量词、英文风格前缀和反向词；高级参数仍可用JSON。
- `/ai 生图 偏好 参数:{"scale":6,"prompt_prefix":"watercolor"}` 保存个人偏好，按 Discord 用户账号跨服务器共用；修改为逐项合并。
- `/ai 生图 重置` 清除本人全部偏好，恢复跟随默认值。提示词前后缀可设空字符串来覆盖默认值。
- `/ai 生图 绘制 描述:... 参数:{...}` 直接提交；描述建议用英文，聊天入口会由模型整理英文。
- `/ai 生图 默认 参数:{"steps":28,"scale":5}` 仅开发者可调，逐项合并。
- `/ai 生图 试画 描述:...` 仅开发者可用，允许在关闭期间试画，忽略开发者的个人偏好以核验全局默认值；本次参数仍可覆盖。
- `/ai 生图 默认 参数:{"enabled":true}` 开放；`false` 停止接受新请求，已受理批次仍按冻结参数完成。

优先级：本次明确指定 > 个人偏好 > 全局默认。自然语言的一次参数需附本轮逐字证据，不会修改持久偏好或默认配置。红包/点单与花店独立 NPC 的轮次保持原处理路径，不触发生图。

## 候选默认值

| 参数 | 默认 |
| --- | --- |
| model | nai-diffusion-4-5-full |
| width / height | 832 / 1216 |
| steps / scale | 28 / 5 |
| sampler / noise_schedule | k_euler_ancestral / karras |
| cfg_rescale | 0 |
| seed | -1（随机） |
| n_samples | 1 |
| quality | true |
| prompt_prefix / prompt_suffix | 空 |
| negative_prompt | lowres, bad anatomy, bad hands, text, error, worst quality, low quality, jpeg artifacts, watermark |

`quality:true` 在最终提示词后追加 `best quality, amazing quality, very aesthetic, absurdres`，关闭则不追加。反向词由最终解析的 `negative_prompt` 原样传递。模型支持 V4.5 Full/Curated、V4 Full、V3；当前没有接 V5 流式协议、图生图、参考图或角色分区。

宽高为64的倍数、各64–1536且单张不超过1048576像素；步数1–50，CFG 0–10，CFG rescale 0–1，seed为-1或0–4294967295整数，张数1–4。采样器支持 Euler、Euler a、DPM++ 2M/2S a/SDE；调度支持 karras/exponential/polyexponential/native。非法参数整次拒绝，不静默改值。

## 队列与失败

所有服务器共用专用 Durable Object `system-novelai-images-v1`，继续使用既有 PokerTable 类和 TABLES 绑定，无新增迁移。每批结束后至少等待35000ms才开始下一批；无并行生成。最多20批待处理，每人最多一批等待/生成。本次参数入队时冻结。

队列、冷却、处理租约及最近500个请求ID持久保存。生成前记录处理中，150秒恢复租约；恢复后只标为结果未知，不重发 NovelAI 请求。超过30分钟的待处理请求过期。401/402/429/500、超时、图片格式或 Discord 发送异常均不自动重新生图，避免重复消耗。Discord 使用来源ID nonce 去重。图片在内存中转成PNG附件上传Discord，不把编码图片写入配置或聊天正文。

`/health?commands=1&images=1` 仅返回配置存在状态、开放开关、模型、队列数量与35秒间隔，以及指令 schema 是否一致；不公开个人偏好、描述、图片或凭据。

## 验证边界

本地定向测试覆盖参数、个人隔离、默认试画、意图证据、隐藏字段、并发、35秒间隔、对象重建、处理租约、拒绝自动重试、附件投递及Worker路由。首次发布保留关闭状态，不在真人频道发测试图；真实 NovelAI 生成及 Discord 手机端效果待开发者调参后试画验收。
