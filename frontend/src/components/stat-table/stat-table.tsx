import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useRef,
  useState,
} from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { TableBody, TableHeader, TableRow } from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  alignClassName,
  cellValue,
  renderCellContent,
  resolveAlign,
  type StatColumn,
  sumWidths,
  widthToCss,
} from "./columns"
import {
  type AriaSort,
  ariaSortFor,
  type SortState,
  useSortableHeader,
} from "./use-sortable"

export type { Align, StatColumn } from "./columns"
export type { SortState } from "./use-sortable"

export interface StatTableProps<Row> {
  columns: StatColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  sort?: SortState
  onSortChange?: (sort: SortState) => void
  /** Renders a full-width group heading whenever the returned key changes
   * from the previous row's. `null` means "no heading before this row". */
  groupBy?: (row: Row) => string | null
  /** Overrides the zebra stripe for a single row (see Task 5.6). */
  rowClassName?: (row: Row) => string | undefined
  isLoading?: boolean
  emptyMessage?: string
  /** Required — the table's screen-reader accessible name. */
  caption: string
}

const DEFAULT_SKELETON_ROWS = 8

const headerCellBaseClass =
  "h-11 px-3 align-middle text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
const bodyCellBaseClass = "px-3 py-2 align-middle"

/**
 * Sticky-cell styling. Header row cells are always `top: 0`; the column
 * marked `sticky` (first column, by convention) is additionally `left: 0`.
 * The intersection of both — the corner cell — needs the highest z-index
 * of the three tiers (2 for a plain sticky header, 1 for a plain sticky
 * column, 3 for both at once) or it gets overlapped on scroll. The
 * intersection also can't use `background: inherit` like a sticky body
 * cell does (which would inherit from an unstyled `<tr>` and turn
 * transparent) — it keeps the header's own opaque `--gray-50`.
 */
function headerCellStyle<Row>(column: StatColumn<Row>): CSSProperties {
  const style: CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: column.sticky ? 3 : 2,
    background: "var(--gray-50)",
  }
  if (column.sticky) style.left = 0
  return style
}

function bodyCellStyle<Row>(
  column: StatColumn<Row>,
  isLastRow: boolean,
): CSSProperties {
  const style: CSSProperties = {
    borderBottom: isLastRow ? "none" : "1px solid var(--gray-100)",
  }
  if (column.sticky) {
    style.position = "sticky"
    style.left = 0
    style.zIndex = 1
    style.background = "inherit"
  }
  return style
}

function SortButton<Row>({
  column,
  ariaSort,
  onActivate,
}: {
  column: StatColumn<Row>
  ariaSort: AriaSort
  onActivate: () => void
}) {
  const isActive = ariaSort !== "none"

  const button = (
    <button
      type="button"
      className="inline-flex items-center gap-1"
      style={{
        color: isActive ? "var(--orchid)" : "inherit",
        fontWeight: isActive ? 800 : "inherit",
      }}
      onClick={onActivate}
      onKeyDown={(event) => {
        // `aria-sort` on the `<th>` already announces state; the button
        // still needs its own handler because jsdom (unlike real browsers)
        // does not synthesize a click from an Enter/Space keydown on a
        // native <button>. `preventDefault` here matters in real browsers
        // too: it cancels that native synthesized click so Enter can't
        // fire onClick a second time and double-toggle the sort direction.
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onActivate()
        }
      }}
    >
      <span>{column.label}</span>
      <span aria-hidden="true">{ariaSort === "ascending" ? "↑" : "↓"}</span>
    </button>
  )

  if (!column.title) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{column.title}</TooltipContent>
    </Tooltip>
  )
}

function HeaderLabel<Row>({ column }: { column: StatColumn<Row> }) {
  if (!column.title) return <>{column.label}</>

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: WAI-ARIA APG's
            documented pattern for a tooltip on static text — the span isn't
            interactive, but it must be focusable so a keyboard user gets
            the same hint a mouse user gets on hover. */}
        <span tabIndex={0}>{column.label}</span>
      </TooltipTrigger>
      <TooltipContent>{column.title}</TooltipContent>
    </Tooltip>
  )
}

