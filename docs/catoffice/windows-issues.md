# Windows 平台问题清单（T2/T7/W 线）

> 状态基准：2026-09-02。本文档是 **Windows 专属问题的唯一台账**——每项给出
> 状态（✅已修复 / 🔧代码已备 / ⏳待真机）、证据位置与真机验证步骤。真机运行后
> 把结果回填进「真机验证记录」并同步 cross-platform-plan.md 执行进度表。

## 一、已知问题与状态

### W-1 行高基线差异（T2）⏳待真机（工具链已备）

- **问题**：`lineHeightFactor` 沿用 mac Word probe 值；Windows 真_SIMSun/雅黑
  的 Win metrics（usWinAscent/Descent）与 mac Word 渲染所用替换字体不同，
  行高可能不一致 → 分页漂移。
- **已备**：`tools/word-lineheight-probe/` 三件套（生成 36 探针 docx →
  `collect.ps1` Word COM 采集 → `reduce.mjs` 与 mac 表 diff），合成数据联调通过。
- **真机步骤**：
  1. `node tools/word-lineheight-probe/gen-corpus.mjs D:\probe`
  2. `powershell -ExecutionPolicy Bypass -File tools\word-lineheight-probe\collect.ps1 -Corpus D:\probe`
  3. 拷回 `measurements.json` → `node tools/word-lineheight-probe/reduce.mjs D:\probe`
  4. 差异族（>2%）进 T4 的 win32 分派（`font-platform.ts` seam 已就绪）。

### W-2 中文路径与编码审计（T7）⏳待真机（清单已列）

- **问题**：文件关联 argv 编码、最近文件/自动保存的中文路径、NTFS 大小写、
  路径长度上限——22 处 `process.platform` 分叉未逐一走查。
- **真机步骤**：
  1. `catoffice 'D:\测试 目录\中文 文件.docx'`（argv 传参）
  2. 打开/保存到长路径（>260 字符）与含全角括号/空格路径
  3. 自动恢复副本写到中文 userData 路径后断电重启恢复
  4. `dir /b` 混排大小写文件（NTFS 大小写不敏感）双开同文件
- **修法预案**：argv 用 `process.argv` 原生宽字符（Electron 主进程已是
  UTF-16）；路径长度走 `\\?\` 前缀兜底（按审计结果定）。

### W-3 安装包签名与 SmartScreen（W3）⏳待资质

- **问题**：未签名 NSIS 包触发 SmartScreen 告警；首年信誉积累期除外。
- **选型**（规划已定）：首选 Azure Trusted Signing（按月计费、CI 友好），
  备选 SSL.com eSigner；EV USB 硬件钥最后。
- **阻塞**：主体资质确认。签名参数进 `electron-builder.cjs` 的 win 块
  （azure 配置就位后加 `signtoolOptions`）。

### W-4 test-windows 作业观察期 🔧进行中

- **状态**：CI 已有 `test-windows` 作业（windows-latest：typecheck + 全量
  单测，`continue-on-error: true`）；main 连续两周绿后转为阻断门禁。
- **真机/CI 动作**：关注作业绿率；失败样本回填本节。

### W-5 OCR helper 编码 🔧代码已备

- **状态**：`win-ocr.exe` 由 .NET csc 在打包时编译（`build-win.mjs`），
  协议与 mac Vision 同（PNG stdin → JSON stdout）；本地引擎缺失时自动走
  CatSpark 云 OCR（L3 闭环）。
- **真机步骤**：打包版转换一张中文扫描件 PDF → 验证 helper 启动与识别；
  对照云 OCR 路径。

## 二、与其它文档的关系

- T2 工具链使用说明：`tools/word-lineheight-probe/README.md`
- 行高因子现状：`apps/docs/src/renderer/line-metrics.ts` 的 `lineHeightFactor`
  （Windows 暂用 mac-probed 值，表头注释写明）
- 分页验收口径：cross-platform-plan.md 验收第 4 条

## 三、真机验证记录

（真机运行后填：日期 / 机器 / Windows 版本 / Word 版本 / 各问题结果 / 回归点）
