# 静态设备图片上传

13 张设备图已在 GitHub 仓库中。它们作为 Worker 静态 ASSETS 提供；不要把图片或 Base64 内容灌进模型上下文。

Cloudflare 上传 connector 使用普通 API token，不能代替 assets-upload-session 返回的短期 JWT。先按 Worker 整包发布流程取得 session JSON，再在本地运行：

```sh
python scripts/upload-equipment-assets.py \
  --session-file /path/to/assets-session.json \
  --account-id ACCOUNT_ID \
  --completion-file /path/to/equipment-completion.json
```

session 文件需包含 `result.jwt` 和 `result.buckets`。脚本从 `assets/equipment-art/manifest.json` 读取 13 个设备 ID，并核对 `public/art/equipment/{id}/v1.jpg`；为 Cloudflare 按文件路径生成前 32 位 SHA-256 和字节数。每个待传 bucket 作为 multipart 请求，字段名是 hash、字段值是 Base64 ASCII、类型为 `image/jpeg`，使用 session JWT 上传。若 buckets 为空，则直接把 session JWT 写作 completion JWT。completion 文件只含该 JWT，权限设为 `600`。脚本只报告图片数和状态；失败会返回非零状态并报告 API 的 status、code、message，不会报告成功。

也可离线检查 Cloudflare manifest，不读取 session 文件或联网：

```sh
python scripts/upload-equipment-assets.py --manifest-only
```

这一步只上传静态图片，不部署 Worker。之后仍须按完整 Worker 整包合并与发布，保留生产聊天 50、伙伴 51、人设、Secrets 配置和 Cron。发布后核验 13 张图的 hash、健康状态、活跃版本与代码读回；已通过的测试不要重跑。
