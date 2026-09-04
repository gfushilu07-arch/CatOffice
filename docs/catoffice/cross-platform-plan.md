# 跨平台开发规划（macOS / Windows / Linux）

本文是办公猫跨平台工作的任务书：覆盖**中文排版引擎层的平台矩阵**与**三平台构建/签名/发布/测试**两条线，并给出开发顺序与技术选型。上游基线（2026-08-26 snapshot，shell v0.8.0）本身就是跨平台产品（已发布过 linux-v0.5.149），大量平台基建是继承来的——我们的工作是**接住、验证、补缺**，不是从零做。

## 〇、执行进度

| 日期 | 任务 | 内容 |
| --- | --- | --- |
| 2026-08-31 | **W1 完成** | ci.yml 三个作业全部切 pnpm（`pnpm/action-setup` SHA 固定 + `pnpm install --frozen-lockfile` + pnpm store 缓存）；package-lock.json 确认**保留**（许可证门禁工具的依赖清单，见 upstream-sync.md 政策），并用 `npm install --package-lock-only` 刷新对齐 |
| 2026-08-31 | **W2 起步** | 新增 `test-windows` 作业（windows-latest：typecheck + 全量单测，Rust sidecar 走 runner 默认 MSVC）；`continue-on-error: true` 起步，main 连续两周绿后转为阻断门禁 |
| 2026-08-31 | **T1 完成** | `apps/docs/tests/font-chain-matrix.test.ts`：63 项语料（GB 经典/微软现代/繁/日/韩/Noto/思源/中文厂商名/西文锚点/未知名）× `cssFontFamily`/双槽/EA-only/行高因子，按 `darwin/win32/linux` 三平台快照分桶（`UPDATE_FONT_SNAPSHOTS=1` 再生）；单次运行用 profile 覆盖生成全部三份（任意主机可再生成），另有 win32 字面命中 / linux bundled 兜底两条结构不变量断言 |
| 2026-08-31 | **T4 完成（第一刀）** | 新增 `apps/docs/src/renderer/font-platform.ts` seam（`fontPlatform()` 推断 + `setFontPlatform()` 测试覆盖 + `WINDOWS_NATIVE_FONTS` 清单）；`line-metrics.ts` 的 cjkVariant 分支接入平台分派：darwin 保持 wholesale 替换（快照逐字节冻结验证），win32/linux 保留字面链头、由声明类决定 serif/sans——修复了 bundled Noto 名在所有平台被降级到替换类的问题；平台分派语义单测 `font-platform.test.ts`。行高因子暂保持平台共享（等 T2/T3 基线） |
| 2026-08-31 | **T3 完成（测量+接线）** | `tools/measure-font-linebox.mjs`：Playwright 实测 bundled 字体在 Blink 的行盒比例（15 族，单行 div/100px/line-height:normal），产出 fixture + 生成表 `font-linebox-linux.generated.ts`；`linuxChainFactor()` = 字体链上第一个 file-backed bundled 字体的实测值（local() 别名不在表内自然跳过），注入 `lineHeightFactor` / `cjkDeclaredLineFactor` / `krLineFactor` 三入口——Linux 分页/画布因子与真实渲染面对齐（CJK 1.40、KR 1.22、Latin 1.15），darwin/win32 不受影响（快照验证）。**待续**：在真 Linux CI 上重跑测量工具校验跨平台一致性（mac FreeType/CoreText 差异） |
| 2026-08-31 | **T6 完成（第一刀）** | 禁则集抽成共享模块 `packages/pptx-render/src/kinsoku.ts`（子路径 `@genoffice/pptx-render/kinsoku`，pptx text-layout 与 docs 共用单一数据源）；离线分页 `simulateLines` 接入拉下式避头尾：行首禁闭符号/行尾禁开括号 → CJK 前驱下拉（与 pptx 布局同语义），单字行无法内断时悬挂溢出而非空行；9 个单元场景锁定行为（含 Latin 词不拉、段首豁免、keep-all 路径不动的边界）。**待续**：keep-all 硬断行的禁则、悬挂/挤压两种行尾策略与编辑画布 `line-break` 选型的一致性校验（归入 T5/T6 后续） |
| 2026-08-31 | **T5 完成（第一阶段闭环）** | 规则单一化：`punctuation-squeeze.ts`（相邻全角闭标点 run，除末位外右缩半宽）；三面同源消费——① 分页 `simulateLines` 前瞻压缩（拉下 carried 序列重算压缩）；② 画布 `PunctSqueezeExtension` 逐文本节点 decoration（UTF-16 偏移映射）+ `.doc-punct-squeeze` CSS 负右边距；③ 8 个单测锁定模型/分页/装饰三方一致。**待续（第二阶段）**：行首/行尾标点压缩（需要断点信息，归属分页渲染路径）、全角开括号参与规则、与 Word compressPunctuation 模式的逐项对齐、跨 text node 的 run 处理 |
| 2026-08-31 | **T5+T6 第二阶段（探针修正 + keep-all 禁则）** | **决定性实测**（`tools/probe-text-spacing-trim.mjs`）：Chromium 151 无 lang 时默认就对相邻全角闭标点做半宽修剪（`一。。。一`=500px），量恰与挤压装饰规则相同 → 画布装饰会**双重压缩**；lang=zh-CN 时原生还叠加行首/行尾修剪（400px）。**修复**：`.doc-page` 钉 `text-spacing-trim: space-all` 把原生修剪关为不修，装饰保持唯一显式压缩源（规则可控、模型可对齐）；分页打印路径未来反选启用原生并弃装饰。**keep-all 硬断行禁则**：hard-break 分割点套同一拉下规则（`가나다라마바사。` 断为 `가나다라마바`/`사。`），T6 待续项清零 |
| 2026-09-01 | **首行缩进字符单位（M5 硬前置）** | `w:firstLineChars`/`w:hangingChars`/`w:leftChars` 全链路支持：docx-engine parse（signed 模型字段）+ generate 回写（双形式并存，Word 持续按 EA 字号缩放）+ 保真比较精化（模型未携带 chars 时视为未建模属性保留，仅显式建模且不同才触发重建）；渲染侧 OOXML 优先级 chars > twips，emit `em` 缩进（200 = 2 字，公文标准）；schema attrs/convert/Ctrl+Q/ribbon/indent.ts 全部接线，**用户 twips 编辑显式清除 chars 防双写吞编辑**。3 组回写测试；docx-engine 927/928 + docs 125/126（失败项均确认为既有并行 flake） |
| 2026-09-01 | **M5 第一刀：GB/T 9704 公文骨架生成器** | `apps/docs/src/renderer/govt-template.ts`：发文机关标志（红头，红色小标宋 36pt 居中）→ 发文字号（3号仿宋居中）→ 红色分隔线（空段红色底边框，`borders:'b'` + `borderLines.b` 覆盖）→ 标题（2号小标宋居中）→ 主送机关 → 正文（3号仿宋，`indentFirstLineChars:200` + twips 640 回退——上笔工作的直接消费方）→ 附件说明 → 署名/成文日期（右对齐右空四字/二字）；全字段可调用方覆盖。6 个回程测试走真实引擎（generateParagraphXml → buildDocx → parseDocx）逐字段验证红头颜色/字符缩进/红线边框/落款对齐全部原样存活。**待续**：UI 入口（并入素材中心 A1，见 [asset-center-plan.md](asset-center-plan.md)）、版心 sectPr（A4 上37/下35/左28/右26mm）、印章图形占位、主题词与版记（P2） |
| 2026-09-02 | **M5 第二刀：GB/T 9704 版心（页框）** | `govt-template.ts` 新增 `GB_A4`（11906×16838 twips）/`GB_MARGINS`（上37/下35/左28/右26mm → 2098/1984/1587/1474 twips）/`govtDocSection()`（portrait、单栏、header/footer 1440，直接产出引擎 `SectionSettings`）；回程测试证 `applySectionSettings` 对配对 sectPr 覆写 + `sectionSettingsFromXml` 读回全字段一致（US-Letter 基座 → GB 页框，页框随存/开存活）。**发现**：`applySectionSettings` 的 pgMar 插入锚是 `</w:sectPr>`，自闭合 `<w:sectPr/>` 输入会静默丢边距——测试需用配对形式（引擎与 Word 的真实输出形态）。**待续**：UI 入口（素材中心 A1）、印章图形占位、主题词与版记（P2） |
| 2026-09-02 | **M5 第三刀：印章图形占位（骑年盖月）** | 新增 `apps/docs/src/renderer/govt-seal.ts`：**零依赖调色板 PNG 编解码**（color type 3 + stored deflate——渲染进程无 node:zlib，stored 块 ~10 行；4×4 超采样 coverage 1:1 映射 16 级透明度，修掉 17 级溢出与星形起点错位两个真 bug）；`sealPlaceholderPng()` 渲染红圈+五角星（φ40mm 标准圆章，可调直径/圈宽/星径/颜色）；`govtSealImage()` 产出 `NewImage`——`wrap:'front'` + posOffset 锚定成文日期（垂直中心压日期行/半章上浮，水平对准日期文字区：右空二字 + ~6 字宽估计），走标准 save 路径（genImage attrs → kind:'image' → media part + wp:anchor）。4 个测试：PNG 手写解码器逐字节验证（IHDR/PLTE/tRNS/stored 块/adler32 + 圆心星/顶圈/环内/角点四点 alpha 采样）+ 几何断言 + 真实 saveDocx 嵌入回读。**待续**：UI 入口（素材中心 A1，在日期段落挂 genImage 节点）、机构名弧形文字（真章素材替换整个图片，属素材中心）、主题词与版记（P2） |
| 2026-09-02 | **T5 二阶段第一刀：w:characterSpacingControl 全链路（标点压缩文档级开关）** | Word 亚洲排版「标点压缩」的设置项——后续行首/行尾压缩、compressPunctuation 逐项对齐都要挂在它下面。引擎：`CharacterSpacingControl` 类型 + `ParsedDoc.characterSpacingControl`（parseLayoutSettings 解析，非法值=undefined）+ `SaveOptions.characterSpacingControl`（undefined=保持原样字节稳定保存；apply 沿 settings.xml 根插入模式）+ 3 个 round-trip 测试（set/replace/keep，15/15 绿）。渲染：`punctuation-squeeze.ts` 新增 `setPunctuationCompressionEnabled()` seam——**默认开**（本 fork 中文排版默认=Word 对 zh 文档写的 compressPunctuation），显式 `doNotCompress` 才关；`simulateLines` 两个消费点（字符推进 + 拉下 carried 序列）与 `PunctSqueezeExtension` 装饰同读一个标志，分页预测与画布永不失步；打开/新建两条文档落地路径接线（`parsed.characterSpacingControl !== 'doNotCompress'`）。门控测试断言开关两侧分页断行与装饰数。**探针发现**：门关时 `一二三四五。。。`@70px 断为 `一二三四｜五。。。` 而非 naive 的 7+1——`。` 行首禁闭把 `五` 拉下，这是禁则的正确体现；压缩开时 64px 单行放下。**待续（T5 二阶段余项）**：行首/行尾压缩面（需断点信息，归属分页渲染路径）、全角开括号参与规则、跨 text node 的 run 处理 |
| 2026-09-02 | **T5 二阶段第二刀：跨 text node 的相邻压缩（run 边界）** | **布局探底**：生产分页 `pagination.ts` 的 lineBoxes 来自 DOM 实测（`domLineBoundaries` 浏览器真实断行），`simulateLines` 的真实消费者是 pagination-parity 黄金测试与表格 autofit——行首/行尾压缩面需要 Word 真机探针定语义（同 T2 阻塞），故先做确定性最高的跨 run 相邻性。规则源单一化：`squeezeRightsAcrossEm(pieces)` 把多段文本当一个序列算压缩、按段切回（跨边界相邻即压缩，Word 对跨格式的相邻标点同样压缩）；空段透明跨越、`squeezeRightsEm` 委托之。三方消费同源：① `simulateLines` 段落级一次跨 run 计算 + 拉下 carry 重算配对「本 run 尾段+后续 runs」（修正溢出字符自身压缩值依赖新行上下文的旧近似）；② `PunctSqueezeExtension` 改**段落级扫描**（textblock 遍历，bold 等 text 相邻压缩，硬换行/inline 图片等非文本节点断开 run）。测试：跨边界单元 4 例（含 `['。。','。。']` 四连标点=前三压后一）、simulateLines 跨 run 单行化（旧逐 run 算法 72px 换行 vs 跨段 64px 单行）、装饰跨 bold 边界落点 + 硬换行断句，4 套件 157/157 绿。**待续**：行首/行尾压缩面（等 Word 探针）、全角开括号参与规则 |
| 2026-09-02 | **T5 二阶段第三刀：全角开括号参与压缩（对称规则）** | **探针定语义**（`tools/probe-open-bracket-trim.mjs`）：Chromium 原生 text-spacing-trim 对全角开括号**完全不修剪**（`一（一`=300px=control、`）。`=400px=满宽，trim-auto 与 space-all 皆然）→ 开括号规则必须模型自实现。**统一规则**：极长标点 run（闭∪开混合，跨 piece）：闭标点非序列末位 → 压**右**半；开括号非序列首位 → 压**左**半。对偶自洽——`。。`前压右（现状不变）、`（（`后压左、`。（`两侧各压半（重复空隙=整空）、`（。`字形间无空隙不压。核心重构：`squeezeAcrossEm()` 返回 `SqueezeSide{right,left}` 双侧数组（画布需区分方向：右压 margin-right 拉后续文字、左压 margin-left 拉字形自身），`squeezeRightsEm` 取 right 列保持兼容。消费端：`simulateLines` advance/pendW 用 right+left 之和（度量合成），装饰按侧落 `doc-punct-squeeze`/`doc-punct-squeeze-left` 两个 class，CSS 新增左压 margin-left 规则。测试 22 个：开括号单元（`（（`/`「「「`）、`。（`双压、`（。`不压、`）（`混合 run、跨边界复用、装饰左压 class 断言（ProseMirror `deco.type.attrs.class`），4 套件 161/161 绿。**T5 余项清零至**：行首/行尾压缩面（等 Word 真机探针，同 T2 阻塞） |
| 2026-09-02 | **L2 第一刀：Linux arm64 目标（CI-ready）** | 信创线（规划 §3 政务/国企）前置。builder 配置：`GENOFFICE_LINUX_ARM64=1` 时 AppImage/deb/rpm 三目标追加 `arm64` arch（默认关闭——缺交叉 sidecar 的 arm64 包会静默变成打不开任何工作簿的安装器）；交叉 sidecar 契约 = `cargo build --release --target aarch64-unknown-linux-gnu`（`gcc-aarch64-linux-gnu`），staged 到 `native/xlsx-sidecar-arm64`；beforePack 补存在性硬断言（electron-builder 对缺失 extraResources **静默跳过**，是配置里已知的坑）；两侧运行时解析（shell `index.ts` + sheets `sheets-main.ts`）在 linux+arm64 下优先取 `-arm64` 后缀文件并回退。新增 release workflow `dist-linux.yml`（ci.yml 是纯测试门禁不打包）：`workflow_dispatch` 手动触发、x64 默认、`arm64` 输入开关装交叉链 + 交叉构建 + 双 arch 打包；产物仅 artifact 上传不发布（GENOFFICE_UPDATE_URL 不设 → 包内无 updater，发布/promotion 归 W3）。本机验证：配置开关两侧加载 + 目标翻转 + staging 列表 ✓、两侧 tsc 0 错误、workflow YAML 解析 ✓；**交叉编译与真实打包验证归 CI**（本机无 aarch64-linux-gnu 工具链） |
| 2026-09-02 | **L3 第一刀：云 OCR 预识别供给接缝（pdf2docx 引擎层）** | **架构探底**：转换管线在主进程**同步 PDFium scope** 内跑（wasm 堆指针持有），HTTP 引擎无法从内部调用 → 云 OCR 走「**异步预识别 → Map 供给同步管线**」：新增 `ocr-async.ts` 的 `recognizeScannedPages(pdf, opts, engine)`——同步打开文档探出 scanned 页（复用 `extractPage` 的 `scanned` 判定）、每页渲染 >=3 px/pt（与本地路径同一识别渲染）、scope 外并发 await `AsyncOcrEngine`，返回 `Map<pageIndex, OcrRecognition>`；失败/throw/null 的页**缺席**于 map（转换期逐页回退）。`ConvertOptions.ocrRecognitions` 供给优先于同步 `ocr` 引擎（调用方对供给页的云结果是显式决定，本地引擎不得覆盖），**置信度闸门全部留在 ocr.ts**——云答案与本地答案同一把尺（paperShare/均值置信度/覆盖率/最小字符数）。5 个测试：probe 只渲染 scanned 页、引擎 throw/拒绝缺席、供给路径端到端（状态 ocr + docx 文本 + 无图片块）、供给被闸门拒 → 位图回退且本地引擎不救、map 缺页 → 本地引擎照常接手；pdf2docx 711/711 全绿。**第二刀待续**：CatSpark mock `/ocr` endpoint（mock/server.ts 已留缝）+ shell/pdf 布线（ensureOcrEngine 后追加 async 预识别调用） |
| 2026-09-02 | **L3 第二刀：CatSpark 云 OCR 全链接通（mock 端点 → requester → shell 布线 → docx）** | mock server 新增 `/api/ocr/recognize`（原始 PNG body in → OcrRecognition 形 JSON out，canned 扫描页文本，非 PNG 400）；catspark 新增 `./ocr` 子路径：`cloudOcrBase()`（`CATSPARK_OCR_BASE` 覆盖，默认 `apiUrl('/api/ocr')`）+ `recognizeCloudOcr()`（fetch POST，网络/非 200/坏 JSON 全部 resolve null = 逐页回退，行结构逐字段清洗）。shell 布线（`pdf2docx-local.ts`）：**本地引擎缺席（Linux）或 `CATSPARK_CLOUD_OCR=1` 强制**时先 `recognizeScannedPages(pdf, {pdfium}, recognizeCloudOcr)` 预识别，空结果/异常静默降级纯本地转换；`cloudConfigured()` 复用 `isDefaultCloudOrigin(cloudOrigin())`——仅 mock 模式或 CatSpark 部署发网络请求，upstream 默认云零新增请求。**端到端测试**（shell/tests/cloud-ocr.test.ts）：起 mock server → `convertPdfFileToDocxLocal`（`CATSPARK_CLOUD_OCR=1` 强制——darwin 有本地 Vision 引擎会抢先且慢）→ docx 含 mock 识别文本、无图片块；shell 215/215 + catspark 19/19 + tsc 0/0。**至此 L3 闭环**：Linux/信创线扫描件 PDF → CatSpark 云（先 mock 后真实服务）→ 可编辑 docx |
| 2026-09-02 | **L4 预备：Wayland ozone 开关 + 真机走查清单** | ① `apps/shell/src/main/linux-ozone.ts`：`CATOFFICE_OZONE` 三档（`x11` 默认 / `wayland` 强制原生 / `auto` 跟随 `XDG_SESSION_TYPE`）——**默认仍 X11/XWayland**（部分合成器全局菜单/IME 有缺口，原生 Wayland 是显式选择）；启用时用 `ozone-platform-hint=auto`（非 `-platform=`，保留 Chromium 回退链：Wayland 失败落 XWayland 而非黑窗）+ `enable-wayland-ime`（fcitx5）；决策函数（`ozoneChoice`/`shouldEnableWayland`）导出供测试，Electron `commandLine` 效果面 late-bound require 保持模块 node 可导入；3 个决策单测。② `docs/catoffice/linux-desktop-checklist.md`：七节真机走查清单（显示后端/沙箱 SUID/菜单 WM_CLASS/文件关联/输入法/剪贴板打印/CI 衔接），每项给预期+验证法，含走查记录表格——真机走查后结果记执行进度表。shell 218/218（215+3）、tsc 0。**L4 剩余**：真机走查（需真实 Linux 桌面，与 L2 的 CI 实跑一并安排） |
| 2026-09-02 | **T2 准备：Windows Word 行高探针工具链（等真机）** | `tools/word-lineheight-probe/` 三件套：① `gen-corpus.mjs` 生成 36 个探针 docx（18 族 × 10.5/12pt——Windows 在场字体全集含 CJK 六家/繁中/KR/JP/Latin 大脸；单段 24 行 `<w:br/>` 软换行、无段距、行短不折行=纯行进；docx-engine 回读验证字体/字号/断行数）；② `collect.ps1` Word COM 隐藏自动化：`GoTo(wdGoToLine)` 逐显示行取 `wdVerticalPositionRelativeToPage`（pt），只读不存，产出带 OS/Word 版本出处的 `measurements.json`；③ `reduce.mjs` 相邻行距**中位数**/字号=因子，翻页跳变（>中位×3）丢弃，与 `MAC_FACTORS` 快照逐项 diff（>2% 标记 differs、双字号互差 >2% 报测量异常）产出 `windows-word-factors.json`。**合成数据联调通过**：SimSun 1.3029/YaHei 1.7143 精确还原、脏数据样本（中间翻页）被正确过滤。差异项后续进 T4 的 win32 分派（`font-platform.ts` seam 已就绪，linux 先例同款）。**阻塞点不变**：collect.ps1 需 Windows+Word 真机；工具链就位后真机侧只剩拷贝+一条命令 |
| 2026-09-02 | **素材中心 A1 完成（并入 M5 UI 入口待续项）** | 详见 [asset-center-plan.md](asset-center-plan.md) 执行进度表：5 品类 GB/T 9704 模板（Block[] 保真）+ Home「公文模板」卡 → 原生菜单直选 → 新 docs tab 即套；引擎 `buildBlankDocx` 增 section 选项、docs `newFile` 增模板参数、四层 IPC 贯通。M5 的「UI 入口」待续项就此关闭 |
| 2026-09-02 | **M4 补遗：simulateLines 计入 CJK-Latin autospace pad（画布/分页一致性缺口）** | **盘点发现的真实缺口**：中西文自动加间距（autoSpaceDE/DN，Word ~1/4em = Chromium 原生 1/8em + `.doc-autospace-pad` span 1/8em）只在**画布**实现（AutospaceExtension 装饰 + protected-render），离线分页 `simulateLines` 完全没算 pad 宽度——画布每个 CJK/Latin 边界多 0.125em，分页预测按无 pad 测量，长段断行预测漂移，直接违反 M4 验收口径（三方换行位置一致）。**实现**：导出 `AUTOSPACE_PAD_EM=0.125`（styles.css 同值注释互指）；`prevChar` 段落级邻接状态（**跨 run 边界**——格式切换不隐藏空隙，与画布跨 node 检测同语义），三种重置=视觉断行/换行符/行首吞空格；三条路径计入——CJK 逐字（pad 进 adv）、词缓冲 flush（buf 内部 boundaries + 首边界）、禁则拉下（pendingW 计 pending 内部 pad；pending 从新视觉行开始无前置 pad）；pad 归属断行边界（折行处 pad 算前行宽，与浏览器 margin 行为一致）。**行为修正一例**：`ab六c。`@40px 旧期望 `ab六c｜。` 基于「无 pad 恰好放下」的巧合——六|c 是 UAX#14 合法断点且有 pad，浏览器同样在此折行，测试更新为 `ab六｜c。`。**测试**：5 个专项（pad 改变断点 71px 双侧、跨 run 边界、行首不跨行、词缓冲内部边界 81/82px 双侧、24pt 时 pad=4px）；4 布局套件 166 绿、docs 1350（仅剩既知 protect-dialog flake）。**排版引擎层盘点结论**：M4 三大件（挤压/禁则/autospace）在模型-画布-引擎三面已对齐；余项仅剩行首/行尾压缩面（等 Word 真机探针，同 T2 阻塞） |
| 2026-09-03 | **规划落地：合规方案 + 国际化排版方案 + 印章检测（SA）** | 三份新规划：① [compliance-plan.md](compliance-plan.md)——等保对标映射表 + 四工作项（C1 本地安全审计日志=等保最大缺口且是 C2 数据源；C2 分层上传同意体系=T1 AI 内容/T2 崩溃日志/T3 统计，transport 单通道门控、版本化同意、撤回即停、隔离部署整体禁用变量；C3 会话锁定+剩余信息；C4 SM3；C5 SM4/OFD 待业务决策）；② [i18n-typography-plan.md](i18n-typography-plan.md)——多语言引擎分层定案：**不按语言拆引擎**（成形=Chromium 内建、断行=Intl.Segmenter 内建、排版模型 <30KB 常驻、字体走既有 CDN 按需），工作项 IL1 SEA 断行移植（修真 bug）/IL2 RTL 审计/IL4 字体链，挂 **M6**；③ asset-center-plan.md 增 **SA1 印章边缘检测**（HSV 印泥色域→连通域→外接矩形→形状判定→mm 定标，纯 JS，夹具现成）+SA2 印章素材库 |
| 2026-09-02 | **T6 收口：line-break 选型一致性三方探针验证（待续项关闭）** | T6 首刀遗留的「悬挂/挤压两种行尾策略与编辑画布 `line-break` 选型的一致性校验」以实测收口：**Playwright 探针**（临时脚本）在 bundled Noto Sans CJK SC、lang=zh-CN、100px 字号下验证——① `一二三`@250px 逐字折行（基线 ✓）；② `ab六c`@200px 在 `line-break:auto/strict/loose` 三档下**都在汉字\|拉丁边界折行**（UAX#14 边界，strict 也不禁）；③ `abc`@100px Latin 词不内断（溢出）。**三方对照结论**：画布默认 CSS（无 line-break 覆盖=auto）允许汉字\|拉丁断点 = pptx-render token 流语义（wideChar 逐字 token、Latin 连续 buf 一个不可断 token）= simulateLines 新行为（autospace pad 刀修正的 `ab六c。` 折行）。**选型定案：无需设置 line-break:strict/loose，默认 auto 即三方一致**；上一刀更新的测试期望就是 Blink 真行为。悬挂/挤压行尾策略现状（悬挂溢出）与画布一致（画布折行走 UAX#14，无 kinsoku 拉下——Word 默认也允许行尾标点悬挂，模型拉下仅在 prevent 标记路径），一致性成立。T6 待续项全部清零 |
| 2026-09-04 | **M6/IL1：SEA 词典断词移植 simulateLines（真 bug 修复）** | 泰/老/高棉/缅文无词间空格，simulateLines 的词缓冲把整段 SEA 当**一个不可断词**、超宽按字符硬折——与浏览器断行完全不符。修复：`flushWord` 检测 SEA 缓冲（`SEA_RE` = 泰+老 U+0E00–0EFF / 缅 U+1000–109F / 高棉 U+1780–17FF，**对齐 pptx-render text-layout 同款常量**——首刀抄漏泰文块被新测试当场抓住）后经 `Intl.Segmenter`（word 粒度，V8 内建零字节）切词典词，逐词重入 flush（递归深度 1）；**无进展防护**：Segmenter 不再细分的单一 segment（如 `การA` 泰-拉丁混排整段返回）直接按不可断词 flush，否则无限递归（测试以栈溢出形态抓住）。7 个测试（`line-break-sea.test.ts`）：词典词往返、词界折行 vs 旧硬折、分段 parity 属性断言、超长单词回退硬折、CJK 相邻整词保持、泰-拉丁混排单 segment 语义、四文种正则。布局 4 套 168 绿 + 全工作区 7904/0（含一轮 docs 并行 flake 复核）+ tsc 0。**M6 余项**：IL2 RTL 审计、IL4 字体链（IL3 条件项未触发） |
| 2026-09-04 | **M6/IL2：RTL 专项审计收口** | 全链路清单化（[rtl-audit.md](rtl-audit.md)）：docx 三层（段落 w:bidi 逻辑 jc 翻转/run w:rtl+Cs 双生子/表格 bidiVisual/节 bidi）、docs 画布（dir=auto 推断+Ribbon 切换+表格镜像+分页 RTL 分栏）、sheets（rightToLeft 全表镜像+readingOrder 携带）、pptx UAX#9 重排——**存量均已在位**。唯一真缺口：pptx 段落 `a:pPr rtl="1"` 不解析不写回（types 注释旧称"生成内容专用"），阿语 PPTX 首强推断错判拉丁开头段落的基方向且再保存 rtl 蒸发。四刀修复：parse→`Paragraph.rtl`+`pPrExplicit.rtl`、generate 写回 `want('rtl')` 门控、text-layout 显式基级（`paraBaseRtl` 优先 + `applyBidi` explicitDirection + `TextLine.rtl`）、slides TextEditOverlay 显式 rtl 行 `dir=rtl`+右对齐默认（编辑态=画布态）。11 新测试（含中性字符基级判别——阿文 run 在两基向下都是奇数级，区分点在 trailing neutrals）；pptx-engine 778、pptx-render 230、slides 578 全绿，三侧 tsc 0。取舍 4 条记录（run 级嵌入/显式 readingOrder 渲染/rtlGutter/占位符链 rtl）**M6 余项**：IL4 字体链（IL3 条件项未触发） |
| 2026-09-04 | **M6/IL4：Thai/Devanagari/Hebrew 字体链 + 打包子集（西里尔确认已覆盖）** | **盘点**：阿文（Naskh/Sans 子集+四别名+probe 因子）与 Tamil（Latha 校准）已闭环；泰/梵/希伯来声明缺链——穿到未知西文名尾链（Cambria/Chromium 静默回退），模型与画布对真实替代面双双失据。macOS 实测（system_profiler）：Thonburi/Sukhumvit/Ayuthaya（泰）、Devanagari Sangam MN/Kohinoor/ITF（梵）、希伯来无专用衬线面（TNR 带 Hebrew——与阿文 naskh 同款整体替代模式）。**实现**：① 三个 Noto 子集（pyftsubset，script 块+U+0020-024F+U+2000-206F，`--layout-features='*'` 保 shaping，仅字形/advance 不动故保留 Noto 名——OFL RFN 不适用；无拉丁字母，拉丁走链）；② `cssFontFamily` 三检测分支（文种名+Unicode 字符名双路）：泰 `[declared, Noto Sans Thai, Thonburi]`、梵 `[declared, Noto Sans Devanagari, Sangam/Kohinoor/ITF]`、希伯来 `[declared, Times New Roman, Liberation Serif, Noto Sans Hebrew]`（Word 对缺失希伯来面整体替代 TNR，Win/mac TNR 均带希伯来，子集垫 Linux）；③ **Tahoma 泰文尾巴**（泰文文档最常见声明，mac 缺 Tahoma 时把泰文码点钉进子集而非 Chromium 静默回退，Tahoma 自身覆盖的字形不受影响）；④ BUNDLED_FONTS 注册 + fonts.css @font-face。**西里尔结论**：Liberation Serif/Sans、Carlito、Caladea 全带西里尔+希腊字形（metric-compatible Latin 链三平台通用），无需新链，矩阵语料锁定即可。font-chain-matrix 新增 3 语料组 22 面、三平台快照再生（win32 逐字验链头、linux 验 bundled 尾）。**债务**：替代面行高因子（Thonburi/Sangam 等）无 Word 探针值，随 T2 断言程序；CDN font-catalog 补 Noto 三家属 A3 镜像运营方（生成脚本不在仓库，sha256 需真文件）。字体/布局 10 套件 203 绿 + docs tsc 0。**M6 全部本地项收口**（IL1/IL2/IL4 完成，IL3 条件项未触发；IL5 拼写词典独立项） |

