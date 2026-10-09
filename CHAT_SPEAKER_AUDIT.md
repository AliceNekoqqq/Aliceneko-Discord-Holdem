# 多人连续回复时的发言归属排查

## 结论

能证实的主要风险有两类：频道记录的内部参与者代号没有与 Discord 用户 ID 在模型输入中建立明确映射；以及当前发言者自己的频道记录会从 `channelConversation` 去重掉，造成共享时间轴缺行。前者会让模型在同名成员/引用者与 `member_N` 之间只能靠昵称对应，后者让频道记录与个人历史分开呈现、失去交织顺序。二者都可能导致短指代错认，但源码本身不能证明实际线上回答已因此出错。

此前提到的“不同成员并发”仍是候选风险：队列键确实含作者 ID，但当前 `gateway-concurrency.test.mjs` 的同频道排序用例固定使用同一个作者，并未验证 A/B 两个作者。该测试因此不能排除跨成员并发。实际请求是否重叠，仍要通过 A/B 不同 ID 的延迟测试验证。

## 已证实与推测

| 项目 | 证据与判断 |
|---|---|
| 内部 key 与 Discord ID 的映射 | `ai-chat.mjs:589-614` 以 `row.user_id` 生成 `current_user` / `member_N`，因此程序内部知道其 Discord ID；但序列化的 `currentSpeaker` 和 `channelConversation.participants` 只含 `key/name`，不含原 ID。`discord-chat-context.mjs:96-100` 另提供当前用户及成员名单（含 Discord ID/name），却没有将这些 ID 显式映射到 `current_user/member_N`。模型需要按名称自行关联；同名时关系不确定。这是数据结构里可证实的关联缺口，不等于每次都会错认。 |
| 引用 ID 与参与者 key | `discord-chat-context.mjs:78-84,102-108` 能核验引用本 bot 回复指向的原消息，并将引用作者/回复对象的 Discord 身份 ID 放进 `replyReference`；本 bot 引用还给 `replyToCurrentUser` 布尔值。但 `replyReference.author.id/replyTo.id` 没有转成频道记录使用的 `member_N` key；对被引用的普通成员消息，关联仍靠名单昵称或原始 ID 的语义匹配。引用关系的原始事实已保留，跨表示的显式连接没有保留。 |
| current speaker 对应 | `currentSpeaker` 被设为 `{key:"current_user",name:...}`；Discord 背景单独包含本轮作者 ID。程序没有输出共同的 opaque ID/key 引用，当前发言者与 Discord 作者 ID 的链接也未以一个结构字段表达。同名或昵称改动时模型不能只靠 `name` 安全连接。 |
| 去重与时间轴 | `ai-chat.mjs:595-601` 用 `(user_id, role, content, created_at)` 去重；`personalRows` 来自该账号跨频道的个人历史，匹配到的当前频道行从 `channelConversation` 删除。其事实通常仍在 `history` 的 user/model 序列里，但该序列不带频道时间戳，且个人历史可跨频道；因此无法保证与其他成员的频道记录按原时间交织。`channelHistory` 先取最近 30 行再去重（`:583-586,598-601`），当前用户自己的重复行可能使其共享视图明显变短甚至为空。纯函数断言已复现：A 的两条行在个人 history 保留，在 channelConversation 被移除；participant 对象也没有 `id`。这是结构/时间轴缺失已证实，是否造成某次错误指代属于推测。 |
| 去重键边界 | 上述 key 不含 channel ID 或 row ID；个人记录是跨频道查询。因此极端情况下，同一用户、角色、文字且毫秒时间戳相同的另一个频道记录也会撞 key 并被去重。这是低概率但可由键定义推导出的潜在误删，尚无线上样本。 |
| 共享频道记忆开关 | `channelMemoryOn` 初始为 false，只有数据库频道配置 `enabled===1` 才读取（`ai-chat.mjs:657,678-682`）；`/ai 频道记忆 查看` 明确默认关闭（`:485-501`）。默认状态下不会把频道历史作为共享上下文。 |
| 共享记录范围 | 只有 Gateway 识别到直接 @bot 才调用 `replyToMention`（`discord-gateway.mjs:132-144`）；普通非 @ 消息不会进入模型或 AI 聊天记忆。频道设置文字也确认只保存成功的 @ 问答（`ai-chat.mjs:492-501`）。且写入频道表位于 `db && memoryOn && generated` 内（`:736-758`），因此个人记忆关闭时即使频道记忆开启，该成员本轮也不写入共享记录。这是明文隐私策略；若用户的短指代依赖最近普通群聊，bot 看不到它是确定的能力边界，是否导致具体误认仍属推测。 |
| 队列及测试范围 | `discord-gateway.mjs:136-149` 队列键为 `[guild_id, channel_id, author.id]`，同频道不同作者有独立链，代码本身允许并发。`gateway-concurrency.test.mjs:34-48` 的 fixture 在 `:11` 将作者固定为 `'user'`，故“same channel preserves ordering”只证同一用户；`:15-32` 则证明同一用户跨频道可并发。针对 A/B 跨用户并发和第二轮上下文快照的测试仍缺。 |
| 回复发送和写入顺序 | `ai-chat.mjs:728-758` 先发送 Discord 回复，再在个人记忆开启时批量写个人及（若开启）频道历史。失败发送不会保存；保存错误由空 `catch` 吞掉。并发请求因此可能在前一轮落库前读取快照；该时序是代码可达风险，不是生产已观察事件。 |
| 默认行为与实际复现 | `PROJECT_STATE.md:694-700` 记录过账号隔离和引用对象改造及固定场景模型验证，但真人新消息的归属仍需线上请求/回发核验。本次未读生产日志/私聊，也未向 Discord 发测试消息，不能判定模型输出错误、记忆配置、未见非 @ 内容或并发哪一项对应用户体验。 |

