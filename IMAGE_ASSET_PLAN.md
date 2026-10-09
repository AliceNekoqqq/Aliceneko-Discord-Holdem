# 酒馆与菜品图片计划

beta.37已补齐并接入全部20款常驻菜品图，连同酒馆氛围图共21项ready。用户确认上一段对话原本已生成20张，但其余17个文件未找回；随后明确授权Luna补缺，本批重新补齐缺失文件，不宣称恢复了旧17张。原room、milk、cake、mushroom-noodles四项JPEG和v1地址保持不变。

## 当前交付与风格

暖色故事插画：临河旧街、棕木桌、奶油色器皿与克制莓粉点缀。各菜按实际配方、数量、温度与器皿绘制，无人物、可读字和水印。酒馆图是氛围插画，真实客流及装修以程序店内地图为准。

| 稳定ID | 主题 | 尺寸 | JPEG字节 |
|---|---|---|---|
| room | Riverside old-street tavern atmosphere | 960×640 | 165608 |
| water | 白水 | 512×512 | 59305 |
| tea | 热茶 | 512×512 | 62622 |
| milk | Red bean milk | 512×512 | 60418 |
| soda | 蝶影苏打 | 512×512 | 72928 |
| special | 今日心情特调 | 512×512 | 57810 |
| cake | Red bean pastry | 512×512 | 63275 |
| snack | 深夜小食拼盘 | 512×512 | 67472 |
| plum-tea | 梅子乌龙 | 512×512 | 68164 |
| pear-soup | 暖梨饮 | 512×512 | 62803 |
| lemon-honey | 柠蜜水 | 512×512 | 69445 |
| redbean-soy | 红豆豆乳 | 512×512 | 64402 |
| postcard-pudding | 明信片布丁 | 512×512 | 59950 |
| river-mochi | 临河糯米团 | 512×512 | 72243 |
| oldstreet-cookie | 旧街黄油饼 | 512×512 | 63497 |
| postcard-jelly | 邮差果冻 | 512×512 | 62443 |
| mushroom-noodles | Clear mushroom soup noodles | 512×512 | 73406 |
| scallion-pancake | 葱香小煎饼 | 512×512 | 60434 |
| tomato-rice | 番茄蛋饭 | 512×512 | 67056 |
| sweet-potato | 烤红薯 | 512×512 | 61125 |
| dumpling-soup | 小巷馄饨 | 512×512 | 62749 |

实际生成提示词、状态与视觉核验见[assets/art/prompts.json](assets/art/prompts.json)；交付JPEG、尺寸、SHA256与v1文件名见[manifest.json](assets/art/manifest.json)，总JPEG字节1457155。每张≤180KB，20张菜图512×512，酒馆图960×640。主agent完成视觉核验，不凭图片修改菜单配方或价格。

构建脚本[scripts/build-tavern-art.py](scripts/build-tavern-art.py)要求全部21个ID各一次；既有JPEG哈希匹配时原样保留，其他文件仅按比例缩小及JPEG压缩。示例：`python scripts/build-tavern-art.py room=assets/art/room-v1.jpg water=assets/art/water-v1.jpg ...`，省略号须替换为全部ID。脚本同步生成JSON清单、tavern-art-manifest.mjs、21个图片数据模块及聚合tavern-art-data.mjs，避免单次大文件发布载荷。

## 展示、地址与检查

酒馆图用于菜单首页；全部20款常驻菜图用于点单预览、收据、公共上桌和自然语言看图。看图不创建钱包或购买草稿，不调用模型、生图服务或持续轮询。

固定公开地址`https://discord-holdem.aliceneko.workers.dev/art/{id}/v1.jpg`，只允许清单ID的GET/HEAD，image/jpeg、nosniff、缓存一年immutable。图片不能决定价格、余额或发起购买；若以后修改已发布图片应采用v2新URL，保留v1供历史消息。

本批80项针对性串行通过，包括全部图片与编译数据SHA/尺寸、旧4字节保留、GET/HEAD/cache、全部20款自然语言看图、菜单展示、签名交互与聊天知识库。Cloudflare beta.37活跃版本3badd681-9ab7-4fb7-9152-456b1f412e02，100%流量；80模块完整读回一致，现有生产绑定及Cron保持。当前环境直连health/新图片收到403，线上HTTP字节与Discord加载/布局仍待实际使用验证。beta.36的343项回归与首批4个线上GET/SHA/cache成功是历史证据。

## 后续新品补图

1. 用户明确提出新品后，确认真实商品ID、名称、配方、价格、类别和温度；没有配方不按名字猜食材。当前没有自由云端菜单导入接口，需先接入实际菜单来源。
2. 用统一风格单独生图，核对配方、数量、器皿、构图及无字/水印，保存实际提示词与审核结果。
3. 同步新JPEG、prompt状态、全量manifest、数据模块和版本映射；检查私人预览、公共上桌、HTTP与钱包/重复确认边界，再整批发布。

云端自由菜单导入、R2对象存储和自动生图仍未实现；没有开启运行时图片计费，会话结束后不会自动补图。