## 一、基线盘点：已经有什么

### 1.1 对我们有利的技术事实

- **Chromium 渲染全平台一致**：Blink 断行、HarfBuzz shaping、CSS 行为在三个平台是同一引擎——排版「逻辑层」（度量模型、禁则、挤压算法、分页模拟）天然平台无关，平台差异几乎全部集中在**字体资产**与**系统集成**。
- **打包三平台配置齐全**（`apps/shell/electron-builder.cjs`）：`dist:mac` / `dist:win` / `dist:linux` 根脚本就绪；NSIS x64（sidecar 交叉编译 `x86_64-pc-windows-gnu`）、AppImage/deb/rpm（desktop 入口、hicolor 图标集、deb/rpm 包名与升级谱系都已修正）、文件关联九种扩展、更新 feed（generic provider，`latest.yml`/`latest-mac.yml`）。
- **系统 OCR 双平台已继承**：mac Vision（swiftc 编译 universal，构建时按需编译）、Windows `Windows.Media.Ocr`（in-box .NET csc 编译，`packages/pdf2docx/ocr-helper/build-win.mjs` + smoke 测试）。Linux 无系统 OCR → bitmap 降级。
- **字体资产平台无关基座已存在**：`apps/docs/src/renderer/fonts/fonts.css` 69 个 `@font-face`（Carlito/Caladea/Liberation metric 别名 + Noto CJK GB2312 子集 + `GenOffice *` local() 别名），任何平台都能兜底出正确行宽。
- **字体下载目录机制已就绪**：`GENOFFICE_FONT_CDN_URL` 注入 → slides 字体管理器可提示下载缺字体——这是「方正/汉仪授权字体」商业线的现成接入点。
- **CI 已有**：`.github/workflows/ci.yml`（单测 + 兼容门禁 + Linux E2E）。

