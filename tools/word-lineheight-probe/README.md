# Windows Word line-height probe (T2) toolchain

Goal: measure each font family's single-spacing line-height factor on a
**real Windows + Word** machine, to replace/correct the mac-probed values
`lineHeightFactor` currently uses (the data source for T4's win32 dispatch
table).

The mac gap: the factor table in `line-metrics.ts` comes from the mac Word
batch probe — on Windows, real SimSun/YaHei carry different Win metrics
(usWinAscent/Descent) than whatever faces mac Word substitutes, so line
heights may diverge. Only Windows Word can speak for Windows Word.

## Three steps

### 1. Generate the corpus (any machine)

```bash
node tools/word-lineheight-probe/gen-corpus.mjs /tmp/word-probe-corpus
```

Produces 36 `probe_<sizePt>_<slug>.docx` files (18 families x 10.5/12pt —
the Windows-present set: six Simplified-Chinese faces, Traditional, KR, JP,
and the big Office Latin faces). Each probe is ONE paragraph of 24 lines
joined by soft breaks (`<w:br/>`), no paragraph spacing, lines short enough
to never wrap — the measured pitch is pure line advance. Samples verified
through the docx engine (font / size / break count round-trip).

### 2. Collect (Windows + Word machine)

Copy the directory to the Windows box:

```powershell
powershell -ExecutionPolicy Bypass -File collect.ps1 -Corpus C:\path\to\probe-corpus
```

- Word runs hidden via COM automation, opens each docx read-only, walks the
  display lines with `GoTo(wdGoToLine)` recording
  `wdVerticalPositionRelativeToPage` (points), and saves nothing.
- Output: `measurements.json` (carries the OS and Word versions —
  substitution behavior differs by build, so every factor table must name
  its provenance).

### 3. Reduce (any machine)

```bash
node tools/word-lineheight-probe/reduce.mjs /path/to/probe-corpus
```

- factor = median(adjacent line deltas) / fontSizePt; page-break jumps
  (deltas > 3x the median) are discarded before the median.
- Diffed family-by-family against `MAC_FACTORS` (snapshot from
  line-metrics.ts); deltas > 2% get flagged `differs`, and two sizes
  disagreeing by > 2% report a measurement problem.
- Output: `windows-word-factors.json`.

## After the run

Differing families move into T4's win32 dispatch: the `font-platform.ts`
seam is in place, so they hang off a win32 branch of `lineHeightFactor`
(same pattern as the existing `linuxChainFactor`). Families without a
difference keep the mac value (one factor serving both platforms).

## Known limits

- `GoTo(wdGoToLine)` + `wdVerticalPositionRelativeToPage` precision is
  ~0.05pt — plenty for factors >= 1.15 (error well under 0.1%).
- Hidden-window pagination/measurement matches a visible session (Word COM
  layout does not depend on visibility) — validated the same way in the mac
  batch probe.
- Uninstall any font-substitution utility (noMeiryoURL and friends) before
  measuring.
