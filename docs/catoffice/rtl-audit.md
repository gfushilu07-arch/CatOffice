# IL2 RTL 专项审计（2026-09-04）

审计目标（[i18n-typography-plan.md](i18n-typography-plan.md) IL2）：w:bidi 的
解析/保存/画布渲染/对齐翻转/混合方向 run 清单化，缺口再修。验收口径②：
阿拉伯语文档打开时段落方向、对齐、混合方向 run 的显示与 Word 一致。

## 一、现状盘点（存量比规划预期厚实）

### docx（引擎 + docs 画布）

| 层 | 位置 | 现状 |
| --- | --- | --- |
| 段落 w:bidi | docx-engine `parse.ts`/`generate.ts`/`patch.ts` | ✅ 解析/生成/外科补丁全保留；**Word 逻辑 jc 配额已实现**（bidi 段落里 w:jc left/right 是逻辑 start/end，读入转视觉、写回再翻转） |
| run w:rtl | docx-engine `parse.ts:4108` | ✅ 解析为 run.rtl；**Cs 双生子选择已实现**（rtl run 读 w:bCs/w:iCs/w:szCs 无回退——Word for Mac 探针实测语义），样式链继承（段样式→run） |
| 表格 w:bidiVisual | docx-engine `parse.ts:4684` | ✅ 解析 + generate 保留表 |
| 节 w:bidi | docx-engine `section.ts:117,330` | ✅ sectPr 层解析/保存（分栏视觉序） |
| 画布段落方向 | docs `editor/direction.ts` | ✅ dir=auto 首强字符推断（`bidiInferred`，仅渲染不写回）；显式 w:bidi → `direction:rtl` + `unicode-bidi:isolate`（extensions.ts:433） |
| 对齐翻转 | docs `direction.ts` `alignAttrFor` | ✅ align 存视觉值：RTL 段 null=右（start），显式翻转时 left/right 对调保持逻辑对齐 |
| Ribbon UI | docs `Ribbon.tsx:3482` | ✅ LTR/RTL 切换按钮 + 激活态（含 bidiInferred） |
| 表格 bidiVisual 画布 | docs `extensions.ts:1768`、`protected-render.ts:1357` | ✅ `dir="rtl"` 镜像列序，且**单元格文本不被重排** |
| 分页 RTL 分栏 | docs `pagination.ts:1323` | ✅ 节级 bidi 多栏从右往左填充（纯视觉镜像，引擎索引保持逻辑） |
| 混合方向 run | docs 画布 | ✅（按浏览器原生 UAX#9 重排；run 的 cs 标志驱动 Cs 字体槽选择——见「已接受取舍」#1） |

### pptx（引擎 + slides）

| 层 | 位置 | 现状 |
| --- | --- | --- |
| UAX#9 重排 | pptx-render `text-layout.ts` `applyBidi` | ✅ bidi-js 嵌入级别 → token 级切分 → 折行逻辑序、行内视觉重排（L2） |
| 基方向推断 | `paraBaseRtl` | ✅ 首强字符推断；RTL 段无显式对齐时默认右对齐（只进布局几何，不写回 TextLine.align） |
| run 级方向 | render-tree GlyphRun.rtl → konva `direction` | ✅ 奇数级 run 标 rtl，渲染器逐 run 设 canvas direction |
| 表格 tblPr rtl | pptx-engine `parse.ts:2712`、build-slide | ✅ 镜像网格（逻辑列 1 渲染在最右）+ 边框左右对调 |
| 段落 a:pPr rtl | pptx-engine | ❌ **本审计发现的主缺口（已修，见二）** |

### xlsx / pdf

| 层 | 现状 |
| --- | --- |
| 工作表 rightToLeft | ✅ sheetView rightToLeft="1" 全表镜像（sheets `rtl-grid-mirror.ts`：A 列在右、行号列在左） |
| 单元格 readingOrder | ✅ 样式携带 round-trip（xlsx-alignment-carry 测试）；渲染层 Univer 不消费显式值（见「已接受取舍」#2） |

