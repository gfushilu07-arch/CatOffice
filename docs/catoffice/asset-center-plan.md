# 素材中心规划（对标 WPS 稻壳儿）

> 状态：**规划中，未开工**。本文档定义定位、品类、架构与分期；开工顺序见文末与 cross-platform-plan.md 的衔接。

## 一、定位

WPS 稻壳儿 = 模板/素材商城（在线模板库、会员体系、贡献者生态）。CatOffice 素材中心对齐「新建即套模板」的核心场景，差异化三点：

1. **模板即 docx**：字节级保真引擎是产品根基——模板不用自有格式、不用转换器，就是普通 docx，打开即编辑、保存不破坏（对标稻壳儿需要 WPS 专属格式/会员解锁的体验）。
2. **本地优先**：内置模板层零网络可用（离线/信创隔离环境完整可用），与跨平台规划「bundled 兜底」哲学一致；云目录是增强而非依赖。
3. **AI 套版**：product-plan.md §9.3 已规划「公文套版」AI 技能（把草稿套进标准红头）——素材中心为它提供模板供给，AI 填充 ×× 占位符（govt-template.ts 已确立该惯例）。

## 二、内容品类（分期）

| 期 | 品类 | 内容 |
| --- | --- | --- |
| P0 | 公文模板 | GB/T 9704 全套：通知/请示/报告/函/纪要 + 红头变体（横版/联合发文）；`govt-template.ts` 生成器是第一件内容 |
| P1 | 办公文档模板 | 合同、简历、会议纪要、周报；表格模板（预算/排班/台账）；演示模板（工作汇报） |
| P2 | 元素与生态 | 印章样式、页眉页脚包、编号样式包；社区贡献（UGC 需审核与版权授权协议，上线前过 license-audit 同款合规审） |

## 三、架构（复用现有基建）

**内容格式**：docx 文件本体。生成器（如 `apps/docs/src/renderer/govt-template.ts`）产出规范 Block[] → 引擎写出真 docx；预览缩略图走分页/pptx-render 管线渲染首页。

**双层分发**：

| 层 | 载体 | 说明 |
| --- | --- | --- |
| 本地内置层 | 随包 extraResources / 生成器代码 | 零网络、零帐号可用；跨平台安装包自带 |
| 云目录层 | CatSpark `CATSPARK_API_BASE/api/asset_center/*` | 分类/搜索/预览/下载端点；**mock 模式已可全仿真**（`packages/catspark/src/mock/server.ts` 扩展路由即可），`CATSPARK_API_BASE` 一键切真实后端——与客户端对接契约同构 |

**UI**：Shell Home 页「新建」入口扩展模板画廊（当前只有空白新建，见 docs-main `openTab(undefined, { newBlank: true })` 路径）；Docs 内为第二入口。

**帐号与计费**：复用 Catspark 设备码登录与积分体系；免费/积分模板分级；流量归因走既有 `X-Agent-Type`。

**合规**：自制模板版权归 Cat Office Team；字体沿用既有的 metric 替换 + 字体 CDN 目录策略（授权方正/汉仪字体按需下载，不进安装包——license-audit.md 的黄灯清单）；UGC 上线前补贡献者协议。

## 四、分期与顺序

| 期 | 内容 | 前置 |
| --- | --- | --- |
| A1 | 本地内置公文模板（GB/T 9704 全套固化）+ 新建入口直选 | M5 公文骨架（govt-template.ts 已就绪） |
| A2 | 模板画廊 UI：本地内置 + mock 云目录（缩略图预览、分类浏览） | mock 服务器扩展 asset_center 路由 |
| A3 | CatSpark 真实云目录端点 + 搜索/分类（catspark-integration.md 增补契约段） | CatSpark 服务端（Rust/axle） |
| A4 | 积分/会员计费、UGC 贡献生态 | 合规协议先行 |

### 执行进度

