/**
 * Merged dictionary entry (upstream-sync principle 3): the upstream
 * `strings.ts` stays byte-identical to the GenOffice snapshot, and this fork
 * entry spreads the brand overrides (strings-brand.ts) LAST per language, so
 * the rebranded values win while every other key passes through untouched.
 * A shallow per-language merge — upstream may restructure its own
 * dictionaries freely without touching this file.
 */
import type { Lang } from '@genoffice/i18n'
import { strings as upstream } from './strings'
import { brandStrings } from './strings-brand'

export const strings = Object.fromEntries(
  (Object.entries(upstream) as Array<[Lang, (typeof upstream)[Lang]]>).map(
    ([lang, dict]) => [lang, { ...dict, ...brandStrings[lang] }],
  ),
) as typeof upstream