## 二、本审计修复的主缺口：pptx 段落 a:pPr rtl="1" 全链路

**Bug**：`parseParagraph` 完全不读 `pPr['@_rtl']`（types.ts 旧注释直言
"generated content only (pdf2pptx)"），而 generate 侧会写 `rtl="1"`。后果：
阿拉伯文 PPTX 打开 → 段落显式基方向丢失，交给首强字符推断——以拉丁/数字
开头的段落（阿语幻灯片里的品牌名、编号标题）基方向错判为 LTR，默认对齐与
中性字符（标点、空白）解析全部偏差；**再保存时 rtl="1" 静默蒸发**。

修复（三刀）：

1. **parse**（pptx-engine）：`pPr['@_rtl'] === '1'|'true'` → `Paragraph.rtl`
   + `pPrExplicit.rtl`（外科重建路径保真语义）。
2. **generate**：`rtl="1"` 写回加 `want('rtl')` 门控（重建只写显式项，与
   algn/marL 同规矩；pdf2pptx 生成路径无 pPrExplicit，行为不变）。
3. **render**（pptx-render text-layout）：`paraBaseRtl` 显式 rtl 直接优先
   （显式 rtl 的本义就是覆盖文本长相）；`applyBidi` 以段落基方向作
   `getEmbeddingLevels` 的 `explicitDirection`（拉丁开头也保持 RTL 基级）；
   `TextLine` 新增 `rtl`（编辑器覆盖层消费）。
4. **slides 编辑覆盖层**（TextEditOverlay）：显式 rtl 行 `dir="rtl"` 替代
   `dir="auto"`，无显式对齐时补 textAlign right——编辑态与画布一致
   （推断型段落仍走 dir=auto，浏览器原生语义不变）。

测试：pptx-engine `paragraph-rtl.test.ts` 6 个（rtl="1"/"true" 解析、
pPrExplicit、无 rtl 不污染、generate 写回、外科补丁保留、非显式不注入）；
pptx-render `text-layout.test.ts` 新增 5 个（显式 rtl 默认右对齐几何、
TextLine.rtl 标记、无 rtl 保持左对齐、首强推断路径、显式 rtl 覆盖首强推断
的中性字符基级判别、显式 align 优先）。pptx-engine 778/778、pptx-render
230/230、slides tsc 0。

## 三、已接受取舍（记录，不做）

1. **docs 画布 run 级 w:rtl 的视觉嵌入**：Word 的 run 级 rtl 给 run 加一个
   RTL 嵌入级，主要影响弱方向字符（纯数字/标点 run）的解析。画布依赖浏览器
   原生 UAX#9（真实文本必然有强方向字符），cs 标志已正确驱动 Cs 字体槽；
   为弱字符 run 加 `unicode-bidi:embed` 会改变存量文档渲染，风险大于收益。
2. **sheets 单元格显式 readingOrder 渲染**：样式已 round-trip；Univer 骨架
   不消费该值。影响面 = 强制 readingOrder=2 的纯 LTR 文本单元格（罕见），
   依赖上游。
3. **w:rtlGutter（节级装订线在右）**：引擎连 w:gutter 都未建模（静态 0），
   单独建模 rtlGutter 无意义，随未来 gutter 需求一并做。
4. **占位符链继承 rtl**：版式/母版占位符段落的 rtl 不沿 phChain 合并
   （PowerPoint 实际会在每段写 rtl，实测影响面趋零）。

## 四、结论

验收口径②在 docx/pptx 两条线上达成：段落方向（显式 + 推断）、对齐
（逻辑/视觉翻转 + 默认右对齐）、混合方向 run（原生 UAX#9 + Cs 字体槽 +
逐 run direction）三层齐备。IL2 收口；i18n 排版余项 IL4 字体链
（IL3 条件项未触发）。
