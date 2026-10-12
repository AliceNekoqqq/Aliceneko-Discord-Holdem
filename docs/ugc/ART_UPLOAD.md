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
- 2026-10-12：源图和发布复制验证完成；生产发布检查38220183471成功；公开JPEG HTTP200、83175字节、SHA256一致；当前配方版本条件绑定ready并回读确认，菜单映射验证通过。

## 2026-10-12 线上核验完成

- 巡检29个PokerTable对象，其中21个有持久数据，2个包含UGC档案；当前在售定稿仅黄金椰椰乌龙1款。
- 复用已有JPEG；生产公开地址返回HTTP 200、image/jpeg、83175字节，SHA256与源图一致。GitHub源图及构建接入已存在，不重复上传或部署。
- 条件绑定匹配guild、dish_id、revision=1及recipe_hash=8a988a6d；SQL实际更新1行，读回status=ready及正确asset_key。配方、价格、用户资料未变。
- 本轮缺图已清零。继续巡检新入库菜品；真人Discord展示尚未实测。

## 2026-10-13 07:32 巡检及复活赛补图完成

- 用户主动询问后实际重新枚举31个PokerTable对象，有UGC档案的对象2个；在售菜品2款，缺图1款“复活赛”。其入库北京时间01:04:07，早于任务04:13运行记录；当前可见上下文未提供该次执行详情，不能断言漏扫或失败的具体原因。任务触发记录不能替代扫描回执。
- dish_id：ugc_25451bb14a77495f96e7；guild：1554411807978819615；revision：1；recipe_hash：b5dfad58。
- 按完整recipe_json使用内置图片生成：暖色酒馆木桌背景，600ml透明高球杯，冷雪碧与冰红茶浑浊琥珀茶汽液、冰块和沉底熟汉堡肉饼碎、杯心斜插巧乐兹巧克力冰棒、杯沿三颗半切草莓；无文字。食材冷热和装饰检查通过。
- 源图：assets/ugc-art/ugc_25451bb14a77495f96e7-r1-b5dfad58.jpg；512×512 JPEG、98862字节；SHA256 b48ff9d41944cec4d9984c0c7d3a3b58f651171d010de4c7b1a47d919cb7d53d。ASSETS键：art/ugc/ugc_25451bb14a77495f96e7-r1-b5dfad58.jpg。
- GitHub提交fcdda2c873bca64afe2c49ef00629aa23157f668；发布检查38322533335成功。Cloudflare部署efa7d132-f739-490a-a939-959f9b9b48dd、版本be62d8c4-2980-4789-9d39-8d35b9494d02接收100%；bindings及runtime配置与beta.88生产版本一致。
- 公开JPEG HTTP200、image/jpeg、长度及SHA256与源图一致后，以guild/dish/revision/hash/active条件更新1行；回读ready与正确asset_key，缺图数0。配方价格和用户资料未改；真人Discord展示未实测。
- 最后成功：生产资源核验与当前配方菜单绑定；下一步继续扫描新入库菜品并保留扫描及失败阶段的具体回执，不能用任务last_run_time冒充扫描完成。