### 1.2 真实的缺口

| 缺口 | 说明 |
| --- | --- |
| CI 失配 | ci.yml 仍用 `npm ci` + `package-lock.json`（上游遗留），与本仓 pnpm 工作区漂移；且只有 ubuntu 作业，无 Windows/macOS 测试 |
| 无 Windows/macOS 构建发布作业 | `dist:win`/`dist:linux` 只有本机手跑路径；CI 矩阵、签名、发布流水线未接（mac notarize 配置在但证书未接；win NSIS 无签名配置） |
| 排版层零平台感知 | `line-metrics.ts`/`doc-style-css.ts` 无一处 `process.platform`；字体替换链、行高因子全部隐含「mac Word probe」基线 |
| 无 Windows/Linux 行高与替换基线 | 现有 probe 值是 mac Word 的渲染行为（含 Word for Mac 对缺失字体的 wholesale 替换规则）；Windows 上真 SimSun/YaHei 原生存在、Linux 上全缺，行为分叉没有数据 |
| Linux OCR 缺位 | 仅 bitmap 降级（对应规划 Phase 1 的「PDF Linux OCR」） |
| 信创/aarch64 未动 | electron-builder 仅 x64；arm64 Linux（鲲鹏/飞腾）需要交叉编译链 |

## 二、中文排版引擎层 × 三平台矩阵

