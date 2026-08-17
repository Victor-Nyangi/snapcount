/**
 * App-wide numeric text formatters. These are string formatters, not
 * `StatTable` column concerns — `stat-table/columns.ts` owns fixed-per-
 * column precision/sign resolution for the generic (no-`render`) cell
 * path; these live here because they are needed as plain functions inside
 * a column's `render`, wherever a mark (e.g. `DiffCell`) or a bespoke
 * layout needs the formatted text directly rather than going through
 * `StatColumn.precision`/`signed`.
 */

/**
 * Fixed-precision-3 rate/percentage formatting with the leading zero
 * before the decimal point stripped (".765", not "0.765") — the app's
 * convention for values that are always a fraction under 1, e.g. win
 * percentage (`pct`) and strength of schedule (`sos`). A value of exactly
 * 1 keeps its leading digit (there is nothing to strip): "1.000".
 */
export function formatPct(value: number): string {
  return value.toFixed(3).replace(/^0\./, ".")
}

// U+2212 MINUS SIGN. Deliberately not U+002D HYPHEN-MINUS: under
// `font-variant-numeric: tabular-nums` every digit and this glyph must
// share one advance width so a column of signed values stays aligned: a
// hyphen is narrower in most families and throws that off.
const MINUS_SIGN = "−"

/**
 * Signs a whole-number differential: "+131" for positive, "0" for exactly
 * zero (never signed), "−185" for negative (U+2212, see above — NOT
 * `String(value)`, which would emit an ASCII hyphen).
 */
export function formatDiff(value: number): string {
  if (value === 0) return "0"
  if (value > 0) return `+${value}`
  return `${MINUS_SIGN}${Math.abs(value)}`
}

/**
 * Splits the standings `formula_label` into its weighted terms and the
 * trailing clause, so a caller can bold only the terms — the mockup wraps
 * each weight in `<strong style="font-weight:800">` inside an otherwise
 * normal-weight paragraph, not the paragraph as a whole.
 *
 * The server sends one flat string
 * ("<term> + <term> + <term>, scaled to 100"), so the shape has to be
 * recovered here. It degrades instead of mangling: a label with no " + "
 * comes back as `{ terms: [], tail: label }`, which renders as plain
 * unemphasised text rather than a wrongly-bolded fragment.
 */
export function splitFormulaLabel(label: string): {
  terms: string[]
  tail: string
} {
  const parts = label.split(" + ")
  if (parts.length < 2) return { terms: [], tail: label }

  const last = parts[parts.length - 1]
  const comma = last.indexOf(",")
  if (comma === -1) return { terms: parts, tail: "" }

  return {
    terms: [...parts.slice(0, -1), last.slice(0, comma)],
    tail: last.slice(comma),
  }
}
