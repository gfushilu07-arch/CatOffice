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
