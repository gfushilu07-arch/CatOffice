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
| SA1 | **印章边缘检测**：导入盖章扫描页 → 自动检测印章边界/形状/尺寸（见下节） | sealPlaceholderPng 夹具现成 |
| SA2 | 印章素材管理：导入/裁剪的印章图入库（本地素材库），插入时替换骑年盖月占位章 | SA1 |

### 执行进度

| 日期 | 任务 | 内容 |
| --- | --- | --- |
| 2026-09-04 | **SA2 管理面 UI 完成（素材章层级闭环）** | **四层贯通**：① main 持有库根（`userData/seals`，`docs-main.ts` seals:list/add/rename/remove/image 五 IPC——单写者模式与审计日志同例；add 校验名称/8MB 上限/shape 白名单）；② preload + shared/ipc 类型（`SealLibraryEntry` 从 seal-library 复用）；③ **SealLibraryModal**（docs 渲染器）：卡栅格缩略图（`sealsImage` data-url）+ 形状/尺寸/层级徽标 + 插入/重命名（inline 编辑，Enter 提交 Esc 取消）/删除（confirm）；**导入走 SA1 检测直通**——`createImageBitmap` 解码 → `detectSeal` 红印泥检测 → 命中即 `cropRgba` 裁边 + 自动形状/尺寸标注（mm 按 300dpi 定标）→ `OffscreenCanvas.convertToBlob` 重编码 PNG，未命中存整图；④ **插入路径**复用既有 `insertImageFromDataUrl`（genImage → save 落盘），Ribbon 审阅组新增「签章管理」按钮（IconStamp 圆章图标）。19 语言字符串；CSS `.seal-library-modal` 栅格。测试：modal UI 5（列表元数据/插入 data-url/重命名提交/删除确认/空库提示）+ 既有 seal-library 4 + seal-detect 6；相关 4 套件 50 绿、docs tsc 0。**素材章层闭环**：检测→入库→管理→插入全链可视；SA3 签章层未来同面板挂 CA 层（entry.signature 字段已预留）
| 2026-09-02 | **A1 完成：本地公文模板 + 新建入口直选** | **五层贯通**：① `govt-catalog.ts`（renderer）——5 品类参数表（通知/请示/报告/函/纪要，title 带 ×× 占位、文件名基底、id 稳定）；② 引擎 `buildBlankDocx` 新增 `section` 选项（GB 版心随空白文档 emit，`applySectionSettings` 应用，2 个回读测试）；③ docs `newFile(ctx, template?)` 新增 `NewFileTemplate{blocks,section,fileName}`——模板 blocks 替换空段但**保留 hidden 尾块**（sectPr 否则丢页框）、section 直注入 ctx（生成块无 originalXml 供 readSections 读）、文件名用模板基底；④ 四层 IPC：docs-main `queueDocsGovtTemplate`/`docs:consume-govt-template`（one-shot Map）→ preload `consumeGovtTemplate` → shared/ipc 类型；shell tab-manager `openDocsTab` 增 `govtTemplateId`、`home-api` 增 `govtTemplates()`（原生菜单选择器）+ `newDoc` opts 透传、shell main `GOVT_TEMPLATE_MENU`（标签留 shell 侧——shell 与 docs renderer 独立打包）+ `newDocTab(govtTemplateId)`；⑤ Home.tsx 新增「公文模板 GB/T 9704」卡（复用 docs 图标）→ 原生菜单 5 项（光标处 popup）→ 新 docs tab 渲染器 boot 时消费模板 id → `govtDocBlocks(options)` + `govtDocSection()` 应用。**语义保全**：模板走 Block[]（非 AiDocContent html），字符缩进/红头/红线全保真；tab 标题首保存时由 fileName 同步（既有 saved hook）。测试：引擎 blank-section 2 + docs govt-catalog 3；shell 218/218、docs 1340（1 个既知环境 flake 除外）、engine 931。**待续（A2）**：模板画廊缩略图预览 + mock 云目录路由 |
| 2026-09-02 | **A2 完成：模板画廊（本地+云合并）+ mock 云目录** | **契约**（catspark `./asset-center` 子路径）：`AssetTemplateEntry`（元数据 + `preset{kind:'govt',options}`——云条目是**生成预设**而非二进制，"下载"即本地应用预设，与「模板即 docx 生成器」一致）；`listAssetTemplates()` 失败一律 null（本地层零依赖云）；`CATSPARK_ASSET_BASE` 覆盖。**mock 路由** `/api/asset_center/templates`：5 个与本地同 id 的品类（验证合并去重）+ 2 个云独占（联合发文/横版红头，带 downloads 流行度）。**画廊 UI**（docs 渲染器 `TemplateGallery.tsx`，EquationModal 同款 modal-backdrop 挂载）：本地 5 卡置顶（离线保底）→ 云独占按 downloads 排后；本地卡被云元数据**增强**（使用次数）但 preset 不被覆盖；mini 实时预览（红头/字号/红线/标题 CSS 缩微）；`__gallery` 哨兵 id——shell 菜单首项「从模板画廊新建…」→ 新 tab 开画廊，其余 5 项仍直套；云失败显示降级提示且本地 5 卡照常可用；客户端动态 import 保持出画廊才加载。**测试**：catspark 20/20（mock 路由断言）、docs gallery merge 4（去重/增强/排序/离线保底）+ 目录 3；docs 1344 全绿、shell 218、tsc 0/0。**待续（A3，阻塞 CatSpark 服务端）**：真实云目录端点 + 搜索/分类契约增补 |
| 2026-09-02 | **A3 客户端侧完成：查询契约 + 对接文档（服务端就绪即插即用）** | 查询契约落地：mock `GET /api/asset_center/templates` 支持 `category` 过滤 + `q` 子串搜索（label+description），客户端 `listAssetTemplates({category,q})` 同参透传，1 个契约测试（分类/搜索/空结果）；[catspark-integration.md](catspark-integration.md) 增补**第六节素材中心契约**（端点表、AssetTemplateEntry 字段注释、云条目=元数据+生成预设语义、本地保底合并规则）+ **第七节云 OCR 契约**（PNG in → OcrRecognition out、异步预识别模型、置信度闸门在客户端、失败=逐页回退）+ 环境变量表两行 + **验收 4/5**（A2 画廊冒烟 + L3 云 OCR 端到端）。**A3 剩余仅为服务端实现**（Rust/axle 照第六节契约），客户端零改动切换 |
| 2026-09-02 | **P1 完成：办公文档模板线（合同/周报/会议纪要）+ 统一模板目录** | **生成器**（`office-template.ts`）：三类日常办公模板——周报（本周完成/下周计划/问题风险三节+汇报人字段，issues 空=节省略）、会议纪要（时间/地点/主持/参会字段+议定事项+行动项行+记录人落款）、合同（双方+条款+盖章签署页）；小四正文/三号标题、2 字符首行缩进（480tw）、×× 占位与公文线同惯例；`officeDocSection()`=A4+Word 中文默认页边距（上下 2.54cm 左右 3.17cm，非 GB 版心）。**目录统一**（`template-catalog.ts`）：`TemplateEntry{id,label,description,fileName,category,defaultOptions,render(options)}` 统一渲染协议，`ALL_TEMPLATES` = govt 5（委托 govtDocBlocks+govtDocSection）+ business 3（专属生成器）；`templateById` 供 boot 直套。**画廊升级**：本地层=8 卡（govt 置顶、business 随后、云独占按 downloads 排尾）；business 卡用无红头缩略预览（粗标题+线条条）；云条目 category 归入合并排序；pick 走目录 render（云独占无本地生成器按 govt 契约回退）。boot 消费点同走统一目录（菜单直选 office id 即套）。**测试**：office 6 + gallery merge 4（8 卡分层断言）+ catalog 3；docs 1349 全绿。**P1 剩余**：简历/表格/演示模板（品类扩展=加生成器+目录条目，管线已就绪）；云契约 `preset.kind` 扩 business 待 A3 服务端同步 |
| 2026-09-02 | **S1 完成：表格模板线（预算/值班/台账，跨模块第一刀）** | sheets 侧基建复用：`csv-import.ts` 导出 `rowsToXlsxBuffer(rows, sheetName)`（既有 `xlsxBufferFromRows` 行数组→xlsx 的薄包装，inlineStr/数字/公式串原样写入）；`sheet-templates.ts` 三预设——**预算表**（科目/计划/实际/差额 + 行级 `=B2-C2` 与合计 `=SUM()`，sheets 引擎打开即算）、**值班表**（周一至周五时段行）、**台账**（编号/日期/事项/经办/金额/状态）；`SHEET_TEMPLATE_MENU` 菜单数据随预设走（shell 与 sheets 渲染器独立打包）。**shell 贯通**（复用 docs 侧 A1 的四层 IPC 模式）：`newSheetTab(sheetTemplateId)` 按模板落盘（文件名用模板基底）→ 既有 routeDocumentPath 打开；`home-api` 增 `sheetTemplates()` 原生菜单 + `newSheet` opts 透传 `sheetTemplateId`；Home「表格模板」卡（预算/排班/台账副标）。v1 有意不含跨行样式（gateway 只写值），列宽/冻结/格式化属引擎 write 路径后续。**测试**：sheets 4（三预设逐 header 断言 + 生成 workbook 可解析、sheet 命名正确）；sheets 157/158（唯一失败=pivot LibreOffice 环境缺）、shell 218、tsc 0/0。**修正（平台问题审计发现）**：v1 把 `=SUM(B2:B4)` 写成了 inlineStr **文本**（isNumericCell 不认公式），Excel/WPS 打开预算表显示公式文字而非计算值——`buildWorksheetXml` 现对 `=` 开头值发真 `<f>` 公式单元（无缓存值，打开即重算），永久测试锁定 D2/B5 形态 + 禁止公式文本泄漏 |
| 2026-09-02 | **目标 9：apply_govt_template AI 工具（公文套版 skill）** | 走既有 agent 工具体系：AGENT_TOOLS 增 `apply_govt_template`（LLM 从草稿抽取 kind/title/banner/docNumber/recipients/paragraphs/attachments/signer/date/keywords/colophon），executor 校验 kind/title、**只透传模型填了的字段**（未填保持 ×× 占位）、经注入回调落地——AiPanel prop → createDocsSkill → executeTool → executeAsyncTool，App 侧回调 = templateById.render(fields) + newFile（真生成器保真，非 HTML 往返）；system prompt 增公文套版指引行；aiSumGovtTemplate 注册全部 19 locale；i18n 键类型收紧暴露两处。executor 单测 4 例（字段过滤/校验/无回调/失败传播）。**意义**：用户给草稿 → AI 抽字段 → 完整红头文件，规划 §9.3 的「素材中心 × AI」会合点落地 |
| 2026-09-02 | **目标 1：GB/T 9704 尾部块（主题词/版记）** | govtDocBlocks 增 `keywords`（主题词：日期下空行、加粗三号黑体顶格「关键词：」标签式）与 `colophon`（版记：抄送行+印发行，全宽上下横线=段落 tb 边框），未设即省略；apply_govt_template 同步透传 keywords/colophonCc/colophonPrint。真实引擎回程测试 3 例（加粗黑体存活/未设省略/横线边框存活），govt-template 11 绿。**GB/T 9704 版式全链完成**：红头→字号→红线→标题→主送→正文→附件→署名→日期→主题词→版记 |
| 2026-09-02 | **目标 5：品类扩充（简历 + 发票登记 + 考勤 + 项目提案）** | docs：`resumeBlocks`（标题头+姓名行+联系方式居中+简介/经历/教育/技能四节，经历行=期间+组织+岗位）入 office-template + 统一目录（本地层 8→9）；sheets：发票登记（价税合计=行级 `=D+E` + 合计 SUM）与考勤表（应出勤 21.75 基数）两预设（3→5）；slides：项目提案 6 页骨架重构为 `PROPOSAL_TEMPLATE` 常量 + `WEEKLY_REPORT_TEMPLATE` 命名导出（过程误删 weekly 条目被测试当场抓住恢复——测试网价值实证）。测试：docs office 6/gallery 4（9 卡断言）/全部 1362 绿；sheets 7；slides 2。**内置模板总量 9+5+2=16** |
| 2026-09-02 | **S2 完成：演示模板线（工作汇报骨架，跨模块第二刀）** | `deck-templates.ts`（slides main）：`createBlankPptx → openPptx → addElement(kind:'textbox') → insertSlideWithLayout → savePptx` 程序化搭 **6 页骨架**（封面：标题 40pt 居中+汇报人副行；目录；三节内容各=标题 30pt+18pt 条目体；结尾「谢谢观看」），16:9 EMU 网格，×× 占位与 docs/sheets 线同惯例；插入页复用空白 deck 自带的唯一 layout。**踩坑记录**：`addElement` 的 `kind:'rect'` 产出 shape（prstGeom，非 text 元素），纯文本必须 `kind:'textbox'`。**shell 贯通**（同 S1 模式）：`newSlideTab(deckTemplateId)` 异步渲染 → 模板名落盘 → routeDocumentPath 打开；`home-api` 增 `deckTemplates()` + `newSlide` opts 透传；Home「演示模板」卡（工作汇报副标）。**测试**：slides 2（id 稳定性 + 6 页 save/reopen 后逐页文本断言——经 `text.paragraphs[].runs[].text` 抽取）；slides 60/61（唯一失败=system-fonts 字体扫描环境 flake）、shell 218、tsc 0/0。**S3 待续**：三模块模板入口统一画廊（现 docs=浮层画廊、sheets/slides=原生菜单） |
| 2026-09-02 | **S3 完成：模板入口工厂统一** | shell main 三处复制粘贴的 picker handler（govtTemplates/sheetTemplates/deckTemplates）收敛为 `registerTemplatePicker(channel, entries, onPick)` 工厂——菜单构建/光标锚定/错误面统一，各模块只留 onPick 语义（docs=openDocsTab 带模板 id 走浮层画廊/直套，sheets=落盘路由，slides=异步渲染落盘路由）。三入口行为不变（行为测试 shell 218 全绿），纯结构收敛；后续加品类（简历/更多表格/更多演示）= 预设数组加条目，picker 零改动。**跨模块模板线至此收口**：docs（P0 5 + P1 3 + 浮层画廊）+ sheets（3 表格）+ slides（1 演示）= 12 个内置模板，一条 Home 卡片带一个模块 |

## 五、与现有文档的关系

- [product-plan.md](product-plan.md) §9.3「公文套版」AI 技能 = 素材中心的 AI 消费方；§8.1 文档模块的公文项（P1）= 内容供给线。
- [cross-platform-plan.md](cross-platform-plan.md) M5 公文版式 = P0 品类的生产线；其「UI 入口」待续项并入 A1。
- [catspark-integration.md](catspark-integration.md) A3 时增补 `asset_center` 契约段（端点、mock 行为、验收）。
- [license-audit.md](license-audit.md) 模板内容版权与 UGC 协议沿用其审计框架。
