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
  /** Default: 'right' for numeric columns, 'left' for text. */
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
 * A column with `precision` is always numeric; otherwise inferred from the
 * first row's resolved value.
 */
export function isNumericColumn<Row>(
  column: StatColumn<Row>,
  rows: Row[],
): boolean {
  if (column.precision !== undefined) return true
  if (rows.length === 0) return false
  return typeof cellValue(column, rows[0]) === "number"
}

export function resolveAlign<Row>(column: StatColumn<Row>, rows: Row[]): Align {
  if (column.align) return column.align
  return isNumericColumn(column, rows) ? "right" : "left"
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
 * `signed` settings — both are properties of the column, never of a cell.
 *
 * - With `precision`: fixed-decimal, leading "0" before the point stripped
 *   (".765", not "0.765") — the app's rate/percentage convention.
 * - With `signed`: positive values get an explicit "+" prefix ("+131").
 *   Zero never gets a sign, and negative values keep their natural "-"
 *   regardless of `signed` — there is no way to suppress that.
 * - Without `signed` (the default): positive values render plain ("472"),
 *   which is what most numeric stat columns (PF, PA, rank, GP) want.
 */
export function formatNumericValue(
  value: number,
  precision?: number,
  signed?: boolean,
): string {
  if (precision !== undefined) {
    const fixed = value.toFixed(precision)
    return fixed.replace(/^(-?)0\./, "$1.")
  }
  const sign = signed && value > 0 ? "+" : ""
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