**设计原则：度量/分页/禁则/挤压的算法模型平台无关；字体解析（cssFontFamily、行高因子）按平台特化，用「平台 × 字体环境」快照测试锁住。**

### 2.1 三平台中文字体资产

| 字体 | Windows | macOS | Linux（默认） |
| --- | --- | --- | --- |
| 宋体 SimSun / 新宋体 | ✅ 系统自带 | ❌ → 现有替换链 | ❌ → bundled 宋体子集 |
| 黑体 SimHei / 微软雅黑 / 等线 | ✅（雅黑/等线随系统） | ❌ → PingFang 链 | ❌ → Noto Sans CJK |
| 楷体 KaiTi / 仿宋 FangSong | ✅（简体中文语言包） | ❌ → STKaiti/STFangsong | ❌（Fandol/WenQuanYi 不可依赖） |
| 繁体 PMingLiU / 微軟正黑體 | ✅（繁体语言包） | ❌ → Songti TC/PingFang TC 链 | ❌ |
| Noto/思源 CJK | 少见 | 少见 | ⭕ 用户常装（但不可假设） |

推论：**Windows 是「字面命中」平台**（声明什么用什么，替换链基本不触发），**macOS 是「替换」平台**（现状已打磨），**Linux 是「兜底」平台**（全靠 bundled 子集 + metric 别名）。当前代码把 mac 的替换链当成了唯一路径——Windows 上 `SimSun → GenOffice Songti SC` 这类映射反而**劣化**（放着真 SimSun 不用）。

