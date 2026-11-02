# 酒馆盲拍藏品图片

## casino.9：192件与独立物件配色

192件白/绿/蓝/紫/金/红28/26/29/29/28/52，新增120件。种类结构参考社区竞拍盒子2026.10.29默认可掉落图鉴，统计口径见docs/casino/BIDKING_POOL_REFERENCE.json；不是官方概率表。现行掉率30/25/20/13/11/1%独立保持。

用户明确要求本体不跟随品质染色。palettes-v4.json逐件记录材质与配色；品质色仅在UI边框/提示中出现。普通物件以实用和磨损区分，高级物件以精细雕工、复杂结构、镶嵌和独特形制区分，保留木头、银铁、皮革、瓷器、透明玻璃等本色。72件原藏品使用新v4 PNG，新120件使用尚未发布的v3 PNG。

8张新增/修订WebP均1024×1536 RGBA，透明alpha最小值0；合计4752292字节：

| 源图 | 字节 | SHA256 |
| --- | ---: | --- |
| props-base-v4.webp | 534352 | 494d72288e0b2b864ce4753eb0bc0db3c3882124168cba1b5bfda755ee561b32 |
| props-memes-a-v4.webp | 628308 | ef40555e4e3a33e5fa6cae90489161146efe5feeada9f2e610d6d639627b737d |
| props-memes-b-v4.webp | 587062 | 992db4146117ea16aff39fcd9c5b5338fb16adc6ae8e1d94f6b68fde72f655b2 |
| props-expansion-a-v3.webp | 582706 | c4d84ffda763fc183ee16cf167da712a926b5fc675660fbcce4321083938c3b0 |
| props-expansion-b-v3.webp | 589276 | 42913dc44decf43618bddac7d242e16e1ceeb191214cc42994b336ca526834e3 |
| props-expansion-c-v3.webp | 575438 | 8f74679b1471fcd729cbdff7d6db3ffac659ee4aed4a95caa2112f96dd0b8948 |
| props-expansion-d-v3.webp | 615864 | 468f3ab265bf8292379978d1a78b590e9e16df290f8621b167a2005ba997097b |
| props-expansion-e-v3.webp | 639286 | be7296443300b36def520a090440cb38818595f99b8e05d9c36adefa4444b468 |

内置imagegen生成/编辑，参考官方Steam截图中的写实3D道具表现；参考截图不打入产品。通用提示：4列6行24件完整独立物件，1024×1536真实透明背景，每格256像素、24像素透明边；保留身份/布局/轮廓，以自然材料和各自配色修改，柔和中性上方光，无UI/框/标签/文字/描边/泛光粒子，不按品质整批涂色。精确逐件配色见palettes-v4.json；新增物件主题见expansion-v2.json的visual字段，pack a至e、slot0至23对应网格。b/c去除统一蓝/紫倾向；a/d/e经目检保留各自材料。memes-b首次修改未得到真实透明底，已单独使用背景提取编辑修正，成品真实alpha透明。

python3 scripts/build-auction-art.py继续从旧源图原样生成v1/v2资产；再从3张v4源图生成修订72张PNG，与新增120张v3 PNG合成192件主图集。manifest.previousItems保留旧72张v2 PNG路由；旧v1/v2不可变URL及字节不变。v3主图集1024×3072 RGBA、12,582,912字节，SHA256为43123bfe21d34a7f456f36011147a842c1b8d668d4124cbb9b726f14ecc57ff6。v2 SHA256保持792f0888fe084e93144fcc58dbf1ed1348ebf2830b6017cc3fcc2d4ab5cf88b2。JS只含索引，无图片Base64；共享单个有界12MiB缓存。连通物件分割保留完整部件并清理邻图碎片。实际图鉴、混合仓库和新旧版本路由需验收。

## v2源图与生成记录（兼容保留）

casino.7（2026-11-02）共72件原创藏品：原24件统一重绘，加48件有实物造型的梗藏品。新增名称、短介绍与英文造型简报由当前assistant直接编写，按用户要求不使用Gemini；此前两条新增文案任务已取消，未采用草稿。源数据见expansion-v1.json。

用户指出旧尝试“太GPT风格”，随后指定参考《竞拍之王》。已实际查看官方Steam的交易所截图，参考其独立道具、略俯视三分之四角度、写实3D材质、受控反光与清晰轮廓；不沿用未经选择的手绘/像素小样。参考：https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4128580/1d6ac4bafc381583d30b629a21edd9db004eed3a/ss_1d6ac4bafc381583d30b629a21edd9db004eed3a.1920x1080.jpg?t=1775130184 。本项目物件为重新生成的原创酒馆/玩梗道具，不是原作图标移植。

### v2源图

| 源图 | 内容 | 字节 | SHA256 |
| --- | --- | ---: | --- |
| props-base-v2.webp | 每品质原4件，对应变体0–3 | 531386 | d580054105633018693593e3d3eb05cd2aaf80b971aa5453e8eec158bd9c7985 |
| props-memes-a-v2.webp | 每品质新增前4件，对应变体4–7 | 678140 | 8520b1dd6049bcee5c4784c08270c7365429d691aa203a0777b856cbf2c1ffa4 |
| props-memes-b-v2.webp | 每品质新增后4件，对应变体8–11 | 644534 | 3c59a35d45701712f299f252d9ecd8991967b2c1c29dc870b0711c818dafe1bc |

均为1024×1536 RGBA透明WebP，quality94，原始alpha范围0～254。原24件名称沿用已批准的casino-auction-copy-20261102-v1；新增48件没有调用Gemini。旧atlas-v1.webp与全部v1公开路径保留，禁止覆盖已有一年不可变缓存。

### v2生成提示

使用内置imagegen，官方截图作为唯一画风参考，不作为修改目标。每张4列×6行、24个单件、透明背景；按白/绿/蓝/紫/金/红从上到下排列，约束物体完整、独立、留透明边距，无文字、UI框、品质底板、水印。风格为类似参考截图的写实3D游戏道具缩略图，柔和中性光、清楚轮廓、适度细节；禁止手绘描边、水彩、珠宝贴纸感、泛光光晕和粒子堆叠。普通道具为旧货与日用品；高级道具用金银、水晶、皮革和精细结构体现工艺与价值。梗必须表现为物理物件。

第一张对象按tavern-auction-data.mjs原24件名称顺序；第二、三张分别按expansion-v1.json的slot0–3、slot4–7逐品质顺序，使用visual字段作为对象简报，将glowing/dramatically类装饰要求收敛为材质表现（实际提示删除glowing与dramatically两词）。生成过程中没有请求Gemini文案。不要将被否定的旧尝试或6件画风小样作为产品源图。

### v2构建记录

运行`python3 scripts/build-auction-art.py`；完整静态构建会自动调用。v2先对alpha连通物件按质心归入网格，保留跨格的完整物件，清除小块邻图碎片，保留边缘抗锯齿，再缩放成256×256透明PNG；生成72张v2 PNG及512×2304 RGBA图集（4,718,592字节）。公共文件通过ASSETS读取，JS仅含索引，无图片Base64。图鉴按6种品质分页，每页12件；仓库与图鉴使用同一组图片。

v1继续采用原来的固定裁剪算法，保持旧图片与1,572,864字节图集逐字节相同。旧sprites-v1.bin SHA256为7aa7b328c729f325ba93b6459d203fbb4b98a3224b588b37a0c7624ad5391455；红色原藏品PNG SHA256为21652ddc510e20315fd15c7ea2e7477bbd8c03fb9b012d30e95d15f0e859917b，均有回归断言。
