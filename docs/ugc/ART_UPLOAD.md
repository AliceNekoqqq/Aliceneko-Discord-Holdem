# UGC 菜图补充

定时任务已获授权执行扫描、生成或复用图片、GitHub上传、Cloudflare发布、菜单绑定和线上核验。只处理已定稿且在售的当前版本，不改配方、价格或作者。

- 存储：`PokerTable` Durable Objects SQLite，读取 `tavern_ugc_dishes`、`tavern_ugc_revisions`、`tavern_ugc_art`。不是 D1。
- 源图：`assets/ugc-art/ugc_<id>-r<revision>-<recipe_hash>.jpg`，512×512 JPEG。`scripts/build-static-art.py` 发布至同名 `art/ugc/`。不嵌入 Base64。
- 发布后先核验公开图片 HTTP 200、JPEG 格式和 SHA256，再核对菜品仍 active、当前 revision 及 recipe_hash，条件更新 art.asset_key/status。未验证前保留 pending。
- 菜单现有 `ugcMenuItem` 和 `artEmbed` 从数据库 asset_key 自动展示；用户重新打开菜单即可读取，不需要改配方或菜单缓存。
- 如果步骤失败，记录实际阶段和可恢复文件；不得把生成、GitHub上传或构建成功当成菜单已上线。

## 黄金椰椰乌龙

- dish_id：`ugc_edf5fe7e7ef740f7ba85`，revision：1，recipe_hash：`8a988a6d`。
- asset_key：`art/ugc/ugc_edf5fe7e7ef740f7ba85-r1-8a988a6d.jpg`。
- JPEG：83,175 字节，SHA256：`e0169775f1308370cb98c62dfeb54c87e7638bd95575c8d678011dc4c95572b2`。
- 配方：冷乌龙茶与椰乳摇匀呈浅奶茶色，杯底椰果，顶部椰肉碎。按线上定稿绘制。
- 2026-10-12：源图和发布复制验证完成；此记录提交时生产发布及数据库绑定尚待核验。