### 2.2 排版任务清单

- **T1 字体可用性矩阵测试基建**：三平台 ×（无中文语言包 / 有语言包 / 装 Office）的 `isFontAvailable` + `cssFontFamily` 快照断言表；Linux 特别验证 canvas 探测不受 fontconfig 别名干扰。
- **T2 Windows 行高基线**：现有 `lineHeightFactor` 的 probe 值是 mac Word 行为（Windows 上真 SimSun/YaHei 的 Win metrics 可能不同）。用 **PowerShell + Word COM 自动化**复刻 mac 的批量 probe 法（同一批 docx 样本 → Windows Word 转 PDF → 测基线行距），产出 `windows` 平台因子表。
- **T3 Linux 度量基线**：用 opentype.js 直接读 bundled 子集的真实 metrics 作为 Linux 因子来源（不依赖系统字体存在性）；fontconfig 匹配探底（`fc-match` 行为、合成加粗）。
- **T4 平台分派层**（第一刀已落地）：`font-platform.ts` seam（`fontPlatform()` / `setFontPlatform()` / `WINDOWS_NATIVE_FONTS`）；`cssFontFamily` 的 cjkVariant 分支已分派——darwin wholesale 替换不变，win32/linux 字面链头 + 声明类。**待续**：行高因子分派（T2 Windows probe / T3 opentype 基线到位后）、其余替换分支（KR PANOSE/altName 路径）按快照差异逐支分派。
- **T5 标点挤压（跨平台统一方案）**：`font-feature-settings 'halt'/'chws'` 依赖字体 OpenType 特性表——Windows SimSun 没有、我们 bundled 的子集可以预置。统一采用「**测量侧挤压模型**（simulateLines 的 measure 扣减半宽）+ **渲染侧 span margin 微调**」平台无关方案；bundled 子集补 halt 作为 Linux 加速路径。
- **T6 避头尾**：Blink 断行三平台一致 → 编辑画布 CSS 策略一次到位（`line-break` 选型）；离线分页 `simulateLines` 移植 pptx-render 的 KINSOKU 集（纯 JS，平台无关）。
- **T7 中文路径与编码审计**（Windows 特有）：文件关联 argv 编码、最近文件/自动保存的中文路径、NTFS 大小写、路径长度上限——沿 shell/sheets 的 22 处 `process.platform` 分叉走查。

