#!/usr/bin/env node
/**
 * Generate the Windows Word line-height probe corpus (T2).
 *
 * One docx per (font, size): a single paragraph of N identical lines joined
 * by <w:br/> — pure line advance, no paragraph spacing, no wrapping (the
 * runs are short). The collector (collect.ps1) walks the lines with Word's
 * Selection and records the vertical position of each; the reducer
 * (reduce.mjs) turns adjacent differences into the per-family line-height
 * factor and diffs it against the current mac-probed table.
 *
 * Output: one directory of probe_<sizePt>_<fontSlug>.docx files.
 *
 * Run: node tools/word-lineheight-probe/gen-corpus.mjs /path/to/out-dir
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')

/** Windows-present families the renderer cares about (T2 corpus). Slug is the
 * reducer's join key and must match MAC_FACTORS in reduce.mjs. */
const FAMILIES = [
  ['simsun', 'SimSun'],
  ['nsimsun', 'NSimSun'],
  ['simhei', 'SimHei'],
  ['microsoft-yahei', 'Microsoft YaHei'],
  ['kaiti', 'KaiTi'],
  ['fangsong', 'FangSong'],
  ['dengxian', 'DengXian'],
  ['pmingliu', 'PMingLiU'],
  ['mingliu', 'MingLiU'],
  ['dfkai-sb', 'DFKai-SB'],
  ['ms-jhenghei', 'Microsoft JhengHei'],
  ['meiryo', 'Meiryo'],
  ['ms-mincho', 'MS Mincho'],
  ['malgun-gothic', 'Malgun Gothic'],
  ['batang', 'Batang'],
  ['times-new-roman', 'Times New Roman'],
  ['cambria', 'Cambria'],
  ['calibri', 'Calibri'],
]

const SIZES_PT = [10.5, 12]
/** lines per probe: 24 fits one A4 page at 12pt x 1.8 worst-case factor */
const LINES = 24
/** the repeated glyph run per line: CJK cover + digits, short enough to never wrap */
const LINE_TEXT = '永國線測国字A8'

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'

function documentXml(family, sizePt, lines) {
  const sz = Math.round(sizePt * 2).toString()
  let runs = `<w:r><w:rPr>${rPr(family, sz)}</w:rPr><w:t>${LINE_TEXT}</w:t></w:r>`
  for (let i = 1; i < lines; i++) {
    runs += `<w:r><w:rPr>${rPr(family, sz)}</w:rPr><w:br/><w:t>${LINE_TEXT}</w:t></w:r>`
  }
  return (
    XML_DECL +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' +
    '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>' +
    '</w:pPr>' +
    runs +
    '</w:p>' +
    // A4, 1-inch margins (known geometry for the collector's pagination guard)
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' +
    '</w:sectPr></w:body></w:document>'
  )
}

function rPr(family, sz) {
  return (
    `<w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:eastAsia="${family}" w:cs="${family}"/>` +
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`
  )
}

const CONTENT_TYPES =
  XML_DECL +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>'

const RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>'

const DOC_RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'

async function writeProbe(outDir, sizePt, slug, family) {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES)
  zip.file('_rels/.rels', RELS)
  zip.file('word/_rels/document.xml.rels', DOC_RELS)
  zip.file('word/document.xml', documentXml(family, sizePt, LINES))
  const bytes = await zip.generateAsync({ type: 'nodebuffer' })
  const path = join(outDir, `probe_${sizePt}_${slug}.docx`)
  writeFileSync(path, bytes)
  return path
}

const outDir = resolve(process.argv[2] ?? 'probe-corpus')
mkdirSync(outDir, { recursive: true })
let count = 0
for (const sizePt of SIZES_PT) {
  for (const [slug, family] of FAMILIES) {
    await writeProbe(outDir, sizePt, slug, family)
    count++
  }
}
console.log(`wrote ${count} probe docx files to ${outDir}`)
console.log(`next: copy the directory to a Windows box with Word and run collect.ps1`)
