import type { ReactNode } from "react"

/**
 * Column-definition types and the pure, side-effect-free helpers that
 * derive per-cell presentation from them. Nothing here touches React
 * rendering — `stat-table.tsx` is the only file that turns these into DOM.
 */

export type Align = "left" | "right" | "center"

export interface StatColumn<Row> {
  key: string
  label: string
  /** Tooltip text; the mockup's `title` attr. */
  title?: string
  /** From the mockup's `grid-template-columns`. */
  width: number | string
  /**
   * Default: 'right' when `precision` or `signed` is set, 'left' otherwise.
   * Alignment is a property of the COLUMN, never the data — it must render
   * identically whether `rows` is `[]` (loading/empty) or populated, so a
   * numeric column with neither `precision` nor `signed` (a plain count:
   * PF, PA, rank, GP) must set this explicitly rather than rely on
   * inference from row values.
   */
  align?: Align
  /** FIXED PER COLUMN — a cell may never choose its own. */
  precision?: number
  /**
   * Whether positive values get an explicit "+" prefix. Sign is a property
   * of the QUANTITY, not of the cell — a column is signed or it is not,
   * and no cell decides for itself, the same rule `precision` follows.
   * Default false. Only genuinely signed quantities (a differential, a
   * game margin, a cumulative differential, a value vs. baseline) should
   * ever set this; a plain count (PF, PA, rank, games played) should not.
   */
  signed?: boolean
  sortable?: boolean
  /** First column only. */
  sticky?: boolean
  /**
   * Doubles as the sort key AND the default cell-content accessor when no
   * `render` is supplied (proven by the "moves focus with arrow keys" test,
   * which expects the DIFF column's raw `value` to be visible cell text).
   */
  value?: (row: Row) => number | string
  render?: (row: Row) => ReactNode
}

/** Resolves a `column.width` to a CSS length for `<col style>`. */
export function widthToCss(width: number | string): string {
  return typeof width === "number" ? `${width}px` : width
}

/** Sum of numeric column widths, used as the scroll wrapper's min-width. */
export function sumWidths<Row>(columns: StatColumn<Row>[]): number {
  return columns.reduce(
    (total, column) =>
      total + (typeof column.width === "number" ? column.width : 0),
    0,
  )
}

/** Raw cell value: `column.value(row)` if given, else `row[column.key]`. */
export function cellValue<Row>(
  column: StatColumn<Row>,
  row: Row,
): number | string {
  if (column.value) return column.value(row)
  return (row as unknown as Record<string, unknown>)[column.key] as
    | number
    | string
}

/**
 * Whether a column should be treated as numeric for default alignment.
 * Resolved from the column definition ALONE — `precision` and `signed`
 * are both concepts that only make sense for numbers, so either one is
 * proof enough. Deliberately does not look at row data: alignment must
 * not flip when `rows` goes from `[]` (loading/empty) to populated, which
 * is exactly the layout jump the fixed-width skeleton exists to prevent.
 * A plain numeric column with neither must set `align: 'right'` itself.
 */
export function isNumericColumn<Row>(column: StatColumn<Row>): boolean {
  return column.precision !== undefined || column.signed === true
}

export function resolveAlign<Row>(column: StatColumn<Row>): Align {
  if (column.align) return column.align
  return isNumericColumn(column) ? "right" : "left"
}

export function alignClassName(align: Align): string {
  switch (align) {
    case "right":
      return "text-right"
    case "center":
      return "text-center"
    default:
      return "text-left"
  }
}

/**
 * Formats a raw numeric value per the column's fixed `precision` and
 * `signed` settings — both are properties of the column, never of a cell,
 * and `signed` applies whether or not `precision` is also set (a "+7.9"
 * differential-per-game column needs both at once).
 *
 * - With `precision`, unsigned: fixed-decimal, leading "0" before the
 *   point stripped (".765", not "0.765") — the app's rate/percentage
 *   convention, for values that are always a fraction under 1.
 * - With `precision`, signed: fixed-decimal WITHOUT the leading-zero
 *   strip ("0.0", "2.3", "-2.3") — a signed quantity is a differential,
 *   not a fraction, and can cross whole numbers, so ".0" would read as a
 *   typo, not a value.
 * - `signed`: positive values (in either branch above) get an explicit
 *   "+" prefix. Zero never gets a sign, and negative values keep their
 *   natural "-" regardless — there is no way to suppress that.
 * - Without `signed` (the default): positive values render plain ("472"),
 *   which is what most numeric stat columns (PF, PA, rank, GP) want.
 */
export function formatNumericValue(
  value: number,
  precision?: number,
  signed?: boolean,
): string {
  const sign = signed && value > 0 ? "+" : ""

  if (precision !== undefined) {
    const fixed = value.toFixed(precision)
    const body = signed ? fixed : fixed.replace(/^(-?)0\./, "$1.")
    return `${sign}${body}`
  }

  return `${sign}${value}`
}

/** Resolves the content of a data cell: `render` wins outright, else the
 * formatted raw value. */
export function renderCellContent<Row>(
  column: StatColumn<Row>,
  row: Row,
): ReactNode {
  if (column.render) return column.render(row)
  const raw = cellValue(column, row)
  if (typeof raw === "number") {
    return formatNumericValue(raw, column.precision, column.signed)
  }
  return raw
}