function SkeletonRows<Row>({
  columns,
  count,
}: {
  columns: StatColumn<Row>[]
  count: number
}) {
  return (
    <>
      {Array.from({ length: count }, (_, rowIndex) => {
        const isLastRow = rowIndex === count - 1
        const zebraBackground =
          rowIndex % 2 === 0 ? "var(--card)" : "var(--app-row-zebra)"
        return (
          <TableRow
            key={`skeleton-${rowIndex}`}
            data-testid="stat-table-skeleton-row"
            style={{ background: zebraBackground }}
          >
            {columns.map((column) => (
              // Same styling path as a real body cell — a loading table's
              // sticky column must stay pinned too, or it slides under the
              // header/first column the moment someone scrolls it.
              <td
                key={column.key}
                className={bodyCellBaseClass}
                style={bodyCellStyle(column, isLastRow)}
              >
                <Skeleton className="h-4 w-4/5" />
              </td>
            ))}
          </TableRow>
        )
      })}
    </>
  )
}

/**
 * The table every stat screen (Standings, Week, Team, Player) renders
 * through. See plan §1.6 for why this is a semantic `<table>` with
 * `table-layout: fixed` and a mockup-derived `<colgroup>` rather than a CSS
 * Grid: sticky headers, a sticky first column, roving-tabindex cell
 * navigation, and free row/column association for screen readers all
 * depend on it being a real table.
 *
 * Sort is fully controlled: this component never holds sort state itself.
 * The caller (eventually URL search params) owns `sort` and receives the
 * next value via `onSortChange`.
 */
