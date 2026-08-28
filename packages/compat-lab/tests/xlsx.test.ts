import { describe, expect, it } from 'vitest'
import { xlsxToText } from '@genoffice/file-parse'
import { buildXlsx } from '../src/helpers/build-xlsx'
import { FORMULAS_XLSX_SPEC, VALUES_XLSX_SPEC } from '../src/helpers/golden-specs'
import { loadGolden } from './helpers/load-golden'

const CASES: Array<[string, typeof VALUES_XLSX_SPEC]> = [
  ['07-values.xlsx', VALUES_XLSX_SPEC],
  ['08-formulas.xlsx', FORMULAS_XLSX_SPEC],
]

describe.each(CASES)('golden xlsx %s', (name, spec) => {
  const golden = loadGolden('xlsx', name)

  it('reads to the committed text expectation', async () => {
    expect(await xlsxToText(golden.bytes)).toBe(golden.expected.text)
  })

  it('rebuilding from the spec agrees with the committed file', async () => {
    const rebuilt = await buildXlsx(spec)
    expect(await xlsxToText(rebuilt)).toBe(golden.expected.text)
  })
})