## 三、平台 bring-up（非排版）

### 3.1 Windows（W 线）

- **W1 fork CI 修复** ✅：ci.yml 切到 pnpm（`pnpm/action-setup` + `pnpm install --frozen-lockfile` + GitHub cache 存 store）；package-lock.json **保留**——`tools/check-licenses.mjs` / `gen-third-party-notices.mjs` 以它为依赖清单（upstream-sync.md 的并存政策），依赖增删后用 `npm install --package-lock-only --ignore-scripts` 刷新。
- **W2 Windows 测试作业**：`windows-latest` 跑 typecheck + 单测（Rust sidecar 走 GNU 工具链，与打包一致）；E2E 可选开。
- **W3 Windows 构建发布**：CI 作业跑 `dist:win`（自动编译 win-ocr、cargo 交叉 sidecar）；**签名选型**（见 §五）；electron-updater NSIS feed（`latest.yml`）接到 CatOffice 更新 CDN。
- **W4 安装体验**：NSIS 已是 assisted 模式（可选目录）；补充中文安装语言、卸载残留清理。

### 3.2 Linux（L 线）

- **L1 Linux 测试/E2E**：已有（ubuntu-22.04 + AppArmor sysctl 规避）✓，W1 的 pnpm 化同样适用。
- **L2 Linux 构建发布**：CI 作业跑 `dist:linux`（`apt install rpm` 补 rpmbuild）；AppImage + deb 走更新 feed，rpm 仅 Release 附件（配置已如此）；**arm64 目标**（`--arm64` + cargo `aarch64-unknown-linux-gnu` 交叉链）——信创线（规划 §3 政务/国企）的前置。
- **L3 Linux OCR 路线决策**：① bitmap 降级（现状）；② 对接 CatSpark 云 OCR（自研后端线，零本地体积）；③ 本地 PaddleOCR/Tesseract（体积/授权/效果权衡）。建议先 ② 后 ③。
- **L4 桌面集成走查**：Wayland/X11（`--ozone-platform`）、全局菜单缺失时的菜单可达性、托盘、`chrome-sandbox` SUID 与 AppImage 打包的组合。

