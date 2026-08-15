/**
 * Last-5 form as W/L squares, newest last. Geometry ported verbatim from
 * the mockup's `r.form` mapping (16x16, 9px/800, radius 4).
 *
 * Individual squares are `aria-hidden`: five separate letters read aloud
 * one at a time is useless. The group carries a single descriptive label
 * instead.
 */
export function FormDots({ form }: { form: string }) {
  const chars = form.split("")
  const label = `Last 5: ${chars.join(" ")}, most recent last`

  return (
    <span role="img" aria-label={label} className="inline-flex gap-0.5">
      {chars.map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="inline-flex items-center justify-center"
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            fontFamily: "var(--font-body)",
            fontSize: 9,
            fontWeight: 800,
            background: ch === "W" ? "var(--emerald)" : "var(--gray-300)",
            color: ch === "W" ? "#FFFFFF" : "var(--gray-700)",
          }}
        >
          {ch}
        </span>
      ))}
    </span>
  )
}