| 日期 | 任务 | 内容 |
| --- | --- | --- |
| 2026-09-02 | **A1 完成：本地公文模板 + 新建入口直选** | **五层贯通**：① `govt-catalog.ts`（renderer）——5 品类参数表（通知/请示/报告/函/纪要，title 带 ×× 占位、文件名基底、id 稳定）；② 引擎 `buildBlankDocx` 新增 `section` 选项（GB 版心随空白文档 emit，`applySectionSettings` 应用，2 个回读测试）；③ docs `newFile(ctx, template?)` 新增 `NewFileTemplate{blocks,section,fileName}`——模板 blocks 替换空段但**保留 hidden 尾块**（sectPr 否则丢页框）、section 直注入 ctx（生成块无 originalXml 供 readSections 读）、文件名用模板基底；④ 四层 IPC：docs-main `queueDocsGovtTemplate`/`docs:consume-govt-template`（one-shot Map）→ preload `consumeGovtTemplate` → shared/ipc 类型；shell tab-manager `openDocsTab` 增 `govtTemplateId`、`home-api` 增 `govtTemplates()`（原生菜单选择器）+ `newDoc` opts 透传、shell main `GOVT_TEMPLATE_MENU`（标签留 shell 侧——shell 与 docs renderer 独立打包）+ `newDocTab(govtTemplateId)`；⑤ Home.tsx 新增「公文模板 GB/T 9704」卡（复用 docs 图标）→ 原生菜单 5 项（光标处 popup）→ 新 docs tab 渲染器 boot 时消费模板 id → `govtDocBlocks(options)` + `govtDocSection()` 应用。**语义保全**：模板走 Block[]（非 AiDocContent html），字符缩进/红头/红线全保真；tab 标题首保存时由 fileName 同步（既有 saved hook）。测试：引擎 blank-section 2 + docs govt-catalog 3；shell 218/218、docs 1340（1 个既知环境 flake 除外）、engine 931。**待续（A2）**：模板画廊缩略图预览 + mock 云目录路由 |
| 2026-09-02 | **A2 完成：模板画廊（本地+云合并）+ mock 云目录** | **契约**（catspark `./asset-center` 子路径）：`AssetTemplateEntry`（元数据 + `preset{kind:'govt',options}`——云条目是**生成预设**而非二进制，"下载"即本地应用预设，与「模板即 docx 生成器」一致）；`listAssetTemplates()` 失败一律 null（本地层零依赖云）；`CATSPARK_ASSET_BASE` 覆盖。**mock 路由** `/api/asset_center/templates`：5 个与本地同 id 的品类（验证合并去重）+ 2 个云独占（联合发文/横版红头，带 downloads 流行度）。**画廊 UI**（docs 渲染器 `TemplateGallery.tsx`，EquationModal 同款 modal-backdrop 挂载）：本地 5 卡置顶（离线保底）→ 云独占按 downloads 排后；本地卡被云元数据**增强**（使用次数）但 preset 不被覆盖；mini 实时预览（红头/字号/红线/标题 CSS 缩微）；`__gallery` 哨兵 id——shell 菜单首项「从模板画廊新建…」→ 新 tab 开画廊，其余 5 项仍直套；云失败显示降级提示且本地 5 卡照常可用；客户端动态 import 保持出画廊才加载。**测试**：catspark 20/20（mock 路由断言）、docs gallery merge 4（去重/增强/排序/离线保底）+ 目录 3；docs 1344 全绿、shell 218、tsc 0/0。**待续（A3，阻塞 CatSpark 服务端）**：真实云目录端点 + 搜索/分类契约增补 |
| 2026-09-02 | **A3 客户端侧完成：查询契约 + 对接文档（服务端就绪即插即用）** | 查询契约落地：mock `GET /api/asset_center/templates` 支持 `category` 过滤 + `q` 子串搜索（label+description），客户端 `listAssetTemplates({category,q})` 同参透传，1 个契约测试（分类/搜索/空结果）；[catspark-integration.md](catspark-integration.md) 增补**第六节素材中心契约**（端点表、AssetTemplateEntry 字段注释、云条目=元数据+生成预设语义、本地保底合并规则）+ **第七节云 OCR 契约**（PNG in → OcrRecognition out、异步预识别模型、置信度闸门在客户端、失败=逐页回退）+ 环境变量表两行 + **验收 4/5**（A2 画廊冒烟 + L3 云 OCR 端到端）。**A3 剩余仅为服务端实现**（Rust/axle 照第六节契约），客户端零改动切换 |
| 2026-09-02 | **P1 完成：办公文档模板线（合同/周报/会议纪要）+ 统一模板目录** | **生成器**（`office-template.ts`）：三类日常办公模板——周报（本周完成/下周计划/问题风险三节+汇报人字段，issues 空=节省略）、会议纪要（时间/地点/主持/参会字段+议定事项+行动项行+记录人落款）、合同（双方+条款+盖章签署页）；小四正文/三号标题、2 字符首行缩进（480tw）、×× 占位与公文线同惯例；`officeDocSection()`=A4+Word 中文默认页边距（上下 2.54cm 左右 3.17cm，非 GB 版心）。**目录统一**（`template-catalog.ts`）：`TemplateEntry{id,label,description,fileName,category,defaultOptions,render(options)}` 统一渲染协议，`ALL_TEMPLATES` = govt 5（委托 govtDocBlocks+govtDocSection）+ business 3（专属生成器）；`templateById` 供 boot 直套。**画廊升级**：本地层=8 卡（govt 置顶、business 随后、云独占按 downloads 排尾）；business 卡用无红头缩略预览（粗标题+线条条）；云条目 category 归入合并排序；pick 走目录 render（云独占无本地生成器按 govt 契约回退）。boot 消费点同走统一目录（菜单直选 office id 即套）。**测试**：office 6 + gallery merge 4（8 卡分层断言）+ catalog 3；docs 1349 全绿。**P1 剩余**：简历/表格/演示模板（品类扩展=加生成器+目录条目，管线已就绪）；云契约 `preset.kind` 扩 business 待 A3 服务端同步 |
| 2026-09-02 | **S1 完成：表格模板线（预算/值班/台账，跨模块第一刀）** | sheets 侧基建复用：`csv-import.ts` 导出 `rowsToXlsxBuffer(rows, sheetName)`（既有 `xlsxBufferFromRows` 行数组→xlsx 的薄包装，inlineStr/数字/公式串原样写入）；`sheet-templates.ts` 三预设——**预算表**（科目/计划/实际/差额 + 行级 `=B2-C2` 与合计 `=SUM()`，sheets 引擎打开即算）、**值班表**（周一至周五时段行）、**台账**（编号/日期/事项/经办/金额/状态）；`SHEET_TEMPLATE_MENU` 菜单数据随预设走（shell 与 sheets 渲染器独立打包）。**shell 贯通**（复用 docs 侧 A1 的四层 IPC 模式）：`newSheetTab(sheetTemplateId)` 按模板落盘（文件名用模板基底）→ 既有 routeDocumentPath 打开；`home-api` 增 `sheetTemplates()` 原生菜单 + `newSheet` opts 透传 `sheetTemplateId`；Home「表格模板」卡（预算/排班/台账副标）。v1 有意不含跨行样式（gateway 只写值），列宽/冻结/格式化属引擎 write 路径后续。**测试**：sheets 4（三预设逐 header 断言 + 生成 workbook 可解析、sheet 命名正确）；sheets 157/158（唯一失败=pivot LibreOffice 环境缺）、shell 218、tsc 0/0 |

## 五、与现有文档的关系

- [product-plan.md](product-plan.md) §9.3「公文套版」AI 技能 = 素材中心的 AI 消费方；§8.1 文档模块的公文项（P1）= 内容供给线。
- [cross-platform-plan.md](cross-platform-plan.md) M5 公文版式 = P0 品类的生产线；其「UI 入口」待续项并入 A1。
- [catspark-integration.md](catspark-integration.md) A3 时增补 `asset_center` 契约段（端点、mock 行为、验收）。
- [license-audit.md](license-audit.md) 模板内容版权与 UGC 协议沿用其审计框架。