### 3.3 macOS（M 线，收尾性质）

- **M1 签名与公证接入**：Developer ID 证书 + notarization（`notarize: true` 已配，缺证书与 CI secrets）；`GENOFFICE_MAC_X64=1` Intel 双包开关已留。
- **M2 公证/更新流水线**：`afterAllArtifactBuild` 的 notarize-dmg.js 接 CI；`latest-mac.yml` 进 CDN。

## 四、开发顺序（里程碑）

| 里程碑 | 内容 | 任务 | 量级 |
| --- | --- | --- | --- |
| **M1 跨平台门禁** | CI pnpm 化 + Windows 测试作业 + 字体矩阵测试基建 | W1 W2 T1 | 1–2 周 |
| **M2 Windows 主战场** | Windows 行高基线 + 平台分派层 + Windows 构建签名发布 | T2 T4 T7 W3 W4 | 2–3 周 |
| **M3 Linux 兜底** | Linux 度量基线 + 构建发布 + OCR 路线落地 | T3 L2 L3 L4 | 2 周 |
| **M4 中文排版硬骨头** | 标点挤压 + 避头尾（平台无关算法，一次写三平台受益） | T5 T6 | 3–4 周 |
| **M5 公文版式** | GB/T 9704 版心/红头/发文字号（依赖 M2 的字符缩进与 M4 的挤压/禁则） | 规划 P1 项 | 3–4 周 |
| **M6 国际化排版** | SEA 词典分词（Intl.Segmenter）/RTL 审计/多语言字体链——引擎分层：成形与分词用 Chromium/V8 内建（零字节），排版模型常驻，字体按需下载 | IL1–IL4，详见 [i18n-typography-plan.md](i18n-typography-plan.md) | 2–3 周 |
| **并行线** | mac 签名（M1 线）、方正/汉仪授权字体（商务谈判 + slides 字体目录供 CDN） | M1' 商务线 | 持续 |