export function StatTable<Row>({
  columns,
  rows,
  rowKey,
  sort,
  onSortChange,
  groupBy,
  rowClassName,
  isLoading = false,
  emptyMessage,
  caption,
}: StatTableProps<Row>) {
  const activate = useSortableHeader(sort, onSortChange)
  const columnCount = columns.length
  const minWidth = sumWidths(columns)

  // Roving tabindex: exactly one body cell is a tab stop at a time. Cell
  // refs are keyed by "row:col" so arrow/Home/End/PageUp/PageDown can move
  // focus imperatively without re-deriving DOM position from the event.
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map())
  const [active, setActive] = useState({ row: 0, col: 0 })

  // `active` can go stale the instant `rows` (or `columns`) shrinks after
  // the user has arrowed/tabbed further in than the new size allows — e.g.
  // Standings' conference/division filters narrowing 32 rows down to 4
  // while focus sits on row 20. Clamping here, at render time rather than
  // in an effect, means there's never a paint where zero cells are tab
  // stops: whenever there's at least one data row, exactly one rendered
  // cell's (rowIndex, colIndex) will equal this pair.
  const activeRow = rows.length > 0 ? Math.min(active.row, rows.length - 1) : 0
  const activeCol = columnCount > 0 ? Math.min(active.col, columnCount - 1) : 0

  const registerCell =
    (rowIndex: number, colIndex: number) =>
    (el: HTMLTableCellElement | null) => {
      const key = `${rowIndex}:${colIndex}`
      if (el) cellRefs.current.set(key, el)
      else cellRefs.current.delete(key)
    }

  const focusCell = (rowIndex: number, colIndex: number) => {
    if (rows.length === 0) return
    const clampedRow = Math.min(Math.max(rowIndex, 0), rows.length - 1)
    const clampedCol = Math.min(Math.max(colIndex, 0), columnCount - 1)
    setActive({ row: clampedRow, col: clampedCol })
    cellRefs.current.get(`${clampedRow}:${clampedCol}`)?.focus()
  }

  const handleCellKeyDown = (
    event: ReactKeyboardEvent<HTMLTableCellElement>,
    rowIndex: number,
    colIndex: number,
  ) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault()
        focusCell(rowIndex, colIndex + 1)
        break
      case "ArrowLeft":
        event.preventDefault()
        focusCell(rowIndex, colIndex - 1)
        break
      case "ArrowDown":
        event.preventDefault()
        focusCell(rowIndex + 1, colIndex)
        break
      case "ArrowUp":
        event.preventDefault()
        focusCell(rowIndex - 1, colIndex)
        break
      case "Home":
        event.preventDefault()
        focusCell(rowIndex, 0)
        break
      case "End":
        event.preventDefault()
        focusCell(rowIndex, columnCount - 1)
        break
      case "PageDown":
        event.preventDefault()
        focusCell(rowIndex + 10, colIndex)
        break
      case "PageUp":
        event.preventDefault()
        focusCell(rowIndex - 10, colIndex)
        break
      default:
        break
    }
  }

  let body: ReactNode
  if (isLoading) {
    body = (
      <SkeletonRows
        columns={columns}
        count={rows.length > 0 ? rows.length : DEFAULT_SKELETON_ROWS}
      />
    )
  } else if (rows.length === 0) {
    body = (
      <TableRow>
        <td
          colSpan={columnCount}
          className="px-3 py-6 text-center"
          style={{ color: "var(--gray-500)" }}
        >
          {emptyMessage ?? "No results to display."}
        </td>
      </TableRow>
    )
  } else {
    const elements: ReactNode[] = []
    let previousGroup: string | null | undefined
    rows.forEach((row, rowIndex) => {
      const key = rowKey(row)

      if (groupBy) {
        const group = groupBy(row)
        if (group !== null && group !== previousGroup) {
          elements.push(
            <tr key={`group-${key}`}>
              <td
                colSpan={columnCount}
                style={{
                  padding: "8px 12px",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--orchid)",
                  background: "var(--gray-50)",
                }}
              >
                {group}
              </td>
            </tr>,
          )
        }
        previousGroup = group
      }

      const isLastRow = rowIndex === rows.length - 1
      const customRowClassName = rowClassName?.(row)
      const zebraBackground =
        rowIndex % 2 === 0 ? "var(--card)" : "var(--app-row-zebra)"

      elements.push(
        <TableRow
          key={key}
          className={customRowClassName}
          style={
            customRowClassName ? undefined : { background: zebraBackground }
          }
        >
          {columns.map((column, colIndex) => {
            const align = resolveAlign(column)
            const isDefaultNumericCell =
              !column.render && typeof cellValue(column, row) === "number"
            const isFocused = rowIndex === activeRow && colIndex === activeCol

            return (
              <td
                key={column.key}
                ref={registerCell(rowIndex, colIndex)}
                tabIndex={isFocused ? 0 : -1}
                className={cn(
                  bodyCellBaseClass,
                  alignClassName(align),
                  isDefaultNumericCell && "tabular",
                )}
                style={bodyCellStyle(column, isLastRow)}
                onKeyDown={(event) =>
                  handleCellKeyDown(event, rowIndex, colIndex)
                }
                onFocus={() => setActive({ row: rowIndex, col: colIndex })}
              >
                {renderCellContent(column, row)}
              </td>
            )
          })}
        </TableRow>,
      )
    })
    body = elements
  }

  return (
    <div className="relative w-full overflow-x-auto">
      <table
        className="w-full caption-bottom text-sm"
        style={{
          tableLayout: "fixed",
          minWidth: minWidth || undefined,
          borderCollapse: "collapse",
        }}
      >
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={{ width: widthToCss(column.width) }} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => {
              const align = resolveAlign(column)
              const ariaSort = column.sortable
                ? ariaSortFor(sort, column.key)
                : undefined

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn(headerCellBaseClass, alignClassName(align))}
                  style={headerCellStyle(column)}
                >
                  {column.sortable ? (
                    <SortButton
                      column={column}
                      ariaSort={ariaSort ?? "none"}
                      onActivate={() =>
                        activate(column.key, column.defaultSortDir)
                      }
                    />
                  ) : (
                    <HeaderLabel column={column} />
                  )}
                </th>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>{body}</TableBody>
      </table>
    </div>
  )
}
