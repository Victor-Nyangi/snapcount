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
