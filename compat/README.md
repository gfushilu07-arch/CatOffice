# Compat Lab — 兼容性黄金语料

确定性验证「我们能读、能写、读写往返不漂移」的语料与门禁。**不依赖 LibreOffice/Excel**，全部门禁进 `pnpm test`（包 `@catoffice/compat-lab`，20 个用例）。

## 布局

```
compat/golden/
  docx/  01-simple.docx        标题+段落（含中文）
         02-tables.docx        表格+嵌套表格
         03-rich.docx          项目符号/编号列表+图片+OMML 数学
         04-kitchen-sink.docx  上游全要素夹具
  pptx/  05-standard-business.pptx   多页商务样张（python-pptx 生成，许可证见
         06-unicode-cjk-emoji.pptx    packages/pptx-engine/tests/fixtures/LICENSE-python-pptx.txt）
  xlsx/  07-values.xlsx       共享字符串/数字/布尔/中文/特殊字符/空位补齐
         08-formulas.xlsx      公式+缓存值（数字/字符串/布尔结果）+ inlineStr
  pdf/   09-text.pdf          单页文本
         10-multipage.pdf      三页多页标记
  expectations/               每个文件的期望输出 JSON（text + docx 块类型摘要）
```

## 门禁内容

| 格式 | 读取门禁                                                  | 往返门禁                                                                       |
| ---- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| docx | `docxToText` 等于期望文本；`parseDocx` 块类型摘要等于期望 | —（docx 无整文件重序列化器；写路径由 pdf2docx 与编辑器保存链路各自的测试覆盖） |
| pptx | `pptxToText` 等于期望文本                                 | `openPptx → savePptx →` 重读文本不漂移                                         |
| xlsx | `xlsxToText` 等于期望文本                                 | 按同 spec 重建文件，读取结果与提交版一致（生成器↔读取器契约）                  |
| pdf  | `pdfToText` 等于期望文本                                  | `PDFDocument.load → save →` 重读文本不漂移                                     |

## 何时重建语料

`pnpm --filter @catoffice/compat-lab run golden`

- **上游合并带来引擎读写变化**时：先跑门禁看红，确认是「上游修正」还是「我们回归」，属前者则重建语料并在 PR 说明里引用上游变更；
- **有意增强语料覆盖**（新特性样张）时：改 `packages/compat-lab/scripts/generate-golden.ts`（xlsx 内容改 `src/helpers/golden-specs.ts`），重建并人工审查 expectations diff。

生成文件是提交进仓库的（这正是门禁的意义：语料稳定，变化即信号）。zip 内嵌时间戳导致二进制不必逐字节确定，门禁全部比对**解析后的内容**。

## 有意留白（v1 边界）

- **xlsx 重序列化往返**由 Rust 侧承担：`apps/sheets/native/xlsx-engine/src/convert.rs` 已有 calamine→最小 xlsx 的往返测试（`cargo test`，见 deny/CI 说明）；
- **视觉保真**（渲染像素级）不在 vitest 范围：`tools/fidelity-compare.mjs`（pptx↔LibreOffice/PowerPoint）与 `tools/sheets-fidelity-compare.mjs`（xlsx↔Excel）是独立的重型管线，本机需装参考应用后手工跑；
- 真实世界复杂样本（加密文档、损坏文件、MS Office 特有脏 XML）列为后续扩充方向，逐步以「最小化重现」方式加入。