## 方案优先级

1. **让身份关联显式而不依赖名字。** 在组装模型背景时，为内部 `current_user/member_N` 提供同一套 prompt-local key 映射；把本轮 current Discord ID、引用作者 ID、引用回复对象 ID 映射成这些 key。优先传 opaque key，不必把原始 Discord ID继续暴露给模型。找不到历史参与者时标成 unknown，不能猜。测试同名账号、改名、引用 B、bot 回复引用目标为 A/B 的双人序列，断言 key 关系一致。
2. **保留共享频道的完整时间轴。** 不要因同一数据也出现在个人历史而静默删除其频道记录。可以保留频道行并标注它与个人 history 重复，或构造一条有时间戳、带 speaker 的统一频道序列；如仍去重，须用确切共享记录 ID，而不是跨表的内容/时间组合。验证当前 A 与旁观者 B 得到的频道时间轴对同一事件一致。
3. **补跨用户队列回归，评估串行策略。** 先写 A/B 同频道、A 首轮延迟的测试，观察 B 的数据库读取/模型请求是否发生在 A 保存之前。若成立，频道级 FIFO 能保证上下文顺序，但会让该频道后续请求等待。现有“同频道顺序”测试需要把第二条消息作者改为另一 ID，才覆盖多人场景；另保留不同频道并发断言。
4. **明确普通聊天的上下文边界。** 目前默认频道共享记忆关闭，且仅保留成功 @ 对话、个人记忆开启者的内容。若用户希望 bot 理解“那个人呢”这类建立在普通聊天上的短指代，应另行明确授权与保留策略，再考虑仅读取很短的频道近况或按需引用；不应在本次原因排查中擅自扩大采集。
5. **补写入失败可观测性。** 不记录正文的前提下，记录 message ID、频道及安全错误类别，区分发送失败与历史落库失败；长期可靠性再评估 outbox。

## 验证与限制

本地只读核对 `ai-chat.mjs`、`discord-chat-context.mjs`、`discord-gateway.mjs`、`gateway-concurrency.test.mjs`、`ai-chat.test.mjs`、`CHAT_MESSAGE_PROTOCOL.md` 和 `PROJECT_STATE.md`。针对纯数据转换运行 `node --test gateway-concurrency.test.mjs`（3/3 通过）和 `prepareChatContext` 的内存断言（通过，确认去重移除及 key 对象不含原 ID）；没有调用模型、读生产数据或发 Discord 消息。并发测试通过不代表覆盖跨作者竞争；没有真人复现证据。报告未改共享记忆实现文件。