排序理由：**先让「跨平台不被破坏」变成 CI 门禁（M1），再把资源砸向用户量最大的 Windows（M2）**；Linux 体量小但信创线有战略价值，度量兜底方案（bundled 子集）恰好也是离线部署/信创隔离环境的方案，一次投入两处收益；标点挤压/避头尾是纯算法（M4）放在平台基线稳定之后做，避免基线漂移返工。

## 五、技术选型清单

| 事项 | 选型 | 备注 |
| --- | --- | --- |
| CI 矩阵 | GitHub Actions：`ubuntu-22.04`（现状）+ `windows-latest` + `macos-14` | E2E 三平台可配 `continue-on-error` 起步 |
| pnpm CI | `pnpm/action-setup` + `actions/setup-node` cache `pnpm` | store 缓存键含 lockfile hash |
| Windows 签名 | 首选 **Azure Trusted Signing**（按月计费、CI 友好、无需实物 USB）；备选 SSL.com eSigner；EV USB 硬件钥最后 | 国内团队主体资质需提前确认 |
| Windows probe | PowerShell + Word COM（`Documents.Open` → 导出 PDF → 解析基线） | 复刻 mac 批量 probe 法，同一批 docx 样本保证可比 |
| Linux arm64 交叉 | cargo `aarch64-unknown-linux-gnu` + `CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER`（aarch64-linux-gnu-gcc）；electron-builder `--arm64` | CI 用 ubuntu-x64 交叉，或 arm64 自托管 runner |
| Linux OCR | 近线：CatSpark 云 OCR 接口（mock 已留缝）；远线：PaddleOCR PP-OCRv5（onnxruntime，约几十 MB） | 避开系统 tesseract 的中文质量坑 |
| 挤压渲染 | 测量侧 JS 模型 + 渲染侧 span margin；bundled 子集预置 `halt` 特性 | Chromium `text-spacing-trim` 尚未稳定，不押注 |
| 字体分发 | 既有 `GENOFFICE_FONT_CDN_URL` 目录机制 + fonts.css 子集基座 | 授权字体走 CDN 目录按需下载，不进安装包 |
| 度量兜底 | opentype.js 读 bundled 子集真实 metrics（OpentypeMetrics 类接口已就绪） | Linux/信创环境「零系统字体」也成立 |

## 六、验收口径

1. **M1**：PR 门禁在三个平台都跑 typecheck/单测；三平台字体矩阵快照测试入库。
2. **M2**：Windows 无中文语言包机器上打开 GB2312 子集文档，行宽/行高与 Windows Word 差距 ≤ 既有 mac 口径；签名后的 NSIS 包 SmartScreen 无告警（信誉积累期除外）；`latest.yml` 自动更新可走通。
3. **M3**：裸 Linux（无中文字体）打开中文 docx 不出豆腐、分页与 bundled 度量一致；arm64 deb 可安装运行。
4. **M4**：同一段中文文本在模拟分页、Chromium 渲染、Windows Word 三者的换行位置逐行一致（黄金语料 ≥ 20 篇）。
