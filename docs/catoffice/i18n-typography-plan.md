# 国际化排版开发方案（多语言引擎分层与动态加载）

> 状态：**规划**。目标：一份文档里混排多语言（中文为主，混入英/日/韩/泰/
> 阿/印地等）时，断行、成形、测量、字体四层全部正确——且默认安装只为
> 常用语言付出体积。回答核心架构问题：**语言相关的"引擎"哪些常驻、哪些
> 动态加载**。

## 一、分层架构：引擎归属与加载策略

关键认知：**渲染成形不需要我们造引擎**。docs 的画布就是 Chromium——
Arabic 连写、Indic 元音附标、泰文组合标记全部由 Blink 内建 HarfBuzz 原生
正确成形。我们真正的工程面只有四个，逐层盘点：

| 层 | 干什么 | 引擎归属 | 加载策略 | 现状 |
| --- | --- | --- | --- | --- |
| ① 成形（shaping） | 字符 → 字形（连写/附标/组合标记） | **Chromium 内建**（Blink+HarfBuzz） | 常驻，零成本 | ✅ 已正确 |
| ② 断行（line breaking） | 在哪能折行：CJK 逐字 / Latin 空格 / **泰语等按词典** / 阿拉伯按词 | **`Intl.Segmenter`（V8 内建）** + 自研模型 | Segmenter 零字节常驻；自研模型 <20KB 常驻 | ⚠️ 见 IL1 |
| ③ 排版模型 | 禁则/标点挤压/autospace/行高因子 | 自研纯 JS（kinsoku / punctuation-squeeze / line-metrics） | 常驻（总计 <30KB，全语言共用） | ✅ CJK 已闭环 |
| ④ 字体 | 每种语言的字形来源 | Noto 等开源字体 + 系统 | **按需下载**（既有 CDN 目录机制） | ⚠️ 覆盖面见 IL4 |

**结论（对动态加载问题的直接回答）**：不按语言拆"引擎"。成形和分词是
Chromium/V8 内建能力，零字节；排版模型是小体积纯 JS、全语言共用一份。
真正大的东西只有**资产**（字体文件、拼写词典），而字体已经走 CDN 目录
按需下载的既有机制。默认安装只为 CJK+Latin 付体积；泰文/阿文文档**开箱
即正确断行成形**（Segmenter 内建），用户用到该语言时才下载对应字体。
可选懒加载项只有一个：harfbuzzjs wasm（见 IL3，仅在测量漂移被实测证实
后才引入）。

## 二、现状盘点（已有什么）

- **script 检测**：pdf2docx `script.ts`（`scriptOf`/`isEastAsianScript`）完整；
  docs/pptx 共用。
- **CJK 三件套**：禁则（kinsoku 共享模块）、标点挤压（双侧+文档级开关）、
  autospace（画布+分页模型一致）——已在 M4 闭环。
- **Latin**：空格断词、字体链、行高因子（Word probe 表）。
- **Korean**：keep-all 断行（Hangul 段落）、krLineFactor。
- **pptx 断行已用 `Intl.Segmenter`**：text-layout 对南亚语（泰/老/高棉）
  做 ICU 词典分词（`WORD_SEG`，V8 内建、零依赖）。
- **RTL 零件**：docs 渲染器已带 `bidi-js`；pdf2docx 有 RTL 段落属性；
  pptx 有 rtl 段落标记。

## 三、分期

| 项 | 内容 | 说明 |
| --- | --- | --- |
| **IL1** | **SEA 断行移植**：simulateLines 的词缓冲对泰/老/高棉/缅文走 `Intl.Segmenter`（word 粒度），与 pptx-render 同语义 | 修真 bug：现状整段 non-CJK 当一个不可断词、超宽硬折。工程量小（参照现成实现）。**✅ 已完成（2026-09-04，3d4b473）**：`SEA_RE` 对齐 pptx-render + 无进展防护（单一 segment 不重入）；7 专项测试，全工作区绿。验收① 的画布↔模型 parity 语料仍待续（画布断行为 Chromium ICU，预期一致、探针未做） |
| **IL2** | **RTL 专项审计**：w:bidi 的解析/保存/画布渲染/对齐翻转/混合方向 run 清单化，缺口再修 | 审计先行——RTL 做错是可见 bug 级，但出现频率待评估。**✅ 已完成（2026-09-04，[rtl-audit.md](rtl-audit.md)）**：存量盘点（docx 三层+画布+分页/sheets 镜像/pptx UAX#9 均已在位）；主缺口 = pptx 段落 `a:pPr rtl="1"` 不解析不写回（阿语 PPTX 基方向丢失+再保存蒸发）已四刀修复（parse/generate 门控/paraBaseRtl+applyBidi 显式基级/TextEditOverlay），取舍项 4 条记录在案 |
| **IL3** | **测量一致性验证**（条件项）：复杂脚本文档若出现画布 vs 模型的行高/宽度漂移，再移植 slides 的 harfbuzzjs shaped-measure（动态 import） | 先测量后引入——Chromium 是渲染真值，可能不需要 |
| **IL4** | **字体链梳理**：阿文/泰文/天城文/西里尔在各 OS 的回退链 + CDN 目录补充对应 Noto 子集 | 并入 T4 分派体系；新语料进 font-chain-matrix 快照 |
| **IL5** | **拼写词典按需下载**（可选）：hunsehun 词典复用字体 CDN 目录机制 | 独立功能项，非排版正确性必需 |

## 四、验收口径

1. 泰文段落（无空格）在离线分页模型的断行与画布 Chromium 实际折行逐行
   一致（IL1 后新增 parity 语料）。
2. 阿拉伯语文档打开：段落方向、对齐、混合方向 run 的显示与 Word 一致
   （IL2 审计报告定义细则）。
3. 默认安装体积不因多语言支持增长（字体全部走按需）；泰/阿文档首开
   只触发对应字体目录提示，不触发任何"引擎下载"。
4. 既有 CJK/Latin/Korean 排版测试（punctuation-squeeze/kinsoku/parity）
   全绿不回归。

## 五、与其他文档的关系

- CJK 排版既有闭环与平台分派：[cross-platform-plan.md](cross-platform-plan.md)
  （本方案挂其里程碑 **M6 国际化排版**，IL1–IL4）。
- 字体目录机制：`GENOFFICE_FONT_CDN_URL`（README 与 font-list）。
- SEA 分词的现成参照：`packages/pptx-render/src/text-layout.ts` 的
  `WORD_SEG` 分支。
