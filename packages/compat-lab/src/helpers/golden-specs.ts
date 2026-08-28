import type { XlsxSpec } from './build-xlsx'

/**
 * Logical content of the generated xlsx golden files. Single source of truth:
 * scripts/generate-golden.ts materializes these into compat/golden/xlsx/*.xlsx,
 * tests rebuild from the same specs and require the reader output to match.
 */
export const VALUES_XLSX_SPEC: XlsxSpec = {
  sheets: [
    {
      name: 'Values',
      rows: [
        ['Product', undefined, 'Qty', 'Price'],
        ['办公猫笔记本', undefined, 12, 4.5],
        ['Cat & Mouse "Special" <Edition>', undefined, true, false],
        [undefined, 'gap-filler', undefined, undefined],
        ['Tail 锦上添花'],
      ],
    },
  ],
}

export const FORMULAS_XLSX_SPEC: XlsxSpec = {
  sheets: [
    {
      name: 'Formulas',
      inlineStrings: true,
      rows: [
        [10, 20, 30],
        [
          { formula: 'SUM(A1:C1)', cached: 60 },
          { formula: 'A1*2', cached: 20 },
          { formula: 'IF(A1>5,"big","small")', cached: 'big' },
        ],
        [
          { formula: 'A1>100', cached: false },
          'literal',
          { formula: 'CONCATENATE("a","b")', cached: 'ab' },
        ],
      ],
    },
  ],
}
