import JSZip from 'jszip'

/**
 * Minimal but valid OOXML spreadsheet writer for the golden corpus. Same
 * philosophy as docx-engine's tests/helpers/build-docx: hand-rolled XML in a
 * zip, no external xlsx library, so corpus generation is deterministic and
 * dependency-free. Output is readable by calamine (Rust sidecar), IronCalc and
 * file-parse's xlsxToText alike.
 */

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'

export type XlsxCellValue = number | string | boolean

/** a cell that carries a formula plus the cached result readers display */
export interface XlsxFormulaCell {
  formula: string
  cached: XlsxCellValue
}

export type XlsxCell = XlsxCellValue | XlsxFormulaCell | undefined

export interface XlsxSheetSpec {
  name: string
  /** emit strings as t="inlineStr" instead of the shared-strings table */
  inlineStrings?: boolean
  rows: XlsxCell[][]
}

export interface XlsxSpec {
  sheets: XlsxSheetSpec[]
}

const isFormula = (cell: XlsxCell): cell is XlsxFormulaCell =>
  cell !== undefined && typeof cell === 'object'

/** 0 → "A", 25 → "Z", 26 → "AA" */
function columnName(index: number): string {
  let name = ''
  let n = index
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  }
  return name
}

function xmlEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function stringCell(ref: string, text: string, inline: boolean, sharedIndex?: number): string {
  if (inline) {
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`
  }
  return `<c r="${ref}" t="s"><v>${sharedIndex}</v></c>`
}

function valueCell(
  ref: string,
  cell: NonNullable<XlsxCell>,
  strings: Map<string, number>,
  inline: boolean,
): string {
  if (isFormula(cell)) {
    const { formula, cached } = cell
    if (typeof cached === 'string') {
      return `<c r="${ref}" t="str"><f>${xmlEscape(formula)}</f><v>${xmlEscape(cached)}</v></c>`
    }
    if (typeof cached === 'boolean') {
      return `<c r="${ref}" t="b"><f>${xmlEscape(formula)}</f><v>${cached ? 1 : 0}</v></c>`
    }
    return `<c r="${ref}"><f>${xmlEscape(formula)}</f><v>${cached}</v></c>`
  }
  if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`
  if (typeof cell === 'boolean') return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`
  if (inline) return stringCell(ref, cell, true)
  let index = strings.get(cell)
  if (index === undefined) {
    index = strings.size
    strings.set(cell, index)
  }
  return stringCell(ref, cell, false, index)
}

export async function buildXlsx(spec: XlsxSpec): Promise<Uint8Array> {
  const zip = new JSZip()
  const shared = new Map<string, number>()
  const anyShared = spec.sheets.some((sheet) => !sheet.inlineStrings)

  const contentTypes = [
    XML_DECL,
    `<Types xmlns="${CT_NS}">`,
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...spec.sheets.map(
      (_sheet, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    ),
    ...(anyShared
      ? [
          '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
        ]
      : []),
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '</Types>',
  ].join('')
  zip.file('[Content_Types].xml', contentTypes)

  zip.file(
    '_rels/.rels',
    XML_DECL +
      `<Relationships xmlns="${RELS_NS}">` +
      `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/>` +
      '</Relationships>',
  )

  zip.file(
    'xl/workbook.xml',
    XML_DECL +
      `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><sheets>` +
      spec.sheets
        .map(
          (sheet, i) =>
            `<sheet name="${xmlEscape(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        )
        .join('') +
      '</sheets></workbook>',
  )

  const relTargets = spec.sheets
    .map((_sheet, i) => {
      const type = `${NS_R}/worksheet`
      return `<Relationship Id="rId${i + 1}" Type="${type}" Target="worksheets/sheet${i + 1}.xml"/>`
    })
    .join('')
  const extraRels = [
    ...(anyShared
      ? [
          `<Relationship Id="rId${spec.sheets.length + 1}" Type="${NS_R}/sharedStrings" Target="sharedStrings.xml"/>`,
        ]
      : []),
    `<Relationship Id="rId${spec.sheets.length + (anyShared ? 2 : 1)}" Type="${NS_R}/styles" Target="styles.xml"/>`,
  ].join('')
  zip.file(
    'xl/_rels/workbook.xml.rels',
    XML_DECL + `<Relationships xmlns="${RELS_NS}">` + relTargets + extraRels + '</Relationships>',
  )

  spec.sheets.forEach((sheet, sheetIndex) => {
    const lines = spec.sheets[sheetIndex].rows.map((row, rowIndex) => {
      const cells = row
        .map((cell, colIndex) => {
          if (cell === undefined) return ''
          const ref = `${columnName(colIndex)}${rowIndex + 1}`
          return valueCell(ref, cell, shared, sheet.inlineStrings ?? false)
        })
        .filter((xml) => xml !== '')
      return `<row r="${rowIndex + 1}">${cells.join('')}</row>`
    })
    zip.file(
      `xl/worksheets/sheet${sheetIndex + 1}.xml`,
      XML_DECL +
        `<worksheet xmlns="${NS_MAIN}"><sheetData>${lines.join('')}</sheetData></worksheet>`,
    )
  })

  if (anyShared) {
    const entries = [...shared.keys()]
    zip.file(
      'xl/sharedStrings.xml',
      XML_DECL +
        `<sst xmlns="${NS_MAIN}" count="${entries.length}" uniqueCount="${entries.length}">` +
        entries.map((text) => `<si><t xml:space="preserve">${xmlEscape(text)}</t></si>`).join('') +
        '</sst>',
    )
  }

  zip.file(
    'xl/styles.xml',
    XML_DECL +
      `<styleSheet xmlns="${NS_MAIN}">` +
      '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
      '</styleSheet>',
  )

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return new Uint8Array(buffer)
}
